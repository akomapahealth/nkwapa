import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EncounterStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import {
  deriveDiabetesEscalation,
  evaluateDiabetesMentalHealth,
  evaluateGlucoseSuspicion,
  parseDiabetesNutrition,
  parseLegacyDiabetesSymptoms,
  resolveFollowUpDate,
  type PayloadIssue,
} from '@nkwapa/db';
import { PERMISSIONS } from '../auth/constants/permissions';
import {
  assertPermissionAtClinic,
  hasPermissionAtClinic,
  type ScopedRole,
} from '../auth/clinic-roles';
import { PrismaService } from '../prisma/prisma.service';
import { buildKeysetWhere, decodeKeysetCursor, encodeKeysetCursor } from '../common/keyset-cursor';
import {
  UpsertDiabetesClinicianPlanDto,
  UpsertDiabetesScreeningDto,
} from './dto/diabetes-screening.dto';

const MAX_FUTURE_COLLECTION_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 25;

type DiabetesWithContext = Prisma.DiabetesScreeningGetPayload<{
  include: {
    authoredBy: { select: { id: true; displayName: true } };
    clinicianPlanAuthor: { select: { id: true; displayName: true } };
    encounter: { select: { id: true; patientId: true; createdAt: true; status: true } };
  };
}>;

export interface DiabetesActor {
  userId: string;
  roles: ScopedRole[];
}

export interface DiabetesRequestMetadata {
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  syncMutation?: {
    entityType: string;
    entityId: string;
    idempotencyKey: string;
  };
}

export interface DiabetesCompatibilityInput {
  symptomsJson?: string | null;
  legacySymptomsUnmapped?: boolean;
}

