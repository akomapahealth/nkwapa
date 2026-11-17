import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  type OnModuleInit,
} from '@nestjs/common';
import { Prisma, type FollowUpTier, type RiskFlagKind } from '@prisma/client';
import {
  DEFAULT_FOLLOW_UP_CONFIG,
  FOLLOW_UP_REASON_LABELS,
  formatPersonName,
  type FollowUpMovementDirection,
  type FollowUpReason,
} from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PushService, type PushMessage } from '../push/push.service';
import { MaintenanceScheduler } from '../maintenance/maintenance-scheduler';
import { isApiFeatureEnabled } from '../common/feature-flags';
import { flagRecipients, loadClinicStaff, type FlagEvent } from './flag-recipients';
import type { RiskRecomputeTrigger } from './follow-up-risk.service';

export const URGENT_ESCALATION_JOB = 'escalate-urgent-follow-up-flag';
export const FOLLOW_UP_FLAGS_DAILY_JOB = 'follow-up-flags-daily';
const DAY_MS = 24 * 60 * 60 * 1000;

/** A recompute that wrote a new assessment, as the flag rules need it. */
export interface TierChange {
  clinicId: string;
  patientId: string;
  assessmentId: string;
  previous: { tier: FollowUpTier; reasons: readonly string[] } | null;
  current: { tier: FollowUpTier; reasons: readonly string[] };
  direction: FollowUpMovementDirection;
  trigger: RiskRecomputeTrigger;
  actorUserId: string | null;
}

/** The kinds someone can say "I'm on it" to. */
export const TAKEABLE_KINDS = ['URGENT', 'SCREENING_URGENT'] as const satisfies RiskFlagKind[];
type TakeableKind = (typeof TAKEABLE_KINDS)[number];

/** Who has taken an urgent flag, for the chart banner and the bell tile. */
export interface UrgentFlagView {
  id: string;
  kind: TakeableKind;
  raisedAt: Date;
  /** The screening findings in plain words; null for an Urgent tier, whose reasons say it. */
  detail: string | null;
  acknowledgement: { userId: string; displayName: string; at: Date } | null;
}

/** An urgent finding at screening (#337), as `PushService.alertClinicians` receives it. */
export interface ScreeningAlert {
  clinicId: string;
  encounterId: string;
  actorUserId: string;
  /** Plain-English findings, e.g. "Chest pain" or "Blood pressure 186/124 mmHg". */
  findings: string[];
}

/**
 * A screening flag whose visit now has a repeat reading and nothing urgent left (#334): the first
 * reading was the only finding and the repeat did not confirm it, so managers are not told. No
 * repeat, or anything still urgent on the hypertension or diabetes screen, and it escalates.
 */
async function settledByRepeat(tx: Prisma.TransactionClient, flagId: string): Promise<boolean> {
  const flag = await tx.patientRiskFlag.findUnique({
    where: { id: flagId },
    select: {
      kind: true,
      encounter: {
        select: {
          hypertensionAssessment: {
            select: { repeatSystolicBp: true, repeatDiastolicBp: true, urgentReviewReasons: true },
          },
          diabetesScreening: { select: { urgentReviewReasons: true } },
        },
      },
    },
  });
  const htn = flag?.encounter?.hypertensionAssessment;
  if (flag?.kind !== 'SCREENING_URGENT' || !htn) return false;
  const repeated = htn.repeatSystolicBp !== null || htn.repeatDiastolicBp !== null;
  const dmUrgent = flag.encounter?.diabetesScreening?.urgentReviewReasons.length ?? 0;
  return repeated && htn.urgentReviewReasons.length === 0 && dmUrgent === 0;
}

/** The oldest a screening flag can be and still be taken: a same-day finding. */
export function screeningFlagOpenSince(now = new Date()): Date {
  return new Date(now.getTime() - DEFAULT_FOLLOW_UP_CONFIG.screeningFlagOpenHours * 3_600_000);
}

/**
 * Where a patient's open flag is: their Urgent tier's while they are Urgent, else a screening
 * flag from today.
 */
