/**
 * PHQ-2 depression screening and the two-item diabetes-distress screen.
 *
 * Both are scored here rather than in the form, because a score that decides whether a supervising
 * clinician is alerted must not depend on which surface computed it. The API recomputes on write
 * and ignores whatever the client sent for the derived columns; this module is what both of them
 * run.
 */

export const PHQ2_RESPONSES = [
  'NOT_AT_ALL',
  'SEVERAL_DAYS',
  'MORE_THAN_HALF_THE_DAYS',
  'NEARLY_EVERY_DAY',
  'NOT_ASSESSED',
] as const;

export type Phq2Response = (typeof PHQ2_RESPONSES)[number];

export const PHQ2_RESPONSE_LABELS: Record<Phq2Response, string> = {
  NOT_AT_ALL: 'Not at all',
  SEVERAL_DAYS: 'Several days',
  MORE_THAN_HALF_THE_DAYS: 'More than half the days',
  NEARLY_EVERY_DAY: 'Nearly every day',
  NOT_ASSESSED: 'Not asked',
};

/**
 * The instrument's own scoring. `NOT_ASSESSED` scores nothing, which is why it is `null` here
 * rather than 0: an unasked question and an answer of "not at all" are different facts, and
 * scoring the first as the second would silently report a completed screen.
 */
export const PHQ2_RESPONSE_SCORES: Record<Phq2Response, number | null> = {
  NOT_AT_ALL: 0,
  SEVERAL_DAYS: 1,
  MORE_THAN_HALF_THE_DAYS: 2,
  NEARLY_EVERY_DAY: 3,
  NOT_ASSESSED: null,
};

export const PHQ2_MIN_SCORE = 0;
export const PHQ2_MAX_SCORE = 6;

/** The instrument's published cut-off for a positive screen. */
export const PHQ2_POSITIVE_THRESHOLD = 3;

/**
 * Total the two items, or return null if the screen is incomplete.
 *
 * A partial total is worse than no total. Answering only the first item and scoring it as 3 of 6
 * reads as a negative screen, when the unasked item could have carried it over the threshold.
 */
export function phq2Total(
  interest: Phq2Response | null | undefined,
  mood: Phq2Response | null | undefined,
): number | null {
  const a = scoreOf(interest);
  const b = scoreOf(mood);
  if (a === null || b === null) return null;
  return a + b;
}

/** A screen that was never completed is not a negative screen. */
export function isPhq2Positive(total: number | null | undefined): boolean {
  return typeof total === 'number' && total >= PHQ2_POSITIVE_THRESHOLD;
}

function scoreOf(response: Phq2Response | null | undefined): number | null {
  if (!response) return null;
  const score = PHQ2_RESPONSE_SCORES[response];
  return score ?? null;
}

export const DIABETES_DISTRESS_RESPONSES = [
  'NOT_A_PROBLEM',
  'SLIGHT_PROBLEM',
  'MODERATE_PROBLEM',
  'SERIOUS_PROBLEM',
  'VERY_SERIOUS_PROBLEM',
  'NOT_ASSESSED',
] as const;

export type DiabetesDistressResponse = (typeof DIABETES_DISTRESS_RESPONSES)[number];

export const DIABETES_DISTRESS_RESPONSE_LABELS: Record<DiabetesDistressResponse, string> = {
  NOT_A_PROBLEM: 'Not a problem',
  SLIGHT_PROBLEM: 'A slight problem',
  MODERATE_PROBLEM: 'A moderate problem',
  SERIOUS_PROBLEM: 'A serious problem',
  VERY_SERIOUS_PROBLEM: 'A very serious problem',
  NOT_ASSESSED: 'Not asked',
};

/**
 * Severity rank, used only to compare against the cut-off.
 *
 * Ordering the answers explicitly rather than relying on their position in the array means
 * inserting a response later cannot quietly move the threshold.
 */
const DISTRESS_SEVERITY: Record<DiabetesDistressResponse, number | null> = {
  NOT_A_PROBLEM: 0,
  SLIGHT_PROBLEM: 1,
  MODERATE_PROBLEM: 2,
  SERIOUS_PROBLEM: 3,
  VERY_SERIOUS_PROBLEM: 4,
  NOT_ASSESSED: null,
};

/** "Moderate or greater", per the clinical specification. */
export const DIABETES_DISTRESS_POSITIVE_SEVERITY = DISTRESS_SEVERITY.MODERATE_PROBLEM as number;

/**
 * Positive when *either* item is moderate or worse.
 *
 * Unlike PHQ-2 this does not need both answers: one moderate response is already positive, and
 * waiting for the second would delay a prompt the specification wants raised. An unanswered item
 * simply cannot contribute.
 */
export function isDiabetesDistressPositive(
  overwhelmed: DiabetesDistressResponse | null | undefined,
  failing: DiabetesDistressResponse | null | undefined,
): boolean {
  return isDistressing(overwhelmed) || isDistressing(failing);
}

function isDistressing(response: DiabetesDistressResponse | null | undefined): boolean {
  if (!response) return false;
  const severity = DISTRESS_SEVERITY[response];
  return severity !== null && severity >= DIABETES_DISTRESS_POSITIVE_SEVERITY;
}
