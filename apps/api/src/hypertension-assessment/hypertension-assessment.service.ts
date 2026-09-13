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
  classifyBloodPressure,
  deriveHypertensionEscalation,
  parseHypertensionLifestyle,
  parseHypertensionSubstanceDetails,
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
  UpsertHypertensionAssessmentDto,
  UpsertHypertensionClinicianPlanDto,
} from './dto/hypertension-assessment.dto';

const MAX_FUTURE_COLLECTION_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 25;

type HypertensionWithContext = Prisma.HypertensionAssessmentGetPayload<{
  include: {
    authoredBy: { select: { id: true; displayName: true } };
    clinicianPlanAuthor: { select: { id: true; displayName: true } };
    encounter: {
      select: {
        id: true;
        patientId: true;
        createdAt: true;
        status: true;
        vitals: { select: { systolicBp: true; diastolicBp: true } };
      };
    };
  };
}>;

export interface HypertensionActor {
  userId: string;
  roles: ScopedRole[];
}

export interface HypertensionRequestMetadata {
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  syncMutation?: { entityType: string; entityId: string; idempotencyKey: string };
}

@Injectable()
export class HypertensionAssessmentService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    clinicId: string,
    patientId: string,
    actor: HypertensionActor,
    params: { cursor?: string; limit?: number } = {},
  ) {
    this.assertReadPermission(actor.roles, clinicId);
    await this.assertPatientScope(clinicId, patientId);

    const cursor = params.cursor
      ? decodeKeysetCursor(params.cursor, 'The hypertension history cursor is invalid.')
      : null;
    const limit = params.limit ?? DEFAULT_PAGE_SIZE;
    const records = await this.prisma.hypertensionAssessment.findMany({
      where: { clinicId, encounter: { patientId }, ...buildKeysetWhere('collectedAt', cursor) },
      include: this.contextInclude(),
      orderBy: [{ collectedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = records.length > limit;
    const items = records
      .slice(0, limit)
      .map((record) => this.toResponse(record, actor.roles, clinicId));
    const last = records.slice(0, limit).at(-1);
    return {
      items,
      nextCursor: hasMore && last ? encodeKeysetCursor(last.collectedAt, last.id) : null,
    };
  }

  async upsert(
    clinicId: string,
    encounterId: string,
    actor: HypertensionActor,
    dto: UpsertHypertensionAssessmentDto,
    metadata: HypertensionRequestMetadata = {},
    assessmentId?: string,
  ) {
    this.assertWritePermission(actor.roles, clinicId);
    const collectedAt = this.validateCollectionTime(dto.collectedAt);

    /*
      The JSONB sections are checked here rather than by class-validator.

      `@nkwapa/db` holds one definition of what a lifestyle or substance payload may contain, and
      the encounter form imports the same parser. Running it here means a payload the form would
      reject is a payload the API rejects, for the same reason, at the same path.
    */
    const lifestyle = parseHypertensionLifestyle(dto.lifestyle ?? null);
    const substances = parseHypertensionSubstanceDetails(dto.substanceDetails ?? null);
    this.assertPayloadsValid([...lifestyle.issues, ...substances.issues]);

    const saved = await this.prisma.$transaction(async (tx) => {
      const encounter = await tx.encounter.findUnique({
        where: { id: encounterId },
        select: {
          clinicId: true,
          status: true,
          vitals: { select: { systolicBp: true, diastolicBp: true } },
        },
      });
      if (!encounter || encounter.clinicId !== clinicId) {
        throw new NotFoundException('Encounter not found in the active clinic');
      }
      if (encounter.status === EncounterStatus.FINALIZED) {
        throw new ConflictException({
          code: 'CONFLICT_FINALIZED',
          message: 'Cannot modify a hypertension assessment for a finalized encounter',
          existingStatus: encounter.status,
        });
      }

      /*
        Derivation happens here, from the encounter's own vitals, and the payload's values for
        these columns are ignored.

        Today's reading is never copied onto this record. It lives on `Vitals`, the interview reads
        it, and one encounter therefore cannot hold two disagreeing answers to "what was the blood
        pressure today". The classification is recomputed from that reading on every write, so
        correcting a mistyped vital corrects the classification too, with no second edit.
      */
      const derivedClassification = classifyBloodPressure(
        encounter.vitals?.systolicBp ?? null,
        encounter.vitals?.diastolicBp ?? null,
      );
      const escalation = deriveHypertensionEscalation({
        symptoms: dto.currentSymptoms,
        systolicBp: encounter.vitals?.systolicBp ?? null,
        diastolicBp: encounter.vitals?.diastolicBp ?? null,
        repeatSystolicBp: dto.repeatSystolicBp,
        repeatDiastolicBp: dto.repeatDiastolicBp,
      });

      /*
        A manual classification is honoured only when the clinician said they were overriding.

        Without the flag, a client that echoed back the value it was shown would look identical to
        one asserting a clinical judgement, and the derivation would never take effect.
      */
      const classification = dto.classificationOverridden
        ? (dto.classification ?? derivedClassification)
        : derivedClassification;

      const writable = {
        classification,
        derivedClassification,
        classificationOverridden: dto.classificationOverridden,
        suspected: dto.suspected,
        confirmed: dto.confirmed,
        hypertensionStatus: dto.hypertensionStatus,
        yearDiagnosed: dto.yearDiagnosed,
        yearDiagnosedUnknown: dto.yearDiagnosedUnknown,
        mainConcern: dto.mainConcern,
        mainConcernOther: dto.mainConcernOther,
        usualCareFacility: dto.usualCareFacility,
        usualCareFacilityStatus: dto.usualCareFacilityStatus,
        repeatPerformed: dto.repeatPerformed,
        repeatSystolicBp: dto.repeatSystolicBp,
        repeatDiastolicBp: dto.repeatDiastolicBp,
        repeatPosition: dto.repeatPosition ?? null,
        repeatCuffSize: dto.repeatCuffSize ?? null,
        repeatMeasuredAt: dto.repeatMeasuredAt ? new Date(dto.repeatMeasuredAt) : null,
        repeatPromptShown: dto.repeatPromptShown,
        homeMonitorStatus: dto.homeMonitorStatus,
        homeCheckFrequency: dto.homeCheckFrequency,
        homeSystolicAvg: dto.homeSystolicAvg,
        homeDiastolicAvg: dto.homeDiastolicAvg,
        homeReadingsUnknown: dto.homeReadingsUnknown,
        homeReadingSource: dto.homeReadingSource,
        currentSymptoms: dto.currentSymptoms,
        urgentReviewRequired: escalation.urgentReviewRequired,
        urgentReviewReasons: escalation.reasons,
        medicationReminderStrategies: dto.medicationReminderStrategies,
        reminderStrategyOther: dto.reminderStrategyOther,
        contributingSubstances: dto.contributingSubstances,
        substanceSchemaVersion: substances.schemaVersion,
        substanceDetails: substances.payload as unknown as Prisma.InputJsonValue,
        lifestyleSchemaVersion: lifestyle.schemaVersion,
        lifestyle: lifestyle.payload as unknown as Prisma.InputJsonValue,
        relevantConditions: dto.relevantConditions,
        pregnantNow: dto.pregnantNow,
        planningPregnancy: dto.planningPregnancy,
        kidneyFunctionTesting: dto.kidneyFunctionTesting,
        urineProteinTesting: dto.urineProteinTesting,
        cholesterolTesting: dto.cholesterolTesting,
        ecgCompleted: dto.ecgCompleted,
        statinUse: dto.statinUse,
        aspirinUse: dto.aspirinUse,
        volunteerActions: (dto.volunteerActions ?? null) as Prisma.InputJsonValue,
        clinicianReviewRequested: dto.clinicianReviewRequested,
        reviewReasons: dto.reviewReasons,
        reviewReasonOther: dto.reviewReasonOther,
        notes: dto.notes,
        collectedAt,
        authoredByUserId: actor.userId,
      };

      const existing = await tx.hypertensionAssessment.findUnique({ where: { encounterId } });
      const record = await tx.hypertensionAssessment.upsert({
        where: { encounterId },
        create: { id: assessmentId ?? randomUUID(), clinicId, encounterId, ...writable },
        update: writable,
        include: this.contextInclude(),
      });

      await this.writeAudit(tx, {
        clinicId,
        actorUserId: actor.userId,
        action: existing ? 'HYPERTENSION_ASSESSMENT.UPSERT' : 'HYPERTENSION_ASSESSMENT.CREATE',
        entityId: record.id,
        before: existing,
        after: record,
        metadata,
      });
      return record;
    });

    return this.toResponse(saved, actor.roles, clinicId);
  }

  /**
   * Record the supervising clinician's plan.
   *
   * Separate from `upsert` and separately permissioned. The UI also hides this section from a
   * volunteer, but hiding is not a boundary, and this is the layer that decides.
   *
   * The follow-up window is resolved to a concrete `CarePlan.followUpDate` in the same transaction,
   * because that column is what `EncounterService` schedules the patient's reminder from when the
   * encounter is finalized. Storing only the window would leave a plan that reads as complete and
   * schedules nothing.
   */
  async upsertClinicianPlan(
    clinicId: string,
    encounterId: string,
    actor: HypertensionActor,
    dto: UpsertHypertensionClinicianPlanDto,
    metadata: HypertensionRequestMetadata = {},
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
          message: 'Cannot modify a hypertension assessment for a finalized encounter',
          existingStatus: encounter.status,
        });
      }

      const existing = await tx.hypertensionAssessment.findUnique({ where: { encounterId } });
      if (!existing) {
        throw new NotFoundException(
          'Record the hypertension assessment before adding a clinician plan',
        );
      }

      const record = await tx.hypertensionAssessment.update({
        where: { encounterId },
        data: {
          clinicianPlanItems: dto.clinicianPlanItems,
          clinicianPlanOther: dto.clinicianPlanOther,
          bpGoalSystolic: dto.bpGoalSystolic,
          bpGoalDiastolic: dto.bpGoalDiastolic,
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

      await this.writeAudit(tx, {
        clinicId,
        actorUserId: actor.userId,
        action: 'HYPERTENSION_ASSESSMENT.CLINICIAN_PLAN',
        entityId: record.id,
        before: existing,
        after: record,
        metadata,
      });
      return record;
    });

    return this.toResponse(saved, actor.roles, clinicId);
  }

  /**
   * Validate an offline replay through the same DTO the REST route uses.
   *
   * This is the whole point of the module. `sync.service.ts` previously wrote this record with an
   * inline upsert that cast `payload.classification` straight to the enum, so a mutation carrying
   * `{ classification: 'BOGUS' }` was accepted by the API and only failed deeper down. The offline
   * path and the online path now reject the same payloads.
   */
  async validateSyncPayload(payload: Record<string, unknown>, fallbackCollectedAt: string) {
    const candidate: Record<string, unknown> = {
      ...payload,
      collectedAt: payload.collectedAt ?? fallbackCollectedAt,
    };
    // Derived server-side; a replayed device must not be able to assert them.
    delete candidate.derivedClassification;
    delete candidate.urgentReviewRequired;
    delete candidate.urgentReviewReasons;
    // The clinician plan has its own route and its own permission.
    for (const key of [
      'clinicianPlanItems',
      'clinicianPlanOther',
      'bpGoalSystolic',
      'bpGoalDiastolic',
      'followUpWindow',
      'followUpOther',
      'followUpOwner',
      'clinicianComments',
      'clinicianPlanAuthorId',
      'clinicianPlanAuthoredAt',
    ]) {
      delete candidate[key];
    }

    const dto = plainToInstance(UpsertHypertensionAssessmentDto, candidate);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    });
    if (errors.length) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Hypertension assessment validation failed.',
        fieldErrors: this.flattenValidationErrors(errors),
      });
    }
    this.validateCollectionTime(dto.collectedAt);
    return { dto };
  }

  toResponse(record: HypertensionWithContext, roles: ScopedRole[], clinicId: string) {
    const maySeeClinicianPlan = hasPermissionAtClinic(
      roles,
      clinicId,
      PERMISSIONS.CAREPLAN_CLINICIAN_PLAN,
    );

    return {
      id: record.id,
      clinicId: record.clinicId,
      patientId: record.encounter.patientId,
      classification: record.classification,
      derivedClassification: record.derivedClassification,
      classificationOverridden: record.classificationOverridden,
      suspected: record.suspected,
      confirmed: record.confirmed,
      hypertensionStatus: record.hypertensionStatus,
      yearDiagnosed: record.yearDiagnosed,
      yearDiagnosedUnknown: record.yearDiagnosedUnknown,
      mainConcern: record.mainConcern,
      mainConcernOther: record.mainConcernOther,
      usualCareFacility: record.usualCareFacility,
      usualCareFacilityStatus: record.usualCareFacilityStatus,
      repeatPerformed: record.repeatPerformed,
      repeatSystolicBp: record.repeatSystolicBp,
      repeatDiastolicBp: record.repeatDiastolicBp,
      repeatPosition: record.repeatPosition,
      repeatCuffSize: record.repeatCuffSize,
      repeatMeasuredAt: record.repeatMeasuredAt?.toISOString() ?? null,
      repeatPromptShown: record.repeatPromptShown,
      homeMonitorStatus: record.homeMonitorStatus,
      homeCheckFrequency: record.homeCheckFrequency,
      homeSystolicAvg: record.homeSystolicAvg,
      homeDiastolicAvg: record.homeDiastolicAvg,
      homeReadingsUnknown: record.homeReadingsUnknown,
      homeReadingSource: record.homeReadingSource,
      currentSymptoms: record.currentSymptoms,
      urgentReviewRequired: record.urgentReviewRequired,
      urgentReviewReasons: record.urgentReviewReasons,
      medicationReminderStrategies: record.medicationReminderStrategies,
      reminderStrategyOther: record.reminderStrategyOther,
      contributingSubstances: record.contributingSubstances,
      substanceDetails: record.substanceDetails,
      lifestyle: record.lifestyle,
      relevantConditions: record.relevantConditions,
      pregnantNow: record.pregnantNow,
      planningPregnancy: record.planningPregnancy,
      kidneyFunctionTesting: record.kidneyFunctionTesting,
      urineProteinTesting: record.urineProteinTesting,
      cholesterolTesting: record.cholesterolTesting,
      ecgCompleted: record.ecgCompleted,
      statinUse: record.statinUse,
      aspirinUse: record.aspirinUse,
      volunteerActions: record.volunteerActions,
      clinicianReviewRequested: record.clinicianReviewRequested,
      reviewReasons: record.reviewReasons,
      reviewReasonOther: record.reviewReasonOther,
      notes: record.notes,
      /*
        Omitted, not blanked, for anyone without the permission.

        A key present with a null value tells a reader there is a plan they cannot see, which is
        more than they are entitled to know and enough to build a UI that hints at it.
      */
      ...(maySeeClinicianPlan
        ? {
            clinicianPlan: {
              items: record.clinicianPlanItems,
              other: record.clinicianPlanOther,
              bpGoalSystolic: record.bpGoalSystolic,
              bpGoalDiastolic: record.bpGoalDiastolic,
              followUpWindow: record.followUpWindow,
              followUpOther: record.followUpOther,
              followUpOwner: record.followUpOwner,
              comments: record.clinicianComments,
              author: record.clinicianPlanAuthor,
              authoredAt: record.clinicianPlanAuthoredAt?.toISOString() ?? null,
            },
          }
        : {}),
      collectedAt: record.collectedAt.toISOString(),
      author: record.authoredBy,
      sourceEncounter: {
        id: record.encounter.id,
        createdAt: record.encounter.createdAt.toISOString(),
        status: record.encounter.status,
      },
      todaysVitals: {
        systolicBp: record.encounter.vitals?.systolicBp ?? null,
        diastolicBp: record.encounter.vitals?.diastolicBp ?? null,
      },
      isEditable:
        record.encounter.status !== EncounterStatus.FINALIZED &&
        hasPermissionAtClinic(roles, clinicId, PERMISSIONS.SCREENING_WRITE),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    params: {
      clinicId: string;
      actorUserId: string;
      action: string;
      entityId: string;
      before: unknown;
      after: unknown;
      metadata: HypertensionRequestMetadata;
    },
  ): Promise<void> {
    await tx.auditEvent.create({
      data: {
        clinicId: params.clinicId,
        actorUserId: params.actorUserId,
        action: params.action,
        entityType: 'HypertensionAssessment',
        entityId: params.entityId,
        beforeJson: params.before ? JSON.stringify(params.before) : undefined,
        afterJson: JSON.stringify(params.after),
        requestId: params.metadata.requestId ?? randomUUID(),
        ipAddress: params.metadata.ipAddress,
        userAgent: params.metadata.userAgent,
      },
    });
    if (params.metadata.syncMutation) {
      await tx.syncMutation.create({
        data: {
          clinicId: params.clinicId,
          entityType: params.metadata.syncMutation.entityType,
          entityId: params.metadata.syncMutation.entityId,
          operation: 'UPSERT',
          idempotencyKey: params.metadata.syncMutation.idempotencyKey,
          status: 'APPLIED',
        },
      });
    }
  }

  private assertPayloadsValid(issues: readonly PayloadIssue[]): void {
    if (!issues.length) return;
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Hypertension assessment validation failed.',
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
      encounter: {
        select: {
          id: true,
          patientId: true,
          createdAt: true,
          status: true,
          vitals: { select: { systolicBp: true, diastolicBp: true } },
        },
      },
    } satisfies Prisma.HypertensionAssessmentInclude;
  }
}