function openFlagWhere(
  patientId: string,
  clinicId: string,
  tier: FollowUpTier | null,
): Prisma.PatientRiskFlagWhereInput {
  return tier === 'URGENT'
    ? { patientId, clinicId, kind: 'URGENT' }
    : {
        patientId,
        clinicId,
        kind: 'SCREENING_URGENT',
        raisedAt: { gte: screeningFlagOpenSince() },
      };
}

/*
  A backfill first tiers a whole register, and a merge combines two charts already known: neither
  is news about the patient, so neither tells anyone.
*/
const QUIET_TRIGGERS = new Set<RiskRecomputeTrigger>(['BACKFILL', 'MERGE']);

/**
 * The flag, if any, a recompute raises. Only a change tells anyone: the same tier again, a move
 * down or becoming Stable never does. Very high blood pressure without symptoms is its own event,
 * worded "needs prompt assessment", whether or not the tier moved.
 */
export function flagFor(change: TierChange): TierFlagKind | null {
  if (QUIET_TRIGGERS.has(change.trigger)) return null;
  const { previous, current } = change;
  if (current.tier === 'URGENT') return previous?.tier === 'URGENT' ? null : 'URGENT';
  const severe = 'SEVERE_BP_ASYMPTOMATIC';
  if (current.reasons.includes(severe) && !previous?.reasons.includes(severe)) return 'SEVERE_BP';
  if (change.direction === 'UP' && current.tier === 'HIGH') return 'HIGH';
  return null;
}

type TierFlagKind = Exclude<RiskFlagKind, 'SCREENING_URGENT'>;

const FLAG_EVENT: Record<TierFlagKind, FlagEvent> = {
  URGENT: 'URGENT',
  HIGH: 'HIGH',
  SEVERE_BP: 'SEVERE_BP',
  NOT_IMPROVING: 'NOT_IMPROVING',
};

const reasonText = (reasons: readonly string[]) =>
  reasons
    .map((reason) => FOLLOW_UP_REASON_LABELS[reason as FollowUpReason])
    .filter(Boolean)
    .join('. ');

/** The bell and push wording for each flag. Push fields never name the patient or a reading. */
function flagMessage(
  kind: TierFlagKind,
  patient: { id: string; name: string },
  clinicId: string,
  added: readonly string[],
): Omit<PushMessage, 'riskFlagId'> {
  const url = `/clinics/${clinicId}/patients/${patient.id}?tab=overview`;
  const config = DEFAULT_FOLLOW_UP_CONFIG;
  switch (kind) {
    case 'URGENT':
      return {
        kind: 'HEALTH_ALERT',
        title: 'A patient needs urgent review',
        body: 'Open Nkwapa to see who.',
        url,
        tag: `risk-${patient.id}-HEALTH_ALERT`,
        clinicId,
        // The same finding usually reached the bell from screening a moment ago.
        silentMerge: true,
        inbox: {
          title: `${patient.name} needs urgent review`,
          body: `${reasonText(added) || 'Danger signs recorded'}. Refer today.`,
        },
      };
    case 'SEVERE_BP':
      return {
        kind: 'RISK_TIER_CHANGE',
        title: 'A patient needs prompt assessment',
        body: 'Open Nkwapa to see who.',
        url,
        tag: `risk-${patient.id}-RISK_TIER_CHANGE`,
        clinicId,
        inbox: {
          title: `${patient.name} needs prompt assessment`,
          body: `Very high blood pressure on repeat, without danger symptoms. Assess within ${config.asymptomaticSevereAssessmentDays} days.`,
        },
      };
    case 'HIGH':
      return {
        kind: 'RISK_TIER_CHANGE',
        title: 'A patient moved up to high risk',
        body: 'Open Nkwapa to see who.',
        url,
        tag: `risk-${patient.id}-RISK_TIER_CHANGE`,
        clinicId,
        inbox: {
          title: `${patient.name} moved up to high risk`,
          body: `${reasonText(added) || 'Their risk went up'}. Follow up on the High rhythm.`,
        },
      };
    case 'NOT_IMPROVING':
      return {
        kind: 'RISK_TIER_CHANGE',
        title: 'A high-risk patient needs a clinician review',
        body: 'Open Nkwapa to see who.',
        url,
        tag: `risk-${patient.id}-RISK_TIER_CHANGE`,
        clinicId,
        inbox: {
          title: `${patient.name} is still high risk after ${config.notImprovingMonths} months`,
          body: 'Their risk has not fallen. Refer to a clinician to review the plan.',
        },
      };
  }
}

