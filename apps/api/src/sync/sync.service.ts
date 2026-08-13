import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  SyncOperation,
  SyncMutationStatus,
  EncounterStatus,
  HypertensionClassification,
  NationalIdType,
  Sex,
  UserRole,
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
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PatientRepository } from '../patients/patient.repository';
import { EncounterRepository } from '../encounters/encounter.repository';
import { SyncMutationDto, SYNC_OPERATION } from './dto/sync-mutation.dto';
import { SyncMutationResultDto, SYNC_MUTATION_RESULT_STATUS } from './dto/sync-push-response.dto';
import { SyncPullResponseDto } from './dto/sync-pull-response.dto';
import { MedicalHistoryService } from '../medical-history/medical-history.service';
import { hasPermission, PERMISSIONS } from '../auth/constants/permissions';
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

export type EntityType =
  | 'patient'
  | 'encounter'
  | 'vitals'
  | 'encounter_vitals_bundle'
  | 'diabetes_screening'
  | 'hypertension_assessment'
  | 'care_plan'
  | 'patient_consent'
  | 'prescription'
  | 'medical_history_revision'
  | 'patient_medication_revision'
  | 'medication_reconciliation'
  | 'patient_pharmacy_revision'
  | 'patient_pharmacy_preference';

export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface UserWithId {
  user: { id: string };
  roles: Array<{ role: UserRole }>;
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

      if (existing) {
        results.push({
          id: mut.id,
          status: existing.status as SyncMutationResultDto['status'],
          conflictType: existing.conflictType ?? undefined,
          conflictDetails: existing.conflictDetailsJson
            ? (JSON.parse(existing.conflictDetailsJson) as Record<string, unknown>)
            : undefined,
        });
        continue;
      }

      try {
        const result = await this.applyOne(clinicId, actorUserId, user, mut, metadata);
        results.push(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const httpResponse =
          err instanceof HttpException && typeof err.getResponse() === 'object'
            ? (err.getResponse() as Record<string, unknown>)
            : null;
        const conflictResponse = err instanceof ConflictException ? httpResponse : null;
        const isRevisionConflict =
          mut.entityType === 'medical_history_revision' && conflictResponse !== null;
        const isConflict = conflictResponse !== null;
        const status = isConflict
          ? SYNC_MUTATION_RESULT_STATUS.CONFLICT
          : SYNC_MUTATION_RESULT_STATUS.ERROR;
        const conflictType = httpResponse?.code
          ? String(httpResponse.code)
          : isRevisionConflict
            ? 'MEDICAL_HISTORY_CONFLICT'
            : err instanceof HttpException
              ? 'APPLICATION_REJECTED'
              : 'APPLICATION_ERROR';
        const conflictDetails = httpResponse ?? { message: msg };
        results.push({
          id: mut.id,
          status,
          conflictType,
          conflictDetails,
        });
        await this.prisma.syncMutation.create({
          data: {
            clinicId,
            entityType: mut.entityType,
            entityId: mut.entityId,
            operation: mut.operation === 'UPSERT' ? SyncOperation.UPSERT : SyncOperation.DELETE,
            idempotencyKey: mut.idempotencyKey,
            status: isConflict ? SyncMutationStatus.CONFLICT : SyncMutationStatus.ERROR,
            conflictType,
            conflictDetailsJson: JSON.stringify(conflictDetails),
          },
        });
      }
    }

    return results;
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

    if (mut.operation === SYNC_OPERATION.DELETE) {
      return this.applyDelete(clinicId, actorUserId, user, mut, metadata);
    }

    switch (mut.entityType as EntityType) {
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
    const primaryClinicId = (payload.primaryClinicId as string) ?? clinicId;
    const createdByUserId = (payload.createdByUserId as string) ?? actorUserId;

    const rawPhone = (payload.phoneE164 as string) ?? (payload.phone as string) ?? null;
    const phoneE164 = rawPhone ? (normalizePhoneToE164(rawPhone, 'GH') ?? null) : null;

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
      },
      update: {
        patientCode,
        firstName: payload.firstName as string,
        lastName: payload.lastName as string,
        dob: payload.dob ? new Date(payload.dob as string) : null,
        sex: (payload.sex as Sex) ?? 'UNKNOWN',
        phoneE164,
        email: (payload.email as string) ?? null,
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
    const encClinicId = (payload.clinicId as string) ?? clinicId;
    const encPatientId = payload.patientId as string;
    const encCreatedBy = (payload.createdByUserId as string) ?? actorUserId;
    const encounter = await this.prisma.encounter.upsert({
      where: { id: mut.entityId },
      create: {
        id: mut.entityId,
        clinic: { connect: { id: encClinicId } },
        patient: { connect: { id: encPatientId } },
        status: (payload.status as EncounterStatus) ?? 'DRAFT',
        createdBy: { connect: { id: encCreatedBy } },
      },
      update: {
        status: (payload.status as EncounterStatus) ?? existing!.status,
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

  private async ensureEncounterNotFinalized(encounterId: string): Promise<void> {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      select: { status: true },
    });
    if (encounter?.status === EncounterStatus.FINALIZED) {
      throw new Error('Cannot modify encounter data: encounter is finalized');
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
    mut: SyncMutationDto,
    payload: Record<string, unknown>,
    idempotencyKey: string,
    metadata?: RequestMetadata,
  ): Promise<SyncMutationResultDto> {
    const encounterId = payload.encounterId as string;
    if (!encounterId) throw new Error('DiabetesScreening payload must include encounterId');
    await this.ensureEncounterNotFinalized(encounterId);

    const existing = await this.prisma.diabetesScreening.findUnique({
      where: { encounterId },
    });
    const before = existing ? JSON.stringify(existing) : null;

    const screening = await this.prisma.diabetesScreening.upsert({
      where: { encounterId },
      create: {
        id: mut.entityId,
        clinicId,
        encounterId,
        glucoseMgDl: (payload.glucoseMgDl as number) ?? null,
        glucoseType: (payload.glucoseType as 'FASTING' | 'RANDOM' | 'UNKNOWN') ?? 'UNKNOWN',
        hba1cPercent: (payload.hba1cPercent as number) ?? null,
        symptomsJson: (payload.symptomsJson as string) ?? null,
        notes: (payload.notes as string) ?? null,
        authoredByUserId: actorUserId,
      },
      update: {
        glucoseMgDl: (payload.glucoseMgDl as number) ?? existing?.glucoseMgDl ?? null,
        glucoseType:
          (payload.glucoseType as 'FASTING' | 'RANDOM' | 'UNKNOWN') ??
          existing?.glucoseType ??
          'UNKNOWN',
        hba1cPercent: (payload.hba1cPercent as number) ?? existing?.hba1cPercent ?? null,
        symptomsJson: (payload.symptomsJson as string) ?? existing?.symptomsJson ?? null,
        notes: (payload.notes as string) ?? existing?.notes ?? null,
      },
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId,
      action: existing ? 'DIABETES_SCREENING.UPSERT' : 'DIABETES_SCREENING.CREATE',
      entityType: 'DiabetesScreening',
      entityId: screening.id,
      beforeJson: before,
      afterJson: JSON.stringify(screening),
      requestId: idempotencyKey,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    });

    await this.prisma.syncMutation.create({
      data: {
        clinicId,
        entityType: 'diabetes_screening',
        entityId: mut.entityId,
        operation: SyncOperation.UPSERT,
        idempotencyKey,
        status: SyncMutationStatus.APPLIED,
      },
    });

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
    if (!hasPermission(user.roles, PERMISSIONS.MEDICAL_HISTORY_WRITE)) {
      throw new Error('Medical history write permission is required');
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
    this.requireMedicationReconciliationWrite(user);
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
    this.requireMedicationReconciliationWrite(user);
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
    this.requireMedicationReconciliationWrite(user);
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
    this.requireMedicationReconciliationWrite(user);
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

  private requireMedicationReconciliationWrite(user: UserWithId) {
    if (!isApiFeatureEnabled('medicationReconciliation'))
      throw new Error('Medication reconciliation is not enabled');
    if (!hasPermission(user.roles, PERMISSIONS.MEDICATION_RECONCILIATION_WRITE)) {
      throw new ForbiddenException('Medication reconciliation write permission is required');
    }
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
    const entityType = mut.entityType as EntityType;
    const idempotencyKey = mut.idempotencyKey;

    const deletableTypes: EntityType[] = [
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
      if (!hasPermission(user.roles, PERMISSIONS.SCREENING_WRITE)) {
        throw new ForbiddenException('SCREENING.WRITE permission is required to delete vitals');
      }
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
    };
  }
}
