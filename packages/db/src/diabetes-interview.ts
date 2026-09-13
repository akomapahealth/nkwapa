/**
 * The diabetes interview's vocabulary, its JSONB section contract, and its escalation rule.
 *
 * Mirrors `hypertension-interview.ts`. The two conditions share every answer scale they can
 * (`clinical-vocabulary.ts`) and declare only what is genuinely condition-specific here.
 */

import {
  FOOD_RECALL_MAX_LENGTH,
  FREQUENCY_NEVER_SOMETIMES_DAILY,
  FREQUENCY_NEVER_SOMETIMES_OFTEN,
  FREQUENCY_NEVER_SOMETIMES_USUALLY,
  FREQUENCY_RARELY_SOME_MOST,
  MEALS_PER_DAY_BANDS,
  NKWAPA_ANSWERS,
  type FrequencyNeverSometimesDailyValue,
  type FrequencyNeverSometimesOftenValue,
  type FrequencyNeverSometimesUsuallyValue,
  type FrequencyRarelySomeMostValue,
  type MealsPerDayBandValue,
  type NkwapaAnswerValue,
} from './clinical-vocabulary';
import { isHypoglycemic, type DiabetesGlucoseContext } from './diabetes-thresholds';
import {
  isDiabetesDistressPositive,
  isPhq2Positive,
  phq2Total,
  type DiabetesDistressResponse,
  type Phq2Response,
} from './phq2';
import {
  PayloadIssues,
  readEnum,
  readObject,
  readSchemaVersion,
  readText,
  rejectUnknownKeys,
  type ParsedPayload,
} from './payload-contract';

const NOT_ASKED = 'Not asked';

/* ---------------------------------------------------------------------- 1. History */

export const DIABETES_STATUSES = [
  'KNOWN_DIABETES',
  'NEWLY_ELEVATED_GLUCOSE',
  'NO_KNOWN_DIABETES',
  'UNSURE',
  'NOT_ASSESSED',
] as const;
export type DiabetesStatusValue = (typeof DIABETES_STATUSES)[number];
export const DIABETES_STATUS_LABELS: Record<DiabetesStatusValue, string> = {
  KNOWN_DIABETES: 'Known diabetes',
  NEWLY_ELEVATED_GLUCOSE: 'Newly elevated glucose',
  NO_KNOWN_DIABETES: 'No known diabetes',
  UNSURE: 'Unsure',
  NOT_ASSESSED: NOT_ASKED,
};

export const DIABETES_TYPES = [
  'TYPE_1',
  'TYPE_2',
  'GESTATIONAL',
  'UNKNOWN',
  'NOT_ASSESSED',
] as const;
export type DiabetesTypeValue = (typeof DIABETES_TYPES)[number];
export const DIABETES_TYPE_LABELS: Record<DiabetesTypeValue, string> = {
  TYPE_1: 'Type 1',
  TYPE_2: 'Type 2',
  GESTATIONAL: 'Gestational',
  UNKNOWN: 'Unknown',
  NOT_ASSESSED: NOT_ASKED,
};

export const DIABETES_CONCERNS = [
  'NO_CONCERN',
  'HIGH_GLUCOSE',
  'LOW_GLUCOSE',
  'MEDICATION_PROBLEM',
  'DIET',
  'NEW_SYMPTOMS',
  'OTHER',
  'NOT_ASSESSED',
] as const;
export type DiabetesConcernValue = (typeof DIABETES_CONCERNS)[number];
export const DIABETES_CONCERN_LABELS: Record<DiabetesConcernValue, string> = {
  NO_CONCERN: 'No concern',
  HIGH_GLUCOSE: 'High glucose',
  LOW_GLUCOSE: 'Low glucose',
  MEDICATION_PROBLEM: 'Medication problem',
  DIET: 'Diet',
  NEW_SYMPTOMS: 'New symptoms',
  OTHER: 'Other',
  NOT_ASSESSED: NOT_ASKED,
};

/* ------------------------------------------------------------------- 2. Diabetes control */

export const HBA1C_STATUSES = ['VALUE_KNOWN', 'UNKNOWN', 'NEVER_CHECKED', 'NOT_ASSESSED'] as const;
export type Hba1cStatusValue = (typeof HBA1C_STATUSES)[number];
export const HBA1C_STATUS_LABELS: Record<Hba1cStatusValue, string> = {
  VALUE_KNOWN: 'Value known',
  UNKNOWN: 'Unknown',
  NEVER_CHECKED: 'Never checked',
  NOT_ASSESSED: NOT_ASKED,
};

