import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import {
  BloodPressureCuffSize,
  BloodPressureSite,
  EncounterStatus,
  PatientPosition,
  ReadinessToQuit,
  ScreeningAnswer,
  SyncMutationStatus,
  SyncOperation,
  TemperatureSource,
  TobaccoUseStatus,
  type UserRole,
} from '@prisma/client';
import { computeBmi, toCelsius } from '@nkwapa/db';
import { hasPermission, PERMISSIONS } from '../auth/constants/permissions';
import { PrismaService } from '../prisma/prisma.service';
import {
  EncounterVitalsBundleDto,
  type TemperatureInputUnit,
  type TobaccoScreeningInputDto,
  type VitalsInputDto,
} from './dto/encounter-vitals-bundle.dto';
import type { SyncMutationDto } from './dto/sync-mutation.dto';
import type { RequestMetadata, UserWithId } from './sync.service';

type NormalizedVitals = {
  systolicBp: number | null;
  diastolicBp: number | null;
  bpSite: BloodPressureSite | null;
  bpSiteOther: string | null;
  patientPosition: PatientPosition | null;
  patientPositionOther: string | null;
  cuffSize: BloodPressureCuffSize | null;
  cuffSizeOther: string | null;
  pulseBpm: number | null;
  temperatureCelsius: number | null;
  temperatureSource: TemperatureSource | null;
  temperatureSourceOther: string | null;
  respiratoryRate: number | null;
  spo2Percent: number | null;
  weightKg: number | null;
  heightCm: number | null;
  bmi: number | null;
  notes: string | null;
};

type NormalizedTobacco = {
  smokingStatus: TobaccoUseStatus;
  smokelessTobaccoStatus: TobaccoUseStatus;
  passiveExposure: ScreeningAnswer;
  readinessToQuit: ReadinessToQuit;
  counselingGiven: ScreeningAnswer;
};

export type NormalizedEncounterVitalsBundle = {
  schemaVersion: 1;
  encounterId: string;
  vitalsId: string;
  tobaccoScreeningId?: string;
  vitals: NormalizedVitals;
  tobacco?: NormalizedTobacco;
  markTobaccoReviewed: boolean;
};

@Injectable()
export class ClinicalMeasurementsService {
  constructor(private readonly prisma: PrismaService) {}

