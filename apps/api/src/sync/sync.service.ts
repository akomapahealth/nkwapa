import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  SyncOperation,
  SyncMutationStatus,
  EncounterStatus,
  GhanaRegion,
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
import { recordAppliedSyncMutation } from './applied-sync-mutation';
import {
  classifySyncFailure,
  isTerminalOutcome,
  replayStoredOutcome,
  syncRefusal,
  type SyncOutcome,
} from './sync-outcome';
import {
  SYNC_DIABETES_SCREENING_SELECT,
  SYNC_ENCOUNTER_MEDICATION_ADHERENCE_SELECT,
  SYNC_HYPERTENSION_ASSESSMENT_SELECT,
  SYNC_PATIENT_SELECT,
} from './sync-projection';
import { PrismaService } from '../prisma/prisma.service';
import { lockForTransaction } from '../prisma/transaction-lock';
import { TelemetryService } from '../telemetry/telemetry.service';
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
import { HypertensionAssessmentService } from '../hypertension-assessment/hypertension-assessment.service';
import { PrescriptionService } from '../prescriptions/prescription.service';
import { MedicationAdherenceService } from '../medication-adherence/medication-adherence.service';
import { OpsService, type OpsWriteContext } from '../ops/ops.service';
import {
  PatientCheckInReplayPayload,
  ShiftCheckInReplayPayload,
  ShiftCheckOutReplayPayload,
} from '../ops/dto/ops-replay.dto';
import { validatePayload } from '../common/validation';
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
    private readonly hypertensionAssessmentService: HypertensionAssessmentService,
    private readonly medicationAdherenceService: MedicationAdherenceService,
    private readonly prescriptionService: PrescriptionService,
    private readonly opsService: OpsService,
    @Optional() private readonly telemetry?: TelemetryService,
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
        results.push(
          syncRefusal(mut.id, SYNC_MUTATION_RESULT_STATUS.ERROR, 'CLINIC_MISMATCH', {
            message: 'Mutation clinicId does not match query',
          }),
        );
        continue;
      }

      // Two pushes of the same change (two tabs, or a retried request that had in fact landed)
      // used to both find no record, both apply, and then collide on the record's unique key,
      // which aborted the request's transaction and failed the whole push with a 500. Holding the
      // key until this request commits makes the second one wait and then read the first's
      // answer, so a change applies once and both callers are told the same thing.
      await lockForTransaction(this.prisma, `sync-mutation:${clinicId}:${mut.idempotencyKey}`);

      const existing = await this.prisma.syncMutation.findUnique({
        where: {
          clinicId_idempotencyKey: {
            clinicId,
            idempotencyKey: mut.idempotencyKey,
          },
        },
      });

      if (existing && isTerminalOutcome(existing.status, existing.conflictType)) {
        results.push(replayStoredOutcome(mut.id, existing));
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
        results.push({ id: mut.id, ...outcome });
        await this.recordRefusal(clinicId, mut, outcome);
      }
    }

    this.recordRefusalTelemetry(clinicId, mutations, results);
    return results;
  }

  /**
   * One event per refused change: its code, its entity type and whether it will be retried. The
   * batch's totals are recorded by the push route itself; this is what explains them.
   */
  private recordRefusalTelemetry(
    clinicId: string,
    mutations: SyncMutationDto[],
    results: SyncMutationResultDto[],
  ): void {
    if (!this.telemetry) return;
    const entityTypes = new Map(mutations.map((mut) => [mut.id, mut.entityType]));
    for (const result of results) {
      if (result.status === SYNC_MUTATION_RESULT_STATUS.APPLIED) continue;
      const entityType = entityTypes.get(result.id);
      this.telemetry.record('sync.mutation.refuse', {
        clinicId,
        reason: result.conflictType,
        entityType: entityType && isSyncEntityType(entityType) ? entityType : 'other',
        retryable: result.retryable === true,
      });
    }
  }

  /**
   * Record a refusal so an operator can see what a client tried to replay.
   *
   * Only a terminal one is allowed to short-circuit the next attempt; see isTerminalOutcome.
   */
  private async recordRefusal(
    clinicId: string,
    mut: SyncMutationDto,
    outcome: SyncOutcome,
  ): Promise<void> {
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

  /** Refuse a mutation a handler detected itself, recorded the same way as a thrown refusal. */
  private async refuse(
    clinicId: string,
    mut: SyncMutationDto,
    status: Exclude<SyncMutationResultDto['status'], 'APPLIED'>,
    conflictType: string,
    conflictDetails: Record<string, unknown>,
  ): Promise<SyncMutationResultDto> {
    const result = syncRefusal(mut.id, status, conflictType, conflictDetails);
    await this.recordRefusal(clinicId, mut, result);
    return result;
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

    // Every patient-scoped change, not only the ones whose handler looks the chart up itself: a
    // medical history or medication change queued against a chart that has since been merged
    // would otherwise come back as "not found" and be retried forever.
    if (
      mut.operation === SYNC_OPERATION.UPSERT &&
      mut.entityType !== 'patient' &&
      mut.entityType !== 'encounter' &&
      typeof payload.patientId === 'string'
    ) {
      await this.assertPatientNotMerged(payload.patientId, clinicId, 'This change');
    }

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
      case 'diabetes_glucose_reading':
        return this.applyGlucoseReading(
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
          user,
          mut,
          payload,
          idempotencyKey,
          metadata,
        );
      case 'encounter_medication_adherence':
        return this.applyMedicationAdherenceReplace(
          clinicId,
          actorUserId,
          user,
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
          user,
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
      case 'shift_check_in':
      case 'shift_check_out':
      case 'patient_check_in':
        return this.applyOpsReplay(clinicId, actorUserId, mut, payload, metadata);
      default:
        throw new Error(`Unknown entity type: ${mut.entityType}`);
    }
  }

  /**
   * Replay a clinic-operations action through the same service the REST route uses.
   *
   * The service writes the record, its audit event and the idempotency record in one transaction,
   * and treats a write that already applied under this id as applied. A check-in that reached the
   * server online before the connection dropped therefore comes back as applied, not duplicated.
   */
  private async applyOpsReplay(
    clinicId: string,
    actorUserId: string,
    mut: SyncMutationDto,
    payload: Record<string, unknown>,
    metadata?: RequestMetadata,
  ): Promise<SyncMutationResultDto> {
    const context = (occurredAt: string): OpsWriteContext => ({
      requestId: mut.idempotencyKey,
      replay: {
        occurredAt: new Date(occurredAt),
        syncMutation: {
          entityType: mut.entityType,
          entityId: mut.entityId,
          idempotencyKey: mut.idempotencyKey,
        },
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
      },
    });
    const invalid = 'Queued clinic operation failed validation';

    switch (mut.entityType as SyncEntityType) {
      case 'shift_check_in': {
        const dto = await validatePayload(ShiftCheckInReplayPayload, payload, invalid);
        await this.opsService.checkIn(
          clinicId,
          actorUserId,
          { id: mut.entityId, roleAtShift: dto.roleAtShift, notes: dto.notes },
          context(dto.occurredAt),
        );
        break;
      }
      case 'shift_check_out': {
        const dto = await validatePayload(ShiftCheckOutReplayPayload, payload, invalid);
        await this.opsService.checkOut(
          clinicId,
          mut.entityId,
          actorUserId,
          context(dto.occurredAt),
        );
        break;
      }
      default: {
        const dto = await validatePayload(PatientCheckInReplayPayload, payload, invalid);
        await this.opsService.createCheckIn(
          clinicId,
          actorUserId,
          { id: mut.entityId, patientId: dto.patientId, source: dto.source, notes: dto.notes },
          context(dto.occurredAt),
        );
      }
    }
    return { id: mut.id, status: SYNC_MUTATION_RESULT_STATUS.APPLIED };
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
    const existingById = await this.patientRepository.findById(mut.entityId);

    // The chart id comes from the device. Without this, a queued edit could rewrite a patient at a
    // clinic the request was never scoped to, simply by naming its id.
    if (existingById && existingById.primaryClinicId !== clinicId) {
      throw new NotFoundException('Patient not found in the active clinic');
    }

    // A merge retires a chart for good. Writing to it would put demographics on a tombstone no
    // screen shows, so the edit is refused and the clinician is pointed at the surviving chart.
    if (existingById?.mergedIntoPatientId) {
      throw await this.patientMergedConflict(
        existingById.mergedIntoPatientId,
        'This chart was merged into another chart.',
      );
    }

    // The device stopped keeping national IDs (Dexie v8), so an offline edit of an existing chart
    // never carries one. It used to be refused with a plain Error, which classified as retryable
    // and re-sent forever. An edit leaves the stored identifier alone; only a new chart needs one.
    if (!nationalId && !existingById) {
      throw new BadRequestException({
        code: 'PATIENT_NATIONAL_ID_REQUIRED',
        message: 'A new patient needs a national ID before the chart can sync.',
      });
    }

    const hash = nationalId ? hashNationalId(nationalId) : null;
    const existingByHash = hash ? await this.patientRepository.findByNationalIdHash(hash) : null;

    if (existingByHash && existingByHash.id !== mut.entityId) {
      return this.refuse(
        clinicId,
        mut,
        SYNC_MUTATION_RESULT_STATUS.CONFLICT,
        'DUPLICATE_NATIONAL_ID',
        {
          message: 'Another chart already uses this national ID.',
          existingPatientId: existingByHash.id,
          patientCode: existingByHash.patientCode,
        },
      );
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
    const demographics = {
      patientCode,
      firstName: payload.firstName as string,
      lastName: payload.lastName as string,
      dob: payload.dob ? new Date(payload.dob as string) : null,
      sex: (payload.sex as Sex) ?? 'UNKNOWN',
      phoneE164,
      email: (payload.email as string) ?? null,
      ...location,
    };
    const patient =
      nationalId && hash
        ? await this.prisma.patient.upsert({
            where: { id: mut.entityId },
            create: {
              id: mut.entityId,
              ...demographics,
              primaryClinic: { connect: { id: primaryClinicId } },
              nationalIdType: (payload.nationalIdType as NationalIdType) ?? 'OTHER',
              nationalIdCiphertext: encryptNationalId(nationalId),
              nationalIdHash: hash,
              nationalIdLast4: nationalIdLast4(nationalId),
              createdBy: createdByUserId ? { connect: { id: createdByUserId } } : undefined,
            },
            update: demographics,
          })
        : await this.prisma.patient.update({ where: { id: mut.entityId }, data: demographics });

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
      return this.refuse(
        clinicId,
        mut,
        SYNC_MUTATION_RESULT_STATUS.CONFLICT,
        'CONFLICT_FINALIZED',
        {
          message: 'Cannot edit finalized encounter',
          existingStatus: existing.status,
        },
      );
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
    const merged = await this.assertPatientNotMerged(patientId, clinicId, entityLabel);
    if (!merged) {
      throw new NotFoundException(`${entityLabel} patient not found in the active clinic`);
    }
  }

  /**
   * Refuse a change queued against a chart that has since been merged. It would otherwise attach
   * to the retired record, invisible from the surviving chart; the clinician re-enters it there.
   *
   * Resolves to whether the chart exists at this clinic at all, so a caller that needs it can say
   * so without a second query.
   */
  private async assertPatientNotMerged(
    patientId: string,
    clinicId: string,
    entityLabel: string,
  ): Promise<boolean> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, primaryClinicId: clinicId },
      select: { id: true, mergedIntoPatientId: true },
    });
    if (patient?.mergedIntoPatientId) {
      throw await this.patientMergedConflict(
        patient.mergedIntoPatientId,
        `${entityLabel} belongs to a chart that was merged into another chart.`,
      );
    }
    return Boolean(patient);
  }

  /** PATIENT_MERGED, pointing at the chart at the end of the merge chain. */
  private async patientMergedConflict(
    mergedIntoPatientId: string,
    message: string,
  ): Promise<ConflictException> {
    const canonical = await this.patientRepository.findById(mergedIntoPatientId, {
      resolveMerged: true,
    });
    return new ConflictException({
      code: 'PATIENT_MERGED',
      message,
      canonicalPatientId: canonical?.id ?? mergedIntoPatientId,
      ...(canonical?.patientCode ? { patientCode: canonical.patientCode } : {}),
    });
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

  /** Replay a glucose-station reading. `entityId` is the screening row's id. */
  private async applyGlucoseReading(
    clinicId: string,
    actorUserId: string,
    user: UserWithId,
    mut: SyncMutationDto,
    payload: Record<string, unknown>,
    idempotencyKey: string,
    metadata?: RequestMetadata,
  ): Promise<SyncMutationResultDto> {
    const encounterId = payload.encounterId as string;
    if (!encounterId) throw new Error('Glucose reading payload must include encounterId');
    const dto = await this.diabetesScreeningService.validateGlucoseReadingSyncPayload(
      payload,
      mut.createdAt ?? new Date().toISOString(),
    );
    await this.diabetesScreeningService.recordGlucoseReading(
      clinicId,
      encounterId,
      { userId: actorUserId, roles: user.roles },
      dto,
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
    );

    return { id: mut.id, status: SYNC_MUTATION_RESULT_STATUS.APPLIED };
  }

  /**
   * Replay a hypertension assessment through the same service the REST route uses.
   *
   * This used to be an inline upsert that cast `payload.classification` straight to the enum and
   * coalesced every other field with `?? existing?.x ?? default`. It validated nothing: a mutation
   * carrying `{ classification: 'BOGUS' }` was accepted here and failed later, and a device could
   * assert `urgentReviewRequired` for itself. Diabetes has delegated like this since its module
   * landed; the two conditions now reject the same payloads for the same reasons whether they
   * arrive online or through the outbox.
   */
  private async applyHypertensionAssessmentUpsert(
    clinicId: string,
    actorUserId: string,
    user: UserWithId,
    mut: SyncMutationDto,
    payload: Record<string, unknown>,
    idempotencyKey: string,
    metadata?: RequestMetadata,
  ): Promise<SyncMutationResultDto> {
    const encounterId = payload.encounterId as string;
    if (!encounterId) throw new Error('HypertensionAssessment payload must include encounterId');
    const normalized = await this.hypertensionAssessmentService.validateSyncPayload(
      payload,
      mut.createdAt ?? new Date().toISOString(),
    );
    await this.hypertensionAssessmentService.upsert(
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
    );

    return { id: mut.id, status: SYNC_MUTATION_RESULT_STATUS.APPLIED };
  }

  /**
   * Replay a whole adherence set through the same service the REST route uses.
   *
   * The mutation carries the set for one encounter and one condition, not a row, because that is
   * what the write is: a medication dropped from the reconciled list has to lose its observation,
   * and a per-row replay could never express that. `entityId` identifies the set, so two contexts
   * on one encounter replay independently.
   */
  private async applyMedicationAdherenceReplace(
    clinicId: string,
    actorUserId: string,
    user: UserWithId,
    mut: SyncMutationDto,
    payload: Record<string, unknown>,
    idempotencyKey: string,
    metadata?: RequestMetadata,
  ): Promise<SyncMutationResultDto> {
    const encounterId = payload.encounterId as string;
    if (!encounterId) {
      throw new Error('EncounterMedicationAdherence payload must include encounterId');
    }
    const normalized = await this.medicationAdherenceService.validateSyncPayload(payload);
    await this.medicationAdherenceService.replaceForEncounter(
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
    );

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

  /**
   * Replay a prescription through the same service the REST route uses.
   *
   * This was an inline Prisma upsert that validated almost nothing. It accepted a drug belonging
   * to another clinic, an empty dosage and frequency, a quantity below one, free text with no
   * length cap and no sanitising, and -- the part worth closing regardless of likelihood -- a
   * `prescribedByUserId` chosen by the payload, so a replay could attribute a prescription to a
   * clinician who did not write it.
   *
   * The finalized-encounter and allergy checks were here and are now the service's, which is where
   * the REST route already got them. See #134, and the identical fix #114 made for hypertension.
   */
  private async applyPrescriptionUpsert(
    clinicId: string,
    actorUserId: string,
    user: UserWithId,
    mut: SyncMutationDto,
    payload: Record<string, unknown>,
    idempotencyKey: string,
    metadata?: RequestMetadata,
  ): Promise<SyncMutationResultDto> {
    const encounterId = payload.encounterId as string;
    if (!encounterId) throw new Error('Prescription payload must include encounterId');

    const normalized = await this.prescriptionService.validateSyncPayload(payload);
    await this.prescriptionService.upsertFromSync(
      clinicId,
      encounterId,
      mut.entityId,
      normalized.dto,
      {
        clinicId,
        actorUserId,
        /*
          The replay's own roles, so the service decides for itself.

          `SYNC_ENTITY_PERMISSIONS` has already refused a role that may not queue a prescription.
          Passing them on means the service refuses too, rather than trusting that whoever called
          it checked -- which is the second layer, and the reason this handler was worth fixing in
          the first place.
        */
        roles: user.roles,
        requestId: idempotencyKey,
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
      },
    );

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
    await recordAppliedSyncMutation(this.prisma, clinicId, {
      entityType: mut.entityType,
      entityId: mut.entityId,
      idempotencyKey,
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
      return this.refuse(clinicId, mut, SYNC_MUTATION_RESULT_STATUS.ERROR, 'DELETE_NOT_SUPPORTED', {
        message: `DELETE not supported for entity type: ${entityType}`,
      });
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
      mergedPatientRows,
      encounters,
      vitalsRows,
      tobaccoScreenings,
      diabetesScreenings,
      hypertensionAssessments,
      medicationAdherence,
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
      this.prisma.patient.findMany({
        where: {
          primaryClinicId: clinicId,
          mergedIntoPatientId: { not: null },
          ...updatedAtFilter,
        },
        select: { id: true, mergedIntoPatientId: true, updatedAt: true },
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
        select: SYNC_DIABETES_SCREENING_SELECT,
      }),
      this.prisma.hypertensionAssessment.findMany({
        where: { ...where, ...updatedAtFilter },
        select: SYNC_HYPERTENSION_ASSESSMENT_SELECT,
      }),
      this.prisma.encounterMedicationAdherence.findMany({
        where: { ...where, ...updatedAtFilter },
        select: SYNC_ENCOUNTER_MEDICATION_ADHERENCE_SELECT,
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
      ...mergedPatientRows.map((p) => ({ updatedAt: p.updatedAt, id: p.id })),
      ...encounters.map((e) => ({ updatedAt: e.updatedAt, id: e.id })),
      ...vitals.map((v) => ({ updatedAt: v.updatedAt, id: v.id })),
      ...tobaccoScreenings.map((t) => ({ updatedAt: t.updatedAt, id: t.id })),
      ...diabetesScreenings.map((d) => ({ updatedAt: d.updatedAt, id: d.id })),
      ...hypertensionAssessments.map((h) => ({ updatedAt: h.updatedAt, id: h.id })),
      ...medicationAdherence.map((a) => ({ updatedAt: a.updatedAt, id: a.id })),
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
      mergedPatients: mergedPatientRows.flatMap((row) =>
        row.mergedIntoPatientId
          ? [{ id: row.id, mergedIntoPatientId: row.mergedIntoPatientId }]
          : [],
      ),
      encounters,
      vitals,
      tobaccoScreenings,
      diabetesScreenings: diabetesScreeningRecords,
      hypertensionAssessments,
      medicationAdherence,
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