/**
 * Symptoms over the past month.
 *
 * Re-exported from `diabetes-screening.ts`, which owns the vocabulary behind the `symptoms`
 * column. Declaring a second list here would let the form offer an option the write rejects.
 *
 * It is explicitly a recall question, which is why the urgent list below is separate: "had a foot
 * wound sometime last month" and "has an open foot wound right now" are different clinical facts,
 * and only the second one stops a visit.
 */
export {
  DIABETES_SYMPTOMS as DIABETES_INTERVIEW_SYMPTOMS,
  DIABETES_SYMPTOM_LABELS as DIABETES_INTERVIEW_SYMPTOM_LABELS,
  type DiabetesSymptom as DiabetesInterviewSymptomValue,
} from './diabetes-screening';

/**
 * Symptoms happening now.
 *
 * The clinical specification names "vomiting, confusion, difficulty breathing, loss of
 * consciousness, or an active foot wound" as requiring immediate review, but its own symptom
 * checklist contains none of them except the foot wound -- and that checklist asks about the past
 * month, while escalation is a question about this minute. Asking them separately is what makes
 * the specification's own escalation rule implementable; see issue #114.
 */
export const DIABETES_URGENT_SYMPTOMS = [
  'VOMITING',
  'CONFUSION',
  'DIFFICULTY_BREATHING',
  'LOSS_OF_CONSCIOUSNESS',
  'ACTIVE_FOOT_WOUND',
  'NONE',
] as const;
export type DiabetesUrgentSymptomValue = (typeof DIABETES_URGENT_SYMPTOMS)[number];
export const DIABETES_URGENT_SYMPTOM_LABELS: Record<DiabetesUrgentSymptomValue, string> = {
  VOMITING: 'Vomiting',
  CONFUSION: 'Confusion',
  DIFFICULTY_BREATHING: 'Difficulty breathing',
  LOSS_OF_CONSCIOUSNESS: 'Loss of consciousness',
  ACTIVE_FOOT_WOUND: 'Active foot wound',
  NONE: 'None',
};

/* --------------------------------------------------------------------- Guided plan */

export const DIABETES_VOLUNTEER_ACTIONS = [
  'REVIEWED_TODAYS_GLUCOSE',
  'REVIEWED_MEDICATION_ACCESS',
  'DISCUSSED_SUGARY_DRINKS',
  'DISCUSSED_BALANCED_MEALS',
  'REVIEWED_HYPOGLYCEMIA_SYMPTOMS',
  'REVIEWED_BASIC_FOOT_CARE',
  'REFERRED_FOR_NUTRITION_COUNSELING',
  'REQUESTED_CLINICIAN_REVIEW',
  'NO_INTERVENTION_COMPLETED',
] as const;
export type DiabetesVolunteerActionValue = (typeof DIABETES_VOLUNTEER_ACTIONS)[number];
export const DIABETES_VOLUNTEER_ACTION_LABELS: Record<DiabetesVolunteerActionValue, string> = {
  REVIEWED_TODAYS_GLUCOSE: "Reviewed today's glucose result",
  REVIEWED_MEDICATION_ACCESS: 'Reviewed medication-taking and access',
  DISCUSSED_SUGARY_DRINKS: 'Discussed reducing sugary drinks',
  DISCUSSED_BALANCED_MEALS: 'Discussed balanced meals and portion size',
  REVIEWED_HYPOGLYCEMIA_SYMPTOMS: 'Reviewed symptoms of low blood sugar',
  REVIEWED_BASIC_FOOT_CARE: 'Reviewed basic foot care',
  REFERRED_FOR_NUTRITION_COUNSELING: 'Referred for nutrition counseling',
  REQUESTED_CLINICIAN_REVIEW: 'Requested clinician review',
  NO_INTERVENTION_COMPLETED: 'No intervention completed',
};