  async applyBundle(params: {
    clinicId: string;
    actorUserId: string;
    user: UserWithId;
    mutation: SyncMutationDto;
    payload: Record<string, unknown>;
    metadata?: RequestMetadata;
    legacy?: boolean;
  }): Promise<void> {
    if (
      !hasPermission(params.user.roles as Array<{ role: UserRole }>, PERMISSIONS.SCREENING_WRITE)
    ) {
      throw new ForbiddenException(
        'SCREENING.WRITE permission is required for clinical measurements',
      );
    }

    const bundlePayload = params.legacy
      ? this.fromLegacyVitals(params.mutation, params.payload)
      : params.payload;
    const bundle = await this.validateAndNormalize(bundlePayload, !params.legacy);

    await this.prisma.$transaction(async (tx) => {
      const encounter = await tx.encounter.findUnique({
        where: { id: bundle.encounterId },
        select: { clinicId: true, status: true },
      });
      if (!encounter || encounter.clinicId !== params.clinicId) {
        throw new NotFoundException('Encounter not found in the active clinic');
      }
      if (encounter.status === EncounterStatus.FINALIZED) {
        throw new ConflictException({
          code: 'CONFLICT_FINALIZED',
          message: 'Cannot modify measurements for a finalized encounter',
          existingStatus: EncounterStatus.FINALIZED,
        });
      }

      const [existingVitals, existingTobacco] = await Promise.all([
        tx.vitals.findUnique({ where: { encounterId: bundle.encounterId } }),
        bundle.tobacco
          ? tx.tobaccoScreening.findUnique({ where: { encounterId: bundle.encounterId } })
          : Promise.resolve(null),
      ]);

      const vitals = await tx.vitals.upsert({
        where: { encounterId: bundle.encounterId },
        create: {
          id: bundle.vitalsId,
          clinicId: params.clinicId,
          encounterId: bundle.encounterId,
          ...bundle.vitals,
        },
        update: bundle.vitals,
      });

      let tobacco = null;
      if (bundle.tobacco && bundle.tobaccoScreeningId) {
        const answersChanged =
          !existingTobacco ||
          existingTobacco.smokingStatus !== bundle.tobacco.smokingStatus ||
          existingTobacco.smokelessTobaccoStatus !== bundle.tobacco.smokelessTobaccoStatus ||
          existingTobacco.passiveExposure !== bundle.tobacco.passiveExposure ||
          existingTobacco.readinessToQuit !== bundle.tobacco.readinessToQuit ||
          existingTobacco.counselingGiven !== bundle.tobacco.counselingGiven;
        const reviewData = bundle.markTobaccoReviewed
          ? { reviewedByUserId: params.actorUserId, reviewedAt: new Date() }
          : answersChanged
            ? { reviewedByUserId: null, reviewedAt: null }
            : {};

        tobacco = await tx.tobaccoScreening.upsert({
          where: { encounterId: bundle.encounterId },
          create: {
            id: bundle.tobaccoScreeningId,
            clinicId: params.clinicId,
            encounterId: bundle.encounterId,
            ...bundle.tobacco,
            ...reviewData,
          },
          update: { ...bundle.tobacco, ...reviewData },
        });
      }

      await tx.auditEvent.create({
        data: {
          clinicId: params.clinicId,
          actorUserId: params.actorUserId,
          action: existingVitals ? 'VITALS.UPSERT' : 'VITALS.CREATE',
          entityType: 'Vitals',
          entityId: vitals.id,
          beforeJson: existingVitals ? JSON.stringify(existingVitals) : undefined,
          afterJson: JSON.stringify(vitals),
          requestId: params.mutation.idempotencyKey,
          ipAddress: params.metadata?.ipAddress,
          userAgent: params.metadata?.userAgent,
        },
      });

      if (tobacco) {
        await tx.auditEvent.create({
          data: {
            clinicId: params.clinicId,
            actorUserId: params.actorUserId,
            action: bundle.markTobaccoReviewed
              ? 'TOBACCO_SCREENING.REVIEW'
              : existingTobacco
                ? 'TOBACCO_SCREENING.UPSERT'
                : 'TOBACCO_SCREENING.CREATE',
            entityType: 'TobaccoScreening',
            entityId: tobacco.id,
            beforeJson: existingTobacco ? JSON.stringify(existingTobacco) : undefined,
            afterJson: JSON.stringify(tobacco),
            requestId: params.mutation.idempotencyKey,
            ipAddress: params.metadata?.ipAddress,
            userAgent: params.metadata?.userAgent,
          },
        });
      }

      await tx.syncMutation.create({
        data: {
          clinicId: params.clinicId,
          entityType: params.mutation.entityType,
          entityId: params.mutation.entityId,
          operation: SyncOperation.UPSERT,
          idempotencyKey: params.mutation.idempotencyKey,
          status: SyncMutationStatus.APPLIED,
        },
      });
    });
  }

