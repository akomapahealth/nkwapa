/**
 * The answer scales the chronic-disease interviews reuse across sections.
 *
 * The hypertension and diabetes tabs ask roughly a hundred and twenty questions between them, and
 * most of those questions reuse one of about fifteen answer shapes. Declaring each shape once
 * means the Postgres enum, the request DTO, the form control and the generated note all read the
 * same list, and a wording change happens in one place.
 *
 * Every scale carries `NOT_ASSESSED`, and that is load-bearing rather than tidy. A guided
 * interview is saved on every tab change, so most records are read while half-answered. Without a
 * distinct "not yet asked", an unasked question is indistinguishable from an answer of "no", and a
 * generated note would state that a patient denied a symptom nobody mentioned. `TobaccoScreening`
 * already establishes this convention in the schema.
 */

const NOT_ASKED = 'Not asked';

export const NKWAPA_ANSWERS = ['YES', 'NO', 'UNSURE', 'NOT_ASSESSED'] as const;
export type NkwapaAnswerValue = (typeof NKWAPA_ANSWERS)[number];
export const NKWAPA_ANSWER_LABELS: Record<NkwapaAnswerValue, string> = {
  YES: 'Yes',
  NO: 'No',
  UNSURE: 'Unsure',
  NOT_ASSESSED: NOT_ASKED,
};

export const FREQUENCY_NEVER_SOMETIMES_USUALLY = [
  'NEVER',
  'SOMETIMES',
  'USUALLY',
  'NOT_ASSESSED',
] as const;
export type FrequencyNeverSometimesUsuallyValue =
  (typeof FREQUENCY_NEVER_SOMETIMES_USUALLY)[number];
export const FREQUENCY_NEVER_SOMETIMES_USUALLY_LABELS: Record<
  FrequencyNeverSometimesUsuallyValue,
  string
> = { NEVER: 'Never', SOMETIMES: 'Sometimes', USUALLY: 'Usually', NOT_ASSESSED: NOT_ASKED };

export const FREQUENCY_NEVER_SOMETIMES_DAILY = [
  'NEVER',
  'SOMETIMES',
  'DAILY',
  'NOT_ASSESSED',
] as const;
export type FrequencyNeverSometimesDailyValue = (typeof FREQUENCY_NEVER_SOMETIMES_DAILY)[number];
export const FREQUENCY_NEVER_SOMETIMES_DAILY_LABELS: Record<
  FrequencyNeverSometimesDailyValue,
  string
> = { NEVER: 'Never', SOMETIMES: 'Sometimes', DAILY: 'Daily', NOT_ASSESSED: NOT_ASKED };

export const FREQUENCY_RARELY_SOME_MOST = [
  'RARELY',
  'SOME_DAYS',
  'MOST_DAYS',
  'NOT_ASSESSED',
] as const;
export type FrequencyRarelySomeMostValue = (typeof FREQUENCY_RARELY_SOME_MOST)[number];
export const FREQUENCY_RARELY_SOME_MOST_LABELS: Record<FrequencyRarelySomeMostValue, string> = {
  RARELY: 'Rarely',
  SOME_DAYS: 'Some days',
  MOST_DAYS: 'Most days',
  NOT_ASSESSED: NOT_ASKED,
};

export const FREQUENCY_NEVER_SOMETIMES_OFTEN = [
  'NEVER',
  'SOMETIMES',
  'OFTEN',
  'NOT_ASSESSED',
] as const;
export type FrequencyNeverSometimesOftenValue = (typeof FREQUENCY_NEVER_SOMETIMES_OFTEN)[number];
export const FREQUENCY_NEVER_SOMETIMES_OFTEN_LABELS: Record<
  FrequencyNeverSometimesOftenValue,
  string
> = { NEVER: 'Never', SOMETIMES: 'Sometimes', OFTEN: 'Often', NOT_ASSESSED: NOT_ASKED };

export const SCREENING_COMPLETION_STATUSES = [
  'COMPLETED',
  'NOT_COMPLETED',
  'PATIENT_UNSURE',
  'NOT_ASSESSED',
] as const;
export type ScreeningCompletionStatusValue = (typeof SCREENING_COMPLETION_STATUSES)[number];
export const SCREENING_COMPLETION_STATUS_LABELS: Record<ScreeningCompletionStatusValue, string> = {
  COMPLETED: 'Completed',
  NOT_COMPLETED: 'Not completed',
  PATIENT_UNSURE: 'Patient unsure',
  NOT_ASSESSED: NOT_ASKED,
};

export const MEDICATION_USE_STATUSES = ['TAKING', 'NOT_TAKING', 'UNSURE', 'NOT_ASSESSED'] as const;
export type MedicationUseStatusValue = (typeof MEDICATION_USE_STATUSES)[number];
export const MEDICATION_USE_STATUS_LABELS: Record<MedicationUseStatusValue, string> = {
  TAKING: 'Taking',
  NOT_TAKING: 'Not taking',
  UNSURE: 'Unsure',
  NOT_ASSESSED: NOT_ASKED,
};

