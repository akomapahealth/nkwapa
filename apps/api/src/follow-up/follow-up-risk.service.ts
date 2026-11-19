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
import {
  FollowUpFlagService,
  type MissedContact,
  type TierChange,
} from './follow-up-flags.service';
import { dayOf, isInPerson, planContacts, refillDueOn, type OpenContact } from './contact-schedule';

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
  | 'FOLLOW_UP_CONTACT'
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
    const { outcome, change, missed } = await this.prisma.withSystemContext(
      { systemReason: 'Recompute a patient follow-up risk tier' },
      (tx) => this.recomputeIn(tx, request, new Date()),
    );
    // After the commit, so nobody is told about a tier that rolled back. Never throws.
    if (change) await this.flags?.raise(change);
    if (missed?.length) await this.flags?.notifyMissed(missed);
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
  ): Promise<{ outcome: RiskRecomputeOutcome; change?: TierChange; missed?: MissedContact[] }> {
    // One recompute per patient at a time: two saves at once must not book the same contact twice.
    await tx.$executeRaw`SELECT 1 FROM "Patient" WHERE "id" = ${request.patientId}::uuid FOR UPDATE`;
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
    const contacts = await this.loadContacts(tx, patient.id, today);
    records.followUp = contacts.facts;
    const input = assembleFollowUpInput(records);
    const result = assessFollowUp(input);
    const previous = patient.currentRiskAssessment;

    const schedule = (changed: boolean) =>
      this.schedule(tx, {
        clinicId: patient.primaryClinicId,
        patientId: patient.id,
        tier: result.tier,
        atTarget: result.atTarget,
        actions: result.actions,
        changed,
        becameUrgent: result.tier === 'URGENT' && previous?.tier !== 'URGENT',
        today,
        contacts,
      });

    if (previous && sameAnswer(previous, result)) {
      return { outcome: 'UNCHANGED', missed: await schedule(false) };
    }

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
    const missed = await schedule(true);
    return {
      outcome: 'CREATED',
      missed,
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

  /** The patient's follow-up contacts (#338): the engine's facts and the scheduler's state. */
  private async loadContacts(tx: Prisma.TransactionClient, patientId: string, today: Date) {
    const symptomsSince = new Date(
      today.getTime() - DEFAULT_FOLLOW_UP_CONFIG.dangerSignWindowDays * 86_400_000,
    );
    const [open, reached, reported, latestEncounter, stop, prescriptions, supply, lastRefill] =
      await Promise.all([
        tx.followUpContact.findMany({
          where: { patientId, status: { in: ['DUE', 'MISSED'] } },
          select: {
            id: true,
            mode: true,
            purpose: true,
            dueOn: true,
            status: true,
            createdAt: true,
            ownerUserId: true,
          },
        }),
        tx.followUpAttempt.findMany({
          where: { patientId, outcome: { not: 'ATTEMPTED' } },
          orderBy: { at: 'desc' },
          take: 50,
          select: { at: true, mode: true },
        }),
        tx.followUpAttempt.findMany({
          where: {
            patientId,
            at: { gte: symptomsSince },
            OR: [
              { NOT: { symptoms: { isEmpty: true } } },
              { NOT: { diabetesSymptoms: { isEmpty: true } } },
            ],
          },
          select: { at: true, symptoms: true, diabetesSymptoms: true },
        }),
        tx.encounter.findFirst({
          where: { patientId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            createdAt: true,
            createdByUserId: true,
            carePlan: { select: { followUpDate: true } },
          },
        }),
        tx.followUpContact.findFirst({
          where: {
            patientId,
            status: 'CANCELLED',
            cancelReason: { in: ['DECEASED', 'MOVED', 'OPTED_OUT'] },
          },
          orderBy: { cancelledAt: 'desc' },
          select: { cancelledAt: true },
        }),
        // Refill news (#338): the newest treatment prescriptions, the latest supply answer, and
        // when a refill call was last booked.
        tx.prescription.findMany({
          where: { encounter: { patientId }, drug: { category: { in: TREATMENT_CATEGORIES } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { createdAt: true, duration: true },
        }),
        tx.encounterMedicationAdherence.findFirst({
          where: { encounter: { patientId }, supplyRemaining: { not: 'NOT_ASSESSED' } },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true, supplyRemaining: true },
        }),
        tx.followUpContact.findFirst({
          where: { patientId, purpose: 'ADHERENCE_REFILL' },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
      ]);
    return {
      open,
      latestEncounter,
      refillDueOn: refillDueOn({
        prescriptions,
        supply: supply ? { at: supply.createdAt, remaining: supply.supplyRemaining } : null,
        lastRefillBookedAt: lastRefill?.createdAt ?? null,
        today,
      }),
      lastTeleAt: reached.find((attempt) => !isInPerson(attempt.mode))?.at ?? null,
      // Stopped until the patient is next seen in person.
      stopped:
        !!stop?.cancelledAt && (!latestEncounter || latestEncounter.createdAt < stop.cancelledAt),
      facts: {
        completedAt: reached.map((attempt) => attempt.at),
        unresolvedDueOn: open.map((contact) => contact.dueOn),
        reportedSymptoms: reported,
      },
    };
  }

  /**
   * Apply the contact plan (#338) and return the contacts that just became missed, for their
   * owners to be told after the commit.
   */
  private async schedule(
    tx: Prisma.TransactionClient,
    args: {
      clinicId: string;
      patientId: string;
      tier: FollowUpTier;
      atTarget: boolean | null;
      actions: FollowUpAssessment['actions'];
      changed: boolean;
      becameUrgent: boolean;
      today: Date;
      contacts: Awaited<ReturnType<FollowUpRiskService['loadContacts']>>;
    },
  ): Promise<MissedContact[]> {
    const { clinicId, patientId, tier, today, contacts } = args;
    const visit = contacts.latestEncounter;
    const plan = planContacts({
      tier,
      atTarget: args.atTarget,
      actions: args.actions,
      changed: args.changed,
      becameUrgent: args.becameUrgent,
      today,
      latestEncounter: visit ? { id: visit.id, at: visit.createdAt } : null,
      lastTeleAt: contacts.lastTeleAt,
      carePlanFollowUpDate: visit?.carePlan?.followUpDate ?? null,
      stopped: contacts.stopped,
      refillDueOn: contacts.refillDueOn,
      open: contacts.open as OpenContact[],
    });

    for (const { contactId, encounterId } of plan.completeByEncounter) {
      await tx.followUpContact.update({
        where: { id: contactId },
        data: { status: 'DONE', completedAt: visit!.createdAt, encounterId },
      });
      await tx.followUpAttempt.create({
        data: {
          clinicId,
          contactId,
          patientId,
          at: visit!.createdAt,
          byUserId: visit!.createdByUserId,
          mode: 'IN_PERSON',
          outcome: 'RETURNED',
        },
      });
    }
    if (plan.markMissed.length > 0) {
      await tx.followUpContact.updateMany({
        where: { id: { in: plan.markMissed }, status: 'DUE' },
        data: { status: 'MISSED', missedAt: today },
      });
    }
    if (plan.create.length > 0) {
      await tx.followUpContact.createMany({
        data: plan.create.map((contact) => ({
          ...contact,
          clinicId,
          patientId,
          tierAtScheduling: tier,
        })),
      });
    }
    for (const { contactId, purpose, dueOn } of plan.reschedule) {
      await tx.followUpContact.update({
        where: { id: contactId },
        data: { purpose, dueOn, tierAtScheduling: tier },
      });
    }
    return contacts.open
      .filter((contact) => plan.markMissed.includes(contact.id))
      .map((contact) => ({
        clinicId,
        patientId,
        contactId: contact.id,
        ownerUserId: contact.ownerUserId,
        dueOn: dayOf(contact.dueOn),
      }));
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
