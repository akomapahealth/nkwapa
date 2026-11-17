import type {
  FollowUpContactMode,
  FollowUpContactStatus,
  FollowUpOutcome,
  FollowUpTier,
} from '@prisma/client';
import {
  DEFAULT_FOLLOW_UP_CONFIG,
  followUpControl,
  type BpLimit,
  type CardiometabolicConditionValue,
  type FollowUpBpReading,
  type FollowUpConfig,
  startOfDayInTimeZone,
  todayInTimeZone,
} from '@nkwapa/db';
import { ageOn } from './follow-up-input';

/**
 * The monthly follow-up indicators (#339), HEARTS360 definitions. Pure: the service loads rows,
 * this counts them, so the boundary dataset in the spec needs no database.
 *
 * Who is on the register, and their treatment, comes from the stored assessment in force at
 * each month-end. Control is re-judged at that month-end from the readings up to it, with the
 * current config: an assessment row is written only when the answer changes, so its snapshot can
 * be missing later readings, and the definitions are about time passing since a reading.
 *
 * A month is a calendar month in the clinic's own zone (the organization's for an organization
 * report): it starts at local midnight on the 1st.
 */

export const TREND_MONTHS = 6;

export const FOLLOW_UP_TIER_CODES = [
  'URGENT',
  'HIGH',
  'MODERATE',
  'LOW_MODERATE',
  'STABLE',
  'LOW',
  'NOT_TIERED',
] as const satisfies readonly FollowUpTier[];

export const FOLLOW_UP_OUTCOME_CODES = [
  'ATTEMPTED',
  'REACHED',
  'DECLINED',
  'AGREED_TO_RETURN',
  'RETURNED',
  'REFERRED',
  'REFERRAL_CONFIRMED',
] as const satisfies readonly FollowUpOutcome[];

const IN_PERSON_MODES: readonly FollowUpContactMode[] = ['IN_PERSON', 'HOME_VISIT'];

/** Patient sets a figure can open (#339), for roles allowed to see names. */
export const FOLLOW_UP_METRIC_FIGURES = [
  'register',
  'underCare',
  'controlled',
  'uncontrolled',
  'notAssessed',
  'lost3m',
  'lost12m',
  'untreated',
  'startedTreatment',
  ...FOLLOW_UP_TIER_CODES.map((tier) => `tier:${tier}` as const),
  // The patients behind the month's contact counts.
  'contacts:due',
  'contacts:completed',
  'contacts:missed',
  'contacts:attempts',
] as const;
export type FollowUpMetricFigure = (typeof FOLLOW_UP_METRIC_FIGURES)[number];

/* ------------------------------------------------------------------------------- Input */

export interface MetricsAssessment {
  computedAt: Date;
  tier: FollowUpTier;
  hypertensionDiagnosed: boolean;
  onHypertensionTreatment: boolean;
  conditions: readonly CardiometabolicConditionValue[];
  timeZone: string | null;
}

export interface MetricsPatient {
  id: string;
  dob: Date | null;
  /** Oldest first. */
  assessments: MetricsAssessment[];
  readings: FollowUpBpReading[];
  /** When a contact was cancelled with DECEASED. */
  deceasedReportedAt: Date[];
  /** Every visit, for "seen again after the death was recorded". */
  visitAt: Date[];
}

export interface MetricsContact {
  patientId: string;
  mode: FollowUpContactMode;
  status: FollowUpContactStatus;
  dueOn: Date;
  completedAt: Date | null;
  missedAt: Date | null;
}

export interface MetricsAttempt {
  patientId: string;
  mode: FollowUpContactMode;
  outcome: FollowUpOutcome;
  at: Date;
}

export interface MetricsUrgentFlag {
  raisedAt: Date;
  acknowledgedAt: Date | null;
  /** The first reached attempt on an urgent confirmation contact after the flag. */
  confirmationCallAt: Date | null;
}

export interface FollowUpMetricsInput {
  /** `YYYY-MM`. */
  month: string;
  now: Date;
  /** The clinic's zone; months start at local midnight. Defaults to the house zone. */
  timeZone?: string | null;
  config?: FollowUpConfig;
  patients: MetricsPatient[];
  contacts: MetricsContact[];
  attempts: MetricsAttempt[];
  urgentFlags: MetricsUrgentFlag[];
}

