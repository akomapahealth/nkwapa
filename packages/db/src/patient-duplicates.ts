/**
 * Suspected-duplicate heuristics for patient charts.
 *
 * One definition, consumed by both sides: the API scores candidate pairs with it, and the web
 * admin queue labels them with it. Keeping the weights and the plain-language reason copy in the
 * same module is what stops the screen from claiming a different confidence than the service
 * computed.
 *
 * These rules are deliberately conservative. Everything here is an *exact* match on a normalized
 * value, except `NAME_SIMILAR_AND_DOB`, which allows a small edit distance on the first name only
 * once the surname and the date of birth already agree. Nothing fuzzy is scored on its own, and a
 * pair is never surfaced on a similarity signal alone.
 *
 * A note on `NATIONAL_ID_HASH`: `Patient.nationalIdHash` is globally `@unique`, so two live rows
 * cannot share one, and `PatientService.create` refuses the collision before it reaches the
 * database. The rule is kept because a unique constraint is a statement about the present, not
 * about restored or back-filled data, and because a duplicate national ID is the one signal an
 * operator should never have to hunt for. In a healthy database it simply never fires.
 */

/** Match rules, ordered strongest first. The order is the tie-breaker for display. */
export const DUPLICATE_MATCH_REASONS = [
  'NATIONAL_ID_HASH',
  'NAME_AND_DOB',
  'NATIONAL_ID_LAST4',
  'PHONE',
  'EMAIL',
  'NAME_SIMILAR_AND_DOB',
] as const;

export type DuplicateMatchReason = (typeof DUPLICATE_MATCH_REASONS)[number];

/**
 * Points each rule contributes. They are summed and capped at 100.
 *
 * The numbers are chosen so that no single weak signal reaches `MEDIUM` on its own, but any two
 * of them together do: a shared phone number alone is a household, a shared phone number plus a
 * shared date of birth and surname is a duplicate chart.
 */
export const DUPLICATE_MATCH_WEIGHTS: Record<DuplicateMatchReason, number> = {
  NATIONAL_ID_HASH: 100,
  NAME_AND_DOB: 50,
  NATIONAL_ID_LAST4: 45,
  PHONE: 35,
  EMAIL: 35,
  NAME_SIMILAR_AND_DOB: 30,
};

/**
 * What each rule means, in the words a clinic manager would use.
 *
 * The design system forbids system vocabulary on screen, so nothing renders the enum value.
 */
export const DUPLICATE_MATCH_REASON_LABELS: Record<DuplicateMatchReason, string> = {
  NATIONAL_ID_HASH: 'Same national ID',
  NAME_AND_DOB: 'Same name and date of birth',
  NATIONAL_ID_LAST4: 'Same ID type, last 4 digits, and date of birth',
  PHONE: 'Same phone number',
  EMAIL: 'Same email address',
  NAME_SIMILAR_AND_DOB: 'Similar name, same date of birth',
};

export const DUPLICATE_CONFIDENCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const;

export type DuplicateConfidence = (typeof DUPLICATE_CONFIDENCE_LEVELS)[number];

/** Score floors for each confidence band. Below `MEDIUM` a pair is `LOW`. */
export const DUPLICATE_CONFIDENCE_THRESHOLDS = { HIGH: 70, MEDIUM: 40 } as const;

/** The largest first-name edit distance `NAME_SIMILAR_AND_DOB` will still call a match. */
export const DUPLICATE_NAME_EDIT_DISTANCE = 2;

/** The subset of a patient chart the heuristics read. Anything else is presentation. */
export interface DuplicateCandidateInput {
  id: string;
  firstName: string;
  lastName: string;
  dob: Date | string | null;
  phoneE164: string | null;
  email: string | null;
  nationalIdHash: string | null;
  nationalIdType: string | null;
  nationalIdLast4: string | null;
}

export interface DuplicatePairEvaluation {
  reasons: DuplicateMatchReason[];
  /** Capped sum of the matched rules' weights, 0-100. */
  score: number;
  confidence: DuplicateConfidence;
}

/**
 * Strip a name to the letters that carry identity.
 *
 * Diacritics are removed rather than compared because the same Ghanaian name is entered with and
 * without them by different volunteers on different keyboards, and a chart that differs only by an
 * accent is exactly the duplicate this queue exists to find. Hyphens, apostrophes and double
 * spaces go for the same reason.
 */