/**
 * Tells clinic staff about follow-up flags (#337), and records who took an urgent one.
 *
 * Every send runs after the recompute's transaction has committed, as the system, and never
 * throws: a failed notification is logged without patient detail and the save stands. A flag row
 * is written before anyone is told, and its unique key makes a second recompute or sweep a no-op.
 */
@Injectable()
export class FollowUpFlagService implements OnModuleInit {
  private readonly logger = new Logger(FollowUpFlagService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly audit: AuditService,
    @Optional() private readonly scheduler?: MaintenanceScheduler,
  ) {}

  get enabled(): boolean {
    return isApiFeatureEnabled('followUpStratification');
  }

  /**
   * Work as the system, outside any request's RLS transaction: the controller calls in from one,
   * and a tenant context cannot change inside it. The guard has already checked the reader.
   */
  private system<T>(
    context: Parameters<PrismaService['withSystemContext']>[0],
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.detachFromRlsContext(() => this.prisma.withSystemContext(context, work));
  }

  onModuleInit(): void {
    // Screening alerts become flags too, so an urgent finding always has an owner. A hook rather
    // than an import, because this service already depends on PushService.
    this.push.handleScreeningAlertsWith((alert) => this.alertScreening(alert));
    if (!this.scheduler) return;
    // Always registered, so a job queued before the flag was turned off still finds its handler.
    this.scheduler.register({
      jobName: URGENT_ESCALATION_JOB,
      run: (data) => this.escalate((data as { flagId?: string } | undefined)?.flagId),
    });
    // Flag off means no new background work (#333).
    if (this.enabled) {
      this.scheduler.register({
        jobName: FOLLOW_UP_FLAGS_DAILY_JOB,
        // Directors read it at the start of the day; Nkwapa's clinics are all in Ghana.
        cron: { pattern: DEFAULT_FOLLOW_UP_CONFIG.dailyDigestCron, tz: 'Africa/Accra' },
        run: () => this.daily(),
      });
    }
  }

  /** Raise and send the flag a recompute calls for, if any. Never throws. */
  async raise(change: TierChange): Promise<void> {
    if (!this.enabled) return;
    const kind = flagFor(change);
    if (!kind) return;
    try {
      const added = change.current.reasons.filter((r) => !change.previous?.reasons.includes(r));
      const flagId = await this.record(
        change.clinicId,
        change.patientId,
        change.assessmentId,
        kind,
      );
      if (!flagId) return;
      await this.send(flagId, kind, change.clinicId, change.patientId, added, change.actorUserId);
      if (kind === 'URGENT') await this.scheduleEscalation(flagId);
    } catch (error) {
      this.logger.warn(`Follow-up flag failed: ${errorName(error)}`);
    }
  }

  private async scheduleEscalation(flagId: string): Promise<void> {
    await this.scheduler?.delay(
      URGENT_ESCALATION_JOB,
      escalationJobId(flagId),
      { flagId },
      DEFAULT_FOLLOW_UP_CONFIG.urgentEscalationMinutes * 60_000,
    );
  }