@Injectable()
export class DiabetesScreeningService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    clinicId: string,
    patientId: string,
    actor: DiabetesActor,
    params: { cursor?: string; limit?: number } = {},
  ) {
    this.assertReadPermission(actor.roles, clinicId);
    await this.assertPatientScope(clinicId, patientId);

    const cursor = params.cursor
      ? decodeKeysetCursor(params.cursor, 'The diabetes history cursor is invalid.')
      : null;
    const limit = params.limit ?? DEFAULT_PAGE_SIZE;
    const records = await this.prisma.diabetesScreening.findMany({
      where: {
        clinicId,
        encounter: { patientId },
        ...buildKeysetWhere('collectedAt', cursor),
      },
      include: this.contextInclude(),
      orderBy: [{ collectedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = records.length > limit;
    const items = records
      .slice(0, limit)
      .map((record) => this.toResponse(record, actor.roles, clinicId));
    const last = items.at(-1);
    return {
      items,
      nextCursor: hasMore && last ? encodeKeysetCursor(new Date(last.collectedAt), last.id) : null,
    };
  }

  async upsert(
    clinicId: string,
    encounterId: string,
    actor: DiabetesActor,
    dto: UpsertDiabetesScreeningDto,
    metadata: DiabetesRequestMetadata = {},
    screeningId?: string,
    compatibility: DiabetesCompatibilityInput = {},
  ) {
    this.assertWritePermission(actor.roles, clinicId);
    const collectedAt = this.validateCollectionTime(dto.collectedAt);

    /*
      The JSONB section is checked by the shared parser, not by class-validator, so the encounter
      form and the API reject the same payloads at the same paths for the same reasons.
    */
    const nutrition = parseDiabetesNutrition(dto.nutrition ?? null);
    this.assertPayloadsValid(nutrition.issues);

    const screening = await this.prisma.$transaction(async (tx) => {
      const encounter = await tx.encounter.findUnique({
        where: { id: encounterId },
        select: { clinicId: true, patientId: true, status: true },
      });
      if (!encounter || encounter.clinicId !== clinicId) {
        throw new NotFoundException('Encounter not found in the active clinic');
      }
      if (encounter.status === EncounterStatus.FINALIZED) {
        throw new ConflictException({
          code: 'CONFLICT_FINALIZED',
          message: 'Cannot modify diabetes screening for a finalized encounter',
          existingStatus: encounter.status,
        });
      }

      /*
        Derived here, from this payload, and never accepted from a client.

        A device deciding for itself whether a patient's screen is positive, or whether a visit
        needs a clinician, is a device that can be wrong in the direction that matters. The
        encounter form runs the same functions live so the volunteer sees the consequence while
        the patient is still in the room; this is the copy that is stored.
      */
      const derivedSuspicion = evaluateGlucoseSuspicion(dto.glucoseMgDl, dto.glucoseType);
      const mentalHealth = evaluateDiabetesMentalHealth({
        phq2Interest: dto.phq2Interest,
        phq2Mood: dto.phq2Mood,
        distressOverwhelmed: dto.distressOverwhelmed,
        distressFailing: dto.distressFailing,
      });
      const escalation = deriveDiabetesEscalation({
        urgentSymptoms: dto.urgentSymptoms,
        currentFootWound: dto.currentFootWound,
        glucoseMgDl: dto.glucoseMgDl,
        glucoseContext: dto.glucoseType,
      });

      const interview = {
        diabetesStatus: dto.diabetesStatus,
        diabetesType: dto.diabetesType,
        yearDiagnosed: dto.yearDiagnosed,
        yearDiagnosedUnknown: dto.yearDiagnosedUnknown,
        mainConcern: dto.mainConcern,
        mainConcernOther: dto.mainConcernOther,
        hba1cStatus: dto.hba1cStatus,
        hba1cMeasuredOn: dto.hba1cMeasuredOn ? new Date(dto.hba1cMeasuredOn) : null,
        homeGlucoseMonitoring: dto.homeGlucoseMonitoring,
        homeGlucoseLowMgDl: dto.homeGlucoseLowMgDl,
        homeGlucoseHighMgDl: dto.homeGlucoseHighMgDl,
        urgentSymptoms: dto.urgentSymptoms,
        urgentReviewRequired: escalation.urgentReviewRequired,
        urgentReviewReasons: escalation.reasons,
        derivedSuspicion,
        nutritionSchemaVersion: nutrition.schemaVersion,
        nutrition: nutrition.payload as unknown as Prisma.InputJsonValue,
        phq2Interest: dto.phq2Interest,
        phq2Mood: dto.phq2Mood,
        phq2Total: mentalHealth.phq2Total,
        phq2Positive: mentalHealth.phq2Positive,
        distressOverwhelmed: dto.distressOverwhelmed,
        distressFailing: dto.distressFailing,
        distressPositive: mentalHealth.distressPositive,
        eyeExam: dto.eyeExam,
        footExam: dto.footExam,
        kidneyTesting: dto.kidneyTesting,
        bpCheckedToday: dto.bpCheckedToday,
        currentFootWound: dto.currentFootWound,
        volunteerActions: (dto.volunteerActions ?? null) as Prisma.InputJsonValue,
        clinicianReviewRequested: dto.clinicianReviewRequested,
        reviewReasons: dto.reviewReasons,
        reviewReasonOther: dto.reviewReasonOther,
      };

      const existing = await tx.diabetesScreening.findUnique({ where: { encounterId } });
      const saved = await tx.diabetesScreening.upsert({
        where: { encounterId },
        create: {
          id: screeningId ?? randomUUID(),
          clinicId,
          encounterId,
          glucoseMgDl: dto.glucoseMgDl,
          glucoseType: dto.glucoseType,
          hba1cPercent: dto.hba1cPercent,
          symptoms: dto.symptoms,
          symptomsJson: compatibility.symptomsJson ?? null,
          legacySymptomsUnmapped: compatibility.legacySymptomsUnmapped ?? false,
          notes: dto.notes,
          collectedAt,
          authoredByUserId: actor.userId,
          ...interview,
        },
        update: {
          glucoseMgDl: dto.glucoseMgDl,
          glucoseType: dto.glucoseType,
          hba1cPercent: dto.hba1cPercent,
          symptoms: dto.symptoms,
          notes: dto.notes,
          collectedAt,
          authoredByUserId: actor.userId,
          legacySymptomsUnmapped: compatibility.legacySymptomsUnmapped ?? false,
          ...(compatibility.symptomsJson !== undefined
            ? { symptomsJson: compatibility.symptomsJson }
            : {}),
          ...interview,
        },
        include: this.contextInclude(),
      });

      await tx.auditEvent.create({
        data: {
          clinicId,
          actorUserId: actor.userId,
          action: existing ? 'DIABETES_SCREENING.UPSERT' : 'DIABETES_SCREENING.CREATE',
          entityType: 'DiabetesScreening',
          entityId: saved.id,
          beforeJson: existing ? JSON.stringify(existing) : undefined,
          afterJson: JSON.stringify(saved),
          requestId: metadata.requestId ?? randomUUID(),
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      });
      if (metadata.syncMutation) {
        await tx.syncMutation.create({
          data: {
            clinicId,
            entityType: metadata.syncMutation.entityType,
            entityId: metadata.syncMutation.entityId,
            operation: 'UPSERT',
            idempotencyKey: metadata.syncMutation.idempotencyKey,
            status: 'APPLIED',
          },
        });
      }
      return saved;
    });

    return this.toResponse(screening, actor.roles, clinicId);
  }

  /**
   * Record the supervising clinician's plan.
   *
   * The clinical specification says this part shows only for the doctor. The UI honours that, but
   * hiding is not a boundary, and this is the layer that decides.
   *
   * The follow-up window resolves to `CarePlan.followUpDate` in the same transaction, because that
   * column is what `EncounterService` schedules the patient's reminder from on finalize. A plan
   * storing only "within 1 month" would read as complete and schedule nothing.
   */
  async upsertClinicianPlan(
    clinicId: string,
    encounterId: string,
    actor: DiabetesActor,
    dto: UpsertDiabetesClinicianPlanDto,
    metadata: DiabetesRequestMetadata = {},
  ) {
    assertPermissionAtClinic(
      actor.roles,
      clinicId,
      PERMISSIONS.CAREPLAN_CLINICIAN_PLAN,
      'CAREPLAN.CLINICIAN_PLAN permission is required',
    );

    const saved = await this.prisma.$transaction(async (tx) => {
      const encounter = await tx.encounter.findUnique({
        where: { id: encounterId },
        select: { clinicId: true, status: true },
      });
      if (!encounter || encounter.clinicId !== clinicId) {
        throw new NotFoundException('Encounter not found in the active clinic');
      }
      if (encounter.status === EncounterStatus.FINALIZED) {
        throw new ConflictException({
          code: 'CONFLICT_FINALIZED',
          message: 'Cannot modify diabetes screening for a finalized encounter',
          existingStatus: encounter.status,
        });
      }

      const existing = await tx.diabetesScreening.findUnique({ where: { encounterId } });
      if (!existing) {
        throw new NotFoundException('Record the diabetes screening before adding a clinician plan');
      }

      const record = await tx.diabetesScreening.update({
        where: { encounterId },
        data: {
          clinicianPlanItems: dto.clinicianPlanItems,
          clinicianPlanOther: dto.clinicianPlanOther,
          followUpWindow: dto.followUpWindow,
          followUpOther: dto.followUpOther,
          followUpOwner: dto.followUpOwner,
          clinicianComments: dto.clinicianComments,
          clinicianPlanAuthorId: actor.userId,
          clinicianPlanAuthoredAt: new Date(),
        },
        include: this.contextInclude(),
      });

      const followUpDate = resolveFollowUpDate(dto.followUpWindow, new Date());
      if (followUpDate) {
        await tx.carePlan.upsert({
          where: { encounterId },
          create: { clinicId, encounterId, followUpDate },
          update: { followUpDate },
        });
      }

      await tx.auditEvent.create({
        data: {
          clinicId,
          actorUserId: actor.userId,
          action: 'DIABETES_SCREENING.CLINICIAN_PLAN',
          entityType: 'DiabetesScreening',
          entityId: record.id,
          beforeJson: JSON.stringify(existing),
          afterJson: JSON.stringify(record),
          requestId: metadata.requestId ?? randomUUID(),
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      });
      return record;
    });

    return this.toResponse(saved, actor.roles, clinicId);
  }

  async validateSyncPayload(payload: Record<string, unknown>, fallbackCollectedAt: string) {
    const hasStructuredSymptoms = Object.prototype.hasOwnProperty.call(payload, 'symptoms');
    const hasLegacySymptoms = Object.prototype.hasOwnProperty.call(payload, 'symptomsJson');
    if (hasStructuredSymptoms && hasLegacySymptoms) {
      throw new BadRequestException({
        code: 'AMBIGUOUS_SYMPTOMS_CONTRACT',
        message: 'Provide symptoms or the deprecated symptomsJson field, not both.',
      });
    }

    const legacy = hasLegacySymptoms
      ? parseLegacyDiabetesSymptoms(payload.symptomsJson)
      : { symptoms: [], hasUnmapped: false };
    /*
      Cherry-picked rather than spread.

      The outbox stores `encounterId` and `clinicId` inside the payload to address the write, and
      the DTO runs with `forbidNonWhitelisted`; spreading would reject every offline mutation. The
      derived columns are left out for a different reason -- a replayed device must not be able to
      assert whether a screen is positive or a visit needs a clinician.
    */
    const candidate = {
      glucoseMgDl: payload.glucoseMgDl ?? null,
      glucoseType: payload.glucoseType ?? 'UNKNOWN',
      hba1cPercent: payload.hba1cPercent ?? null,
      symptoms: hasStructuredSymptoms ? payload.symptoms : legacy.symptoms,
      notes: payload.notes ?? null,
      collectedAt: payload.collectedAt ?? fallbackCollectedAt,
      ...Object.fromEntries(
        (
          [
            'diabetesStatus',
            'diabetesType',
            'yearDiagnosed',
            'yearDiagnosedUnknown',
            'mainConcern',
            'mainConcernOther',
            'hba1cStatus',
            'hba1cMeasuredOn',
            'homeGlucoseMonitoring',
            'homeGlucoseLowMgDl',
            'homeGlucoseHighMgDl',
            'urgentSymptoms',
            'nutrition',
            'phq2Interest',
            'phq2Mood',
            'distressOverwhelmed',
            'distressFailing',
            'eyeExam',
            'footExam',
            'kidneyTesting',
            'bpCheckedToday',
            'currentFootWound',
            'volunteerActions',
            'clinicianReviewRequested',
            'reviewReasons',
            'reviewReasonOther',
          ] as const
        )
          .filter((key) => payload[key] !== undefined)
          .map((key) => [key, payload[key]]),
      ),
    };
    const dto = plainToInstance(UpsertDiabetesScreeningDto, candidate);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    });
    if (errors.length) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Diabetes screening validation failed.',
        fieldErrors: this.flattenValidationErrors(errors),
      });
    }
    this.validateCollectionTime(dto.collectedAt);
    return {
      dto,
      compatibility: hasLegacySymptoms
        ? {
            symptomsJson: typeof payload.symptomsJson === 'string' ? payload.symptomsJson : null,
            legacySymptomsUnmapped: legacy.hasUnmapped,
          }
        : {},
    };
  }

  toResponse(record: DiabetesWithContext, roles: ScopedRole[], clinicId: string) {
    return {
      id: record.id,
      clinicId: record.clinicId,
      patientId: record.encounter.patientId,
      glucoseMgDl: record.glucoseMgDl,
      glucoseType: record.glucoseType,
      hba1cPercent: record.hba1cPercent,
      symptoms: record.symptoms,
      notes: record.notes,
      collectedAt: record.collectedAt.toISOString(),
      author: record.authoredBy,
      sourceEncounter: {
        id: record.encounter.id,
        createdAt: record.encounter.createdAt.toISOString(),
        status: record.encounter.status,
      },
      legacySymptomsUnmapped: record.legacySymptomsUnmapped,
      diabetesStatus: record.diabetesStatus,
      diabetesType: record.diabetesType,
      yearDiagnosed: record.yearDiagnosed,
      yearDiagnosedUnknown: record.yearDiagnosedUnknown,
      mainConcern: record.mainConcern,
      mainConcernOther: record.mainConcernOther,
      hba1cStatus: record.hba1cStatus,
      hba1cMeasuredOn: record.hba1cMeasuredOn?.toISOString() ?? null,
      homeGlucoseMonitoring: record.homeGlucoseMonitoring,
      homeGlucoseLowMgDl: record.homeGlucoseLowMgDl,
      homeGlucoseHighMgDl: record.homeGlucoseHighMgDl,
      urgentSymptoms: record.urgentSymptoms,
      urgentReviewRequired: record.urgentReviewRequired,
      urgentReviewReasons: record.urgentReviewReasons,
      derivedSuspicion: record.derivedSuspicion,
      nutrition: record.nutrition,
      phq2Interest: record.phq2Interest,
      phq2Mood: record.phq2Mood,
      phq2Total: record.phq2Total,
      phq2Positive: record.phq2Positive,
      distressOverwhelmed: record.distressOverwhelmed,
      distressFailing: record.distressFailing,
      distressPositive: record.distressPositive,
      eyeExam: record.eyeExam,
      footExam: record.footExam,
      kidneyTesting: record.kidneyTesting,
      bpCheckedToday: record.bpCheckedToday,
      currentFootWound: record.currentFootWound,
      volunteerActions: record.volunteerActions,
      clinicianReviewRequested: record.clinicianReviewRequested,
      reviewReasons: record.reviewReasons,
      reviewReasonOther: record.reviewReasonOther,
      /*
        Omitted, not blanked, for anyone without the permission. A key present with a null value
        tells a volunteer there is a plan they cannot see, which is more than they are entitled to
        know and enough to build a UI that hints at it.
      */
      ...(hasPermissionAtClinic(roles, clinicId, PERMISSIONS.CAREPLAN_CLINICIAN_PLAN)
        ? {
            clinicianPlan: {
              items: record.clinicianPlanItems,
              other: record.clinicianPlanOther,
              followUpWindow: record.followUpWindow,
              followUpOther: record.followUpOther,
              followUpOwner: record.followUpOwner,
              comments: record.clinicianComments,
              author: record.clinicianPlanAuthor,
              authoredAt: record.clinicianPlanAuthoredAt?.toISOString() ?? null,
            },
          }
        : {}),
      isEditable:
        record.encounter.status !== EncounterStatus.FINALIZED &&
        hasPermissionAtClinic(roles, clinicId, PERMISSIONS.SCREENING_WRITE),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private assertPayloadsValid(issues: readonly PayloadIssue[]): void {
    if (!issues.length) return;
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Diabetes screening validation failed.',
      fieldErrors: issues.map((issue) => ({ field: issue.path, message: issue.message })),
    });
  }

  private validateCollectionTime(value: string): Date {
    const collectedAt = new Date(value);
    if (!Number.isFinite(collectedAt.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_COLLECTION_TIME',
        message: 'Collection time must be a valid ISO timestamp.',
      });
    }
    if (collectedAt.getTime() > Date.now() + MAX_FUTURE_COLLECTION_SKEW_MS) {
      throw new BadRequestException({
        code: 'COLLECTION_TIME_IN_FUTURE',
        message: 'Collection time cannot be more than five minutes in the future.',
      });
    }
    return collectedAt;
  }

  private flattenValidationErrors(
    errors: ValidationError[],
    parentPath?: string,
  ): Array<{ field: string; message: string }> {
    return errors.flatMap((error) => {
      const field = parentPath ? `${parentPath}.${error.property}` : error.property;
      const own = error.constraints
        ? Object.values(error.constraints).map((message) => ({ field, message }))
        : [];
      return [...own, ...this.flattenValidationErrors(error.children ?? [], field)];
    });
  }

  private async assertPatientScope(clinicId: string, patientId: string): Promise<void> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, primaryClinicId: clinicId, mergedIntoPatientId: null },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient not found in the active clinic');
  }

  private assertReadPermission(roles: ScopedRole[], clinicId: string): void {
    assertPermissionAtClinic(
      roles,
      clinicId,
      PERMISSIONS.SCREENING_READ,
      'SCREENING.READ permission is required',
    );
  }

  private assertWritePermission(roles: ScopedRole[], clinicId: string): void {
    assertPermissionAtClinic(
      roles,
      clinicId,
      PERMISSIONS.SCREENING_WRITE,
      'SCREENING.WRITE permission is required',
    );
  }

  private contextInclude() {
    return {
      authoredBy: { select: { id: true, displayName: true } },
      clinicianPlanAuthor: { select: { id: true, displayName: true } },
      encounter: { select: { id: true, patientId: true, createdAt: true, status: true } },
    } satisfies Prisma.DiabetesScreeningInclude;
  }
}