export const DIABETES_REVIEW_REASONS = [
  'ABNORMAL_GLUCOSE',
  'HYPOGLYCEMIA_SYMPTOMS',
  'HYPERGLYCEMIA_SYMPTOMS',
  'MEDICATION_PROBLEM',
  'POSITIVE_MENTAL_HEALTH_SCREEN',
  'DIABETES_DISTRESS',
  'FOOT_WOUND',
  'OVERDUE_DIABETES_SCREENING',
  'OTHER',
  'ROUTINE_REVIEW_ONLY',
] as const;
export type DiabetesReviewReasonValue = (typeof DIABETES_REVIEW_REASONS)[number];
export const DIABETES_REVIEW_REASON_LABELS: Record<DiabetesReviewReasonValue, string> = {
  ABNORMAL_GLUCOSE: 'Abnormal glucose',
  HYPOGLYCEMIA_SYMPTOMS: 'Hypoglycemia symptoms',
  HYPERGLYCEMIA_SYMPTOMS: 'Hyperglycemia symptoms',
  MEDICATION_PROBLEM: 'Medication problem',
  POSITIVE_MENTAL_HEALTH_SCREEN: 'Positive mental-health screen',
  DIABETES_DISTRESS: 'Diabetes distress',
  FOOT_WOUND: 'Foot wound',
  OVERDUE_DIABETES_SCREENING: 'Overdue diabetes screening',
  OTHER: 'Other',
  ROUTINE_REVIEW_ONLY: 'Routine review only',
};

export const DIABETES_CLINICIAN_PLAN_ITEMS = [
  'CONTINUE_CURRENT_MANAGEMENT',
  'MEDICATION_REFILL',
  'MEDICATION_CHANGE',
  'ORDER_LABORATORY_TESTING',
  'NUTRITION_REFERRAL',
  'EYE_EXAMINATION_REFERRAL',
  'FOOT_OR_WOUND_CARE_REFERRAL',
  'MENTAL_HEALTH_SUPPORT',
  'LINK_TO_COMMUNITY_HEALTH_WORKER',
  'REFER_TO_PARTNER_FACILITY',
  'URGENT_TRANSFER',
  'OTHER',
] as const;
export type DiabetesClinicianPlanItemValue = (typeof DIABETES_CLINICIAN_PLAN_ITEMS)[number];
export const DIABETES_CLINICIAN_PLAN_ITEM_LABELS: Record<DiabetesClinicianPlanItemValue, string> = {
  CONTINUE_CURRENT_MANAGEMENT: 'Continue current management',
  MEDICATION_REFILL: 'Medication refill',
  MEDICATION_CHANGE: 'Medication change',
  ORDER_LABORATORY_TESTING: 'Order laboratory testing',
  NUTRITION_REFERRAL: 'Nutrition referral',
  EYE_EXAMINATION_REFERRAL: 'Eye examination referral',
  FOOT_OR_WOUND_CARE_REFERRAL: 'Foot/wound-care referral',
  MENTAL_HEALTH_SUPPORT: 'Mental-health support',
  LINK_TO_COMMUNITY_HEALTH_WORKER: 'Link to community health worker',
  REFER_TO_PARTNER_FACILITY: 'Refer to partner health facility',
  URGENT_TRANSFER: 'Urgent transfer',
  OTHER: 'Other',
};

/* ------------------------------------------------------------------ 4. Nutrition (JSONB) */

export const DIABETES_NUTRITION_SCHEMA_VERSION = 1;

export interface DiabetesNutritionPayload {
  mealsPerDay: MealsPerDayBandValue;
  skipsMeals: NkwapaAnswerValue;
  sugarSweetenedDrinks: FrequencyNeverSometimesDailyValue;
  addsSugar: FrequencyNeverSometimesUsuallyValue;
  fruitVegetables: FrequencyRarelySomeMostValue;
  foodInsecurity: FrequencyNeverSometimesOftenValue;
  wantsNutritionCounseling: NkwapaAnswerValue;
  breakfastYesterday: string | null;
  lunchYesterday: string | null;
  dinnerYesterday: string | null;
}

const NUTRITION_KEYS: readonly (keyof DiabetesNutritionPayload)[] = [
  'mealsPerDay',
  'skipsMeals',
  'sugarSweetenedDrinks',
  'addsSugar',
  'fruitVegetables',
  'foodInsecurity',
  'wantsNutritionCounseling',
  'breakfastYesterday',
  'lunchYesterday',
  'dinnerYesterday',
];

