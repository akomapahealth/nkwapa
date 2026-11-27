/**
 * Red flags carried with a patient along the station line (#415).
 *
 * A station's live notice ("Refer today", "Repeat it now") used to stay on that station's form.
 * These flags travel with the check-in instead, so the next station and review see them without
 * relying on a hand-off note. No thresholds live here: every rule is one of the shared functions,
 * so the line, the forms and the follow-up engine cannot disagree about a reading.
 */
import { isSeverelyElevated, shouldPromptRepeat } from './bp-classification';
import {
  evaluateGlucoseSuspicion,
  type DiabetesGlucoseContext,
  DIABETES_GLUCOSE_CONTEXTS,
} from './diabetes-thresholds';
import type { DiabetesUrgentSymptomValue } from './diabetes-interview';
import { checkDangerSigns, type FollowUpReason } from './follow-up-stratification';
import type { HypertensionSymptomValue } from './hypertension-interview';

export type LineFlagKind = 'REFER_TODAY' | 'REPEAT_AT_REVIEW';
export type LineFlagSource = 'BP' | 'GLUCOSE';

/** A flag as raised by one set of readings, before it is pinned to a station. */
export interface RaisedLineFlag {
  kind: LineFlagKind;
  source: LineFlagSource;
  /** The reading that raised it, as numbers, so each screen shows it in the clinic's units. */
  systolic?: number;
  diastolic?: number;
  glucoseMgDl?: number;
}

/** A flag on the check-in: the reading, where and when it was taken. */
export interface LineFlag extends RaisedLineFlag {
  stationName: string;
  /** ISO time the station handed the patient on. */
  at: string;
}

export interface LineReadings {
  systolic?: number | null;
  diastolic?: number | null;
  glucoseMgDl?: number | null;
  glucoseType?: string | null;
  hypertensionSymptoms?: readonly HypertensionSymptomValue[] | null;
  diabetesUrgentSymptoms?: readonly DiabetesUrgentSymptomValue[] | null;
}

const BP_DANGER: readonly FollowUpReason[] = ['DANGER_BP_WITH_SYMPTOMS'];

const glucoseContext = (value: string | null | undefined): DiabetesGlucoseContext =>
  (DIABETES_GLUCOSE_CONTEXTS as readonly string[]).includes(value ?? '')
    ? (value as DiabetesGlucoseContext)
    : 'UNKNOWN';

/** The flags one encounter's readings raise now: at most one per source, the worse one. */
export function lineFlagsFor(readings: LineReadings, now: Date = new Date()): RaisedLineFlag[] {
  const { systolic, diastolic, glucoseMgDl } = readings;
  const hasBp = systolic != null && diastolic != null;
  const context = glucoseContext(readings.glucoseType);
  const { reasons } = checkDangerSigns({
    readings: hasBp ? [{ systolic, diastolic, at: now, measured: true }] : [],
    glucose: glucoseMgDl != null ? { mgDl: glucoseMgDl, context, at: now } : null,
    symptoms: {
      hypertension: readings.hypertensionSymptoms ?? null,
      diabetes: readings.diabetesUrgentSymptoms ?? null,
    },
    today: now,
  });

  const flags: RaisedLineFlag[] = [];
  if (hasBp) {
    const kind: LineFlagKind | null =
      isSeverelyElevated(systolic, diastolic) || reasons.some((r) => BP_DANGER.includes(r))
        ? 'REFER_TODAY'
        : shouldPromptRepeat(systolic, diastolic)
          ? 'REPEAT_AT_REVIEW'
          : null;
    if (kind) flags.push({ kind, source: 'BP', systolic, diastolic });
  }
  if (glucoseMgDl != null) {
    // Every danger sign that is not about BP is about glucose.
    const kind: LineFlagKind | null = reasons.some((r) => !BP_DANGER.includes(r))
      ? 'REFER_TODAY'
      : evaluateGlucoseSuspicion(glucoseMgDl, context) === 'SUSPECTED'
        ? 'REPEAT_AT_REVIEW'
        : null;
    if (kind) flags.push({ kind, source: 'GLUCOSE', glucoseMgDl });
  }
  return flags;
}

const SEVERITY: Record<LineFlagKind, number> = { REPEAT_AT_REVIEW: 1, REFER_TODAY: 2 };

/**
 * The check-in's flags after a station adds what it raised. A flag is never taken back while the
 * patient is on the line: a normal repeat at review leaves the original reading in view. Per
 * source, a worse flag replaces a milder one; an equal one keeps the first reading.
 */
export function mergeLineFlags(existing: readonly LineFlag[], raised: readonly LineFlag[]) {
  const bySource = new Map(existing.map((flag) => [flag.source, flag]));
  for (const flag of raised) {
    const held = bySource.get(flag.source);
    if (!held || SEVERITY[flag.kind] > SEVERITY[held.kind]) bySource.set(flag.source, flag);
  }
  return [...bySource.values()];
}

/** The worst flag on a check-in, or null without any. */
export function worstLineFlag(flags: readonly LineFlag[] | null | undefined): LineFlagKind | null {
  let worst: LineFlagKind | null = null;
  for (const flag of flags ?? []) {
    if (!worst || SEVERITY[flag.kind] > SEVERITY[worst]) worst = flag.kind;
  }
  return worst;
}

/** Whether a stored value is a list of line flags, for reading the JSON column safely. */
export function parseLineFlags(value: unknown): LineFlag[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (flag): flag is LineFlag =>
      typeof flag === 'object' &&
      flag !== null &&
      (flag.kind === 'REFER_TODAY' || flag.kind === 'REPEAT_AT_REVIEW') &&
      (flag.source === 'BP' || flag.source === 'GLUCOSE') &&
      typeof flag.stationName === 'string' &&
      typeof flag.at === 'string',
  );
}