export const MEDICATION_SUPPLY_STATUSES = [
  'NONE',
  'LESS_THAN_ONE_WEEK',
  'AT_LEAST_ONE_WEEK',
  'UNSURE',
  'NOT_ASSESSED',
] as const;
export type MedicationSupplyStatusValue = (typeof MEDICATION_SUPPLY_STATUSES)[number];
export const MEDICATION_SUPPLY_STATUS_LABELS: Record<MedicationSupplyStatusValue, string> = {
  NONE: 'None',
  LESS_THAN_ONE_WEEK: 'Less than 1 week',
  AT_LEAST_ONE_WEEK: 'At least 1 week',
  UNSURE: 'Unsure',
  NOT_ASSESSED: NOT_ASKED,
};

export const MEDICATION_ADHERENCE_LEVELS = [
  'ALWAYS',
  'SOMETIMES',
  'NOT_TAKING',
  'UNSURE',
  'NOT_ASSESSED',
] as const;
export type MedicationAdherenceLevelValue = (typeof MEDICATION_ADHERENCE_LEVELS)[number];
export const MEDICATION_ADHERENCE_LEVEL_LABELS: Record<MedicationAdherenceLevelValue, string> = {
  ALWAYS: 'Always',
  SOMETIMES: 'Sometimes',
  NOT_TAKING: 'Not taking',
  UNSURE: 'Unsure',
  NOT_ASSESSED: NOT_ASKED,
};

export const MEDICATION_DOSES_MISSED = [
  'ZERO',
  'ONE',
  'TWO_TO_THREE',
  'FOUR_OR_MORE',
  'UNSURE',
  'NOT_ASSESSED',
] as const;
export type MedicationDosesMissedValue = (typeof MEDICATION_DOSES_MISSED)[number];
export const MEDICATION_DOSES_MISSED_LABELS: Record<MedicationDosesMissedValue, string> = {
  ZERO: '0',
  ONE: '1',
  TWO_TO_THREE: '2-3',
  FOUR_OR_MORE: '4 or more',
  UNSURE: 'Unsure',
  NOT_ASSESSED: NOT_ASKED,
};

/**
 * `NONE` is an answer here, not an absence.
 *
 * A volunteer ticking "None" has asked about barriers and found none, which is a clinically
 * different statement from an empty array meaning the question was skipped. The form must not
 * collapse the two.
 */
export const MEDICATION_PROBLEMS = [
  'NONE',
  'SIDE_EFFECTS',
  'COST',
  'UNAVAILABLE',
  'FORGETTING',
  'DOES_NOT_UNDERSTAND',
  'OTHER',
] as const;
export type MedicationProblemValue = (typeof MEDICATION_PROBLEMS)[number];
export const MEDICATION_PROBLEM_LABELS: Record<MedicationProblemValue, string> = {
  NONE: 'None',
  SIDE_EFFECTS: 'Side effects',
  COST: 'Cost',
  UNAVAILABLE: 'Unavailable',
  FORGETTING: 'Forgetting',
  DOES_NOT_UNDERSTAND: 'Does not understand instructions',
  OTHER: 'Other',
};

export const MEDICATION_REMINDER_STRATEGIES = [
  'SAME_TIME_DAILY',
  'PILLBOX',
  'PHONE_ALARM',
  'FAMILY_REMINDER',
  'WITH_ROUTINE_OR_MEAL',
  'NONE',
  'OTHER',
] as const;
export type MedicationReminderStrategyValue = (typeof MEDICATION_REMINDER_STRATEGIES)[number];
export const MEDICATION_REMINDER_STRATEGY_LABELS: Record<MedicationReminderStrategyValue, string> =
  {
    SAME_TIME_DAILY: 'Takes them at the same time each day',
    PILLBOX: 'Uses a pillbox',
    PHONE_ALARM: 'Uses a phone alarm',
    FAMILY_REMINDER: 'Family member reminds them',
    WITH_ROUTINE_OR_MEAL: 'Takes them with a regular activity or meal',
    NONE: 'Has no reminder system',
    OTHER: 'Other',
  };

export const TOBACCO_USE_STATUSES = [
  'NEVER',
  'FORMER',
  'CURRENT_OCCASIONAL',
  'CURRENT_DAILY',
  'NOT_ASSESSED',
] as const;
export type TobaccoUseStatusValue = (typeof TOBACCO_USE_STATUSES)[number];
export const TOBACCO_USE_STATUS_LABELS: Record<TobaccoUseStatusValue, string> = {
  NEVER: 'Never',
  FORMER: 'Former',
  CURRENT_OCCASIONAL: 'Current, occasionally',
  CURRENT_DAILY: 'Current, daily',
  NOT_ASSESSED: NOT_ASKED,
};