export function emptyDiabetesNutrition(): DiabetesNutritionPayload {
  return {
    mealsPerDay: 'NOT_ASSESSED',
    skipsMeals: 'NOT_ASSESSED',
    sugarSweetenedDrinks: 'NOT_ASSESSED',
    addsSugar: 'NOT_ASSESSED',
    fruitVegetables: 'NOT_ASSESSED',
    foodInsecurity: 'NOT_ASSESSED',
    wantsNutritionCounseling: 'NOT_ASSESSED',
    breakfastYesterday: null,
    lunchYesterday: null,
    dinnerYesterday: null,
  };
}

export function parseDiabetesNutrition(value: unknown): ParsedPayload<DiabetesNutritionPayload> {
  const issues = new PayloadIssues();
  const source = readObject(value, 'nutrition', issues);
  const schemaVersion = readSchemaVersion(source, DIABETES_NUTRITION_SCHEMA_VERSION, issues);

  rejectUnknownKeys(source, [...NUTRITION_KEYS, 'schemaVersion'], 'nutrition', issues);

  const at = 'nutrition';
  const payload: DiabetesNutritionPayload = {
    mealsPerDay: readEnum(source, 'mealsPerDay', MEALS_PER_DAY_BANDS, 'NOT_ASSESSED', at, issues),
    skipsMeals: readEnum(source, 'skipsMeals', NKWAPA_ANSWERS, 'NOT_ASSESSED', at, issues),
    sugarSweetenedDrinks: readEnum(
      source,
      'sugarSweetenedDrinks',
      FREQUENCY_NEVER_SOMETIMES_DAILY,
      'NOT_ASSESSED',
      at,
      issues,
    ),
    addsSugar: readEnum(
      source,
      'addsSugar',
      FREQUENCY_NEVER_SOMETIMES_USUALLY,
      'NOT_ASSESSED',
      at,
      issues,
    ),
    fruitVegetables: readEnum(
      source,
      'fruitVegetables',
      FREQUENCY_RARELY_SOME_MOST,
      'NOT_ASSESSED',
      at,
      issues,
    ),
    foodInsecurity: readEnum(
      source,
      'foodInsecurity',
      FREQUENCY_NEVER_SOMETIMES_OFTEN,
      'NOT_ASSESSED',
      at,
      issues,
    ),
    wantsNutritionCounseling: readEnum(
      source,
      'wantsNutritionCounseling',
      NKWAPA_ANSWERS,
      'NOT_ASSESSED',
      at,
      issues,
    ),
    breakfastYesterday: readText(source, 'breakfastYesterday', FOOD_RECALL_MAX_LENGTH, at, issues),
    lunchYesterday: readText(source, 'lunchYesterday', FOOD_RECALL_MAX_LENGTH, at, issues),
    dinnerYesterday: readText(source, 'dinnerYesterday', FOOD_RECALL_MAX_LENGTH, at, issues),
  };

  return { schemaVersion, payload, issues: issues.list };
}

export function serializeDiabetesNutrition(
  payload: DiabetesNutritionPayload,
): Record<string, unknown> {
  return { ...payload, schemaVersion: DIABETES_NUTRITION_SCHEMA_VERSION };
}

/* ------------------------------------------------------------- Escalation derivation */

export type DiabetesEscalationReason =
  | 'URGENT_SYMPTOM_VOMITING'
  | 'URGENT_SYMPTOM_CONFUSION'
  | 'URGENT_SYMPTOM_DIFFICULTY_BREATHING'
  | 'URGENT_SYMPTOM_LOSS_OF_CONSCIOUSNESS'
  | 'ACTIVE_FOOT_WOUND'
  | 'HYPOGLYCEMIA';

export const DIABETES_ESCALATION_REASON_LABELS: Record<DiabetesEscalationReason, string> = {
  URGENT_SYMPTOM_VOMITING: 'Vomiting',
  URGENT_SYMPTOM_CONFUSION: 'Confusion',
  URGENT_SYMPTOM_DIFFICULTY_BREATHING: 'Difficulty breathing',
  URGENT_SYMPTOM_LOSS_OF_CONSCIOUSNESS: 'Loss of consciousness',
  ACTIVE_FOOT_WOUND: 'Active foot wound',
  HYPOGLYCEMIA: 'Low blood glucose',
};

const URGENT_SYMPTOM_REASONS: ReadonlyArray<
  [DiabetesUrgentSymptomValue, DiabetesEscalationReason]