  /**
   * After a merge commits: the absorbed chart's flags follow the person, so an open urgent flag and
   * who took it are on the surviving chart. Moved whether or not the flag is on: it is data, not a
   * notification. Never throws; a failure leaves the flags on the merged chart, where they are
   * history.
   */
  moveFlagsAfterMerge(sourcePatientId: string, canonicalPatientId: string): Promise<void> {
    return this.prisma.afterCommit(async () => {
      await this.system({ systemReason: 'Move follow-up flags to the surviving chart' }, (tx) =>
        tx.patientRiskFlag.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: canonicalPatientId },
        }),
      ).catch((error) =>
        this.logger.warn(`Moving flags after a merge failed: ${errorName(error)}`),
      );
    });
  }

  /**
   * An urgent finding at screening, with follow-up stratification on: the Urgent row of the
   * recipient policy, one tile per patient that opens their chart, and a flag someone can take.
   * A patient already Urgent joins their open flag; anyone else gets a screening flag for this
   * visit, with the same escalation. Runs after the save commits, and never throws.
   */
  alertScreening(alert: ScreeningAlert): void {
    void this.prisma
      .afterCommit(
        () =>
          this.sendScreeningAlert(alert).catch((error) =>
            this.logger.warn(`Screening alert failed: ${errorName(error)}`),
          ),
        `screening-alert:${alert.encounterId}:${alert.findings.join('|')}`,
      )
      .catch((error) => this.logger.warn(`Screening alert failed: ${errorName(error)}`));
  }

  /** Exposed for tests; callers use alertScreening(). */
  async sendScreeningAlert(alert: ScreeningAlert): Promise<void> {
    const detail = alert.findings.join('. ').slice(0, 300);
    const found = await this.system(
      { systemReason: 'Route an urgent screening finding' },
      async (tx) => {
        const encounter = await tx.encounter.findUnique({
          where: { id: alert.encounterId },
          select: {
            patient: {
              select: { id: true, firstName: true, lastName: true, currentRiskTier: true },
            },
          },
        });
        const staff = await loadClinicStaff(tx, alert.clinicId);
        const patient = encounter?.patient ?? null;
        if (!patient) return { staff, patient, flagId: null, created: false };
        if (patient.currentRiskTier === 'URGENT') {
          const flag = await tx.patientRiskFlag.findFirst({
            where: openFlagWhere(patient.id, alert.clinicId, 'URGENT'),
            orderBy: { raisedAt: 'desc' },
            select: { id: true },
          });
          return { staff, patient, flagId: flag?.id ?? null, created: false };
        }
        const { count } = await tx.patientRiskFlag.createMany({
          data: [
            {
              clinicId: alert.clinicId,
              patientId: patient.id,
              encounterId: alert.encounterId,
              kind: 'SCREENING_URGENT',
              detail,
            },
          ],
          skipDuplicates: true,
        });
        // A second finding on the same visit joins its flag and says what is now known.
        if (count === 0) {
          await tx.patientRiskFlag.updateMany({
            where: { encounterId: alert.encounterId, kind: 'SCREENING_URGENT' },
            data: { detail },
          });
        }
        const flag = await tx.patientRiskFlag.findFirst({
          where: { encounterId: alert.encounterId, kind: 'SCREENING_URGENT' },
          select: { id: true },
        });
        return { staff, patient, flagId: flag?.id ?? null, created: count === 1 };
      },
    );

    const { patient } = found;
    const name = (patient && formatPersonName(patient, 'short')) || 'A patient';
    this.push.notify(flagRecipients('URGENT', found.staff, alert.actorUserId), {
      kind: 'HEALTH_ALERT',
      title: 'A patient needs urgent review',
      body: 'Open Nkwapa to see who.',
      ...(patient
        ? {
            url: `/clinics/${alert.clinicId}/patients/${patient.id}?tab=overview`,
            tag: `risk-${patient.id}-HEALTH_ALERT`,
          }
        : {
            url: `/clinics/${alert.clinicId}/encounters/${alert.encounterId}`,
            tag: `health-${alert.encounterId}`,
          }),
      clinicId: alert.clinicId,
      riskFlagId: found.flagId,
      inbox: {
        title: `${name} needs urgent review`,
        body: `${detail}. Recorded at screening; see the patient now.`,
      },
    });
    if (found.created && found.flagId) await this.scheduleEscalation(found.flagId);
  }

  /** The flag's id, or null when this assessment already raised this kind. */
  private async record(
    clinicId: string,
    patientId: string,
    assessmentId: string,
    kind: TierFlagKind,
  ): Promise<string | null> {
    try {
      const row = await this.system({ systemReason: 'Record a follow-up flag' }, (tx) =>
        tx.patientRiskFlag.create({
          data: { clinicId, patientId, assessmentId, kind },
          select: { id: true },
        }),
      );
      return row.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return null;
      }
      throw error;
    }
  }

  private async send(
    flagId: string,
    kind: TierFlagKind,
    clinicId: string,
    patientId: string,
    added: readonly string[],
    actorUserId: string | null,
  ): Promise<void> {
    const { staff, patient } = await this.system(
      { systemReason: 'Route a follow-up flag' },
      async (tx) => ({
        staff: await loadClinicStaff(tx, clinicId),
        patient: await tx.patient.findUnique({
          where: { id: patientId },
          select: { firstName: true, lastName: true },
        }),
      }),
    );
    const name = (patient && formatPersonName(patient, 'short')) || 'A patient';
    this.push.notify(flagRecipients(FLAG_EVENT[kind], staff, actorUserId), {
      ...flagMessage(kind, { id: patientId, name }, clinicId, added),
      riskFlagId: flagId,
    });
  }

  /**
   * The open urgent flag for a patient, with who took it: their Urgent tier's while they are
   * Urgent (acknowledging is not resolving; data that moves them out of Urgent is), else today's
   * screening flag. Null when neither is open.
   */
  async openUrgentFlag(clinicId: string, patientId: string): Promise<UrgentFlagView | null> {
    if (!this.enabled) return null;
    return this.system({ systemReason: 'Read the open urgent follow-up flag' }, (tx) =>
      this.findOpenUrgent(tx, clinicId, patientId),
    );
  }

  private async findOpenUrgent(
    tx: Prisma.TransactionClient,
    clinicId: string,
    patientId: string,
  ): Promise<UrgentFlagView | null> {
    const patient = await tx.patient.findFirst({
      where: { id: patientId, primaryClinicId: clinicId },
      select: { currentRiskTier: true },
    });
    if (!patient) return null;
    const flag = await tx.patientRiskFlag.findFirst({
      where: openFlagWhere(patientId, clinicId, patient.currentRiskTier),
      orderBy: { raisedAt: 'desc' },
      select: {
        id: true,
        kind: true,
        detail: true,
        raisedAt: true,
        acknowledgement: {
          select: { userId: true, createdAt: true, user: { select: { displayName: true } } },
        },
      },
    });
    if (!flag) return null;
    const ack = flag.acknowledgement;
    return {
      id: flag.id,
      kind: flag.kind as TakeableKind,
      raisedAt: flag.raisedAt,
      detail: flag.kind === 'SCREENING_URGENT' ? flag.detail : null,
      acknowledgement: ack
        ? { userId: ack.userId, displayName: ack.user.displayName, at: ack.createdAt }
        : null,
    };
  }

  /**
   * "I'm on it": the first person to take an urgent flag owns it. Their colleagues' tiles are
   * marked read and the escalation is cancelled. Taking a flag someone already took returns
   * theirs, so two people pressing at once both see one owner.
   */
  async acknowledge(
    clinicId: string,
    patientId: string,
    userId: string,
  ): Promise<NonNullable<UrgentFlagView['acknowledgement']>> {
    if (!this.enabled) throw new NotFoundException();
    const view = await this.system(
      { systemReason: 'Acknowledge an urgent follow-up flag' },
      async (tx) => {
        const open = await this.findOpenUrgent(tx, clinicId, patientId);
        if (!open) throw new ConflictException('This patient has no open urgent flag.');
        if (open.acknowledgement) return open;
        await tx.riskFlagAcknowledgement.createMany({
          data: [{ clinicId, flagId: open.id, userId }],
          skipDuplicates: true,
        });
        await tx.inboxNotification.updateMany({
          where: { riskFlagId: open.id, readAt: null },
          data: { readAt: new Date() },
        });
        await this.audit.logWrite(
          {
            clinicId,
            actorUserId: userId,
            action: 'FOLLOW_UP_FLAG_ACKNOWLEDGED',
            entityType: 'PatientRiskFlag',
            entityId: open.id,
            beforeJson: null,
            afterJson: JSON.stringify({ kind: open.kind }),
          },
          tx,
        );
        return this.findOpenUrgent(tx, clinicId, patientId);
      },
    );
    await this.scheduler?.cancel(escalationJobId(view!.id));
    return view!.acknowledgement!;
  }

  /**
   * Nobody took an urgent flag in time: tell the clinic's managers and directors, once. Skipped
   * when someone took it, when an Urgent patient is no longer Urgent, and for a screening flag
   * once the patient is Urgent, because the Urgent flag escalates then instead.
   */
  async escalate(flagId: string | undefined): Promise<void> {
    if (!this.enabled || !flagId) return;
    const flag = await this.system(
      { systemReason: 'Escalate an unacknowledged urgent flag' },
      async (tx) => {
        if (await settledByRepeat(tx, flagId)) return null;
        const claimed = await tx.patientRiskFlag.updateMany({
          where: {
            id: flagId,
            escalatedAt: null,
            acknowledgement: { is: null },
            OR: [
              { kind: 'URGENT', patient: { currentRiskTier: 'URGENT' } },
              {
                kind: 'SCREENING_URGENT',
                patient: {
                  OR: [{ currentRiskTier: null }, { currentRiskTier: { not: 'URGENT' } }],
                },
              },
            ],
          },
          data: { escalatedAt: new Date() },
        });
        if (claimed.count === 0) return null;
        return tx.patientRiskFlag.findUnique({
          where: { id: flagId },
          select: {
            clinicId: true,
            patientId: true,
            patient: { select: { firstName: true, lastName: true } },
          },
        });
      },
    );
    if (!flag) return;
    const staff = await this.system({ systemReason: 'Route an urgent flag escalation' }, (tx) =>
      loadClinicStaff(tx, flag.clinicId),
    );
    const name = formatPersonName(flag.patient, 'short') || 'An urgent patient';
    this.push.notify(flagRecipients('UNACKNOWLEDGED', staff), {
      kind: 'HEALTH_ALERT',
      title: 'An urgent patient has not been picked up',
      body: 'Open Nkwapa to see who.',
      url: `/clinics/${flag.clinicId}/patients/${flag.patientId}?tab=overview`,
      tag: `risk-${flag.patientId}-escalation`,
      clinicId: flag.clinicId,
      riskFlagId: flagId,
      inbox: {
        title: `Nobody has picked up ${name}`,
        body: `Urgent for ${DEFAULT_FOLLOW_UP_CONFIG.urgentEscalationMinutes} minutes with nobody on it. Find someone to see them now.`,
      },
    });
  }

  /** Once a day: patients not improving, any escalation whose job was lost, and the digest. */
  async daily(now = new Date()): Promise<void> {
    if (!this.enabled) return;
    for (const step of [
      () => this.flagNotImproving(now),
      () => this.escalateMissed(now),
      () => this.sendDigest(),
    ]) {
      try {
        await step();
      } catch (error) {
        this.logger.warn(`Follow-up flag sweep step failed: ${errorName(error)}`);
      }
    }
  }

  /** High since at least `notImprovingMonths` ago, counting from the start of the High run. */
  async flagNotImproving(now: Date): Promise<number> {
    const since = new Date(now);
    since.setUTCMonth(since.getUTCMonth() - DEFAULT_FOLLOW_UP_CONFIG.notImprovingMonths);
    const due = await this.system(
      { systemReason: 'Find patients still high risk' },
      (tx) => tx.$queryRaw<Array<{ clinicId: string; patientId: string; assessmentId: string }>>`
        SELECT p."primaryClinicId" AS "clinicId", p.id AS "patientId", start.id AS "assessmentId"
        FROM "Patient" p
        CROSS JOIN LATERAL (
          SELECT a.id, a."computedAt"
          FROM "PatientRiskAssessment" a
          WHERE a."patientId" = p.id
            AND a.tier = 'HIGH'
            AND a."computedAt" > COALESCE((
              SELECT max(b."computedAt") FROM "PatientRiskAssessment" b
              WHERE b."patientId" = p.id AND b.tier NOT IN ('HIGH', 'NOT_TIERED')
            ), '-infinity'::timestamp)
          ORDER BY a."computedAt" ASC
          LIMIT 1
        ) start
        WHERE p."currentRiskTier" = 'HIGH'
          AND p."mergedIntoPatientId" IS NULL
          AND start."computedAt" <= ${since}
          AND NOT EXISTS (
            SELECT 1 FROM "PatientRiskFlag" f
            WHERE f."assessmentId" = start.id AND f.kind = 'NOT_IMPROVING'
          )`,
    );
    for (const row of due) {
      const flagId = await this.record(
        row.clinicId,
        row.patientId,
        row.assessmentId,
        'NOT_IMPROVING',
      );
      if (flagId) await this.send(flagId, 'NOT_IMPROVING', row.clinicId, row.patientId, [], null);
    }
    return due.length;
  }

  /** A backstop for an escalation job lost while Redis was down. Only today's flags. */
  private async escalateMissed(now: Date): Promise<void> {
    const minutes = DEFAULT_FOLLOW_UP_CONFIG.urgentEscalationMinutes;
    const flags = await this.system({ systemReason: 'Find unacknowledged urgent flags' }, (tx) =>
      tx.patientRiskFlag.findMany({
        where: {
          kind: { in: [...TAKEABLE_KINDS] },
          escalatedAt: null,
          acknowledgement: { is: null },
          raisedAt: {
            gte: new Date(now.getTime() - DAY_MS),
            lte: new Date(now.getTime() - minutes * 60_000),
          },
        },
        select: { id: true },
      }),
    );
    for (const { id } of flags) await this.escalate(id);
  }

  /** Directors get counts, never a tile per patient. Clinics with nobody Urgent or High are quiet. */
  async sendDigest(): Promise<void> {
    const rows = await this.system(
      { systemReason: 'Count follow-up flags for the directors' },
      (tx) => tx.$queryRaw<
        Array<{
          clinicId: string;
          clinicName: string;
          urgent: number;
          unclaimed: number;
          high: number;
        }>
      >`
        SELECT p."primaryClinicId" AS "clinicId", c.name AS "clinicName",
          count(*) FILTER (WHERE p."currentRiskTier" = 'URGENT')::int AS urgent,
          count(*) FILTER (WHERE p."currentRiskTier" = 'HIGH')::int AS high,
          count(*) FILTER (
            WHERE p."currentRiskTier" = 'URGENT' AND NOT EXISTS (
              SELECT 1 FROM "RiskFlagAcknowledgement" a
              WHERE a."flagId" = (
                SELECT f.id FROM "PatientRiskFlag" f
                WHERE f."patientId" = p.id AND f.kind = 'URGENT'
                ORDER BY f."raisedAt" DESC LIMIT 1
              )
            )
          )::int AS unclaimed
        FROM "Patient" p
        JOIN "Clinic" c ON c.id = p."primaryClinicId"
        WHERE p."currentRiskTier" IN ('URGENT', 'HIGH') AND p."mergedIntoPatientId" IS NULL
        GROUP BY p."primaryClinicId", c.name`,
    );
    for (const row of rows) {
      const staff = await this.system({ systemReason: 'Route the follow-up digest' }, (tx) =>
        loadClinicStaff(tx, row.clinicId),
      );
      this.push.notify(flagRecipients('DIGEST', staff), {
        kind: 'FOLLOW_UP_DUE',
        title: "Today's follow-up counts are ready",
        body: 'Open Nkwapa to see them.',
        url: row.urgent > 0 ? '/patients?riskTier=URGENT' : '/patients?riskTier=HIGH',
        tag: `follow-up-digest-${row.clinicId}`,
        // Today's counts replace yesterday's unread ones rather than stacking into "3 updates".
        silentMerge: true,
        clinicId: row.clinicId,
        inbox: digestText(row),
      });
    }
  }
}

/** "Hohoe: 3 urgent, 12 high risk", and whether any urgent patient has nobody on it. */
export function digestText(row: {
  clinicName: string;
  urgent: number;
  unclaimed: number;
  high: number;
}): { title: string; body: string } {
  const parts = [
    row.urgent ? `${row.urgent} urgent` : null,
    row.high ? `${row.high} high risk` : null,
  ].filter(Boolean);
  const body =
    row.unclaimed > 0
      ? `${row.unclaimed} urgent ${row.unclaimed === 1 ? 'patient has' : 'patients have'} nobody on it yet.`
      : row.urgent > 0
        ? 'Every urgent patient has someone on it.'
        : 'Nobody is urgent today.';
  return { title: `${row.clinicName}: ${parts.join(', ')}`, body };
}

function escalationJobId(flagId: string): string {
  return `urgent-escalation-${flagId}`;
}

// The error's class only: a Prisma message can quote the row it failed on.
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown error';
}