/* ------------------------------------------------------------------------------ Output */

/** A percentage is never shown without both of these. */
export interface Share {
  count: number;
  of: number;
}

export interface ByMode {
  inPerson: number;
  tele: number;
  total: number;
}

export interface Timing {
  /** Raised in the month and either met or past the limit; still-open ones are not judged yet. */
  judged: number;
  withinLimit: number;
  /** Median of the times that happened, in minutes; null when none did. */
  medianMinutes: number | null;
  limitMinutes: number;
}

export interface FollowUpMetricsTrendPoint {
  month: string;
  register: number;
  underCare: number;
  controlled: number;
  missed: number;
}

export interface FollowUpMetricsReport {
  month: string;
  /** The month-end the figures are taken at, or now for the current month. */
  asOf: string;
  /** True for the current month: figures are "so far", not final. */
  inProgress: boolean;
  /** The zone the month is counted in. */
  timeZone: string | null;
  settings: {
    bpTargetUnder65: BpLimit;
    bpTarget: BpLimit;
    bpTargetWithDisease: BpLimit;
    selfReportedCountsTowardControl: boolean;
    missedContactGraceDays: number;
    controlWindowMonths: number;
    underCareWindowMonths: number;
  };
  /** Hypertension register, deceased excluded: the denominator of every control share. */
  register: number;
  underCare: Share;
  lost12m: Share;
  controlled: Share;
  uncontrolled: Share;
  /** A recent reading the target cannot judge (age unknown and the targets differ). */
  notAssessed: Share;
  lost3m: Share;
  untreated: Share;
  startedTreatment: number;
  tiers: Record<FollowUpTier, number>;
  contacts: {
    due: ByMode;
    completed: ByMode;
    missed: ByMode;
    attempts: ByMode;
    /** Attempts over completed contacts in the month. */
    attemptsPerCompleted: Share;
  };
  outcomes: Record<FollowUpOutcome, number>;
  urgent: { flags: number; acknowledged: Timing; confirmationCall: Timing };
  trend: FollowUpMetricsTrendPoint[];
}

/* ----------------------------------------------------------------------------- Helpers */

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function parseMonth(month: string): { year: number; month: number } | null {
  const match = MONTH.exec(month);
  return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
}

/** The month `at` falls in, in `timeZone`. */
export function monthKey(at: Date, timeZone?: string | null): string {
  return todayInTimeZone(timeZone, at).slice(0, 7);
}

export function shiftMonth(month: string, by: number): string {
  const { year, month: m } = parseMonth(month)!;
  return new Date(Date.UTC(year, m - 1 + by, 1)).toISOString().slice(0, 7);
}

/** [start, end) of a month in `timeZone`, end capped at now. */
export function monthRange(
  month: string,
  now: Date,
  timeZone?: string | null,
): { start: Date; end: Date; cut: Date } {
  const start = startOfDayInTimeZone(`${month}-01`, timeZone);
  const next = startOfDayInTimeZone(`${shiftMonth(month, 1)}-01`, timeZone);
  const end = next < now ? next : now;
  // Figures are taken at the last instant of the month: inclusive comparisons use `cut`.
  return { start, end, cut: new Date(end.getTime() - 1) };
}

const inRange = (date: Date | null, range: { start: Date; end: Date }) =>
  !!date && date >= range.start && date < range.end;

const share = (count: number, of: number): Share => ({ count, of });