> = [
  ['VOMITING', 'URGENT_SYMPTOM_VOMITING'],
  ['CONFUSION', 'URGENT_SYMPTOM_CONFUSION'],
  ['DIFFICULTY_BREATHING', 'URGENT_SYMPTOM_DIFFICULTY_BREATHING'],
  ['LOSS_OF_CONSCIOUSNESS', 'URGENT_SYMPTOM_LOSS_OF_CONSCIOUSNESS'],
  ['ACTIVE_FOOT_WOUND', 'ACTIVE_FOOT_WOUND'],
];

export interface DiabetesEscalationInput {
  urgentSymptoms?: readonly DiabetesUrgentSymptomValue[] | null;
  currentFootWound?: NkwapaAnswerValue | null;
  glucoseMgDl?: number | null;
  glucoseContext?: DiabetesGlucoseContext | null;
}

export interface DiabetesEscalation {
  urgentReviewRequired: boolean;
  reasons: DiabetesEscalationReason[];
}

/**
 * Decide whether this visit needs a clinician now, and say why.
 *
 * A foot wound reaches this from two directions -- the urgent symptom list and the separate
 * preventive-care question -- and either is sufficient. They are asked in different sections by
 * different parts of the specification, and a volunteer who records it in one place should not
 * have to also record it in the other for the escalation to fire.
 *
 * Hypoglycemia escalates on the measured value regardless of context, because a glucose of 55 is
 * low whether it was fasting or random. That is the one place where an `UNKNOWN` context does not
 * suppress a conclusion, and it is safe in the direction that matters.
 */
export function deriveDiabetesEscalation(input: DiabetesEscalationInput): DiabetesEscalation {
  const reasons: DiabetesEscalationReason[] = [];
  const seen = new Set<DiabetesEscalationReason>();

  const add = (reason: DiabetesEscalationReason): void => {
    if (seen.has(reason)) return;
    seen.add(reason);
    reasons.push(reason);
  };

  const urgent = new Set<DiabetesUrgentSymptomValue>(input.urgentSymptoms ?? []);
  for (const [symptom, reason] of URGENT_SYMPTOM_REASONS) {
    if (urgent.has(symptom)) add(reason);
  }

  if (input.currentFootWound === 'YES') add('ACTIVE_FOOT_WOUND');
  if (isHypoglycemic(input.glucoseMgDl)) add('HYPOGLYCEMIA');

  return { urgentReviewRequired: reasons.length > 0, reasons };
}

export function reviewReasonsForDiabetesEscalation(
  escalation: DiabetesEscalation,
): DiabetesReviewReasonValue[] {
  const out = new Set<DiabetesReviewReasonValue>();
  for (const reason of escalation.reasons) {
    if (reason === 'ACTIVE_FOOT_WOUND') out.add('FOOT_WOUND');
    else if (reason === 'HYPOGLYCEMIA') out.add('HYPOGLYCEMIA_SYMPTOMS');
    else out.add('HYPERGLYCEMIA_SYMPTOMS');
  }
  return [...out];
}

/**
 * Score both mental-health screens together, and say which review reasons they imply.
 *
 * Kept here rather than in `phq2.ts` because the mapping from a score to *this interview's*
 * review-reason vocabulary is diabetes-specific, while the instruments themselves are not.
 */
export interface DiabetesMentalHealthResult {
  phq2Total: number | null;
  phq2Positive: boolean;
  distressPositive: boolean;
  reviewReasons: DiabetesReviewReasonValue[];
}

export function evaluateDiabetesMentalHealth(input: {
  phq2Interest?: Phq2Response | null;
  phq2Mood?: Phq2Response | null;
  distressOverwhelmed?: DiabetesDistressResponse | null;
  distressFailing?: DiabetesDistressResponse | null;
}): DiabetesMentalHealthResult {
  const total = phq2Total(input.phq2Interest, input.phq2Mood);
  const phq2Pos = isPhq2Positive(total);
  const distressPos = isDiabetesDistressPositive(input.distressOverwhelmed, input.distressFailing);

  const reviewReasons: DiabetesReviewReasonValue[] = [];
  if (phq2Pos) reviewReasons.push('POSITIVE_MENTAL_HEALTH_SCREEN');
  if (distressPos) reviewReasons.push('DIABETES_DISTRESS');

  return {
    phq2Total: total,
    phq2Positive: phq2Pos,
    distressPositive: distressPos,
    reviewReasons,
  };
}
