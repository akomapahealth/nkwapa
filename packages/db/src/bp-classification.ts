/**
 * Blood-pressure classification, and the prompts derived from a reading.
 *
 * The bands are the ones already written down in `docs/specs/HTN_DIABETES_WORKFLOWS_V1.md`, which
 * marks them "v1 simplified". They are a *staging* scheme. They are deliberately not an escalation
 * protocol, and the two are not the same decision: staging describes a reading, escalation
 * interrupts a visit. The escalation constants below are separated out for exactly that reason and
 * carry their own note.
 *
 * This module is the single definition. The API recomputes from it on every write, the encounter
 * form renders live prompts from it, and the note generator describes the result with it, so the
 * three cannot drift into telling a clinician three different things about one reading.
 */

export const HYPERTENSION_CLASSIFICATIONS = [
  'NORMAL',
  'ELEVATED',
  'STAGE1',
  'STAGE2',
  'CRISIS',
  'UNKNOWN',
] as const;

export type HypertensionClassificationValue = (typeof HYPERTENSION_CLASSIFICATIONS)[number];

/**
 * Band edges, as the lowest value that belongs to each band.
 *
 * Written as inclusive lower bounds because that is how the source spec states them, and
 * restating them as exclusive upper bounds is how an off-by-one gets in.
 */
export const BP_THRESHOLDS = {
  elevatedSystolic: 120,
  stage1Systolic: 130,
  stage1Diastolic: 80,
  stage2Systolic: 140,
  stage2Diastolic: 90,
  crisisSystolic: 180,
  crisisDiastolic: 120,
} as const;

/**
 * Classify a single reading.
 *
 * Crisis is tested first and stage 2 second, descending. The bands overlap by construction -- a
 * reading of 190/85 satisfies both the crisis rule and the stage 2 rule -- so evaluation order is
 * the whole of the definition, not an implementation detail. Ascending order would classify a
 * hypertensive emergency as stage 2 and tell the volunteer nothing was wrong.
 *
 * A partial reading is classifiable only upward. The stage and crisis rules are disjunctive, so
 * one value can satisfy them alone; `NORMAL` and `ELEVATED` are conjunctive and need both. A
 * missing value therefore yields `UNKNOWN` rather than a reassuring band nobody measured.
 */
export function classifyBloodPressure(
  systolic: number | null | undefined,
  diastolic: number | null | undefined,
): HypertensionClassificationValue {
  const sys = normalizeReading(systolic);
  const dia = normalizeReading(diastolic);

  if (sys === null && dia === null) return 'UNKNOWN';

  if (atLeast(sys, BP_THRESHOLDS.crisisSystolic) || atLeast(dia, BP_THRESHOLDS.crisisDiastolic)) {
    return 'CRISIS';
  }
  if (atLeast(sys, BP_THRESHOLDS.stage2Systolic) || atLeast(dia, BP_THRESHOLDS.stage2Diastolic)) {
    return 'STAGE2';
  }
  if (atLeast(sys, BP_THRESHOLDS.stage1Systolic) || atLeast(dia, BP_THRESHOLDS.stage1Diastolic)) {
    return 'STAGE1';
  }

  // Below here both values are required: "normal" is a claim about the whole reading.
  if (sys === null || dia === null) return 'UNKNOWN';

  if (sys >= BP_THRESHOLDS.elevatedSystolic) return 'ELEVATED';
  return 'NORMAL';
}

/**
 * The reading at or above which the volunteer is asked to rest the patient and measure again.
 *
 * Set to the stage 2 edge. A single elevated reading is a common artefact of a rushed cuff, a
 * conversation, or the walk into the room, and the repeat is what separates that from a finding.
 * Prompting from stage 1 would fire on a large share of a screening clinic's patients and train
 * people to dismiss it.
 */
export const BP_REPEAT_PROMPT_SYSTOLIC = BP_THRESHOLDS.stage2Systolic;
export const BP_REPEAT_PROMPT_DIASTOLIC = BP_THRESHOLDS.stage2Diastolic;

export function shouldPromptRepeat(
  systolic: number | null | undefined,
  diastolic: number | null | undefined,
): boolean {
  const sys = normalizeReading(systolic);
  const dia = normalizeReading(diastolic);
  return atLeast(sys, BP_REPEAT_PROMPT_SYSTOLIC) || atLeast(dia, BP_REPEAT_PROMPT_DIASTOLIC);
}

/**
 * PROVISIONAL -- awaiting sign-off from Akomapa's medical director.
 *
 * The clinical specification asks Nkwapa to "flag severely elevated BP according to Akomapa's
 * locally approved escalation protocol". No such protocol exists in this repository. Rather than
 * invent one and have it look authoritative, these constants sit at the crisis edge -- the most
 * defensible reading of the only numbers that are written down -- and are named so that changing
 * them is a one-line, reviewable decision rather than an archaeology exercise.
 *
 * Do not fold these back into `classifyBloodPressure`. Classification says what a reading is;
 * escalation says the visit must stop and a clinician must look now. Collapsing them means a later
 * change to one silently changes the other.
 */
export const BP_ESCALATION_SYSTOLIC = BP_THRESHOLDS.crisisSystolic;
export const BP_ESCALATION_DIASTOLIC = BP_THRESHOLDS.crisisDiastolic;

export function isSeverelyElevated(
  systolic: number | null | undefined,
  diastolic: number | null | undefined,
): boolean {
  const sys = normalizeReading(systolic);
  const dia = normalizeReading(diastolic);
  return atLeast(sys, BP_ESCALATION_SYSTOLIC) || atLeast(dia, BP_ESCALATION_DIASTOLIC);
}

/**
 * PROVISIONAL -- awaiting the same sign-off.
 *
 * "Low BP or dizziness" is one of the specified reasons for clinician review, but no threshold is
 * given. 90/60 is the conventional screening cut-off. It is stated here rather than left implicit
 * in a form so that a clinician can correct one number.
 */
export const BP_HYPOTENSION_SYSTOLIC = 90;
export const BP_HYPOTENSION_DIASTOLIC = 60;

export function isHypotensive(
  systolic: number | null | undefined,
  diastolic: number | null | undefined,
): boolean {
  const sys = normalizeReading(systolic);
  const dia = normalizeReading(diastolic);
  if (sys === null && dia === null) return false;
  return atMost(sys, BP_HYPOTENSION_SYSTOLIC) || atMost(dia, BP_HYPOTENSION_DIASTOLIC);
}

/**
 * Treat anything that is not a finite number as absent.
 *
 * Readings reach here from JSON payloads and from form state, so `NaN` and `Infinity` are both
 * reachable without anyone writing them deliberately. `NaN` fails every comparison silently, which
 * would classify a corrupt reading as `NORMAL`.
 */
function normalizeReading(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function atLeast(value: number | null, threshold: number): boolean {
  return value !== null && value >= threshold;
}

function atMost(value: number | null, threshold: number): boolean {
  return value !== null && value <= threshold;
}
