import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  SyncOperation,
  SyncMutationStatus,
  EncounterStatus,
  GhanaRegion,
  HypertensionClassification,
  NationalIdType,
  PatientLocationStatus,
  Sex,
  MedicalHistoryCategory,
  MedicalHistoryStatus,
} from '@prisma/client';
import {
  encryptNationalId,
  generatePatientCode,
  hashNationalId,
  nationalIdLast4,
  normalizePhoneToE164,
} from '@nkwapa/db';
import { assertPermissionAtClinic, type ScopedRole } from '../auth/clinic-roles';
import type { EntityType as SyncEntityType } from './entity-types';
import { SYNC_ENTITY_PERMISSIONS, isSyncEntityType } from './sync-permissions';
import { classifySyncFailure, isTerminalOutcome } from './sync-outcome';
import { SYNC_PATIENT_SELECT } from './sync-projection';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PatientRepository } from '../patients/patient.repository';
import { resolveResidentialLocation } from '../patients/residential-location.util';
import { EncounterRepository } from '../encounters/encounter.repository';
import { SyncMutationDto, SYNC_OPERATION } from './dto/sync-mutation.dto';
import { SyncMutationResultDto, SYNC_MUTATION_RESULT_STATUS } from './dto/sync-push-response.dto';
import { SyncPullResponseDto } from './dto/sync-pull-response.dto';
import { MedicalHistoryService } from '../medical-history/medical-history.service';
import { isApiFeatureEnabled } from '../common/feature-flags';
import { ClinicalMeasurementsService } from './clinical-measurements.service';
import { MedicationReconciliationService } from '../medication-reconciliation/medication-reconciliation.service';
import type {
  CreatePatientMedicationDto,
  CreatePatientPharmacyDto,
  EndPreferredPharmacyDto,
  ReconcileMedicationListDto,
  RevisePatientMedicationDto,
  RevisePatientPharmacyDto,
  SetPreferredPharmacyDto,
} from '../medication-reconciliation/dto/medication-reconciliation.dto';
import { DiabetesScreeningService } from '../diabetes-screening/diabetes-screening.service';
import { serializeLegacyDiabetesSymptoms } from '@nkwapa/db';

export type { EntityType } from './entity-types';