  async validateAndNormalize(
    payload: Record<string, unknown>,
    requireBloodPressureContext = true,
  ): Promise<NormalizedEncounterVitalsBundle> {
    const dto = plainToInstance(EncounterVitalsBundleDto, payload);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    });
    if (errors.length) this.throwValidationErrors(errors);

    const vitals = this.normalizeVitals(dto.vitals, requireBloodPressureContext);
    if (dto.markTobaccoReviewed && (!dto.tobacco || !dto.tobaccoScreeningId)) {
      this.throwFieldError('markTobaccoReviewed', 'Tobacco answers are required before review');
    }
    if (dto.tobacco && !dto.tobaccoScreeningId) {
      this.throwFieldError('tobaccoScreeningId', 'A tobacco screening ID is required');
    }

    return {
      schemaVersion: 1,
      encounterId: dto.encounterId,
      vitalsId: dto.vitalsId,
      tobaccoScreeningId: dto.tobaccoScreeningId,
      vitals,
      tobacco: dto.tobacco ? this.normalizeTobacco(dto.tobacco) : undefined,
      markTobaccoReviewed: dto.markTobaccoReviewed === true,
    };
  }

  private normalizeVitals(
    input: VitalsInputDto,
    requireBloodPressureContext: boolean,
  ): NormalizedVitals {
    const systolicBp = input.systolicBp ?? null;
    const diastolicBp = input.diastolicBp ?? null;
    const hasSystolic = systolicBp != null;
    const hasDiastolic = diastolicBp != null;
    if (hasSystolic !== hasDiastolic) {
      this.throwFieldError(
        'vitals.systolicBp',
        'Systolic and diastolic blood pressure are required together',
      );
    }
    if (systolicBp != null && diastolicBp != null && systolicBp <= diastolicBp) {
      this.throwFieldError(
        'vitals.systolicBp',
        'Systolic blood pressure must be greater than diastolic',
      );
    }

    const bpSite = input.bpSite ?? null;
    const patientPosition = input.patientPosition ?? null;
    const cuffSize = input.cuffSize ?? null;
    if (requireBloodPressureContext && hasSystolic && !bpSite) {
      this.throwFieldError(
        'vitals.bpSite',
        'Blood pressure site is required with a blood pressure reading',
      );
    }
    if (!hasSystolic && (bpSite || patientPosition || cuffSize)) {
      this.throwFieldError(
        'vitals.bpSite',
        'Blood pressure context requires a blood pressure reading',
      );
    }

    const pulseBpm = input.pulseBpm ?? input.heartRate ?? null;
    if (input.pulseBpm != null && input.heartRate != null && input.pulseBpm !== input.heartRate) {
      this.throwFieldError('vitals.pulseBpm', 'pulseBpm and legacy heartRate cannot conflict');
    }

    const hasTemperature = input.temperatureValue != null;
    if (
      hasTemperature !== (input.temperatureUnit != null) ||
      hasTemperature !== (input.temperatureSource != null)
    ) {
      this.throwFieldError(
        'vitals.temperatureValue',
        'Temperature value, unit, and source are required together',
      );
    }
    const temperatureCelsius = hasTemperature
      ? toCelsius(input.temperatureValue as number, input.temperatureUnit as TemperatureInputUnit)
      : null;
    if (temperatureCelsius != null && (temperatureCelsius < 25 || temperatureCelsius > 45)) {
      this.throwFieldError('vitals.temperatureValue', 'Temperature must convert to 25–45 °C');
    }

    return {
      systolicBp,
      diastolicBp,
      bpSite,
      bpSiteOther: this.normalizeOther('vitals.bpSiteOther', bpSite, input.bpSiteOther),
      patientPosition,
      patientPositionOther: this.normalizeOther(
        'vitals.patientPositionOther',
        patientPosition,
        input.patientPositionOther,
      ),
      cuffSize,
      cuffSizeOther: this.normalizeOther('vitals.cuffSizeOther', cuffSize, input.cuffSizeOther),
      pulseBpm,
      temperatureCelsius,
      temperatureSource: input.temperatureSource ?? null,
      temperatureSourceOther: this.normalizeOther(
        'vitals.temperatureSourceOther',
        input.temperatureSource,
        input.temperatureSourceOther,
      ),
      respiratoryRate: input.respiratoryRate ?? null,
      spo2Percent: input.spo2Percent ?? null,
      weightKg: input.weightKg ?? null,
      heightCm: input.heightCm ?? null,
      bmi: computeBmi(input.weightKg, input.heightCm),
      notes: input.notes?.trim() || null,
    };
  }

  private normalizeTobacco(input: TobaccoScreeningInputDto): NormalizedTobacco {
    return {
      smokingStatus: input.smokingStatus,
      smokelessTobaccoStatus: input.smokelessTobaccoStatus,
      passiveExposure: input.passiveExposure,
      readinessToQuit: input.readinessToQuit,
      counselingGiven: input.counselingGiven,
    };
  }

  private normalizeOther(
    field: string,
    selected: string | null | undefined,
    detail: string | null | undefined,
  ): string | null {
    const normalized = detail?.trim() || null;
    if (selected === 'OTHER' && !normalized) {
      this.throwFieldError(field, 'Detail is required when OTHER is selected');
    }
    if (selected !== 'OTHER' && normalized) {
      this.throwFieldError(field, 'Detail is only allowed when OTHER is selected');
    }
    return selected === 'OTHER' ? normalized : null;
  }

  private fromLegacyVitals(
    mutation: SyncMutationDto,
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    const vitals = { ...payload };
    const encounterId = vitals.encounterId;
    delete vitals.encounterId;
    delete vitals.clinicId;
    return {
      schemaVersion: 1,
      encounterId,
      vitalsId: mutation.entityId,
      vitals,
    };
  }

  private throwValidationErrors(errors: ValidationError[]): never {
    const flatten = (
      items: ValidationError[],
      parent = '',
    ): Array<{ field: string; message: string }> =>
      items.flatMap((error) => {
        const field = parent ? `${parent}.${error.property}` : error.property;
        const own = Object.values(error.constraints ?? {}).map((message) => ({ field, message }));
        return [...own, ...flatten(error.children ?? [], field)];
      });
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Clinical measurement validation failed',
      fieldErrors: flatten(errors),
    });
  }

  private throwFieldError(field: string, message: string): never {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Clinical measurement validation failed',
      fieldErrors: [{ field, message }],
    });
  }
}
