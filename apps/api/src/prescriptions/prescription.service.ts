import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prescription, EncounterStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PrescriptionRepository } from './prescription.repository';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { UpdatePrescriptionDto } from './dto/update-prescription.dto';
import { MedicalHistoryService } from '../medical-history/medical-history.service';
import { isApiFeatureEnabled } from '../common/feature-flags';
import { flattenValidationErrors } from '../common/validation';
import { assertPermissionAtClinic, type ScopedRole } from '../auth/clinic-roles';
import { PERMISSIONS } from '../auth/constants/permissions';

export interface AuditContext {
  clinicId: string;
  actorUserId: string;
  /*
    The actor's clinic seats, so this service can decide for itself who may write.

    The controller's `@RequirePermission` still runs first. This is the second layer the guided
    interviews established and the reason they give for it: a boundary that depends on one layer is
    one refactor from not being a boundary. It matters more here than it used to, because since
    #134 this service has two callers -- the REST controller and the offline replay -- and a
    service reachable from two places that trusts both to have checked is exactly that shape.
  */
  roles: ScopedRole[];
  requestId?: string;
  /*
    Carried so a replayed write keeps the provenance the inline sync handler used to log.

    Delegating to this service would otherwise have quietly dropped the address and client a
    prescription arrived from, which is exactly the sort of thing a clinical audit trail is for.
  */
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class PrescriptionService {
  constructor(
    private readonly prescriptionRepository: PrescriptionRepository,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly medicalHistoryService: MedicalHistoryService,
  ) {}

  private assertWritePermission(roles: ScopedRole[], clinicId: string): void {
    assertPermissionAtClinic(
      roles,
      clinicId,
      PERMISSIONS.PRESCRIPTION_WRITE,
      'PRESCRIPTION.WRITE permission is required',
    );
  }

  private assertReadPermission(roles: ScopedRole[], clinicId: string): void {
    assertPermissionAtClinic(
      roles,
      clinicId,
      PERMISSIONS.PRESCRIPTION_READ,
      'PRESCRIPTION.READ permission is required',
    );
  }

  private async ensureEncounterNotFinalized(encounterId: string, clinicId?: string) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      select: { status: true, clinicId: true, patientId: true },
    });
    if (!encounter) throw new NotFoundException('Encounter not found');
    if (clinicId && encounter.clinicId !== clinicId) {
      throw new NotFoundException('Encounter not found');
    }
    if (encounter.status === EncounterStatus.FINALIZED) {
      throw new BadRequestException('Cannot modify prescriptions on a finalized encounter');
    }
    return encounter;
  }

  async create(
    clinicId: string,
    encounterId: string,
    dto: CreatePrescriptionDto,
    auditContext: AuditContext,
    /** Supplied only by an offline replay; see the note on the create below. */
    prescriptionId?: string,
  ): Promise<Prescription> {
    this.assertWritePermission(auditContext.roles, clinicId);
    const encounter = await this.ensureEncounterNotFinalized(encounterId, clinicId);
    if (isApiFeatureEnabled('medicalHistory')) {
      const allergySummary = await this.medicalHistoryService.getAllergySummary(
        clinicId,
        encounter.patientId,
      );
      if (
        (allergySummary.state === 'ACTIVE_ALLERGIES' || allergySummary.state === 'NOT_RECORDED') &&
        dto.allergyReviewed !== true
      ) {
        throw new BadRequestException({
          code: 'ALLERGY_REVIEW_REQUIRED',
          message: 'Review and acknowledge the patient allergy status before prescribing.',
        });
      }
    }

    const drug = await this.prisma.drug.findUnique({ where: { id: dto.drugId } });
    if (!drug) throw new NotFoundException('Drug not found');
    if (drug.clinicId !== clinicId) {
      throw new BadRequestException('Drug does not belong to this clinic');
    }

    const prescription = await this.prescriptionRepository.create({
      /*
        The offline replay writes under the id the device already queued, so replaying the same
        mutation twice cannot produce two prescriptions. An online create has no id to supply and
        lets the database generate one.
      */
      ...(prescriptionId ? { id: prescriptionId } : {}),
      encounter: { connect: { id: encounterId } },
      clinic: { connect: { id: clinicId } },
      drug: { connect: { id: dto.drugId } },
      dosage: dto.dosage,
      frequency: dto.frequency,
      duration: dto.duration,
      quantity: dto.quantity,
      instructions: dto.instructions,
      prescribedBy: { connect: { id: auditContext.actorUserId } },
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId: auditContext.actorUserId,
      action: 'PRESCRIPTION.CREATE',
      entityType: 'Prescription',
      entityId: prescription.id,
      afterJson: JSON.stringify(prescription),
      requestId: auditContext.requestId,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
    });

    return prescription;
  }

  /**
   * Validate an offline replay through the same DTO the REST route uses.
   *
   * `SyncService` used to write this record with an inline Prisma upsert that touched none of
   * this: it accepted a drug belonging to another clinic, an empty dosage and frequency, a
   * negative quantity, unbounded and unsanitized free text, and a `prescribedByUserId` chosen by
   * the client. The REST route refuses all six. The two paths now run one DTO, so they cannot
   * drift again -- the same fix #114 applied to hypertension, for the same reason.
   */
  async validateSyncPayload(payload: Record<string, unknown>): Promise<{
    dto: CreatePrescriptionDto;
  }> {
    const candidate: Record<string, unknown> = { ...payload };
    /*
      Routing and provenance, not record fields.

      The outbox stores the encounter and clinic inside the payload and the sync handler addresses
      the write from there. `prescribedByUserId` is in there too, because the form has always sent
      it -- it is dropped rather than rejected so a mutation queued before this change still
      replays, and the prescriber is taken from the replaying actor instead.
    */
    delete candidate.encounterId;
    delete candidate.clinicId;
    delete candidate.prescribedByUserId;

    const dto = plainToInstance(CreatePrescriptionDto, candidate);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    });
    if (errors.length) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Prescription validation failed.',
        fieldErrors: flattenValidationErrors(errors),
      });
    }
    return { dto };
  }

  /**
   * Apply a replayed prescription, creating it under the id the device queued.
   *
   * A replay is idempotent by that id: the second delivery of the same mutation updates the row
   * the first one wrote rather than adding a second prescription. The update goes through the
   * ordinary `update`, so a finalized encounter refuses it there as well.
   */
  async upsertFromSync(
    clinicId: string,
    encounterId: string,
    prescriptionId: string,
    dto: CreatePrescriptionDto,
    auditContext: AuditContext,
  ): Promise<Prescription> {
    const existing = await this.prescriptionRepository.findById(prescriptionId);
    if (!existing) {
      return this.create(clinicId, encounterId, dto, auditContext, prescriptionId);
    }
    if (existing.clinicId !== clinicId) {
      throw new NotFoundException('Prescription not found');
    }
    return this.update(
      prescriptionId,
      {
        dosage: dto.dosage,
        frequency: dto.frequency,
        duration: dto.duration,
        quantity: dto.quantity,
        instructions: dto.instructions,
      },
      auditContext,
    );
  }

  async listByEncounter(clinicId: string, encounterId: string, roles: ScopedRole[]) {
    this.assertReadPermission(roles, clinicId);
    return this.prescriptionRepository.listByEncounter(encounterId);
  }

  async update(
    id: string,
    dto: UpdatePrescriptionDto,
    auditContext: AuditContext,
  ): Promise<Prescription> {
    this.assertWritePermission(auditContext.roles, auditContext.clinicId);
    const existing = await this.prescriptionRepository.findById(id);
    if (!existing) throw new NotFoundException('Prescription not found');

    await this.ensureEncounterNotFinalized(existing.encounterId);

    const data: Record<string, unknown> = {};
    if (dto.dosage !== undefined) data.dosage = dto.dosage;
    if (dto.frequency !== undefined) data.frequency = dto.frequency;
    if (dto.duration !== undefined) data.duration = dto.duration;
    if (dto.quantity !== undefined) data.quantity = dto.quantity;
    if (dto.instructions !== undefined) data.instructions = dto.instructions;

    const updated = await this.prescriptionRepository.update(id, data);

    await this.auditService.logWrite({
      clinicId: auditContext.clinicId,
      actorUserId: auditContext.actorUserId,
      action: 'PRESCRIPTION.UPDATE',
      entityType: 'Prescription',
      entityId: id,
      beforeJson: JSON.stringify(existing),
      afterJson: JSON.stringify(updated),
      requestId: auditContext.requestId,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
    });

    return updated;
  }

  async remove(id: string, auditContext: AuditContext): Promise<void> {
    this.assertWritePermission(auditContext.roles, auditContext.clinicId);
    const existing = await this.prescriptionRepository.findById(id);
    if (!existing) throw new NotFoundException('Prescription not found');

    await this.ensureEncounterNotFinalized(existing.encounterId);

    await this.prescriptionRepository.delete(id);

    await this.auditService.logWrite({
      clinicId: auditContext.clinicId,
      actorUserId: auditContext.actorUserId,
      action: 'PRESCRIPTION.DELETE',
      entityType: 'Prescription',
      entityId: id,
      beforeJson: JSON.stringify(existing),
      requestId: auditContext.requestId,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
    });
  }
}
