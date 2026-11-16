import { Injectable, Logger, Optional } from '@nestjs/common';
import type { FollowUpTier, Prisma } from '@prisma/client';
import {
  assessFollowUp,
  DEFAULT_FOLLOW_UP_CONFIG,
  movement,
  type FollowUpAssessment,
} from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SYSTEM_ACTOR_USER_ID } from '../common/system-actor';
import { isApiFeatureEnabled } from '../common/feature-flags';
import {
  assembleFollowUpInput,
  DIABETES_DRUG_CATEGORIES,
  HYPERTENSION_DRUG_CATEGORIES,
  type FollowUpRecords,
} from './follow-up-input';
import { FollowUpFlagService, type TierChange } from './follow-up-flags.service';

/** What caused a recompute. Stored on the row; never a free-text reason. */
export type RiskRecomputeTrigger =
  | 'PATIENT'
  | 'VITALS'
  | 'TOBACCO'
  | 'HYPERTENSION'
  | 'DIABETES'
  | 'MEDICATION'
  | 'PRESCRIPTION'
  | 'SELF_REPORT'
  | 'MEASUREMENT'
  | 'SYNC'
  | 'IMPORT'
  | 'MERGE'
  | 'SWEEP'
  | 'BACKFILL';

export interface RiskRecomputeRequest {
  patientId: string;
  trigger: RiskRecomputeTrigger;
  /** The person whose save caused it; the system actor when null. */
  actorUserId?: string | null;
}

export type RiskRecomputeOutcome = 'CREATED' | 'UNCHANGED' | 'SKIPPED';

const TREATMENT_CATEGORIES = [...HYPERTENSION_DRUG_CATEGORIES, ...DIABETES_DRUG_CATEGORIES];

/**
 * How far back the records reach. shortcut: the latest 60 visits and a year of home readings;
 * a chart older than that is outside every window the engine uses except "known condition",
 * which the latest assessments repeat. Raise if a patient's history ever outgrows it.
 */
const ENCOUNTER_LIMIT = 60;
const HOME_READING_MONTHS = 12;

const SAME_FIELDS = [
  'tier',
  'caughtBy',
  'atTarget',
  'cvdRiskPercent',
  'chart',
  'controlStatus',
  'screeningGroup',
] as const;

/**
 * Keeps every patient's follow-up tier current (#336).
 *
 * A save calls `recomputeAfterCommit`; once the save's transaction commits, the patient's records
 * are read, the engine runs, and a new history row is written only when the answer changed. The
 * recompute runs as the system (the tier is derived, not authored), with the person whose save
 * caused it recorded as `triggeredByUserId`. A failure is logged without patient detail and never
 * fails the save; the nightly sweep repairs whatever it missed.
 */
@Injectable()
export class FollowUpRiskService {
  private readonly logger = new Logger(FollowUpRiskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly flags?: FollowUpFlagService,
  ) {}

  /** Whether tiers are computed and shown. Off until the clinical sign-off in #334. */
  get enabled(): boolean {
    return isApiFeatureEnabled('followUpStratification');
  }

  /** Queue a recompute for after the current transaction commits. Cheap to call repeatedly. */
  async recomputeAfterCommit(request: RiskRecomputeRequest): Promise<void> {
    if (!this.enabled) return;
    await this.prisma.afterCommit(
      () => this.recompute(request),
      `follow-up-risk:${request.patientId}`,
    );
  }

  /** The same, for a save that knows its encounter but not its patient. */
  async recomputeEncounterAfterCommit(
    request: Omit<RiskRecomputeRequest, 'patientId'> & { encounterId: string },
  ): Promise<void> {
    if (!this.enabled) return;
    const { encounterId, ...rest } = request;
    await this.prisma.afterCommit(async () => {
      const encounter = await this.prisma.withSystemContext(
        { systemReason: 'Find the patient whose follow-up tier to recompute' },
        (tx) =>
          tx.encounter.findUnique({ where: { id: encounterId }, select: { patientId: true } }),
      );
      if (encounter) await this.recompute({ ...rest, patientId: encounter.patientId });
    }, `follow-up-risk-encounter:${encounterId}`);
  }

  async recompute(request: RiskRecomputeRequest): Promise<RiskRecomputeOutcome> {
    if (!this.enabled) return 'SKIPPED';
    const { outcome, change } = await this.prisma.withSystemContext(
      { systemReason: 'Recompute a patient follow-up risk tier' },
      (tx) => this.recomputeIn(tx, request, new Date()),
    );
    // After the commit, so nobody is told about a tier that rolled back. Never throws.
    if (change) await this.flags?.raise(change);
    return outcome;
  }

