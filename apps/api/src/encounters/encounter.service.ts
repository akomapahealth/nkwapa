import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Encounter, Prisma } from '@prisma/client';
import { CLINIC_DEFAULT_TIMEZONE, clinicDayWindow } from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ReminderService } from '../reminders/reminder.service';
import { EncounterRepository, EncounterFindManyFilters } from './encounter.repository';
import { CreateEncounterDto } from './dto/create-encounter.dto';
import { isSystemAdmin, type ScopedRole } from '../auth/clinic-roles';
import { FollowUpRiskService } from '../follow-up/follow-up-risk.service';

/** The audit action whose rows double as the sync tombstone for a deleted visit (#384). */
export const ENCOUNTER_DELETE_ACTION = 'ENCOUNTER.DELETE';
export const CLINICAL_NOTE_DELETE_ACTION = 'CLINICAL_NOTE.DELETE';
const ID = { select: { id: true } } as const;

export interface DraftDeleteActor {
  userId: string;
  roles: readonly ScopedRole[];
  requestId?: string;
}

export interface AuditContext {
  clinicId: string;
  actorUserId: string;
  requestId?: string;
}

@Injectable()
export class EncounterService {
  constructor(
    private readonly encounterRepository: EncounterRepository,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly reminderService: ReminderService,
    @Optional() private readonly risk?: FollowUpRiskService,
  ) {}