export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface UserWithId {
  user: { id: string };
  roles: ScopedRole[];
}

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly patientRepository: PatientRepository,
    private readonly encounterRepository: EncounterRepository,
    private readonly medicalHistoryService: MedicalHistoryService,
    private readonly clinicalMeasurementsService: ClinicalMeasurementsService,
    private readonly medicationReconciliationService: MedicationReconciliationService,
    private readonly diabetesScreeningService: DiabetesScreeningService,
  ) {}

  async applyMutations(
    clinicId: string,
    user: UserWithId,
    mutations: SyncMutationDto[],
    metadata?: RequestMetadata,
  ): Promise<SyncMutationResultDto[]> {
    const actorUserId = user.user.id;
    const results: SyncMutationResultDto[] = [];

    for (const mut of mutations) {
      if (mut.clinicId !== clinicId) {
        results.push({
          id: mut.id,
          status: SYNC_MUTATION_RESULT_STATUS.ERROR,
          conflictType: 'CLINIC_MISMATCH',
          conflictDetails: { message: 'Mutation clinicId does not match query' },
        });
        continue;
      }

      const existing = await this.prisma.syncMutation.findUnique({
        where: {
          clinicId_idempotencyKey: {
            clinicId,
            idempotencyKey: mut.idempotencyKey,
          },
        },
      });

      if (existing && isTerminalOutcome(existing.status, existing.conflictType)) {
        const replayed: SyncMutationResultDto = {
          id: mut.id,
          status: existing.status as SyncMutationResultDto['status'],
        };
        if (existing.conflictType) {
          replayed.conflictType = existing.conflictType;
          replayed.conflictDetails = existing.conflictDetailsJson
            ? (JSON.parse(existing.conflictDetailsJson) as Record<string, unknown>)
            : undefined;
          replayed.retryable = false;
        }
        results.push(replayed);
        continue;
      }

      if (existing) {
        // A recorded failure that a replay could still resolve: the payload may have been fixed,
        // a permission granted, or a feature flag turned on. Leaving the row in place would make
        // the outcome permanent and the client's queue undrainable, which is the mechanism behind
        // the poisoned outbox. The row is cleared so the mutation is genuinely re-attempted.
        await this.prisma.syncMutation.delete({
          where: { clinicId_idempotencyKey: { clinicId, idempotencyKey: mut.idempotencyKey } },
        });
      }

      try {
        const result = await this.applyOne(clinicId, actorUserId, user, mut, metadata);
        results.push(result);
      } catch (err) {
        const outcome = classifySyncFailure(err, mut.entityType);
        results.push({
          id: mut.id,
          status: outcome.status,
          conflictType: outcome.conflictType,
          conflictDetails: outcome.conflictDetails,
          retryable: outcome.retryable,
        });

        // Every refusal is recorded so an operator can see what a client tried to replay. Only a
        // terminal one is allowed to short-circuit the next attempt; see isTerminalOutcome.
        await this.prisma.syncMutation.create({
          data: {
            clinicId,
            entityType: mut.entityType,
            entityId: mut.entityId,
            operation: mut.operation === 'UPSERT' ? SyncOperation.UPSERT : SyncOperation.DELETE,
            idempotencyKey: mut.idempotencyKey,
            status:
              outcome.status === SYNC_MUTATION_RESULT_STATUS.CONFLICT
                ? SyncMutationStatus.CONFLICT
                : SyncMutationStatus.ERROR,
            conflictType: outcome.conflictType,
            conflictDetailsJson: JSON.stringify(outcome.conflictDetails),
          },
        });
      }
    }

    return results;
  }

  /**
   * Authorize an offline mutation against the roles the actor holds *at the target clinic*.
   *
   * `POST /sync/push` only proves the caller may synchronize; it says nothing about which records
   * they may write. Every entity type is therefore mapped back to the permission its online REST
   * route requires, so a queued write is never more powerful than the same write made live.
   */
  private async assertMutationPermitted(
    clinicId: string,
    user: UserWithId,
    mut: SyncMutationDto,
  ): Promise<void> {
    if (!isSyncEntityType(mut.entityType)) {
      throw new BadRequestException(`Unknown entity type: ${mut.entityType}`);
    }
    const policy = SYNC_ENTITY_PERMISSIONS[mut.entityType];

    if (mut.operation === SYNC_OPERATION.DELETE) {
      // A non-deletable type is reported as DELETE_NOT_SUPPORTED by applyDelete, which records the
      // attempt. Failing here instead would lose that record.
      if (policy.delete === null) return;
      assertPermissionAtClinic(
        user.roles,
        clinicId,
        policy.delete,
        `${policy.delete} permission is required to delete ${mut.entityType} in this clinic`,
      );
      return;
    }

    const required =
      policy.create === policy.update
        ? policy.create
        : (await this.mutationTargetExists(mut.entityType, mut.entityId))
          ? policy.update
          : policy.create;

    assertPermissionAtClinic(
      user.roles,
      clinicId,
      required,
      `${required} permission is required to write ${mut.entityType} in this clinic`,
    );
  }

  /**
   * Whether an upsert will update rather than create, for the entity types whose create and update
   * permissions differ. Registering a patient and editing an existing chart are separate
   * permissions over REST, and a volunteer holds only the first.
   */
  private async mutationTargetExists(
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<boolean> {
    if (entityType !== 'patient') return false;
    // Same lookup applyPatientUpsert performs, through the repository, so the create/update
    // decision here and the upsert below can never disagree.
    const existing = await this.patientRepository.findById(entityId);
    return Boolean(existing);
  }

  private async applyOne(
    clinicId: string,
    actorUserId: string,
    user: UserWithId,
    mut: SyncMutationDto,
    metadata?: RequestMetadata,
  ): Promise<SyncMutationResultDto> {
    const payload = mut.payloadJson ?? {};
    const idempotencyKey = mut.idempotencyKey;

    await this.assertMutationPermitted(clinicId, user, mut);

    if (mut.operation === SYNC_OPERATION.DELETE) {
      return this.applyDelete(clinicId, actorUserId, user, mut, metadata);
    }

    switch (mut.entityType as SyncEntityType) {
      case 'patient':
        return this.applyPatientUpsert(
          clinicId,
          actorUserId,
          mut,
          payload,
          idempotencyKey,
          metadata,
        );
      case 'encounter':
        return this.applyEncounterUpsert(
          clinicId,
          actorUserId,
          mut,
          payload,
          idempotencyKey,
          metadata,
        );
      case 'vitals':
        return this.applyVitalsUpsert(
          clinicId,
          actorUserId,
          user,
          mut,
          payload,
          idempotencyKey,
          metadata,
        );
      case 'encounter_vitals_bundle':
        return this.applyVitalsBundle(
          clinicId,
          actorUserId,
          user,
          mut,
          payload,
          idempotencyKey,
          metadata,
        );
      case 'diabetes_screening':
        return this.applyDiabetesScreeningUpsert(
          clinicId,
          actorUserId,
          user,
          mut,
          payload,
          idempotencyKey,
          metadata,
        );
      case 'hypertension_assessment':
        return this.applyHypertensionAssessmentUpsert(
          clinicId,
          actorUserId,
          mut,
          payload,
          idempotencyKey,
          metadata,
        );
      case 'care_plan':
        return this.applyCarePlanUpsert(
          clinicId,
          actorUserId,
          mut,
          payload,
          idempotencyKey,
          metadata,
        );
      case 'patient_consent':
        return this.applyPatientConsentUpsert(
          clinicId,
          actorUserId,
          mut,
          payload,
          idempotencyKey,
          metadata,
        );
      case 'prescription':
        return this.applyPrescriptionUpsert(
          clinicId,
          actorUserId,
          mut,
          payload,
          idempotencyKey,
          metadata,
        );
      case 'medical_history_revision':
        return this.applyMedicalHistoryRevision(
          clinicId,
          actorUserId,
          user,
          mut,
          payload,
          idempotencyKey,
        );
      case 'patient_medication_revision':
        return this.applyPatientMedicationRevision(
          clinicId,
          actorUserId,
          user,
          mut,
          payload,
          idempotencyKey,
        );
      case 'medication_reconciliation':
        return this.applyMedicationReconciliation(
          clinicId,
          actorUserId,
          user,
          mut,
          payload,
          idempotencyKey,
        );
      case 'patient_pharmacy_revision':
        return this.applyPatientPharmacyRevision(
          clinicId,
          actorUserId,
          user,
          mut,
          payload,
          idempotencyKey,
        );
      case 'patient_pharmacy_preference':
        return this.applyPatientPharmacyPreference(
          clinicId,
          actorUserId,
          user,
          mut,
          payload,
          idempotencyKey,
        );
      default:
        throw new Error(`Unknown entity type: ${mut.entityType}`);
    }
  }

  private async applyPatientUpsert(
    clinicId: string,
    actorUserId: string,
    mut: SyncMutationDto,
    payload: Record<string, unknown>,
    idempotencyKey: string,
    metadata?: RequestMetadata,
  ): Promise<SyncMutationResultDto> {
    const nationalId = payload.nationalId as string | undefined;
    if (!nationalId) {
      throw new Error('Patient payload must include nationalId');
    }
    const hash = hashNationalId(nationalId);
    const existingByHash = await this.patientRepository.findByNationalIdHash(hash);
    const existingById = await this.patientRepository.findById(mut.entityId);

    if (existingByHash && existingByHash.id !== mut.entityId) {
      const conflictDetails = {
        existingPatientId: existingByHash.id,
        patientCode: existingByHash.patientCode,
      };
      await this.prisma.syncMutation.create({
        data: {
          clinicId,
          entityType: 'patient',
          entityId: mut.entityId,
          operation: SyncOperation.UPSERT,
          idempotencyKey,
          status: SyncMutationStatus.CONFLICT,
          conflictType: 'DUPLICATE_NATIONAL_ID',
          conflictDetailsJson: JSON.stringify(conflictDetails),
        },
      });
      return {
        id: mut.id,
        status: SYNC_MUTATION_RESULT_STATUS.CONFLICT,
        conflictType: 'DUPLICATE_NATIONAL_ID',
        conflictDetails: conflictDetails,
      };
    }

    const patientCode =
      (payload.patientCode as string) ??
      existingById?.patientCode ??
      (await generatePatientCode(this.prisma));
    this.assertPayloadClinicMatches(payload.primaryClinicId, clinicId, 'Patient');
    const primaryClinicId = clinicId;
    const createdByUserId = (payload.createdByUserId as string) ?? actorUserId;

    const rawPhone = (payload.phoneE164 as string) ?? (payload.phone as string) ?? null;
    const phoneE164 = rawPhone ? (normalizePhoneToE164(rawPhone, 'GH') ?? null) : null;

    // Residential location is resolved through the shared invariant so an
    // offline-synced patient stores the same consistent shape as a REST write.
    const location = resolveResidentialLocation({
      residentialLocationStatus: payload.residentialLocationStatus as
        | PatientLocationStatus
        | undefined,
      residentialRegion: payload.residentialRegion as GhanaRegion | undefined,
      residentialDistrict: payload.residentialDistrict as string | undefined,
      residentialCommunity: payload.residentialCommunity as string | undefined,
      residentialAddressNote: payload.residentialAddressNote as string | undefined,
    });

    const before = existingById ? JSON.stringify(existingById) : null;
    const patient = await this.prisma.patient.upsert({
      where: { id: mut.entityId },
      create: {
        id: mut.entityId,
        patientCode,
        primaryClinic: { connect: { id: primaryClinicId } },
        firstName: payload.firstName as string,
        lastName: payload.lastName as string,
        dob: payload.dob ? new Date(payload.dob as string) : null,
        sex: (payload.sex as Sex) ?? 'UNKNOWN',
        phoneE164,
        email: (payload.email as string) ?? null,
        nationalIdType: (payload.nationalIdType as NationalIdType) ?? 'OTHER',
        nationalIdCiphertext: encryptNationalId(nationalId),
        nationalIdHash: hash,
        nationalIdLast4: nationalIdLast4(nationalId),
        createdBy: createdByUserId ? { connect: { id: createdByUserId } } : undefined,
        ...location,
      },
      update: {
        patientCode,
        firstName: payload.firstName as string,
        lastName: payload.lastName as string,
        dob: payload.dob ? new Date(payload.dob as string) : null,
        sex: (payload.sex as Sex) ?? 'UNKNOWN',
        phoneE164,
        email: (payload.email as string) ?? null,
        ...location,
      },
    });

    await this.auditService.logWrite({
      clinicId: patient.primaryClinicId,
      actorUserId,
      action: existingById ? 'PATIENT.UPSERT' : 'PATIENT.CREATE',
      entityType: 'Patient',
      entityId: patient.id,
      beforeJson: before,
      afterJson: JSON.stringify(patient),
      requestId: idempotencyKey,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    });

    await this.prisma.syncMutation.create({
      data: {
        clinicId,
        entityType: 'patient',
        entityId: mut.entityId,
        operation: SyncOperation.UPSERT,
        idempotencyKey,
        status: SyncMutationStatus.APPLIED,
      },
    });

    return {
      id: mut.id,
      status: SYNC_MUTATION_RESULT_STATUS.APPLIED,
    };
  }

  private async applyEncounterUpsert(
    clinicId: string,
    actorUserId: string,
    mut: SyncMutationDto,
    payload: Record<string, unknown>,
    idempotencyKey: string,
    metadata?: RequestMetadata,
  ): Promise<SyncMutationResultDto> {
    const existing = await this.encounterRepository.findById(mut.entityId);
    if (existing && existing.status === EncounterStatus.FINALIZED) {
      const conflictDetails = {
        message: 'Cannot edit finalized encounter',
        existingStatus: existing.status,
      };
      await this.prisma.syncMutation.create({
        data: {
          clinicId,
          entityType: 'encounter',
          entityId: mut.entityId,
          operation: SyncOperation.UPSERT,
          idempotencyKey,
          status: SyncMutationStatus.CONFLICT,
          conflictType: 'CONFLICT_FINALIZED',
          conflictDetailsJson: JSON.stringify(conflictDetails),
        },
      });
      return {
        id: mut.id,
        status: SYNC_MUTATION_RESULT_STATUS.CONFLICT,
        conflictType: 'CONFLICT_FINALIZED',
        conflictDetails: conflictDetails,
      };
    }

    const before = existing ? JSON.stringify(existing) : null;
    // The encounter belongs to the clinic the request was scoped to. Taking the clinic from the
    // payload would let a client queue an encounter into a clinic it was never admitted to.
    this.assertPayloadClinicMatches(payload.clinicId, clinicId, 'Encounter');
    const encPatientId = payload.patientId as string;
    await this.assertPatientInClinic(encPatientId, clinicId, 'Encounter');
    const encCreatedBy = (payload.createdByUserId as string) ?? actorUserId;
    const status = this.resolveSyncedEncounterStatus(payload.status, existing?.status ?? null);
    const encounter = await this.prisma.encounter.upsert({
      where: { id: mut.entityId },
      create: {
        id: mut.entityId,
        clinic: { connect: { id: clinicId } },
        patient: { connect: { id: encPatientId } },
        status,
        createdBy: { connect: { id: encCreatedBy } },
      },
      update: {
        status,
      },
    });

    await this.auditService.logWrite({
      clinicId: encounter.clinicId,
      actorUserId,
      action: existing ? 'ENCOUNTER.UPSERT' : 'ENCOUNTER.CREATE',
      entityType: 'Encounter',
      entityId: encounter.id,
      beforeJson: before,
      afterJson: JSON.stringify(encounter),
      requestId: idempotencyKey,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    });

    await this.prisma.syncMutation.create({
      data: {
        clinicId,
        entityType: 'encounter',
        entityId: mut.entityId,
        operation: SyncOperation.UPSERT,
        idempotencyKey,
        status: SyncMutationStatus.APPLIED,
      },
    });

    return {
      id: mut.id,
      status: SYNC_MUTATION_RESULT_STATUS.APPLIED,
    };
  }

  /**
   * Reject a payload that names a different clinic than the request was scoped to.
   *
   * `applyMutations` already compares the mutation envelope's `clinicId`, but the payload carries
   * its own copy, and writing that one would place the record outside the clinic the caller was
   * admitted to.
   */
  private assertPayloadClinicMatches(
    payloadClinicId: unknown,
    clinicId: string,
    entityLabel: string,
  ): void {
    if (payloadClinicId != null && payloadClinicId !== clinicId) {
      throw new ForbiddenException(
        `${entityLabel} payload names a different clinic than the active clinic`,
      );
    }
  }

  private async assertPatientInClinic(
    patientId: string | undefined,
    clinicId: string,
    entityLabel: string,
  ): Promise<void> {
    if (!patientId) throw new BadRequestException(`${entityLabel} payload must include patientId`);
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, primaryClinicId: clinicId },
      select: { id: true },
    });
    if (!patient) {
      throw new NotFoundException(`${entityLabel} patient not found in the active clinic`);
    }
  }

  /**
   * The encounter status an offline replay may set.
   *
   * Finalization is a doctor's deliberate, audited act that locks vitals, screenings, and clinical
   * notes. It has its own route and its own permission, and it must not be reachable by replaying
   * a queued payload. Review submission likewise belongs to the online workflow.
   */
  private resolveSyncedEncounterStatus(
    requested: unknown,
    existingStatus: EncounterStatus | null,
  ): EncounterStatus {
    if (requested == null) return existingStatus ?? EncounterStatus.DRAFT;
    if (requested !== EncounterStatus.DRAFT) {
      throw new ConflictException({
        code: 'UNSUPPORTED_STATUS_TRANSITION',
        message: 'Encounter status changes are made online, not through offline replay.',
        requestedStatus: String(requested),
        existingStatus: existingStatus ?? EncounterStatus.DRAFT,
      });
    }
    // A queued draft must not silently reopen an encounter that has since moved on.
    return existingStatus ?? EncounterStatus.DRAFT;
  }

  /**
   * Refuse a write against a locked encounter.
   *
   * Reported as a conflict rather than a plain error, matching what the vitals, diabetes, and
   * encounter paths already do. The client treats a conflict as recoverable and an error as a hard
   * rejection that halts the whole sync pass, so signalling the same condition two different ways
   * meant a care plan or prescription queued against a finalized encounter wedged the outbox while
   * a vitals row against the same encounter recovered cleanly.
   */
  private async ensureEncounterNotFinalized(encounterId: string): Promise<void> {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      select: { status: true },
    });
    if (encounter?.status === EncounterStatus.FINALIZED) {
      throw new ConflictException({
        code: 'CONFLICT_FINALIZED',
        message: 'Cannot modify encounter data: encounter is finalized',
        existingStatus: EncounterStatus.FINALIZED,
      });
    }
  }

  private async applyVitalsUpsert(
    clinicId: string,
    actorUserId: string,
    user: UserWithId,
    mut: SyncMutationDto,
    payload: Record<string, unknown>,
    idempotencyKey: string,
    metadata?: RequestMetadata,
  ): Promise<SyncMutationResultDto> {
    await this.clinicalMeasurementsService.applyBundle({
      clinicId,
      actorUserId,
      user,
      mutation: mut,
      payload,
      metadata,
      legacy: true,
    });
    return { id: mut.id, status: SYNC_MUTATION_RESULT_STATUS.APPLIED };
  }

  private async applyVitalsBundle(
    clinicId: string,
    actorUserId: string,
    user: UserWithId,
    mut: SyncMutationDto,
    payload: Record<string, unknown>,
    _idempotencyKey: string,
    metadata?: RequestMetadata,
  ): Promise<SyncMutationResultDto> {
    await this.clinicalMeasurementsService.applyBundle({
      clinicId,
      actorUserId,
      user,
      mutation: mut,
      payload,
      metadata,
    });
    return { id: mut.id, status: SYNC_MUTATION_RESULT_STATUS.APPLIED };
  }

  private async applyDiabetesScreeningUpsert(
    clinicId: string,
    actorUserId: string,
    user: UserWithId,
    mut: SyncMutationDto,
    payload: Record<string, unknown>,
    idempotencyKey: string,
    metadata?: RequestMetadata,
  ): Promise<SyncMutationResultDto> {
    const encounterId = payload.encounterId as string;
    if (!encounterId) throw new Error('DiabetesScreening payload must include encounterId');
    const normalized = await this.diabetesScreeningService.validateSyncPayload(
      payload,
      mut.createdAt ?? new Date().toISOString(),
    );
    await this.diabetesScreeningService.upsert(
      clinicId,
      encounterId,
      { userId: actorUserId, roles: user.roles },
      normalized.dto,
      {
        requestId: idempotencyKey,
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
        syncMutation: {
          entityType: mut.entityType,
          entityId: mut.entityId,
          idempotencyKey,
        },
      },
      mut.entityId,
      normalized.compatibility,
    );

    return { id: mut.id, status: SYNC_MUTATION_RESULT_STATUS.APPLIED };
  }

  private async applyHypertensionAssessmentUpsert(
    clinicId: string,
    actorUserId: string,
    mut: SyncMutationDto,
    payload: Record<string, unknown>,
    idempotencyKey: string,
    metadata?: RequestMetadata,
  ): Promise<SyncMutationResultDto> {
    const encounterId = payload.encounterId as string;
    if (!encounterId) throw new Error('HypertensionAssessment payload must include encounterId');
    await this.ensureEncounterNotFinalized(encounterId);

    const existing = await this.prisma.hypertensionAssessment.findUnique({
      where: { encounterId },
    });
    const before = existing ? JSON.stringify(existing) : null;

    const classification =
      (payload.classification as HypertensionClassification) ?? HypertensionClassification.UNKNOWN;
    const assessment = await this.prisma.hypertensionAssessment.upsert({
      where: { encounterId },
      create: {
        id: mut.entityId,
        clinicId,
        encounterId,
        classification,
        suspected: (payload.suspected as boolean) ?? false,
        confirmed: (payload.confirmed as boolean) ?? false,
        notes: (payload.notes as string) ?? null,
      },
      update: {
        classification:
          (payload.classification as HypertensionClassification) ??
          existing?.classification ??
          HypertensionClassification.UNKNOWN,
        suspected: (payload.suspected as boolean) ?? existing?.suspected ?? false,
        confirmed: (payload.confirmed as boolean) ?? existing?.confirmed ?? false,
        notes: (payload.notes as string) ?? existing?.notes ?? null,
      },
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId,
      action: existing ? 'HYPERTENSION_ASSESSMENT.UPSERT' : 'HYPERTENSION_ASSESSMENT.CREATE',
      entityType: 'HypertensionAssessment',
      entityId: assessment.id,
      beforeJson: before,
      afterJson: JSON.stringify(assessment),
      requestId: idempotencyKey,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    });

    await this.prisma.syncMutation.create({
      data: {
        clinicId,
        entityType: 'hypertension_assessment',
        entityId: mut.entityId,
        operation: SyncOperation.UPSERT,
        idempotencyKey,
        status: SyncMutationStatus.APPLIED,
      },
    });

    return { id: mut.id, status: SYNC_MUTATION_RESULT_STATUS.APPLIED };
  }

  private async applyCarePlanUpsert(
    clinicId: string,
    actorUserId: string,
    mut: SyncMutationDto,
    payload: Record<string, unknown>,
    idempotencyKey: string,
    metadata?: RequestMetadata,
  ): Promise<SyncMutationResultDto> {
    const encounterId = payload.encounterId as string;
    if (!encounterId) throw new Error('CarePlan payload must include encounterId');
    await this.ensureEncounterNotFinalized(encounterId);

    const existing = await this.prisma.carePlan.findUnique({
      where: { encounterId },
    });
    const before = existing ? JSON.stringify(existing) : null;

    const carePlan = await this.prisma.carePlan.upsert({
      where: { encounterId },
      create: {
        id: mut.entityId,
        clinicId,
        encounterId,
        counselingGiven: (payload.counselingGiven as boolean) ?? false,
        medicationPrescribed: (payload.medicationPrescribed as boolean) ?? false,
        followUpDate: payload.followUpDate ? new Date(payload.followUpDate as string) : null,
        notes: (payload.notes as string) ?? null,
      },
      update: {
        counselingGiven: (payload.counselingGiven as boolean) ?? existing?.counselingGiven ?? false,
        medicationPrescribed:
          (payload.medicationPrescribed as boolean) ?? existing?.medicationPrescribed ?? false,
        followUpDate: payload.followUpDate
          ? new Date(payload.followUpDate as string)
          : (existing?.followUpDate ?? null),
        notes: (payload.notes as string) ?? existing?.notes ?? null,
      },
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId,
      action: existing ? 'CARE_PLAN.UPSERT' : 'CARE_PLAN.CREATE',
      entityType: 'CarePlan',
      entityId: carePlan.id,
      beforeJson: before,
      afterJson: JSON.stringify(carePlan),
      requestId: idempotencyKey,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    });

    await this.prisma.syncMutation.create({
      data: {
        clinicId,
        entityType: 'care_plan',
        entityId: mut.entityId,
        operation: SyncOperation.UPSERT,
        idempotencyKey,
        status: SyncMutationStatus.APPLIED,
      },
    });

    return { id: mut.id, status: SYNC_MUTATION_RESULT_STATUS.APPLIED };
  }

  private async applyPatientConsentUpsert(
    clinicId: string,
    actorUserId: string,
    mut: SyncMutationDto,
    payload: Record<string, unknown>,
    idempotencyKey: string,
    metadata?: RequestMetadata,
  ): Promise<SyncMutationResultDto> {
    const patientId = payload.patientId as string;
    const consentType = payload.consentType as string;
    const status = payload.status as string;
    if (!patientId || !consentType || !status) {
      throw new Error('PatientConsent payload must include patientId, consentType, status');
    }

    const consentVersion = (payload.consentVersion as string) ?? 'v1-en';
    if (consentVersion !== 'v1-en') {
      throw new Error('consent_version must be "v1-en"');
    }
    const consentTextSnapshot = (payload.consentTextSnapshot as string) ?? '';
    if (!consentTextSnapshot.trim()) {
      throw new Error('consent_text_snapshot must be non-empty');
    }

    const existing = await this.prisma.patientConsent.findUnique({
      where: { id: mut.entityId },
    });
    const before = existing ? JSON.stringify(existing) : null;

    if (status === 'GRANTED') {
      const existingGranted = await this.prisma.patientConsent.findMany({
        where: {
          patientId,
          clinicId,
          consentType: consentType as 'RESEARCH_DEIDENTIFIED',
          status: 'GRANTED',
        },
      });
      for (const g of existingGranted) {
        if (g.id !== mut.entityId) {
          const beforeRevoke = JSON.stringify(g);
          await this.prisma.patientConsent.update({
            where: { id: g.id },
            data: { status: 'REVOKED', revokedAt: new Date() },
          });
          await this.auditService.logWrite({
            clinicId,
            actorUserId,
            action: 'CONSENT.REVOKE',
            entityType: 'PatientConsent',
            entityId: g.id,
            beforeJson: beforeRevoke,
            afterJson: JSON.stringify({
              ...g,
              status: 'REVOKED',
              revokedAt: new Date().toISOString(),
            }),
            requestId: idempotencyKey,
            ipAddress: metadata?.ipAddress,
            userAgent: metadata?.userAgent,
          });
        }
      }
    }

    const consent = await this.prisma.patientConsent.upsert({
      where: { id: mut.entityId },
      create: {
        id: mut.entityId,
        patientId,
        clinicId,
        consentType: consentType as 'RESEARCH_DEIDENTIFIED',
        status: status as 'GRANTED' | 'REVOKED',
        consentVersion,
        consentTextSnapshot,
        grantedAt: new Date(payload.grantedAt as string),
        revokedAt: payload.revokedAt ? new Date(payload.revokedAt as string) : null,
        recordedByUserId: (payload.recordedByUserId as string) ?? actorUserId,
        witnessName: (payload.witnessName as string) ?? null,
        witnessPhoneE164: (payload.witnessPhoneE164 as string) ?? null,
      },
      update: {
        consentVersion,
        consentTextSnapshot,
        grantedAt: payload.grantedAt ? new Date(payload.grantedAt as string) : existing!.grantedAt,
        revokedAt: payload.revokedAt
          ? new Date(payload.revokedAt as string)
          : (existing?.revokedAt ?? null),
        status: status as 'GRANTED' | 'REVOKED',
        witnessName: (payload.witnessName as string) ?? existing?.witnessName ?? null,
        witnessPhoneE164:
          (payload.witnessPhoneE164 as string) ?? existing?.witnessPhoneE164 ?? null,
      },
    });

    const auditAction = status === 'GRANTED' ? 'CONSENT.GRANT' : 'CONSENT.REVOKE';
    await this.auditService.logWrite({
      clinicId,
      actorUserId,
      action: auditAction,
      entityType: 'PatientConsent',
      entityId: consent.id,
      beforeJson: before,
      afterJson: JSON.stringify(consent),
      requestId: idempotencyKey,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    });

    await this.prisma.syncMutation.create({
      data: {
        clinicId,
        entityType: 'patient_consent',
        entityId: mut.entityId,
        operation: SyncOperation.UPSERT,
        idempotencyKey,
        status: SyncMutationStatus.APPLIED,
      },
    });

    return { id: mut.id, status: SYNC_MUTATION_RESULT_STATUS.APPLIED };
  }

  private async applyPrescriptionUpsert(
    clinicId: string,
    actorUserId: string,
    mut: SyncMutationDto,
    payload: Record<string, unknown>,
    idempotencyKey: string,
    metadata?: RequestMetadata,
  ): Promise<SyncMutationResultDto> {
    const encounterId = payload.encounterId as string;
    if (!encounterId) throw new Error('Prescription payload must include encounterId');
    await this.ensureEncounterNotFinalized(encounterId);
    if (isApiFeatureEnabled('medicalHistory')) {
      const encounter = await this.prisma.encounter.findUnique({
        where: { id: encounterId },
        select: { clinicId: true, patientId: true },
      });
      if (!encounter || encounter.clinicId !== clinicId) {
        throw new Error('Prescription encounter does not belong to this clinic');
      }
      const allergySummary = await this.medicalHistoryService.getAllergySummary(
        clinicId,
        encounter.patientId,
      );
      if (
        (allergySummary.state === 'ACTIVE_ALLERGIES' || allergySummary.state === 'NOT_RECORDED') &&
        payload.allergyReviewed !== true
      ) {
        throw new Error('Allergy review acknowledgement is required');
      }
    }

    const drugId = payload.drugId as string;
    if (!drugId) throw new Error('Prescription payload must include drugId');

    const existing = await this.prisma.prescription.findUnique({
      where: { id: mut.entityId },
    });
    const before = existing ? JSON.stringify(existing) : null;

    const prescription = await this.prisma.prescription.upsert({
      where: { id: mut.entityId },
      create: {
        id: mut.entityId,
        clinicId,
        encounterId,
        drugId,
        dosage: (payload.dosage as string) ?? '',
        frequency: (payload.frequency as string) ?? '',
        duration: (payload.duration as string) ?? null,
        quantity: (payload.quantity as number) ?? null,
        instructions: (payload.instructions as string) ?? null,
        prescribedByUserId: (payload.prescribedByUserId as string) ?? actorUserId,
      },
      update: {
        dosage: (payload.dosage as string) ?? existing?.dosage ?? '',
        frequency: (payload.frequency as string) ?? existing?.frequency ?? '',
        duration: (payload.duration as string) ?? existing?.duration ?? null,
        quantity: (payload.quantity as number) ?? existing?.quantity ?? null,
        instructions: (payload.instructions as string) ?? existing?.instructions ?? null,
      },
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId,
      action: existing ? 'PRESCRIPTION.UPSERT' : 'PRESCRIPTION.CREATE',
      entityType: 'Prescription',
      entityId: prescription.id,
      beforeJson: before,
      afterJson: JSON.stringify(prescription),
      requestId: idempotencyKey,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    });

    await this.prisma.syncMutation.create({
      data: {
        clinicId,
        entityType: 'prescription',
        entityId: mut.entityId,
        operation: SyncOperation.UPSERT,
        idempotencyKey,
        status: SyncMutationStatus.APPLIED,
      },
    });

    return { id: mut.id, status: SYNC_MUTATION_RESULT_STATUS.APPLIED };
  }

  private async applyMedicalHistoryRevision(
    clinicId: string,
    actorUserId: string,
    user: UserWithId,
    mut: SyncMutationDto,
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<SyncMutationResultDto> {
    if (!isApiFeatureEnabled('medicalHistory')) {
      throw new Error('Medical history is not enabled');
    }
    const patientId = payload.patientId as string | undefined;
    const revisionId = payload.revisionId as string | undefined;
    if (!patientId || !revisionId) {
      throw new Error('Medical history payload must include patientId and revisionId');
    }
    const snapshot = {
      revisionId,
      status: payload.status as MedicalHistoryStatus,
      onsetDate: payload.onsetDate as string | undefined,
      occurrenceDate: payload.occurrenceDate as string | undefined,
      resolvedDate: payload.resolvedDate as string | undefined,
      details: (payload.details ?? {}) as Record<string, never>,
      notes: payload.notes as string | undefined,
      sourceEncounterId: payload.sourceEncounterId as string | undefined,
    };
    const expectedCurrentRevisionId = payload.expectedCurrentRevisionId as string | undefined;
    if (expectedCurrentRevisionId) {
      await this.medicalHistoryService.revise(
        clinicId,
        patientId,
        mut.entityId,
        actorUserId,
        { ...snapshot, expectedCurrentRevisionId },
        idempotencyKey,
      );
    } else {
      const category = payload.category as MedicalHistoryCategory | undefined;
      if (!category) throw new Error('New medical history records require a category');
      await this.medicalHistoryService.create(
        clinicId,
        patientId,
        actorUserId,
        { ...snapshot, recordId: mut.entityId, category },
        idempotencyKey,
      );
    }

    await this.prisma.syncMutation.create({
      data: {
        clinicId,
        entityType: 'medical_history_revision',
        entityId: mut.entityId,
        operation: SyncOperation.UPSERT,
        idempotencyKey,
        status: SyncMutationStatus.APPLIED,
      },
    });
    return { id: mut.id, status: SYNC_MUTATION_RESULT_STATUS.APPLIED };
  }

  private async applyPatientMedicationRevision(
    clinicId: string,
    actorUserId: string,
    user: UserWithId,
    mut: SyncMutationDto,
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<SyncMutationResultDto> {
    this.requireMedicationReconciliationEnabled();
    const patientId = payload.patientId as string | undefined;
    const revisionId = payload.revisionId as string | undefined;
    if (!patientId || !revisionId)
      throw new Error('Medication payload requires patientId and revisionId');
    const expected = payload.expectedCurrentRevisionId as string | undefined;
    const snapshot = { ...payload, revisionId };
    if (expected) {
      await this.medicationReconciliationService.reviseMedication(
        clinicId,
        patientId,
        mut.entityId,
        actorUserId,
        snapshot as unknown as RevisePatientMedicationDto,
        { requestId: idempotencyKey },
      );
    } else {
      await this.medicationReconciliationService.createMedication(
        clinicId,
        patientId,
        actorUserId,
        { ...snapshot, recordId: mut.entityId } as unknown as CreatePatientMedicationDto,
        { requestId: idempotencyKey },
      );
    }
    return this.recordAppliedMutation(clinicId, mut, idempotencyKey);
  }

  private async applyMedicationReconciliation(
    clinicId: string,
    actorUserId: string,
    user: UserWithId,
    mut: SyncMutationDto,
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<SyncMutationResultDto> {
    this.requireMedicationReconciliationEnabled();
    const patientId = payload.patientId as string | undefined;
    if (!patientId) throw new Error('Reconciliation payload requires patientId');
    await this.medicationReconciliationService.reconcile(
      clinicId,
      patientId,
      actorUserId,
      { ...payload, eventId: mut.entityId } as unknown as ReconcileMedicationListDto,
      { requestId: idempotencyKey },
    );
    return this.recordAppliedMutation(clinicId, mut, idempotencyKey);
  }

  private async applyPatientPharmacyRevision(
    clinicId: string,
    actorUserId: string,
    user: UserWithId,
    mut: SyncMutationDto,
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<SyncMutationResultDto> {
    this.requireMedicationReconciliationEnabled();
    const patientId = payload.patientId as string | undefined;
    const revisionId = payload.revisionId as string | undefined;
    if (!patientId || !revisionId)
      throw new Error('Pharmacy payload requires patientId and revisionId');
    const expected = payload.expectedCurrentRevisionId as string | undefined;
    if (expected) {
      await this.medicationReconciliationService.revisePharmacy(
        clinicId,
        patientId,
        mut.entityId,
        actorUserId,
        payload as unknown as RevisePatientPharmacyDto,
        { requestId: idempotencyKey },
      );
    } else {
      await this.medicationReconciliationService.createPharmacy(
        clinicId,
        patientId,
        actorUserId,
        { ...payload, recordId: mut.entityId } as unknown as CreatePatientPharmacyDto,
        { requestId: idempotencyKey },
      );
    }
    return this.recordAppliedMutation(clinicId, mut, idempotencyKey);
  }

  private async applyPatientPharmacyPreference(
    clinicId: string,
    actorUserId: string,
    user: UserWithId,
    mut: SyncMutationDto,
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<SyncMutationResultDto> {
    this.requireMedicationReconciliationEnabled();
    const patientId = payload.patientId as string | undefined;
    const action = payload.action as string | undefined;
    if (!patientId) throw new Error('Pharmacy preference payload requires patientId');
    if (action === 'END') {
      await this.medicationReconciliationService.endPreferredPharmacy(
        clinicId,
        patientId,
        actorUserId,
        payload as unknown as EndPreferredPharmacyDto,
        { requestId: idempotencyKey },
      );
    } else {
      const pharmacyRecordId = payload.pharmacyRecordId as string | undefined;
      if (!pharmacyRecordId) throw new Error('Preference SET requires pharmacyRecordId');
      await this.medicationReconciliationService.setPreferredPharmacy(
        clinicId,
        patientId,
        pharmacyRecordId,
        actorUserId,
        { ...payload, preferenceId: mut.entityId } as unknown as SetPreferredPharmacyDto,
        { requestId: idempotencyKey },
      );
    }
    return this.recordAppliedMutation(clinicId, mut, idempotencyKey);
  }

  private requireMedicationReconciliationEnabled() {
    if (!isApiFeatureEnabled('medicationReconciliation'))
      throw new Error('Medication reconciliation is not enabled');
  }

  private async recordAppliedMutation(
    clinicId: string,
    mut: SyncMutationDto,
    idempotencyKey: string,
  ) {
    await this.prisma.syncMutation.create({
      data: {
        clinicId,
        entityType: mut.entityType,
        entityId: mut.entityId,
        operation: SyncOperation.UPSERT,
        idempotencyKey,
        status: SyncMutationStatus.APPLIED,
      },
    });
    return { id: mut.id, status: SYNC_MUTATION_RESULT_STATUS.APPLIED };
  }

  private async applyDelete(
    clinicId: string,
    actorUserId: string,
    user: UserWithId,
    mut: SyncMutationDto,
    metadata?: RequestMetadata,
  ): Promise<SyncMutationResultDto> {
    const entityType = mut.entityType as SyncEntityType;
    const idempotencyKey = mut.idempotencyKey;

    const deletableTypes: SyncEntityType[] = [
      'vitals',
      'diabetes_screening',
      'hypertension_assessment',
      'care_plan',
      'patient_consent',
      'prescription',
    ];
    if (!deletableTypes.includes(entityType)) {
      const msg = `DELETE not supported for entity type: ${entityType}`;
      await this.prisma.syncMutation.create({
        data: {
          clinicId,
          entityType: mut.entityType,
          entityId: mut.entityId,
          operation: SyncOperation.DELETE,
          idempotencyKey,
          status: SyncMutationStatus.ERROR,
          conflictType: 'DELETE_NOT_SUPPORTED',
          conflictDetailsJson: JSON.stringify({ message: msg }),
        },
      });
      return {
        id: mut.id,
        status: SYNC_MUTATION_RESULT_STATUS.ERROR,
        conflictType: 'DELETE_NOT_SUPPORTED',
        conflictDetails: { message: msg },
      };
    }

    if (entityType === 'vitals') {
      const vitals = await this.prisma.vitals.findFirst({
        where: { id: mut.entityId, clinicId },
        select: { encounter: { select: { status: true } } },
      });
      if (!vitals) throw new NotFoundException('Vitals not found in the active clinic');
      if (vitals.encounter.status === EncounterStatus.FINALIZED) {
        throw new ConflictException({
          code: 'CONFLICT_FINALIZED',
          message: 'Cannot delete measurements for a finalized encounter',
          existingStatus: EncounterStatus.FINALIZED,
        });
      }
    }

    if (entityType === 'diabetes_screening') {
      const screening = await this.prisma.diabetesScreening.findFirst({
        where: { id: mut.entityId, clinicId },
        select: { encounter: { select: { status: true } } },
      });
      if (!screening) {
        throw new NotFoundException('Diabetes screening not found in the active clinic');
      }
      if (screening.encounter.status === EncounterStatus.FINALIZED) {
        throw new ConflictException({
          code: 'CONFLICT_FINALIZED',
          message: 'Cannot delete diabetes screening for a finalized encounter',
          existingStatus: EncounterStatus.FINALIZED,
        });
      }
    }

    const beforeMap: Record<string, (id: string) => Promise<unknown>> = {
      vitals: (id) => this.prisma.vitals.findFirst({ where: { id, clinicId } }),
      diabetes_screening: (id) =>
        this.prisma.diabetesScreening.findFirst({ where: { id, clinicId } }),
      hypertension_assessment: (id) =>
        this.prisma.hypertensionAssessment.findFirst({ where: { id, clinicId } }),
      care_plan: (id) => this.prisma.carePlan.findFirst({ where: { id, clinicId } }),
      patient_consent: (id) => this.prisma.patientConsent.findFirst({ where: { id, clinicId } }),
      prescription: (id) => this.prisma.prescription.findFirst({ where: { id, clinicId } }),
    };
    const finder = beforeMap[entityType];
    const beforeRecord = finder ? await finder(mut.entityId) : null;
    const before = beforeRecord ? JSON.stringify(beforeRecord) : null;

    const deleteMap: Record<string, () => Promise<unknown>> = {
      vitals: () => this.prisma.vitals.deleteMany({ where: { id: mut.entityId, clinicId } }),
      diabetes_screening: () =>
        this.prisma.diabetesScreening.deleteMany({ where: { id: mut.entityId, clinicId } }),
      hypertension_assessment: () =>
        this.prisma.hypertensionAssessment.deleteMany({ where: { id: mut.entityId, clinicId } }),
      care_plan: () => this.prisma.carePlan.deleteMany({ where: { id: mut.entityId, clinicId } }),
      patient_consent: () =>
        this.prisma.patientConsent.deleteMany({ where: { id: mut.entityId, clinicId } }),
      prescription: () =>
        this.prisma.prescription.deleteMany({ where: { id: mut.entityId, clinicId } }),
    };
    await deleteMap[entityType]!();

    const actionMap: Record<string, string> = {
      vitals: 'VITALS.DELETE',
      diabetes_screening: 'DIABETES_SCREENING.DELETE',
      hypertension_assessment: 'HYPERTENSION_ASSESSMENT.DELETE',
      care_plan: 'CARE_PLAN.DELETE',
      patient_consent: 'PATIENT_CONSENT.DELETE',
      prescription: 'PRESCRIPTION.DELETE',
    };
    await this.auditService.logWrite({
      clinicId,
      actorUserId,
      action: actionMap[entityType]!,
      entityType: entityType.replace('_', ''),
      entityId: mut.entityId,
      beforeJson: before,
      afterJson: null,
      requestId: idempotencyKey,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    });

    await this.prisma.syncMutation.create({
      data: {
        clinicId,
        entityType: mut.entityType,
        entityId: mut.entityId,
        operation: SyncOperation.DELETE,
        idempotencyKey,
        status: SyncMutationStatus.APPLIED,
      },
    });

    return { id: mut.id, status: SYNC_MUTATION_RESULT_STATUS.APPLIED };
  }

  async pull(clinicId: string, since?: string): Promise<SyncPullResponseDto> {
    const sinceDate = since
      ? (() => {
          const [ts] = since.split('|');
          const d = new Date(ts);
          return isNaN(d.getTime()) ? undefined : d;
        })()
      : undefined;

    const where = { clinicId };
    const updatedAtFilter = sinceDate ? { updatedAt: { gt: sinceDate } } : {};

    const [
      patients,
      encounters,
      vitalsRows,
      tobaccoScreenings,
      diabetesScreenings,
      hypertensionAssessments,
      carePlans,
      patientConsents,
      prescriptions,
      medicalHistoryRecords,
      medicalHistoryRevisions,
      patientMedicationRecords,
      patientMedicationRevisions,
      medicationReconciliationEvents,
      patientPharmacyRecords,
      patientPharmacyRevisions,
      patientPharmacyPreferences,
    ] = await Promise.all([
      this.prisma.patient.findMany({
        where: {
          primaryClinicId: clinicId,
          mergedIntoPatientId: null,
          ...updatedAtFilter,
        },
        select: SYNC_PATIENT_SELECT,
      }),
      this.prisma.encounter.findMany({
        where: { ...where, ...updatedAtFilter },
      }),
      this.prisma.vitals.findMany({
        where: { ...where, ...updatedAtFilter },
      }),
      this.prisma.tobaccoScreening.findMany({
        where: { ...where, ...updatedAtFilter },
      }),
      this.prisma.diabetesScreening.findMany({
        where: { ...where, ...updatedAtFilter },
        include: { authoredBy: { select: { id: true, displayName: true } } },
      }),
      this.prisma.hypertensionAssessment.findMany({
        where: { ...where, ...updatedAtFilter },
      }),
      this.prisma.carePlan.findMany({
        where: { ...where, ...updatedAtFilter },
      }),
      this.prisma.patientConsent.findMany({
        where: { ...where, ...updatedAtFilter },
      }),
      this.prisma.prescription.findMany({
        where: { ...where, ...updatedAtFilter },
      }),
      this.prisma.medicalHistoryRecord.findMany({
        where: { ...where, ...updatedAtFilter },
      }),
      this.prisma.medicalHistoryRevision.findMany({
        where: {
          record: { clinicId },
          ...(sinceDate ? { createdAt: { gt: sinceDate } } : {}),
        },
      }),
      this.prisma.patientMedicationRecord.findMany({ where: { ...where, ...updatedAtFilter } }),
      this.prisma.patientMedicationRevision.findMany({
        where: { record: { clinicId }, ...(sinceDate ? { createdAt: { gt: sinceDate } } : {}) },
      }),
      this.prisma.medicationReconciliationEvent.findMany({
        where: { ...where, ...(sinceDate ? { createdAt: { gt: sinceDate } } : {}) },
      }),
      this.prisma.patientPharmacyRecord.findMany({ where: { ...where, ...updatedAtFilter } }),
      this.prisma.patientPharmacyRevision.findMany({
        where: { record: { clinicId }, ...(sinceDate ? { createdAt: { gt: sinceDate } } : {}) },
      }),
      this.prisma.patientPharmacyPreference.findMany({ where: { ...where, ...updatedAtFilter } }),
    ]);
    const vitals = vitalsRows.map((record) => ({
      ...record,
      heartRate: record.pulseBpm,
    }));

    const diabetesScreeningRecords = diabetesScreenings.map((record) => ({
      ...record,
      symptomsJson: serializeLegacyDiabetesSymptoms(record.symptoms),
    }));

    const allRows = [
      ...patients.map((p) => ({ updatedAt: p.updatedAt, id: p.id })),
      ...encounters.map((e) => ({ updatedAt: e.updatedAt, id: e.id })),
      ...vitals.map((v) => ({ updatedAt: v.updatedAt, id: v.id })),
      ...tobaccoScreenings.map((t) => ({ updatedAt: t.updatedAt, id: t.id })),
      ...diabetesScreenings.map((d) => ({ updatedAt: d.updatedAt, id: d.id })),
      ...hypertensionAssessments.map((h) => ({ updatedAt: h.updatedAt, id: h.id })),
      ...carePlans.map((c) => ({ updatedAt: c.updatedAt, id: c.id })),
      ...patientConsents.map((pc) => ({ updatedAt: pc.updatedAt, id: pc.id })),
      ...prescriptions.map((p) => ({ updatedAt: p.updatedAt, id: p.id })),
      ...medicalHistoryRecords.map((record) => ({
        updatedAt: record.updatedAt,
        id: record.id,
      })),
      ...medicalHistoryRevisions.map((revision) => ({
        updatedAt: revision.createdAt,
        id: revision.id,
      })),
      ...patientMedicationRecords.map((record) => ({ updatedAt: record.updatedAt, id: record.id })),
      ...patientMedicationRevisions.map((revision) => ({
        updatedAt: revision.createdAt,
        id: revision.id,
      })),
      ...medicationReconciliationEvents.map((event) => ({
        updatedAt: event.createdAt,
        id: event.id,
      })),
      ...patientPharmacyRecords.map((record) => ({ updatedAt: record.updatedAt, id: record.id })),
      ...patientPharmacyRevisions.map((revision) => ({
        updatedAt: revision.createdAt,
        id: revision.id,
      })),
      ...patientPharmacyPreferences.map((preference) => ({
        updatedAt: preference.updatedAt,
        id: preference.id,
      })),
    ];
    const maxRow = allRows.reduce(
      (acc, r) =>
        !acc || r.updatedAt > acc.updatedAt
          ? r
          : acc.updatedAt.getTime() === r.updatedAt.getTime() && r.id > acc.id
            ? r
            : acc,
      null as { updatedAt: Date; id: string } | null,
    );
    const nextCursor = maxRow ? `${maxRow.updatedAt.toISOString()}|${maxRow.id}` : (since ?? '');

    return {
      cursor: nextCursor,
      patients,
      encounters,
      vitals,
      tobaccoScreenings,
      diabetesScreenings: diabetesScreeningRecords,
      hypertensionAssessments,
      carePlans,
      patientConsents,
      prescriptions,
      medicalHistoryRecords,
      medicalHistoryRevisions,
      patientMedicationRecords,
      patientMedicationRevisions,
      medicationReconciliationEvents,
      patientPharmacyRecords,
      patientPharmacyRevisions,
      patientPharmacyPreferences,
    };
  }
}