function byMode<T extends { mode: FollowUpContactMode }>(rows: readonly T[]): ByMode {
  const inPerson = rows.filter((row) => IN_PERSON_MODES.includes(row.mode)).length;
  return { inPerson, tele: rows.length - inPerson, total: rows.length };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function timing(
  flags: readonly MetricsUrgentFlag[],
  at: (flag: MetricsUrgentFlag) => Date | null,
  limitMinutes: number,
  now: Date,
): Timing {
  const minutes: number[] = [];
  let judged = 0;
  let withinLimit = 0;
  for (const flag of flags) {
    const done = at(flag);
    const taken = done ? (done.getTime() - flag.raisedAt.getTime()) / 60_000 : null;
    if (taken !== null) minutes.push(taken);
    if (taken !== null && taken <= limitMinutes) {
      judged += 1;
      withinLimit += 1;
    } else if (now.getTime() - flag.raisedAt.getTime() > limitMinutes * 60_000) {
      judged += 1;
    }
  }
  const mid = median(minutes);
  return {
    judged,
    withinLimit,
    medianMinutes: mid === null ? null : Math.round(mid),
    limitMinutes,
  };
}

function latestBefore(assessments: readonly MetricsAssessment[], cut: Date) {
  let found: MetricsAssessment | null = null;
  for (const assessment of assessments) {
    if (assessment.computedAt <= cut) found = assessment;
  }
  return found;
}

/**
 * Deceased on `cut`: the latest DECEASED cancellation is on or before it and no visit came after.
 * The rule #338 uses to stop contacts, so a visit after a mistaken report undoes it (#339).
 */
export function deceasedOn(patient: MetricsPatient, cut: Date): boolean {
  const reported = patient.deceasedReportedAt.filter((at) => at <= cut);
  if (reported.length === 0) return false;
  const latest = Math.max(...reported.map((at) => at.getTime()));
  return !patient.visitAt.some((at) => at.getTime() > latest && at <= cut);
}

/* -------------------------------------------------------------------------- Per month */

type PatientSets = Record<FollowUpMetricFigure, string[]>;

function emptySets(): PatientSets {
  return Object.fromEntries(FOLLOW_UP_METRIC_FIGURES.map((figure) => [figure, []])) as never;
}

/** Which patients each figure counts at one month-end. */
export function patientSetsAt(
  patients: readonly MetricsPatient[],
  cut: Date,
  previousCut: Date,
  config: FollowUpConfig = DEFAULT_FOLLOW_UP_CONFIG,
): PatientSets {
  const sets = emptySets();
  for (const patient of patients) {
    const assessment = latestBefore(patient.assessments, cut);
    if (!assessment || deceasedOn(patient, cut)) continue;
    sets[`tier:${assessment.tier}`].push(patient.id);
    if (!assessment.hypertensionDiagnosed) continue;

    sets.register.push(patient.id);
    const control = followUpControl(
      {
        ageYears: patient.dob ? ageOn(patient.dob, cut) : null,
        conditions: assessment.conditions,
        hypertensionDiagnosed: true,
        onTreatment: { hypertension: assessment.onHypertensionTreatment },
        readings: patient.readings.filter((reading) => reading.at <= cut),
        timeZone: assessment.timeZone,
        today: cut,
      },
      config,
    );
    sets[control.underCare ? 'underCare' : 'lost12m'].push(patient.id);
    const status = {
      CONTROLLED: 'controlled',
      UNCONTROLLED: 'uncontrolled',
      NOT_ASSESSED: 'notAssessed',
      NO_RECENT_READING: 'lost3m',
    } as const;
    sets[status[control.status]].push(patient.id);

    if (!assessment.onHypertensionTreatment) {
      sets.untreated.push(patient.id);
    } else {
      const before = latestBefore(patient.assessments, previousCut);
      if (before?.hypertensionDiagnosed && !before.onHypertensionTreatment) {
        sets.startedTreatment.push(patient.id);
      }
    }
  }
  return sets;
}

/* ---------------------------------------------------------------------------- Contacts */

/** The month's contacts and attempts behind each contact figure. */
export function contactRowsIn(
  contacts: readonly MetricsContact[],
  attempts: readonly MetricsAttempt[],
  month: string,
  range: { start: Date; end: Date },
) {
  // A due date is a calendar date, not an instant: it belongs to the month it names.
  const due = contacts.filter(
    (contact) =>
      contact.status !== 'CANCELLED' && contact.dueOn.toISOString().slice(0, 7) === month,
  );
  const completed = contacts.filter(
    (contact) => contact.status === 'DONE' && inRange(contact.completedAt, range),
  );
  // A contact done late still missed its window: missedAt stays set.
  const missed = contacts.filter((contact) => inRange(contact.missedAt, range));
  const all = attempts.filter((attempt) => inRange(attempt.at, range));
  // Attempts are only ever ATTEMPTED outcomes: never counted as completed follow-ups.
  const tried = all.filter((attempt) => attempt.outcome === 'ATTEMPTED');
  return { due, completed, missed, attempts: tried, allAttempts: all };
}

/** Each contact figure's patients, once each. */
export function contactPatientSets(rows: ReturnType<typeof contactRowsIn>) {
  const ids = (list: readonly { patientId: string }[]) => [
    ...new Set(list.map((row) => row.patientId)),
  ];
  return {
    'contacts:due': ids(rows.due),
    'contacts:completed': ids(rows.completed),
    'contacts:missed': ids(rows.missed),
    'contacts:attempts': ids(rows.attempts),
  };
}

/* ------------------------------------------------------------------------------ Report */

export function computeFollowUpMetrics(input: FollowUpMetricsInput): FollowUpMetricsReport {
  const config = input.config ?? DEFAULT_FOLLOW_UP_CONFIG;
  const zone = input.timeZone;
  const range = monthRange(input.month, input.now, zone);
  const previous = monthRange(shiftMonth(input.month, -1), input.now, zone);
  const sets = patientSetsAt(input.patients, range.cut, previous.cut, config);
  const register = sets.register.length;
  const ofRegister = (figure: FollowUpMetricFigure) => share(sets[figure].length, register);

  const rows = contactRowsIn(input.contacts, input.attempts, input.month, range);
  const { due, completed, attempts } = rows;
  const monthAttempts = rows.allAttempts;
  const missedIn = (r: { start: Date; end: Date }) =>
    input.contacts.filter((contact) => inRange(contact.missedAt, r));
  const flags = input.urgentFlags.filter((flag) => inRange(flag.raisedAt, range));

  const trend: FollowUpMetricsTrendPoint[] = [];
  for (let back = TREND_MONTHS - 1; back >= 0; back -= 1) {
    const month = shiftMonth(input.month, -back);
    const r = monthRange(month, input.now, zone);
    const s =
      back === 0
        ? sets
        : patientSetsAt(
            input.patients,
            r.cut,
            monthRange(shiftMonth(month, -1), input.now, zone).cut,
            config,
          );
    trend.push({
      month,
      register: s.register.length,
      underCare: s.underCare.length,
      controlled: s.controlled.length,
      missed: missedIn(r).length,
    });
  }

  return {
    month: input.month,
    asOf: range.end.toISOString(),
    inProgress: range.end.getTime() === input.now.getTime(),
    timeZone: zone ?? null,
    settings: {
      bpTargetUnder65: config.bpTargetUnder65,
      bpTarget: config.bpTarget,
      bpTargetWithDisease: config.bpTargetWithDisease,
      selfReportedCountsTowardControl: config.selfReportedCountsTowardControl,
      missedContactGraceDays: config.missedContactGraceDays,
      controlWindowMonths: config.controlWindowMonths,
      underCareWindowMonths: config.underCareWindowMonths,
    },
    register,
    underCare: ofRegister('underCare'),
    lost12m: ofRegister('lost12m'),
    controlled: ofRegister('controlled'),
    uncontrolled: ofRegister('uncontrolled'),
    notAssessed: ofRegister('notAssessed'),
    lost3m: ofRegister('lost3m'),
    untreated: ofRegister('untreated'),
    startedTreatment: sets.startedTreatment.length,
    tiers: Object.fromEntries(
      FOLLOW_UP_TIER_CODES.map((tier) => [tier, sets[`tier:${tier}`].length]),
    ) as Record<FollowUpTier, number>,
    contacts: {
      due: byMode(due),
      completed: byMode(completed),
      missed: byMode(rows.missed),
      attempts: byMode(attempts),
      attemptsPerCompleted: share(attempts.length, completed.length),
    },
    outcomes: Object.fromEntries(
      FOLLOW_UP_OUTCOME_CODES.map((code) => [
        code,
        monthAttempts.filter((attempt) => attempt.outcome === code).length,
      ]),
    ) as Record<FollowUpOutcome, number>,
    urgent: {
      flags: flags.length,
      acknowledged: timing(
        flags,
        (flag) => flag.acknowledgedAt,
        config.urgentEscalationMinutes,
        input.now,
      ),
      confirmationCall: timing(
        flags,
        (flag) => flag.confirmationCallAt,
        config.urgentCallWithinHours * 60,
        input.now,
      ),
    },
    trend,
  };
}