export const ALCOHOL_USE_STATUSES = [
  'NEVER',
  'OCCASIONALLY',
  'WEEKLY',
  'DAILY',
  'NOT_ASSESSED',
] as const;
export type AlcoholUseStatusValue = (typeof ALCOHOL_USE_STATUSES)[number];
export const ALCOHOL_USE_STATUS_LABELS: Record<AlcoholUseStatusValue, string> = {
  NEVER: 'Never',
  OCCASIONALLY: 'Occasionally',
  WEEKLY: 'Weekly',
  DAILY: 'Daily',
  NOT_ASSESSED: NOT_ASKED,
};

export const MEALS_PER_DAY_BANDS = [
  'ONE',
  'TWO',
  'THREE',
  'MORE_THAN_THREE',
  'VARIES',
  'NOT_ASSESSED',
] as const;
export type MealsPerDayBandValue = (typeof MEALS_PER_DAY_BANDS)[number];
export const MEALS_PER_DAY_BAND_LABELS: Record<MealsPerDayBandValue, string> = {
  ONE: '1',
  TWO: '2',
  THREE: '3',
  MORE_THAN_THREE: 'More than 3',
  VARIES: 'Varies',
  NOT_ASSESSED: NOT_ASKED,
};

export const FOLLOW_UP_WINDOWS = [
  'TODAY',
  'WITHIN_1_WEEK',
  'WITHIN_1_MONTH',
  'WITHIN_3_MONTHS',
  'OTHER',
  'NOT_ASSESSED',
] as const;
export type FollowUpWindowValue = (typeof FOLLOW_UP_WINDOWS)[number];
export const FOLLOW_UP_WINDOW_LABELS: Record<FollowUpWindowValue, string> = {
  TODAY: 'Today',
  WITHIN_1_WEEK: 'Within 1 week',
  WITHIN_1_MONTH: 'Within 1 month',
  WITHIN_3_MONTHS: 'Within 3 months',
  OTHER: 'Other',
  NOT_ASSESSED: NOT_ASKED,
};

export const FOLLOW_UP_OWNERS = [
  'AKOMAPA_TEAM',
  'COMMUNITY_HEALTH_WORKER',
  'PARTNER_FACILITY',
  'PATIENT',
  'NOT_ASSESSED',
] as const;
export type FollowUpOwnerValue = (typeof FOLLOW_UP_OWNERS)[number];
export const FOLLOW_UP_OWNER_LABELS: Record<FollowUpOwnerValue, string> = {
  AKOMAPA_TEAM: 'Akomapa team',
  COMMUNITY_HEALTH_WORKER: 'Community health worker',
  PARTNER_FACILITY: 'Partner facility',
  PATIENT: 'Patient',
  NOT_ASSESSED: NOT_ASKED,
};

/** How many days past the visit each window lands on. `null` means no date can be derived. */
const FOLLOW_UP_WINDOW_DAYS: Record<FollowUpWindowValue, number | null> = {
  TODAY: 0,
  WITHIN_1_WEEK: 7,
  WITHIN_1_MONTH: 30,
  WITHIN_3_MONTHS: 90,
  // The clinician typed a date instead of picking a window; the window cannot supply one.
  OTHER: null,
  NOT_ASSESSED: null,
};

/**
 * Turn a relative follow-up window into the concrete date the reminder will fire from.
 *
 * This exists because `CarePlan.followUpDate` is load-bearing: `EncounterService` schedules the
 * patient's follow-up reminder from it when an encounter is finalized. The interview collects a
 * relative window because that is how a clinician thinks, but storing the window alone would give
 * the reminder nothing to read, and the plan would look complete while scheduling nothing.
 *
 * The window is the input; the date is what is stored.
 *
 * Returns null for `OTHER` and `NOT_ASSESSED`, and the caller must then use the explicitly entered
 * date or leave the follow-up unset. Guessing a date for `OTHER` would overwrite the clinician's
 * own choice.
 */
export function resolveFollowUpDate(
  window: FollowUpWindowValue | null | undefined,
  from: Date,
): Date | null {
  if (!window) return null;
  const days = FOLLOW_UP_WINDOW_DAYS[window];
  if (days === null || days === undefined) return null;

  /*
    Built in UTC from the calendar parts, not by adding milliseconds.

    Adding `days * 86_400_000` to a timestamp drifts across a daylight-saving boundary and can land
    on the previous day. `Date.UTC` with an overflowing day argument normalizes month and year
    ends correctly, so 30 days from 31 January is 2 March without a special case.
  */
  return new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + days, 0, 0, 0, 0),
  );
}

/**
 * Length limits for the interview's free-text fields.
 *
 * Shared so the two conditions cannot disagree about how long a 24-hour food recall may be, and
 * so the column widths in the migration have one place to be derived from.
 */
export const FOOD_RECALL_MAX_LENGTH = 300;
export const FREE_TEXT_MAX_LENGTH = 200;