  /**
   * Recompute every unmerged patient, one transaction each, so one bad chart cannot stop the rest.
   * Returns counts only: nothing about any patient leaves this method.
   */
  async recomputeAll(
    trigger: 'SWEEP' | 'BACKFILL',
    batchSize = 200,
  ): Promise<Record<RiskRecomputeOutcome | 'FAILED', number>> {
    const counts = { CREATED: 0, UNCHANGED: 0, SKIPPED: 0, FAILED: 0 };
    if (!this.enabled) return counts;
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.prisma.withSystemContext(
        { systemReason: 'List patients for a follow-up tier recompute' },
        (tx) =>
          tx.patient.findMany({
            where: { mergedIntoPatientId: null },
            select: { id: true },
            orderBy: { id: 'asc' },
            take: batchSize,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          }),
      );
      for (const { id } of batch) {
        try {
          counts[await this.recompute({ patientId: id, trigger })] += 1;
        } catch (error) {
          counts.FAILED += 1;
          this.logger.warn(
            `Tier recompute failed: ${error instanceof Error ? error.name : 'unknown error'}`,
          );
        }
      }
      if (batch.length < batchSize) return counts;
      cursor = batch[batch.length - 1].id;
    }
  }

  private async recomputeIn(
    tx: Prisma.TransactionClient,
    request: RiskRecomputeRequest,
    today: Date,
  ): Promise<{ outcome: RiskRecomputeOutcome; change?: TierChange }> {
    const patient = await tx.patient.findUnique({
      where: { id: request.patientId },
      select: {
        id: true,
        dob: true,
        sex: true,
        primaryClinicId: true,
        mergedIntoPatientId: true,
        primaryClinic: { select: { timezone: true } },
        currentRiskAssessment: true,
      },
    });
    if (!patient || patient.mergedIntoPatientId) return { outcome: 'SKIPPED' };

    const records = await this.loadRecords(tx, patient, today);
    const input = assembleFollowUpInput(records);
    const result = assessFollowUp(input);
    const previous = patient.currentRiskAssessment;

    if (previous && sameAnswer(previous, result)) return { outcome: 'UNCHANGED' };

    const move = movement(
      previous
        ? {
            tier: previous.tier,
            reasons: previous.reasons as FollowUpAssessment['reasons'],
            atTarget: previous.atTarget,
          }
        : null,
      result,
    );
    const row = await tx.patientRiskAssessment.create({
      data: {
        clinicId: patient.primaryClinicId,
        patientId: patient.id,
        tier: result.tier,
        caughtBy: result.caughtBy,
        reasons: result.reasons,
        missing: result.missing,
        actions: result.actions,
        cvdRiskPercent: result.cvdRiskPercent,
        chart: result.chart,
        atTarget: result.atTarget,
        controlStatus: result.control.status,
        screeningGroup: result.screeningGroup,
        inputSnapshot: JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue,
        configVersion: result.configVersion,
        trigger: request.trigger,
        triggeredByUserId: request.actorUserId ?? null,
        previousTier: previous?.tier ?? null,
        movement: move.direction,
        movementTrigger: move.trigger,
        computedAt: today,
      },
      select: { id: true },
    });
    await tx.patient.update({
      where: { id: patient.id },
      data: { currentRiskAssessmentId: row.id, currentRiskTier: result.tier },
    });

    if (previous?.tier !== result.tier) {
      await this.audit.logWrite(
        {
          clinicId: patient.primaryClinicId,
          actorUserId: request.actorUserId ?? SYSTEM_ACTOR_USER_ID,
          action: 'FOLLOW_UP_TIER_CHANGED',
          entityType: 'PatientRiskAssessment',
          entityId: row.id,
          beforeJson: previous
            ? JSON.stringify({ tier: previous.tier, reasons: previous.reasons })
            : null,
          afterJson: JSON.stringify({
            tier: result.tier,
            reasons: result.reasons,
            trigger: request.trigger,
            configVersion: result.configVersion,
          }),
        },
        tx,
      );
    }
    return {
      outcome: 'CREATED',
      change: {
        clinicId: patient.primaryClinicId,
        patientId: patient.id,
        assessmentId: row.id,
        previous: previous ? { tier: previous.tier, reasons: previous.reasons } : null,
        current: { tier: result.tier, reasons: result.reasons },
        direction: move.direction,
        trigger: request.trigger,
        actorUserId: request.actorUserId ?? null,
      },
    };
  }

  private async loadRecords(
    tx: Prisma.TransactionClient,
    patient: { id: string; dob: Date | null; sex: FollowUpRecords['patient']['sex'] } & {
      primaryClinic: { timezone: string };
    },
    today: Date,
  ): Promise<FollowUpRecords> {
    const homeSince = new Date(today);
    homeSince.setUTCMonth(homeSince.getUTCMonth() - HOME_READING_MONTHS);
    const patientId = patient.id;

    const [encounters, selfReports, measurements, medicationRecords, prescriptions, reconciled] =
      await Promise.all([
        tx.encounter.findMany({
          where: { patientId },
          orderBy: { createdAt: 'desc' },
          take: ENCOUNTER_LIMIT,
          select: {
            createdAt: true,
            vitals: {
              select: {
                systolicBp: true,
                diastolicBp: true,
                bmi: true,
                weightKg: true,
                heightCm: true,
              },
            },
            tobaccoScreening: { select: { smokingStatus: true } },
            hypertensionAssessment: {
              select: {
                collectedAt: true,
                hypertensionStatus: true,
                confirmed: true,
                repeatSystolicBp: true,
                repeatDiastolicBp: true,
                repeatMeasuredAt: true,
                homeSystolicAvg: true,
                homeDiastolicAvg: true,
                currentSymptoms: true,
                relevantConditions: true,
                pregnantNow: true,
              },
            },
            diabetesScreening: {
              select: {
                collectedAt: true,
                glucoseMgDl: true,
                glucoseType: true,
                hba1cPercent: true,
                hba1cMeasuredOn: true,
                diabetesStatus: true,
                urgentSymptoms: true,
                symptoms: true,
              },
            },
          },
        }),
        tx.patientSelfReport.findMany({
          where: {
            patientId,
            type: { in: ['HOME_BP', 'HOME_GLUCOSE'] },
            recordedAt: { gte: homeSince },
          },
          select: {
            type: true,
            systolicBp: true,
            diastolicBp: true,
            glucoseMgDl: true,
            glucoseType: true,
            recordedAt: true,
          },
        }),
        tx.patientMeasurement.findMany({
          where: { patientId, type: { in: ['BP', 'GLUCOSE'] }, recordedAt: { gte: homeSince } },
          select: { type: true, source: true, recordedAt: true, payloadJson: true },
        }),
        tx.patientMedicationRecord.findMany({
          where: { patientId },
          select: {
            currentRevision: { select: { drug: { select: { category: true } } } },
            revisions: {
              select: {
                revisionNumber: true,
                status: true,
                strength: true,
                dose: true,
                frequency: true,
                createdAt: true,
              },
            },
          },
        }),
        tx.prescription.findMany({
          where: { encounter: { patientId }, drug: { category: { in: TREATMENT_CATEGORIES } } },
          select: {
            drugId: true,
            dosage: true,
            frequency: true,
            createdAt: true,
            drug: { select: { category: true } },
          },
        }),
        tx.medicationReconciliationEvent.count({ where: { patientId } }),
      ]);

    return {
      today,
      timeZone: patient.primaryClinic.timezone,
      patient: { dob: patient.dob, sex: patient.sex },
      encounters: encounters.map((e) => ({
        createdAt: e.createdAt,
        vitals: e.vitals,
        tobacco: e.tobaccoScreening,
        hypertension: e.hypertensionAssessment,
        diabetes: e.diabetesScreening
          ? {
              ...e.diabetesScreening,
              hba1cPercent:
                e.diabetesScreening.hba1cPercent === null
                  ? null
                  : Number(e.diabetesScreening.hba1cPercent),
            }
          : null,
      })),
      selfReports,
      measurements,
      medications: medicationRecords.flatMap((record) => {
        const category = record.currentRevision?.drug?.category;
        return category && TREATMENT_CATEGORIES.includes(category) && record.revisions.length > 0
          ? [{ category, revisions: record.revisions }]
          : [];
      }),
      prescriptions: prescriptions.map((p) => ({ ...p, category: p.drug.category })),
      medicationListReconciled: reconciled > 0,
    };
  }
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Whether a stored row already says what the engine just said. Dates and config version aside. */
export function sameAnswer(
  row: {
    tier: FollowUpTier;
    caughtBy: string | null;
    atTarget: boolean | null;
    cvdRiskPercent: number | null;
    chart: string | null;
    controlStatus: string;
    screeningGroup: string | null;
    reasons: string[];
    missing: string[];
    actions: string[];
    configVersion: string;
  },
  result: FollowUpAssessment,
): boolean {
  const flat = {
    tier: result.tier,
    caughtBy: result.caughtBy,
    atTarget: result.atTarget,
    cvdRiskPercent: result.cvdRiskPercent,
    chart: result.chart,
    controlStatus: result.control.status,
    screeningGroup: result.screeningGroup,
  };
  return (
    SAME_FIELDS.every((field) => row[field] === flat[field]) &&
    sameList(row.reasons, result.reasons) &&
    sameList(row.missing, result.missing) &&
    sameList(row.actions, result.actions) &&
    row.configVersion === DEFAULT_FOLLOW_UP_CONFIG.version
  );
}
