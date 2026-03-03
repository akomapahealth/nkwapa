import { Injectable } from "@nestjs/common";
import { Encounter, EncounterStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ReminderService } from "../reminders/reminder.service";
import {
  EncounterRepository,
  EncounterFindManyFilters,
} from "./encounter.repository";
import { CreateEncounterDto } from "./dto/create-encounter.dto";

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
    private readonly reminderService: ReminderService
  ) {}

  async create(
    dto: CreateEncounterDto,
    auditContext?: AuditContext
  ): Promise<Encounter> {
    const [clinic, patient, user] = await Promise.all([
      this.prisma.clinic.findUnique({ where: { id: dto.clinicId } }),
      this.prisma.patient.findUnique({ where: { id: dto.patientId } }),
      this.prisma.user.findUnique({ where: { id: dto.createdByUserId } }),
    ]);
    if (!clinic) throw new Error("Clinic not found");
    if (!patient) throw new Error("Patient not found");
    if (!user) throw new Error("User not found");

    const encounter = await this.encounterRepository.create({
      clinic: { connect: { id: dto.clinicId } },
      patient: { connect: { id: dto.patientId } },
      status: "DRAFT",
      createdBy: { connect: { id: dto.createdByUserId } },
    });

    if (auditContext) {
      await this.auditService.logWrite({
        clinicId: auditContext.clinicId,
        actorUserId: auditContext.actorUserId,
        action: "ENCOUNTER.CREATE",
        entityType: "Encounter",
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
          diabetesScreening: true,
          hypertensionAssessment: true,
          carePlan: true,
        }
      : undefined;
    return this.encounterRepository.findById(id, include);
  }

  async listByClinic(
    clinicId: string,
    filters?: EncounterFindManyFilters
  ): Promise<Encounter[]> {
    return this.encounterRepository.findManyByClinic(clinicId, filters);
  }

  async listByPatient(
    patientId: string,
    filters?: EncounterFindManyFilters
  ): Promise<Encounter[]> {
    return this.encounterRepository.findManyByPatient(patientId, filters);
  }

  async submitForReview(
    id: string,
    auditContext?: AuditContext
  ): Promise<Encounter> {
    const existing = await this.encounterRepository.findById(id);
    if (!existing) throw new Error("Encounter not found");
    if (existing.status !== "DRAFT") {
      throw new Error(`Cannot submit for review: encounter is ${existing.status}`);
    }
    const updated = await this.encounterRepository.submitForReview(id);
    if (auditContext) {
      await this.auditService.logWrite({
        clinicId: auditContext.clinicId,
        actorUserId: auditContext.actorUserId,
        action: "ENCOUNTER.SUBMIT_FOR_REVIEW",
        entityType: "Encounter",
        entityId: updated.id,
        beforeJson: JSON.stringify(existing),
        afterJson: JSON.stringify(updated),
        requestId: auditContext.requestId,
      });
    }
    return updated;
  }

  async preceptorReview(
    id: string,
    userId: string,
    auditContext?: AuditContext
  ): Promise<Encounter> {
    const existing = await this.encounterRepository.findById(id);
    if (!existing) throw new Error("Encounter not found");
    if (existing.status !== "IN_REVIEW") {
      throw new Error(`Cannot preceptor review: encounter is ${existing.status}`);
    }
    if (existing.preceptorReviewedById) {
      throw new Error("Encounter already preceptor-reviewed");
    }
    const updated = await this.encounterRepository.setPreceptorReviewed(id, userId);
    if (auditContext) {
      await this.auditService.logWrite({
        clinicId: auditContext.clinicId,
        actorUserId: auditContext.actorUserId,
        action: "ENCOUNTER.PRECEPTOR_REVIEW",
        entityType: "Encounter",
        entityId: updated.id,
        beforeJson: JSON.stringify(existing),
        afterJson: JSON.stringify(updated),
        requestId: auditContext.requestId,
      });
    }
    return updated;
  }

  async finalize(
    id: string,
    userId: string,
    auditContext?: AuditContext
  ): Promise<Encounter> {
    const existing = await this.encounterRepository.findById(id);
    if (!existing) throw new Error("Encounter not found");
    if (existing.status !== "IN_REVIEW") {
      throw new Error(`Cannot finalize: encounter is ${existing.status}`);
    }
    if (!existing.preceptorReviewedById) {
      throw new Error("Encounter must be preceptor-reviewed before finalization");
    }
    const updated = await this.encounterRepository.setDoctorFinalized(id, userId);
    if (auditContext) {
      await this.auditService.logWrite({
        clinicId: auditContext.clinicId,
        actorUserId: auditContext.actorUserId,
        action: "ENCOUNTER.FINALIZE",
        entityType: "Encounter",
        entityId: updated.id,
        beforeJson: JSON.stringify(existing),
        afterJson: JSON.stringify(updated),
        requestId: auditContext.requestId,
      });
    }
    await this.createFollowUpReminderIfNeeded(updated, auditContext);
    return updated;
  }

  private async createFollowUpReminderIfNeeded(
    encounter: Encounter,
    auditContext?: AuditContext
  ): Promise<void> {
    const carePlan = await this.prisma.carePlan.findUnique({
      where: { encounterId: encounter.id },
    });
    if (!carePlan?.followUpDate) return;

    const [patient, clinic] = await Promise.all([
      this.prisma.patient.findUnique({ where: { id: encounter.patientId } }),
      this.prisma.clinic.findUnique({ where: { id: encounter.clinicId } }),
    ]);
    const actorUserId = auditContext?.actorUserId ?? "system";
    const requestId = auditContext?.requestId;

    if (patient?.phoneE164) {
      await this.reminderService.scheduleFollowUpReminder({
        clinicId: encounter.clinicId,
        clinicName: clinic?.name ?? "Clinic",
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
        patientCode: patient?.patientCode ?? "?",
        encounterId: encounter.id,
        followUpDate: carePlan.followUpDate,
        actorUserId,
        requestId,
      });
    }

    if (patient?.email) {
      await this.reminderService.scheduleFollowUpEmailReminder({
        clinicId: encounter.clinicId,
        clinicName: clinic?.name ?? "Clinic",
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