export function normalizeNameForMatch(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/** Lowercase and trim an email for comparison. Blank and null are never a match. */
export function normalizeEmailForMatch(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function toTime(value: Date | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * Whether two dates of birth name the same UTC day.
 *
 * `Patient.dob` is a timestamp column holding a date, so two records for the same person can carry
 * different times of day depending on how they were written. Comparing the instant would miss them.
 * Two nulls are not a match: an absent date of birth is not evidence of anything.
 */
export function sameCalendarDay(
  left: Date | string | null | undefined,
  right: Date | string | null | undefined,
): boolean {
  const leftTime = toTime(left);
  const rightTime = toTime(right);
  if (leftTime === null || rightTime === null) return false;
  const leftDate = new Date(leftTime);
  const rightDate = new Date(rightTime);
  return (
    leftDate.getUTCFullYear() === rightDate.getUTCFullYear() &&
    leftDate.getUTCMonth() === rightDate.getUTCMonth() &&
    leftDate.getUTCDate() === rightDate.getUTCDate()
  );
}

/**
 * Levenshtein distance, answered only as "is it within `max`".
 *
 * The caller never needs the number, and bounding it lets the row-by-row scan stop as soon as the
 * whole band exceeds the limit, which keeps this linear for the mismatched pairs that dominate.
 */
export function editDistanceWithin(left: string, right: string, max: number): boolean {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > max) return false;
  if (left.length === 0 || right.length === 0) return Math.max(left.length, right.length) <= max;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    let rowBest = i;
    for (let j = 1; j <= right.length; j += 1) {
      const substitution = previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1);
      const distance = Math.min(current[j - 1] + 1, previous[j] + 1, substitution);
      current.push(distance);
      if (distance < rowBest) rowBest = distance;
    }
    if (rowBest > max) return false;
    previous = current;
  }

  return previous[right.length] <= max;
}

/**
 * Stable identity for an unordered pair of patients.
 *
 * Sorted so that the same two charts produce the same key whichever way round they arrive. It is
 * what a review decision is stored against and what the queue keys its rows on, so it must not
 * depend on the order the blocking query happened to emit.
 */
export function duplicatePairKey(patientAId: string, patientBId: string): string {
  return patientAId < patientBId ? `${patientAId}:${patientBId}` : `${patientBId}:${patientAId}`;
}

/** Split a pair key back into its two patient ids, in stored order. */
export function parseDuplicatePairKey(pairKey: string): [string, string] | null {
  const parts = pairKey.split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return [parts[0], parts[1]];
}

/** Which confidence band a score falls in. */
export function scoreToConfidence(score: number): DuplicateConfidence {
  if (score >= DUPLICATE_CONFIDENCE_THRESHOLDS.HIGH) return 'HIGH';
  if (score >= DUPLICATE_CONFIDENCE_THRESHOLDS.MEDIUM) return 'MEDIUM';
  return 'LOW';
}

function matchedReasons(
  left: DuplicateCandidateInput,
  right: DuplicateCandidateInput,
): DuplicateMatchReason[] {
  const reasons: DuplicateMatchReason[] = [];

  if (left.nationalIdHash && left.nationalIdHash === right.nationalIdHash) {
    reasons.push('NATIONAL_ID_HASH');
  }

  const sameDob = sameCalendarDay(left.dob, right.dob);
  const leftFirst = normalizeNameForMatch(left.firstName);
  const rightFirst = normalizeNameForMatch(right.firstName);
  const leftLast = normalizeNameForMatch(left.lastName);
  const rightLast = normalizeNameForMatch(right.lastName);
  const sameSurname = leftLast.length > 0 && leftLast === rightLast;

  if (sameDob && sameSurname && leftFirst.length > 0 && leftFirst === rightFirst) {
    reasons.push('NAME_AND_DOB');
  }

  if (
    left.nationalIdLast4 &&
    left.nationalIdLast4 === right.nationalIdLast4 &&
    left.nationalIdType &&
    left.nationalIdType === right.nationalIdType &&
    sameDob
  ) {
    reasons.push('NATIONAL_ID_LAST4');
  }

  if (left.phoneE164 && left.phoneE164 === right.phoneE164) {
    reasons.push('PHONE');
  }

  const leftEmail = normalizeEmailForMatch(left.email);
  if (leftEmail.length > 0 && leftEmail === normalizeEmailForMatch(right.email)) {
    reasons.push('EMAIL');
  }

  // Only ever a supporting signal: the surname and date of birth must already agree, and the
  // exact-name rule above must not have fired, or the pair would be counted twice.
  if (
    sameDob &&
    sameSurname &&
    leftFirst.length > 0 &&
    rightFirst.length > 0 &&
    leftFirst !== rightFirst &&
    editDistanceWithin(leftFirst, rightFirst, DUPLICATE_NAME_EDIT_DISTANCE)
  ) {
    reasons.push('NAME_SIMILAR_AND_DOB');
  }

  return reasons;
}

/**
 * Score one candidate pair.
 *
 * Returns an empty reason list and a zero score when nothing matched, so a caller can use this to
 * decide whether a pair belongs in the queue at all rather than pre-filtering with its own copy of
 * the rules.
 */
export function evaluateDuplicatePair(
  left: DuplicateCandidateInput,
  right: DuplicateCandidateInput,
): DuplicatePairEvaluation {
  const reasons = matchedReasons(left, right);
  const score = Math.min(
    100,
    reasons.reduce((total, reason) => total + DUPLICATE_MATCH_WEIGHTS[reason], 0),
  );
  return { reasons, score, confidence: scoreToConfidence(score) };
}
