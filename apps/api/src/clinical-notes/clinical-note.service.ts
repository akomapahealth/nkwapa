import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClinicalNoteStatus, Prisma, UserRole } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddClinicalNoteAddendumDto,
  ClinicalNoteDraftDto,
  UpdateClinicalNoteDraftDto,
} from './dto/clinical-note.dto';
import { CLINICAL_NOTE_INCLUDE, ClinicalNoteRepository } from './clinical-note.repository';

type ClinicalActor = {
  userId: string;
  roles: Array<{ clinicId: string | null; role: UserRole }>;
};

type RequestMetadata = {
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
};

const noteMetadata = (status: ClinicalNoteStatus, version: number) =>
  JSON.stringify({ status, version });

@Injectable()
export class ClinicalNoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: ClinicalNoteRepository,
    private readonly audit: AuditService,
  ) {}

  async getEncounterNote(clinicId: string, encounterId: string, actor: ClinicalActor) {
    this.requireClinicalRole(actor, clinicId);
    const note = await this.repository.findEncounterNote(clinicId, encounterId);
    if (!note) throw new NotFoundException('Clinical note not found');
    return note;
  }

  async listPatientNotes(clinicId: string, patientId: string, actor: ClinicalActor) {
    this.requireClinicalRole(actor, clinicId);
    await this.assertPatient(clinicId, patientId);
    return this.repository.findPatientNotes(clinicId, patientId);
  }

  async pendingForDoctor(clinicId: string, actor: ClinicalActor) {
    this.requireRole(actor, clinicId, UserRole.DOCTOR);
    return this.repository.findPendingForDoctor(clinicId, actor.userId);
  }

  async createDraft(
    clinicId: string,
    encounterId: string,
    actor: ClinicalActor,
    dto: ClinicalNoteDraftDto,
    metadata: RequestMetadata = {},
  ) {
    const authorRole = this.requireClinicalRole(actor, clinicId);
    return this.prisma.$transaction(async (tx) => {
      const encounter = await tx.encounter.findFirst({
        where: { id: encounterId, clinicId },
        select: { id: true, patientId: true },
      });
      if (!encounter) throw new NotFoundException('Encounter not found');

      const existing = await tx.clinicalNote.findUnique({
        where: { encounterId },
        include: CLINICAL_NOTE_INCLUDE,
      });
      if (existing) {
        if (existing.authorUserId === actor.userId) return existing;
        throw this.conflict(
          'CLINICAL_NOTE_EXISTS',
          'This encounter already has a clinical note by another author.',
        );
      }

      const note = await tx.clinicalNote.create({
        data: {
          id: randomUUID(),
          clinicId,
          patientId: encounter.patientId,
          encounterId,
          authorUserId: actor.userId,
          authorRole,
          history: dto.history,
          assessment: dto.assessment,
          plan: dto.plan,
        },
        include: CLINICAL_NOTE_INCLUDE,
      });
      await this.log(note.id, clinicId, actor.userId, 'CLINICAL_NOTE.CREATE', note, metadata);
      return note;
    });
  }

  async updateDraft(
    clinicId: string,
    encounterId: string,
    actor: ClinicalActor,
    dto: UpdateClinicalNoteDraftDto,
    metadata: RequestMetadata = {},
  ) {
    this.requireClinicalRole(actor, clinicId);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.clinicalNote.findFirst({ where: { clinicId, encounterId } });
      if (!current) throw new NotFoundException('Clinical note not found');
      if (current.authorUserId !== actor.userId) {
        throw new ForbiddenException('Only the note author may edit this draft');
      }
      if (current.status !== ClinicalNoteStatus.DRAFT) {
        throw this.conflict('CLINICAL_NOTE_IMMUTABLE', 'Submitted notes cannot be edited.');
      }
      if (current.version !== dto.expectedVersion) {
        throw this.conflict(
          'CLINICAL_NOTE_VERSION_CONFLICT',
          'This draft changed in another session. Reload before saving.',
        );
      }

      const result = await tx.clinicalNote.updateMany({
        where: { id: current.id, version: dto.expectedVersion, status: ClinicalNoteStatus.DRAFT },
        data: {
          history: dto.history,
          assessment: dto.assessment,
          plan: dto.plan,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw this.conflict(
          'CLINICAL_NOTE_VERSION_CONFLICT',
          'This draft changed in another session. Reload before saving.',
        );
      }
      const note = await tx.clinicalNote.findUniqueOrThrow({
        where: { id: current.id },
        include: CLINICAL_NOTE_INCLUDE,
      });
      await this.log(note.id, clinicId, actor.userId, 'CLINICAL_NOTE.DRAFT_SAVE', note, metadata);
      return note;
    });
  }

  async submit(
    clinicId: string,
    encounterId: string,
    actor: ClinicalActor,
    metadata: RequestMetadata = {},
  ) {
    const actorRole = this.requireClinicalRole(actor, clinicId);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.clinicalNote.findFirst({
        where: { clinicId, encounterId },
        include: CLINICAL_NOTE_INCLUDE,
      });
      if (!current) throw new NotFoundException('Clinical note not found');
      if (current.authorUserId !== actor.userId) {
        throw new ForbiddenException('Only the note author may submit this draft');
      }
      if (current.status !== ClinicalNoteStatus.DRAFT) {
        if (current.submittedByUserId === actor.userId) return current;
        throw this.conflict('CLINICAL_NOTE_ALREADY_SUBMITTED', 'This note is already submitted.');
      }
      this.requireComplete(current);

      const assignment = await this.activeAssignment(tx, clinicId, encounterId);
      if (actorRole === UserRole.VOLUNTEER) {
        if (!assignment) {
          throw new BadRequestException({
            code: 'CLINICAL_NOTE_ASSIGNMENT_REQUIRED',
            message: 'Assign a volunteer and doctor before submitting this note.',
          });
        }
        if (assignment.assignedVolunteerId !== actor.userId) {
          throw new ForbiddenException(
            'Only the currently assigned volunteer may submit this note',
          );
        }
      }

      const now = new Date();
      const snapshot = assignment
        ? {
            assignmentId: assignment.id,
            assignedVolunteerId: assignment.assignedVolunteerId,
            assignedVolunteerNameSnapshot: assignment.assignedVolunteer.displayName,
            assignedDoctorId: assignment.assignedDoctorId,
            assignedDoctorNameSnapshot: assignment.assignedDoctor.displayName,
            assignmentAssignedAtSnapshot: assignment.assignedAt,
          }
        : {};
      const doctorSigned = actorRole === UserRole.DOCTOR;
      const note = await tx.clinicalNote.update({
        where: { id: current.id },
        data: {
          ...snapshot,
          status: doctorSigned ? ClinicalNoteStatus.COSIGNED : ClinicalNoteStatus.PENDING_COSIGN,
          submittedByUserId: actor.userId,
          submittedAt: now,
          ...(doctorSigned
            ? {
                signedHistory: current.history,
                signedAssessment: current.assessment,
                signedPlan: current.plan,
                signedContentHash: this.contentHash(current),
                cosignedByUserId: actor.userId,
                cosignedAt: now,
              }
            : {}),
          version: { increment: 1 },
        },
        include: CLINICAL_NOTE_INCLUDE,
      });
      await this.log(
        note.id,
        clinicId,
        actor.userId,
        doctorSigned ? 'CLINICAL_NOTE.AUTHOR_SIGN' : 'CLINICAL_NOTE.SUBMIT',
        note,
        metadata,
      );
      return note;
    });
  }

  async cosign(
    clinicId: string,
    encounterId: string,
    actor: ClinicalActor,
    metadata: RequestMetadata = {},
  ) {
    this.requireRole(actor, clinicId, UserRole.DOCTOR);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.clinicalNote.findFirst({
        where: { clinicId, encounterId },
        include: CLINICAL_NOTE_INCLUDE,
      });
      if (!current) throw new NotFoundException('Clinical note not found');
      if (
        current.status === ClinicalNoteStatus.COSIGNED ||
        current.status === ClinicalNoteStatus.AMENDED
      ) {
        if (current.cosignedByUserId === actor.userId) return current;
        throw this.conflict('CLINICAL_NOTE_ALREADY_COSIGNED', 'This note is already cosigned.');
      }
      if (current.status !== ClinicalNoteStatus.PENDING_COSIGN) {
        throw this.conflict('CLINICAL_NOTE_NOT_PENDING', 'Only pending notes may be cosigned.');
      }
      if (current.assignedDoctorId !== actor.userId) {
        throw new ForbiddenException('Only the assigned doctor may cosign this note');
      }

      const now = new Date();
      const note = await tx.clinicalNote.update({
        where: { id: current.id },
        data: {
          status: ClinicalNoteStatus.COSIGNED,
          signedHistory: current.history,
          signedAssessment: current.assessment,
          signedPlan: current.plan,
          signedContentHash: this.contentHash(current),
          cosignedByUserId: actor.userId,
          cosignedAt: now,
          version: { increment: 1 },
        },
        include: CLINICAL_NOTE_INCLUDE,
      });
      await this.log(note.id, clinicId, actor.userId, 'CLINICAL_NOTE.COSIGN', note, metadata);
      return note;
    });
  }

  async addAddendum(
    clinicId: string,
    encounterId: string,
    actor: ClinicalActor,
    dto: AddClinicalNoteAddendumDto,
    metadata: RequestMetadata = {},
  ) {
    this.requireRole(actor, clinicId, UserRole.DOCTOR);
    const reason = dto.reason.trim();
    const content = dto.content.trim();
    if (!reason || !content)
      throw new BadRequestException('Addendum reason and content are required');

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.clinicalNote.findFirst({ where: { clinicId, encounterId } });
      if (!current) throw new NotFoundException('Clinical note not found');
      if (
        current.status !== ClinicalNoteStatus.COSIGNED &&
        current.status !== ClinicalNoteStatus.AMENDED
      ) {
        throw this.conflict('CLINICAL_NOTE_NOT_SIGNED', 'Addenda require a signed note.');
      }

      const addendum = await tx.clinicalNoteAddendum.create({
        data: {
          id: randomUUID(),
          clinicId,
          clinicalNoteId: current.id,
          authorUserId: actor.userId,
          reason,
          content,
        },
        include: { author: { select: { id: true, displayName: true } } },
      });
      if (current.status === ClinicalNoteStatus.COSIGNED) {
        await tx.clinicalNote.update({
          where: { id: current.id },
          data: { status: ClinicalNoteStatus.AMENDED, version: { increment: 1 } },
        });
      }
      await this.audit.logWrite({
        clinicId,
        actorUserId: actor.userId,
        action: 'CLINICAL_NOTE.ADDENDUM',
        entityType: 'ClinicalNoteAddendum',
        entityId: addendum.id,
        afterJson: JSON.stringify({ clinicalNoteId: current.id, reasonRecorded: true }),
        requestId: metadata.requestId,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
      return tx.clinicalNote.findUniqueOrThrow({
        where: { id: current.id },
        include: CLINICAL_NOTE_INCLUDE,
      });
    });
  }

  private requireClinicalRole(actor: ClinicalActor, clinicId: string) {
    if (this.hasRole(actor, clinicId, UserRole.DOCTOR)) return UserRole.DOCTOR;
    if (this.hasRole(actor, clinicId, UserRole.VOLUNTEER)) return UserRole.VOLUNTEER;
    throw new ForbiddenException('Clinical notes are restricted to doctors and volunteers');
  }

  private requireRole(actor: ClinicalActor, clinicId: string, role: UserRole) {
    if (!this.hasRole(actor, clinicId, role)) {
      throw new ForbiddenException(`This action requires the ${role} role in the selected clinic`);
    }
  }

  private hasRole(actor: ClinicalActor, clinicId: string, role: UserRole) {
    return actor.roles.some((entry) => entry.clinicId === clinicId && entry.role === role);
  }

  private async assertPatient(clinicId: string, patientId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, primaryClinicId: clinicId },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');
  }

  private activeAssignment(tx: Prisma.TransactionClient, clinicId: string, encounterId: string) {
    return tx.patientAssignment.findFirst({
      where: {
        clinicId,
        status: 'ACTIVE',
        patientCheckIn: { encounterId },
      },
      include: {
        assignedVolunteer: { select: { id: true, displayName: true } },
        assignedDoctor: { select: { id: true, displayName: true } },
      },
      orderBy: { assignedAt: 'desc' },
    });
  }

  private requireComplete(note: { history: string; assessment: string; plan: string }) {
    const missing = (['history', 'assessment', 'plan'] as const).filter(
      (field) => !note[field].trim(),
    );
    if (missing.length) {
      throw new BadRequestException({
        code: 'CLINICAL_NOTE_INCOMPLETE',
        message: 'History, Assessment, and Plan are required before signing or submission.',
        fieldErrors: missing.map((field) => ({ field, message: `${field} is required` })),
      });
    }
  }

  private contentHash(note: { history: string; assessment: string; plan: string }) {
    return createHash('sha256')
      .update(
        JSON.stringify({ history: note.history, assessment: note.assessment, plan: note.plan }),
      )
      .digest('hex');
  }

  private conflict(code: string, message: string) {
    return new ConflictException({ code, message });
  }

  private log(
    noteId: string,
    clinicId: string,
    actorUserId: string,
    action: string,
    note: { status: ClinicalNoteStatus; version: number },
    metadata: RequestMetadata,
  ) {
    return this.audit.logWrite({
      clinicId,
      actorUserId,
      action,
      entityType: 'ClinicalNote',
      entityId: noteId,
      afterJson: noteMetadata(note.status, note.version),
      requestId: metadata.requestId,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }
}
