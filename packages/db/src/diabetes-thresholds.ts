/**
 * Glucose interpretation for the diabetes interview.
 *
 * The fasting and random cut-offs are the ones already written down in
 * `docs/specs/HTN_DIABETES_WORKFLOWS_V1.md`, and `docs/specs/09_DIABETES_SCREENING.md` states the
 * rule that governs everything here: an `UNKNOWN` measurement context is never classified. A
 * glucose value without a timing is not a weaker finding, it is a different kind of thing, and
 * guessing its context is how a random 150 becomes a fasting 150.
 */

export const DIABETES_GLUCOSE_CONTEXTS = [
  'FASTING',
  'BEFORE_MEAL',
  'POST_PRANDIAL_2H',
  'RANDOM',
  'UNKNOWN',
] as const;

export type DiabetesGlucoseContext = (typeof DIABETES_GLUCOSE_CONTEXTS)[number];

export const DIABETES_GLUCOSE_CONTEXT_LABELS: Record<DiabetesGlucoseContext, string> = {
  FASTING: 'Fasting',
  BEFORE_MEAL: 'Before meal',
  POST_PRANDIAL_2H: 'Within 2 hours after meal',
  RANDOM: 'Random',
  UNKNOWN: 'Unknown',
};

/** Approved: stated in HTN_DIABETES_WORKFLOWS_V1 and enforced by the existing dashboard flags. */
export const DM_FASTING_SUSPICION_MG_DL = 126;
export const DM_RANDOM_SUSPICION_MG_DL = 200;

/**
 * PROVISIONAL -- awaiting sign-off from Akomapa's medical director.
 *
 * The interview adds "before meal" and "within 2 hours after a meal" as measurement contexts, and
 * no threshold is written down for either. These map each new context onto the nearest approved
 * one: a pre-meal reading is physiologically closest to fasting, a two-hour post-prandial reading
 * closest to random.
 *
 * They are separate named constants rather than a reuse of the approved two so that ratifying or
 * correcting them is a visible edit. Collapsing them into the approved constants would make a
 * provisional number indistinguishable from an approved one.
 */
export const DM_BEFORE_MEAL_SUSPICION_MG_DL = DM_FASTING_SUSPICION_MG_DL;
export const DM_POST_PRANDIAL_2H_SUSPICION_MG_DL = DM_RANDOM_SUSPICION_MG_DL;

/**
 * PROVISIONAL -- awaiting the same sign-off.
 *
 * The interview asks about hypoglycemia symptoms and lists "Low glucose" as a presenting concern,
 * but states no value. 70 mg/dL is the conventional cut-off.
 */
export const DM_HYPOGLYCEMIA_MG_DL = 70;

export const DIABETES_SUSPICION_RESULTS = ['SUSPECTED', 'NOT_SUSPECTED', 'NOT_ASSESSED'] as const;

export type DiabetesSuspicionResult = (typeof DIABETES_SUSPICION_RESULTS)[number];

/**
 * The suspicion threshold for a context, or null where no rule applies.
 *
 * `UNKNOWN` returns null deliberately, and callers must treat that as "do not classify" rather
 * than falling back to another context's number.
 */
export function suspicionThresholdFor(context: DiabetesGlucoseContext): number | null {
  switch (context) {
    case 'FASTING':
      return DM_FASTING_SUSPICION_MG_DL;
    case 'BEFORE_MEAL':
      return DM_BEFORE_MEAL_SUSPICION_MG_DL;
    case 'POST_PRANDIAL_2H':
      return DM_POST_PRANDIAL_2H_SUSPICION_MG_DL;
    case 'RANDOM':
      return DM_RANDOM_SUSPICION_MG_DL;
    case 'UNKNOWN':
      return null;
  }
}

/**
 * Evaluate a single reading.
 *
 * Returns `NOT_ASSESSED` -- not `NOT_SUSPECTED` -- whenever the reading cannot be judged, whether
 * because no value was recorded or because its context is unknown. The distinction matters: a
 * dashboard that renders `NOT_SUSPECTED` is asserting that someone looked and found nothing.
 */
export function evaluateGlucoseSuspicion(
  glucoseMgDl: number | null | undefined,
  context: DiabetesGlucoseContext | null | undefined,
): DiabetesSuspicionResult {
  if (typeof glucoseMgDl !== 'number' || !Number.isFinite(glucoseMgDl)) return 'NOT_ASSESSED';
  if (!context) return 'NOT_ASSESSED';

  const threshold = suspicionThresholdFor(context);
  if (threshold === null) return 'NOT_ASSESSED';

  return glucoseMgDl >= threshold ? 'SUSPECTED' : 'NOT_SUSPECTED';
}

/** Whether a reading is low enough to be worth a clinician's attention now. */
export function isHypoglycemic(glucoseMgDl: number | null | undefined): boolean {
  return (
    typeof glucoseMgDl === 'number' &&
    Number.isFinite(glucoseMgDl) &&
    glucoseMgDl <= DM_HYPOGLYCEMIA_MG_DL
  );
}
