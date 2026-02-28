import { Injectable } from '@nestjs/common';
import {
  SyncOperation,
  SyncMutationStatus,
  EncounterStatus,
  HypertensionClassification,
  NationalIdType,
  Sex,
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
import {
  SyncMutationDto,
  SYNC_OPERATION,
} from './dto/sync-mutation.dto';
import {
  SyncMutationResultDto,
  SYNC_MUTATION_RESULT_STATUS,
} from './dto/sync-push-response.dto';
import { SyncPullResponseDto } from './dto/sync-pull-response.dto';

const ENTITY_TYPES = [
  'patient',
  'encounter',
  'vitals',
  'diabetes_screening',
  'hypertension_assessment',
  'care_plan',
  'patient_consent',
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface UserWithId {
  user: { id: string };
  roles: unknown[];
}

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly patientRepository: PatientRepository,
    private readonly encounterRepository: EncounterRepository
  ) {}

  async applyMutations(
    clinicId: string,
    user: UserWithId,
    mutations: SyncMutationDto[],
    metadata?: RequestMetadata
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
        const result = await this.applyOne(
          clinicId,
          actorUserId,
          mut,
          metadata
        );
        results.push(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
          id: mut.id,
          status: SYNC_MUTATION_RESULT_STATUS.ERROR,
          conflictType: 'APPLICATION_ERROR',
          conflictDetails: { message: msg },
        });
        await this.prisma.syncMutation.create({
          data: {
            clinicId,
            entityType: mut.entityType,
            entityId: mut.entityId,
            operation: mut.operation === 'UPSERT' ? SyncOperation.UPSERT : SyncOperation.DELETE,
            idempotencyKey: mut.idempotencyKey,
            status: SyncMutationStatus.ERROR,
            conflictType: 'APPLICATION_ERROR',
            conflictDetailsJson: JSON.stringify({ message: msg }),
          },
        });
      }
    }

    return results;
  }

  private async applyOne(
    clinicId: string,
    actorUserId: string,
    mut: SyncMutationDto,
    metadata?: RequestMetadata
  ): Promise<SyncMutationResultDto> {
    const payload = mut.payloadJson ?? {};
    const idempotencyKey = mut.idempotencyKey;

    if (mut.operation === SYNC_OPERATION.DELETE) {
      return this.applyDelete(clinicId, actorUserId, mut, metadata);
    }

    switch (mut.entityType as EntityType) {
      case 'patient':
        return this.applyPatientUpsert(clinicId, actorUserId, mut, payload, idempotencyKey, metadata);
      case 'encounter':
        return this.applyEncounterUpsert(clinicId, actorUserId, mut, payload, idempotencyKey, metadata);
      case 'vitals':
        return this.applyVitalsUpsert(clinicId, actorUserId, mut, payload, idempotencyKey, metadata);
      case 'diabetes_screening':
        return this.applyDiabetesScreeningUpsert(clinicId, actorUserId, mut, payload, idempotencyKey, metadata);
      case 'hypertension_assessment':
        return this.applyHypertensionAssessmentUpsert(clinicId, actorUserId, mut, payload, idempotencyKey, metadata);
      case 'care_plan':
        return this.applyCarePlanUpsert(clinicId, actorUserId, mut, payload, idempotencyKey, metadata);
      case 'patient_consent':
        return this.applyPatientConsentUpsert(clinicId, actorUserId, mut, payload, idempotencyKey, metadata);
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
    metadata?: RequestMetadata
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
      (existingById?.patientCode) ??
      (await generatePatientCode(this.prisma));
    const primaryClinicId = (payload.primaryClinicId as string) ?? clinicId;
    const createdByUserId = (payload.createdByUserId as string) ?? actorUserId;

    const rawPhone =
      (payload.phoneE164 as string) ?? (payload.phone as string) ?? null;
    const phoneE164 = rawPhone
      ? (normalizePhoneToE164(rawPhone, 'GH') ?? null)
      : null;

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
    metadata?: RequestMetadata
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
    mut: SyncMutationDto,
    payload: Record<string, unknown>,
    idempotencyKey: string,
    metadata?: RequestMetadata
  ): Promise<SyncMutationResultDto> {
    const encounterId = payload.encounterId as string;
    if (!encounterId) throw new Error('Vitals payload must include encounterId');
    await this.ensureEncounterNotFinalized(encounterId);

    const existing = await this.prisma.vitals.findUnique({
      where: { encounterId },
    });
    const before = existing ? JSON.stringify(existing) : null;

    const vitals = await this.prisma.vitals.upsert({
      where: { encounterId },
      create: {
        id: mut.entityId,
        clinicId,
        encounterId,
        systolicBp: (payload.systolicBp as number) ?? null,
        diastolicBp: (payload.diastolicBp as number) ?? null,
        heartRate: (payload.heartRate as number) ?? null,
        weightKg: (payload.weightKg as number) ?? null,
        heightCm: (payload.heightCm as number) ?? null,
        bmi: (payload.bmi as number) ?? null,
        notes: (payload.notes as string) ?? null,
      },
      update: {
        systolicBp: (payload.systolicBp as number) ?? existing?.systolicBp ?? null,
        diastolicBp: (payload.diastolicBp as number) ?? existing?.diastolicBp ?? null,
        heartRate: (payload.heartRate as number) ?? existing?.heartRate ?? null,
        weightKg: (payload.weightKg as number) ?? existing?.weightKg ?? null,
        heightCm: (payload.heightCm as number) ?? existing?.heightCm ?? null,
        bmi: (payload.bmi as number) ?? existing?.bmi ?? null,
        notes: (payload.notes as string) ?? existing?.notes ?? null,
      },
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId,
      action: existing ? 'VITALS.UPSERT' : 'VITALS.CREATE',
      entityType: 'Vitals',
      entityId: vitals.id,
      beforeJson: before,
      afterJson: JSON.stringify(vitals),
      requestId: idempotencyKey,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    });

    await this.prisma.syncMutation.create({
      data: {
        clinicId,
        entityType: 'vitals',
        entityId: mut.entityId,
        operation: SyncOperation.UPSERT,
        idempotencyKey,
        status: SyncMutationStatus.APPLIED,
      },
    });

    return { id: mut.id, status: SYNC_MUTATION_RESULT_STATUS.APPLIED };
  }

  private async applyDiabetesScreeningUpsert(
    clinicId: string,
    actorUserId: string,
    mut: SyncMutationDto,
    payload: Record<string, unknown>,
    idempotencyKey: string,
    metadata?: RequestMetadata
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
      },
      update: {
        glucoseMgDl: (payload.glucoseMgDl as number) ?? existing?.glucoseMgDl ?? null,
        glucoseType: (payload.glucoseType as 'FASTING' | 'RANDOM' | 'UNKNOWN') ?? existing?.glucoseType ?? 'UNKNOWN',
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
    metadata?: RequestMetadata
  ): Promise<SyncMutationResultDto> {
    const encounterId = payload.encounterId as string;
    if (!encounterId) throw new Error('HypertensionAssessment payload must include encounterId');
    await this.ensureEncounterNotFinalized(encounterId);

    const existing = await this.prisma.hypertensionAssessment.findUnique({
      where: { encounterId },
    });
    const before = existing ? JSON.stringify(existing) : null;

    const classification = (payload.classification as HypertensionClassification) ?? HypertensionClassification.UNKNOWN;
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
        classification: (payload.classification as HypertensionClassification) ?? existing?.classification ?? HypertensionClassification.UNKNOWN,
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
    metadata?: RequestMetadata
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
        medicationPrescribed: (payload.medicationPrescribed as boolean) ?? existing?.medicationPrescribed ?? false,
        followUpDate: payload.followUpDate ? new Date(payload.followUpDate as string) : existing?.followUpDate ?? null,
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
    metadata?: RequestMetadata
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
            afterJson: JSON.stringify({ ...g, status: 'REVOKED', revokedAt: new Date().toISOString() }),
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
        revokedAt: payload.revokedAt ? new Date(payload.revokedAt as string) : existing?.revokedAt ?? null,
        status: status as 'GRANTED' | 'REVOKED',
        witnessName: (payload.witnessName as string) ?? existing?.witnessName ?? null,
        witnessPhoneE164: (payload.witnessPhoneE164 as string) ?? existing?.witnessPhoneE164 ?? null,
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

  private async applyDelete(
    clinicId: string,
    actorUserId: string,
    mut: SyncMutationDto,
    metadata?: RequestMetadata
  ): Promise<SyncMutationResultDto> {
    const entityType = mut.entityType as EntityType;
    const idempotencyKey = mut.idempotencyKey;

    const deletableTypes: EntityType[] = [
      'vitals',
      'diabetes_screening',
      'hypertension_assessment',
      'care_plan',
      'patient_consent',
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

    const beforeMap: Record<string, (id: string) => Promise<unknown>> = {
      vitals: (id) => this.prisma.vitals.findUnique({ where: { id } }),
      diabetes_screening: (id) =>
        this.prisma.diabetesScreening.findUnique({ where: { id } }),
      hypertension_assessment: (id) =>
        this.prisma.hypertensionAssessment.findUnique({ where: { id } }),
      care_plan: (id) => this.prisma.carePlan.findUnique({ where: { id } }),
      patient_consent: (id) =>
        this.prisma.patientConsent.findUnique({ where: { id } }),
    };
    const finder = beforeMap[entityType];
    const beforeRecord = finder ? await finder(mut.entityId) : null;
    const before = beforeRecord ? JSON.stringify(beforeRecord) : null;

    const deleteMap: Record<string, () => Promise<unknown>> = {
      vitals: () => this.prisma.vitals.deleteMany({ where: { id: mut.entityId } }),
      diabetes_screening: () =>
        this.prisma.diabetesScreening.deleteMany({ where: { id: mut.entityId } }),
      hypertension_assessment: () =>
        this.prisma.hypertensionAssessment.deleteMany({ where: { id: mut.entityId } }),
      care_plan: () => this.prisma.carePlan.deleteMany({ where: { id: mut.entityId } }),
      patient_consent: () =>
        this.prisma.patientConsent.deleteMany({ where: { id: mut.entityId } }),
    };
    await deleteMap[entityType]!();

    const actionMap: Record<string, string> = {
      vitals: 'VITALS.DELETE',
      diabetes_screening: 'DIABETES_SCREENING.DELETE',
      hypertension_assessment: 'HYPERTENSION_ASSESSMENT.DELETE',
      care_plan: 'CARE_PLAN.DELETE',
      patient_consent: 'PATIENT_CONSENT.DELETE',
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

  async pull(
    clinicId: string,
    since?: string
  ): Promise<SyncPullResponseDto> {
    const sinceDate = since
      ? (() => {
          const [ts] = since.split('|');
          const d = new Date(ts);
          return isNaN(d.getTime()) ? undefined : d;
        })()
      : undefined;

    const where = { clinicId };
    const updatedAtFilter = sinceDate ? { updatedAt: { gt: sinceDate } } : {};

    const [patients, encounters, vitals, diabetesScreenings, hypertensionAssessments, carePlans, patientConsents] =
      await Promise.all([
        this.prisma.patient.findMany({
          where: {
            primaryClinicId: clinicId,
            ...updatedAtFilter,
          },
        }),
        this.prisma.encounter.findMany({
          where: { ...where, ...updatedAtFilter },
        }),
        this.prisma.vitals.findMany({
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
      ]);

    const allRows = [
      ...patients.map((p) => ({ updatedAt: p.updatedAt, id: p.id })),
      ...encounters.map((e) => ({ updatedAt: e.updatedAt, id: e.id })),
      ...vitals.map((v) => ({ updatedAt: v.updatedAt, id: v.id })),
      ...diabetesScreenings.map((d) => ({ updatedAt: d.updatedAt, id: d.id })),
      ...hypertensionAssessments.map((h) => ({ updatedAt: h.updatedAt, id: h.id })),
      ...carePlans.map((c) => ({ updatedAt: c.updatedAt, id: c.id })),
      ...patientConsents.map((pc) => ({ updatedAt: pc.updatedAt, id: pc.id })),
    ];
    const maxRow = allRows.reduce(
      (acc, r) =>
        !acc || r.updatedAt > acc.updatedAt
          ? r
          : acc.updatedAt.getTime() === r.updatedAt.getTime() && r.id > acc.id
            ? r
            : acc,
      null as { updatedAt: Date; id: string } | null
    );
    const nextCursor = maxRow
      ? `${maxRow.updatedAt.toISOString()}|${maxRow.id}`
      : since ?? '';

    return {
      cursor: nextCursor,
      patients,
      encounters,
      vitals,
      diabetesScreenings,
      hypertensionAssessments,
      carePlans,
      patientConsents,
    };
  }
}