  /**
   * Delete a DRAFT visit created by accident (#384). SYSTEM_ADMIN only, checked here as well as
   * by the route's permission. Its DRAFT note goes with it; a submitted note blocks the delete.
   * Children cascade per the schema. The audit row keeps the before-state and the reason, and is
   * also what sync pull reads to tell devices the visit is gone.
   */
  async deleteDraft(
    clinicId: string,
    encounterId: string,
    reason: string,
    actor: DraftDeleteActor,
  ) {
    assertDraftDeleteSeat(actor);
    const patientId = await this.prisma.$transaction(async (tx) => {
      const encounter = await tx.encounter.findFirst({
        where: { id: encounterId, clinicId },
        include: {
          clinicalNote: { select: { id: true, status: true, version: true } },
          // Ids of what cascades with it, so the audit row says what went.
          vitals: ID,
          tobaccoScreening: ID,
          diabetesScreening: ID,
          hypertensionAssessment: ID,
          carePlan: ID,
          counsellingRecord: ID,
          eyeScreening: ID,
          prescriptions: ID,
          medicationAdherence: ID,
          riskFlags: ID,
        },
      });
      if (!encounter) throw new NotFoundException('Encounter not found');
      if (encounter.status !== 'DRAFT') throw notDraft('visit', encounter.status);
      const note = encounter.clinicalNote;
      if (note && note.status !== 'DRAFT') throw notDraft('note', note.status);

      if (note) await tx.clinicalNote.delete({ where: { id: note.id } });
      try {
        await tx.encounter.delete({ where: { id: encounter.id } });
      } catch (err) {
        // A submitted note is hidden from a system admin by row security, so it surfaces here,
        // as the note's Restrict foreign key.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
          throw notDraft('note', 'SUBMITTED');
        }
        throw err;
      }

      await this.auditService.logWrite(
        {
          clinicId,
          actorUserId: actor.userId,
          action: ENCOUNTER_DELETE_ACTION,
          entityType: 'Encounter',
          entityId: encounter.id,
          // The note is selected as id, status and version only: its text never enters the log.
          beforeJson: JSON.stringify(encounter),
          afterJson: JSON.stringify({ deleted: true, reason, patientId: encounter.patientId }),
          requestId: actor.requestId,
        },
        tx,
      );
      return encounter.patientId;
    });
    await this.risk?.recomputeAfterCommit({
      patientId,
      trigger: 'PATIENT',
      actorUserId: actor.userId,
    });
    return { deleted: true, patientId };
  }

  /** Delete only the DRAFT clinical note on a visit, leaving the visit itself (#384). */
  async deleteDraftNote(
    clinicId: string,
    encounterId: string,
    reason: string,
    actor: DraftDeleteActor,
  ) {
    assertDraftDeleteSeat(actor);
    return this.prisma.$transaction(async (tx) => {
      const note = await tx.clinicalNote.findFirst({
        where: { encounterId, clinicId },
        select: {
          id: true,
          status: true,
          version: true,
          encounterId: true,
          patientId: true,
          authorUserId: true,
          createdAt: true,
        },
      });
      if (!note) throw new NotFoundException('Clinical note not found');
      if (note.status !== 'DRAFT') throw notDraft('note', note.status);
      await tx.clinicalNote.delete({ where: { id: note.id } });
      await this.auditService.logWrite(
        {
          clinicId,
          actorUserId: actor.userId,
          action: CLINICAL_NOTE_DELETE_ACTION,
          entityType: 'ClinicalNote',
          entityId: note.id,
          beforeJson: JSON.stringify(note),
          afterJson: JSON.stringify({ deleted: true, reason }),
          requestId: actor.requestId,
        },
        tx,
      );
      return { deleted: true };
    });
  }

  async create(dto: CreateEncounterDto, auditContext?: AuditContext): Promise<Encounter> {
    const [clinic, patient, user] = await Promise.all([
      this.prisma.clinic.findUnique({ where: { id: dto.clinicId } }),
      this.prisma.patient.findUnique({ where: { id: dto.patientId } }),
      this.prisma.user.findUnique({ where: { id: dto.createdByUserId } }),
    ]);
    if (!clinic) throw new Error('Clinic not found');
    if (!patient) throw new Error('Patient not found');
    if (!user) throw new Error('User not found');

    const encounter = await this.encounterRepository.create({
      clinic: { connect: { id: dto.clinicId } },
      patient: { connect: { id: dto.patientId } },
      status: 'DRAFT',
      createdBy: { connect: { id: dto.createdByUserId } },
    });

    if (auditContext) {
      await this.auditService.logWrite({
        clinicId: auditContext.clinicId,
        actorUserId: auditContext.actorUserId,
        action: 'ENCOUNTER.CREATE',
        entityType: 'Encounter',
        entityId: encounter.id,
        afterJson: JSON.stringify(encounter),
        requestId: auditContext.requestId,
      });
    }

    return encounter;
  }

  async findById(id: string, withRelations = false): Promise<Encounter | null> {
    const include = withRelations
      ? {
          patient: true,
          vitals: true,
          tobaccoScreening: {
            include: { reviewedBy: { select: { id: true, displayName: true } } },
          },
          diabetesScreening: {
            include: { authoredBy: { select: { id: true, displayName: true } } },
          },
          hypertensionAssessment: true,
          carePlan: true,
          // Status only, so the page can offer a system admin "Delete draft note" (#384).
          clinicalNote: { select: { status: true } },
        }
      : undefined;
    return this.encounterRepository.findById(id, include);
  }

  /**
   * One page of a lane plus how many encounters match its filters (#340). `createdFrom` and
   * `createdTo` are clinic-local days (YYYY-MM-DD), each optional, both inclusive.
   */
  async listQueuePage(
    clinicId: string,
    filters: Omit<EncounterFindManyFilters, 'createdFrom' | 'createdTo'>,
    created: { from?: string; to?: string } = {},
  ) {
    const scoped: EncounterFindManyFilters = { ...filters };
    if (created.from || created.to) {
      for (const [field, day] of [
        ['createdFrom', created.from],
        ['createdTo', created.to],
      ] as const) {
        if (day && !isCalendarDate(day)) {
          throw new BadRequestException({
            message: 'That date does not exist.',
            fieldErrors: [{ field, message: 'That date does not exist.' }],
          });
        }
      }
      if (created.from && created.to && created.from > created.to) {
        throw new BadRequestException({
          message: 'The start date must be on or before the end date.',
          fieldErrors: [
            { field: 'createdTo', message: 'The start date must be on or before the end date.' },
          ],
        });
      }
      const clinic = await this.prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { timezone: true },
      });
      const zone = clinic?.timezone ?? CLINIC_DEFAULT_TIMEZONE;
      if (created.from) scoped.createdFrom = clinicDayWindow(created.from, zone).start;
      if (created.to) scoped.createdTo = clinicDayWindow(created.to, zone).end;
    }
    const [rows, total] = await Promise.all([
      this.encounterRepository.findManyByClinic(clinicId, scoped),
      this.encounterRepository.countByClinic(clinicId, scoped),
    ]);
    return { rows, total };
  }

  /** Uncapped totals for the queue lanes, with the same filters the lane lists use (#307). */
  async countQueueLanes(clinicId: string) {
    const [drafts, review, finalize] = await Promise.all([
      this.encounterRepository.countByClinic(clinicId, { status: 'DRAFT' }),
      this.encounterRepository.countByClinic(clinicId, { status: 'IN_REVIEW', stage: 'REVIEW' }),
      this.encounterRepository.countByClinic(clinicId, {
        status: 'IN_REVIEW',
        stage: 'DOCTOR_READY',
      }),
    ]);
    return { drafts, review, finalize };
  }

  async listByPatient(patientId: string, filters?: EncounterFindManyFilters): Promise<Encounter[]> {
    return this.encounterRepository.findManyByPatient(patientId, filters);
  }

  async submitForReview(id: string, auditContext?: AuditContext): Promise<Encounter> {
    const existing = await this.encounterRepository.findById(id);
    if (!existing) throw new Error('Encounter not found');
    if (existing.status !== 'DRAFT') {
      throw new Error(`Cannot submit for review: encounter is ${existing.status}`);
    }
    const updated = await this.encounterRepository.submitForReview(id);
    if (auditContext) {
      await this.auditService.logWrite({
        clinicId: auditContext.clinicId,
        actorUserId: auditContext.actorUserId,
        action: 'ENCOUNTER.SUBMIT_FOR_REVIEW',
        entityType: 'Encounter',
        entityId: updated.id,
        beforeJson: JSON.stringify(existing),
        afterJson: JSON.stringify(updated),
        requestId: auditContext.requestId,
      });
    }
    return updated;
  }

  async reviewEncounter(
    id: string,
    userId: string,
    auditContext?: AuditContext,
  ): Promise<Encounter> {
    const existing = await this.encounterRepository.findById(id);
    if (!existing) throw new Error('Encounter not found');
    if (existing.status !== 'IN_REVIEW') {
      throw new Error(`Cannot review encounter: encounter is ${existing.status}`);
    }
    if (existing.preceptorReviewedById) {
      throw new Error('Encounter already reviewed');
    }
    const updated = await this.encounterRepository.setPreceptorReviewed(id, userId);
    if (auditContext) {
      await this.auditService.logWrite({
        clinicId: auditContext.clinicId,
        actorUserId: auditContext.actorUserId,
        action: 'ENCOUNTER.REVIEW',
        entityType: 'Encounter',
        entityId: updated.id,
        beforeJson: JSON.stringify(existing),
        afterJson: JSON.stringify(updated),
        requestId: auditContext.requestId,
      });
    }
    return updated;
  }

  async finalize(id: string, userId: string, auditContext?: AuditContext): Promise<Encounter> {
    const existing = await this.encounterRepository.findById(id);
    if (!existing) throw new Error('Encounter not found');
    if (existing.status !== 'IN_REVIEW') {
      throw new Error(`Cannot finalize: encounter is ${existing.status}`);
    }
    if (!existing.preceptorReviewedById) {
      throw new Error('Encounter must be reviewed before finalization');
    }
    const updated = await this.encounterRepository.setDoctorFinalized(id, userId);
    if (auditContext) {
      await this.auditService.logWrite({
        clinicId: auditContext.clinicId,
        actorUserId: auditContext.actorUserId,
        action: 'ENCOUNTER.FINALIZE',
        entityType: 'Encounter',
        entityId: updated.id,
        beforeJson: JSON.stringify(existing),
        afterJson: JSON.stringify(updated),
        requestId: auditContext.requestId,
      });
    }
    await this.markLinkedCheckInCompleted(updated, auditContext);
    await this.createFollowUpReminderIfNeeded(updated, auditContext);
    return updated;
  }

  private async markLinkedCheckInCompleted(
    encounter: Encounter,
    auditContext?: AuditContext,
  ): Promise<void> {
    const linkedCheckIn = await this.prisma.patientCheckIn.findFirst({
      where: { encounterId: encounter.id },
    });
    if (!linkedCheckIn || linkedCheckIn.status === 'COMPLETED') {
      return;
    }

    const updatedCheckIn = await this.prisma.patientCheckIn.update({
      where: { id: linkedCheckIn.id },
      data: { status: 'COMPLETED' },
    });

    await this.auditService.logWrite({
      clinicId: encounter.clinicId,
      actorUserId: auditContext?.actorUserId ?? encounter.doctorFinalizedById ?? 'system',
      action: 'CHECKIN.STATUS.UPDATE',
      entityType: 'PatientCheckIn',
      entityId: linkedCheckIn.id,
      beforeJson: JSON.stringify({
        id: linkedCheckIn.id,
        status: linkedCheckIn.status,
        encounterId: linkedCheckIn.encounterId,
      }),
      afterJson: JSON.stringify({
        id: updatedCheckIn.id,
        status: updatedCheckIn.status,
        encounterId: updatedCheckIn.encounterId,
      }),
      requestId: auditContext?.requestId,
    });
  }

  private async createFollowUpReminderIfNeeded(
    encounter: Encounter,
    auditContext?: AuditContext,
  ): Promise<void> {
    const carePlan = await this.prisma.carePlan.findUnique({
      where: { encounterId: encounter.id },
    });
    if (!carePlan?.followUpDate) return;

    const [patient, clinic] = await Promise.all([
      this.prisma.patient.findUnique({ where: { id: encounter.patientId } }),
      this.prisma.clinic.findUnique({ where: { id: encounter.clinicId } }),
    ]);
    const actorUserId = auditContext?.actorUserId ?? 'system';
    const requestId = auditContext?.requestId;

    if (patient?.phoneE164) {
      await this.reminderService.scheduleFollowUpReminder({
        clinicId: encounter.clinicId,
        clinicName: clinic?.name ?? 'Clinic',
        clinicTimezone: clinic?.timezone,
        patientId: encounter.patientId,
        patientCode: patient.patientCode,
        phoneE164: patient.phoneE164,
        encounterId: encounter.id,
        followUpDate: carePlan.followUpDate,
        actorUserId,
        requestId,
      });
    } else if (!patient?.phoneE164 && !patient?.email) {
      await this.reminderService.scheduleFollowUpReminderNoContact({
        clinicId: encounter.clinicId,
        patientId: encounter.patientId,
        patientCode: patient?.patientCode ?? '?',
        encounterId: encounter.id,
        followUpDate: carePlan.followUpDate,
        actorUserId,
        requestId,
      });
    }

    if (patient?.email) {
      await this.reminderService.scheduleFollowUpEmailReminder({
        clinicId: encounter.clinicId,
        clinicName: clinic?.name ?? 'Clinic',
        clinicTimezone: clinic?.timezone,
        patientId: encounter.patientId,
        patientCode: patient.patientCode,
        email: patient.email,
        encounterId: encounter.id,
        followUpDate: carePlan.followUpDate,
        actorUserId,
        requestId,
      });
    }
  }
}

function assertDraftDeleteSeat(actor: DraftDeleteActor) {
  if (!isSystemAdmin(actor.roles)) {
    throw new ForbiddenException({
      code: 'DRAFT_DELETE_FORBIDDEN',
      message: 'Only System Admin can delete draft visits and notes',
      recoveryAction: 'Ask a system administrator to delete it.',
    });
  }
}

function notDraft(kind: 'visit' | 'note', status: string) {
  return new ConflictException({
    code: 'DRAFT_DELETE_NOT_DRAFT',
    message: `This ${kind} is ${status.toLowerCase().replace(/_/g, ' ')}, so it can no longer be deleted`,
    recoveryAction: 'Only drafts can be deleted. Correct a submitted record with an addendum.',
    details: { kind, status },
  });
}

function isCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
