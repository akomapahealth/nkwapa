/**
 * The hypertension interview's vocabulary, its JSONB section contracts, and its escalation rule.
 *
 * The tab is a guided interview a volunteer clicks through while examining a patient, so every
 * answer list here is also a list of buttons. Declaring them once means the Postgres enum, the
 * request DTO, the form control and the generated note cannot disagree about what the options
 * were.
 */

import {
  BP_ESCALATION_DIASTOLIC,
  BP_ESCALATION_SYSTOLIC,
  isHypotensive,
  isSeverelyElevated,
} from './bp-classification';
import {
  ALCOHOL_USE_STATUSES,
  FREQUENCY_NEVER_SOMETIMES_DAILY,
  FREQUENCY_NEVER_SOMETIMES_OFTEN,
  FREQUENCY_NEVER_SOMETIMES_USUALLY,
  FREQUENCY_RARELY_SOME_MOST,
  FOOD_RECALL_MAX_LENGTH,
  FREE_TEXT_MAX_LENGTH,
  NKWAPA_ANSWERS,
  TOBACCO_USE_STATUSES,
  type AlcoholUseStatusValue,
  type FrequencyNeverSometimesDailyValue,
  type FrequencyNeverSometimesOftenValue,
  type FrequencyNeverSometimesUsuallyValue,
  type FrequencyRarelySomeMostValue,
  type NkwapaAnswerValue,
  type TobaccoUseStatusValue,
} from './clinical-vocabulary';
import {
  PayloadIssues,
  readEnum,
  readInteger,
  readObject,
  readSchemaVersion,
  readText,
  rejectUnknownKeys,
  type ParsedPayload,
} from './payload-contract';

/* -------------------------------------------------------------------------- 1. History */

export const HYPERTENSION_STATUSES = [
  'KNOWN_HYPERTENSION',
  'NEWLY_ELEVATED_BP',
  'NO_KNOWN_HYPERTENSION',
  'UNSURE',
  'NOT_ASSESSED',
] as const;
export type HypertensionStatusValue = (typeof HYPERTENSION_STATUSES)[number];
export const HYPERTENSION_STATUS_LABELS: Record<HypertensionStatusValue, string> = {
  KNOWN_HYPERTENSION: 'Known hypertension',
  NEWLY_ELEVATED_BP: 'Newly elevated BP',
  NO_KNOWN_HYPERTENSION: 'No known hypertension',
  UNSURE: 'Unsure',
  NOT_ASSESSED: 'Not asked',
};

export const HYPERTENSION_CONCERNS = [
  'NO_CONCERN',
  'HIGH_BP',
  'LOW_BP_OR_DIZZINESS',
  'MEDICATION_PROBLEM',
  'NEW_SYMPTOMS',
  'DIET',
  'OTHER',
  'NOT_ASSESSED',
] as const;
export type HypertensionConcernValue = (typeof HYPERTENSION_CONCERNS)[number];
export const HYPERTENSION_CONCERN_LABELS: Record<HypertensionConcernValue, string> = {
  NO_CONCERN: 'No concern',
  HIGH_BP: 'High BP',
  LOW_BP_OR_DIZZINESS: 'Low BP or dizziness',
  MEDICATION_PROBLEM: 'Medication problem',
  NEW_SYMPTOMS: 'New symptoms',
  DIET: 'Diet',
  OTHER: 'Other',
  NOT_ASSESSED: 'Not asked',
};

export const FACILITY_KNOWN_STATUSES = ['SELECTED', 'NONE', 'UNKNOWN', 'NOT_ASSESSED'] as const;
export type FacilityKnownStatusValue = (typeof FACILITY_KNOWN_STATUSES)[number];
export const FACILITY_KNOWN_STATUS_LABELS: Record<FacilityKnownStatusValue, string> = {
  SELECTED: 'Selected facility',
  NONE: 'None',
  UNKNOWN: 'Unknown',
  NOT_ASSESSED: 'Not asked',
};

/* --------------------------------------------------------------- 2. Blood-pressure control */

export const BP_REPEAT_STATUSES = ['YES', 'NO', 'NOT_REQUIRED', 'NOT_ASSESSED'] as const;
export type BpRepeatStatusValue = (typeof BP_REPEAT_STATUSES)[number];
export const BP_REPEAT_STATUS_LABELS: Record<BpRepeatStatusValue, string> = {
  YES: 'Yes',
  NO: 'No',
  NOT_REQUIRED: 'Not required',
  NOT_ASSESSED: 'Not asked',
};

export const HOME_BP_MONITOR_STATUSES = [
  'HAS_ONE',
  'DOES_NOT_HAVE_ONE',
  'UNABLE_TO_AFFORD',
  'DOES_NOT_WISH_TO_MONITOR',
  'NOT_ASSESSED',
] as const;
export type HomeBpMonitorStatusValue = (typeof HOME_BP_MONITOR_STATUSES)[number];
export const HOME_BP_MONITOR_STATUS_LABELS: Record<HomeBpMonitorStatusValue, string> = {
  HAS_ONE: 'Has one',
  DOES_NOT_HAVE_ONE: 'Does not have one',
  UNABLE_TO_AFFORD: 'Unable to afford one',
  DOES_NOT_WISH_TO_MONITOR: 'Does not wish to monitor',
  NOT_ASSESSED: 'Not asked',
};

export const HOME_BP_CHECK_FREQUENCIES = [
  'NEVER',
  'OCCASIONALLY',
  'SEVERAL_TIMES_WEEKLY',
  'DAILY',
  'NOT_ASSESSED',
] as const;
export type HomeBpCheckFrequencyValue = (typeof HOME_BP_CHECK_FREQUENCIES)[number];
export const HOME_BP_CHECK_FREQUENCY_LABELS: Record<HomeBpCheckFrequencyValue, string> = {
  NEVER: 'Never',
  OCCASIONALLY: 'Occasionally',
  SEVERAL_TIMES_WEEKLY: 'Several times weekly',
  DAILY: 'Daily',
  NOT_ASSESSED: 'Not asked',
};

export const HOME_BP_SOURCES = [
  'MONITOR_REVIEWED',
  'WRITTEN_READINGS_REVIEWED',
  'PATIENT_RECALL',
  'NOT_ASSESSED',
] as const;
export type HomeBpSourceValue = (typeof HOME_BP_SOURCES)[number];
export const HOME_BP_SOURCE_LABELS: Record<HomeBpSourceValue, string> = {
  MONITOR_REVIEWED: 'Monitor reviewed',
  WRITTEN_READINGS_REVIEWED: 'Written readings reviewed',
  PATIENT_RECALL: 'Patient recall',
  NOT_ASSESSED: 'Not asked',
};

/* ---------------------------------------------------------------------- 3. Current symptoms */

export const HYPERTENSION_SYMPTOMS = [
  'SEVERE_HEADACHE',
  'BLURRED_VISION',
  'CHEST_PAIN',
  'SHORTNESS_OF_BREATH',
  'NEW_WEAKNESS_OR_NUMBNESS',
  'DIFFICULTY_SPEAKING',
  'CONFUSION',
  'FAINTING',
  'SEVERE_DIZZINESS',
  'NONE',
] as const;
export type HypertensionSymptomValue = (typeof HYPERTENSION_SYMPTOMS)[number];
export const HYPERTENSION_SYMPTOM_LABELS: Record<HypertensionSymptomValue, string> = {
  SEVERE_HEADACHE: 'Severe headache',
  BLURRED_VISION: 'Blurred or changed vision',
  CHEST_PAIN: 'Chest pain',
  SHORTNESS_OF_BREATH: 'Shortness of breath',
  NEW_WEAKNESS_OR_NUMBNESS: 'New weakness or numbness',
  DIFFICULTY_SPEAKING: 'Difficulty speaking',
  CONFUSION: 'Confusion',
  FAINTING: 'Fainting',
  SEVERE_DIZZINESS: 'Severe dizziness',
  NONE: 'None',
};

/* ------------------------------------------------------------------------- 5. Substances */

export const BP_AFFECTING_SUBSTANCES = [
  'NSAID',
  'STEROIDS',
  'HERBAL_OR_TRADITIONAL',
  'DECONGESTANTS',
  'STIMULANTS',
  'HORMONAL_CONTRACEPTION',
  'NONE',
  'UNSURE',
] as const;
export type BpAffectingSubstanceValue = (typeof BP_AFFECTING_SUBSTANCES)[number];
export const BP_AFFECTING_SUBSTANCE_LABELS: Record<BpAffectingSubstanceValue, string> = {
  NSAID: 'NSAID pain medicines',
  STEROIDS: 'Steroids',
  HERBAL_OR_TRADITIONAL: 'Herbal or traditional remedies',
  DECONGESTANTS: 'Decongestants',
  STIMULANTS: 'Stimulants',
  HORMONAL_CONTRACEPTION: 'Hormonal contraception',
  NONE: 'None',
  UNSURE: 'Unsure',
};

export const SUBSTANCE_FREQUENCIES = [
  'OCCASIONALLY',
  'SEVERAL_TIMES_WEEKLY',
  'DAILY',
  'NOT_ASSESSED',
] as const;
export type SubstanceFrequencyValue = (typeof SUBSTANCE_FREQUENCIES)[number];
export const SUBSTANCE_FREQUENCY_LABELS: Record<SubstanceFrequencyValue, string> = {
  OCCASIONALLY: 'Occasionally',
  SEVERAL_TIMES_WEEKLY: 'Several times weekly',
  DAILY: 'Daily',
  NOT_ASSESSED: 'Not asked',
};

/* ----------------------------------------------------------------- 7. Relevant history */

export const CARDIOMETABOLIC_CONDITIONS = [
  'DIABETES',
  'KIDNEY_DISEASE',
  'HEART_DISEASE_OR_MI',
  'STROKE_OR_TIA',
  'PERIPHERAL_VASCULAR_DISEASE',
  'HEART_FAILURE',
  'HIGH_CHOLESTEROL',
  'PREGNANCY',
  'NONE_KNOWN',
  'UNSURE',
] as const;
export type CardiometabolicConditionValue = (typeof CARDIOMETABOLIC_CONDITIONS)[number];
export const CARDIOMETABOLIC_CONDITION_LABELS: Record<CardiometabolicConditionValue, string> = {
  DIABETES: 'Diabetes',
  KIDNEY_DISEASE: 'Kidney disease',
  HEART_DISEASE_OR_MI: 'Heart disease or prior heart attack',
  STROKE_OR_TIA: 'Stroke or TIA',
  PERIPHERAL_VASCULAR_DISEASE: 'Peripheral vascular disease',
  HEART_FAILURE: 'Heart failure',
  HIGH_CHOLESTEROL: 'High cholesterol',
  PREGNANCY: 'Pregnancy',
  NONE_KNOWN: 'None known',
  UNSURE: 'Unsure',
};

/**
 * Pregnancy planning carries a refusal option the other yes/no/unsure scales do not.
 *
 * "Prefer not to answer" is a different fact from "unsure", and a reproductive-intent question is
 * exactly where a patient is entitled to decline without that being recorded as uncertainty.
 */
export const PREGNANCY_PLANNING_ANSWERS = [
  'YES',
  'NO',
  'UNSURE',
  'PREFER_NOT_TO_ANSWER',
  'NOT_ASSESSED',
] as const;
export type PregnancyPlanningAnswerValue = (typeof PREGNANCY_PLANNING_ANSWERS)[number];
export const PREGNANCY_PLANNING_ANSWER_LABELS: Record<PregnancyPlanningAnswerValue, string> = {
  YES: 'Yes',
  NO: 'No',
  UNSURE: 'Unsure',
  PREFER_NOT_TO_ANSWER: 'Prefer not to answer',
  NOT_ASSESSED: 'Not asked',
};

/* --------------------------------------------------------------------- Guided plan */

export const HYPERTENSION_VOLUNTEER_ACTIONS = [
  'REPEATED_BP_AFTER_REST',
  'REVIEWED_TODAYS_BP',
  'REVIEWED_MEDICATION_ACCESS',
  'DISCUSSED_DIETARY_SALT',
  'DISCUSSED_HEALTHY_FOOD',
  'DISCUSSED_PHYSICAL_ACTIVITY',
  'DISCUSSED_TOBACCO_OR_ALCOHOL',
  'REQUESTED_NUTRITION_COUNSELING',
  'REQUESTED_CLINICIAN_REVIEW',
  'NO_INTERVENTION_COMPLETED',
] as const;
export type HypertensionVolunteerActionValue = (typeof HYPERTENSION_VOLUNTEER_ACTIONS)[number];
export const HYPERTENSION_VOLUNTEER_ACTION_LABELS: Record<
  HypertensionVolunteerActionValue,
  string
> = {
  REPEATED_BP_AFTER_REST: 'Repeated blood pressure after rest',
  REVIEWED_TODAYS_BP: "Reviewed today's BP result",
  REVIEWED_MEDICATION_ACCESS: 'Reviewed medication-taking and access',
  DISCUSSED_DIETARY_SALT: 'Discussed reducing dietary salt',
  DISCUSSED_HEALTHY_FOOD: 'Discussed healthy food choices',
  DISCUSSED_PHYSICAL_ACTIVITY: 'Discussed physical activity',
  DISCUSSED_TOBACCO_OR_ALCOHOL: 'Discussed tobacco or alcohol use',
  REQUESTED_NUTRITION_COUNSELING: 'Requested nutrition counseling',
  REQUESTED_CLINICIAN_REVIEW: 'Requested clinician review',
  NO_INTERVENTION_COMPLETED: 'No intervention completed',
};

export const HYPERTENSION_REVIEW_REASONS = [
  'SEVERELY_ELEVATED_BP',
  'LOW_BP_OR_DIZZINESS',
  'CONCERNING_SYMPTOMS',
  'MEDICATION_PROBLEM',
  'MISSED_MEDICATIONS',
  'POSSIBLE_CONTRIBUTING_SUBSTANCE',
  'PREGNANCY_OR_PLANNING',
  'OVERDUE_SCREENING',
  'OTHER',
  'ROUTINE_REVIEW_ONLY',
] as const;
export type HypertensionReviewReasonValue = (typeof HYPERTENSION_REVIEW_REASONS)[number];
export const HYPERTENSION_REVIEW_REASON_LABELS: Record<HypertensionReviewReasonValue, string> = {
  SEVERELY_ELEVATED_BP: 'Severely elevated BP',
  LOW_BP_OR_DIZZINESS: 'Low BP or dizziness',
  CONCERNING_SYMPTOMS: 'Concerning symptoms',
  MEDICATION_PROBLEM: 'Medication problem',
  MISSED_MEDICATIONS: 'Missed medications',
  POSSIBLE_CONTRIBUTING_SUBSTANCE: 'Possible contributing medication or substance',
  PREGNANCY_OR_PLANNING: 'Pregnancy or pregnancy planning',
  OVERDUE_SCREENING: 'Overdue screening',
  OTHER: 'Other',
  ROUTINE_REVIEW_ONLY: 'Routine review only',
};

export const HYPERTENSION_CLINICIAN_PLAN_ITEMS = [
  'CONTINUE_CURRENT_MANAGEMENT',
  'MEDICATION_REFILL',
  'RESTART_PREVIOUS_MEDICATION',
  'ADJUST_MEDICATION',
  'START_MEDICATION',
  'STOP_MEDICATION',
  'ORDER_LABORATORY_TESTING',
  'ARRANGE_HOME_BP_MONITORING',
  'NUTRITION_COUNSELING',
  'TOBACCO_OR_ALCOHOL_SUPPORT',
  'LINK_TO_COMMUNITY_HEALTH_WORKER',
  'REFER_TO_PARTNER_FACILITY',
  'URGENT_TRANSFER',
  'OTHER',
] as const;
export type HypertensionClinicianPlanItemValue = (typeof HYPERTENSION_CLINICIAN_PLAN_ITEMS)[number];
export const HYPERTENSION_CLINICIAN_PLAN_ITEM_LABELS: Record<
  HypertensionClinicianPlanItemValue,
  string
> = {
  CONTINUE_CURRENT_MANAGEMENT: 'Continue current management',
  MEDICATION_REFILL: 'Medication refill',
  RESTART_PREVIOUS_MEDICATION: 'Restart previously prescribed medication',
  ADJUST_MEDICATION: 'Adjust medication',
  START_MEDICATION: 'Start medication',
  STOP_MEDICATION: 'Stop medication',
  ORDER_LABORATORY_TESTING: 'Order laboratory testing',
  ARRANGE_HOME_BP_MONITORING: 'Arrange home BP monitoring',
  NUTRITION_COUNSELING: 'Nutrition counseling',
  TOBACCO_OR_ALCOHOL_SUPPORT: 'Tobacco or alcohol support',
  LINK_TO_COMMUNITY_HEALTH_WORKER: 'Link to community health worker',
  REFER_TO_PARTNER_FACILITY: 'Refer to partner health facility',
  URGENT_TRANSFER: 'Urgent transfer',
  OTHER: 'Other',
};

export const PHYSICAL_ACTIVITY_TYPES = [
  'WALKING',
  'WORK_RELATED',
  'HOUSEHOLD',
  'EXERCISE_OR_SPORTS',
  'OTHER',
  'NONE',
  'NOT_ASSESSED',
] as const;
export type PhysicalActivityTypeValue = (typeof PHYSICAL_ACTIVITY_TYPES)[number];
export const PHYSICAL_ACTIVITY_TYPE_LABELS: Record<PhysicalActivityTypeValue, string> = {
  WALKING: 'Walking',
  WORK_RELATED: 'Work-related',
  HOUSEHOLD: 'Household activity',
  EXERCISE_OR_SPORTS: 'Exercise or sports',
  OTHER: 'Other',
  NONE: 'None',
  NOT_ASSESSED: 'Not asked',
};

/* ------------------------------------------------------- 6. Nutrition and lifestyle (JSONB) */

/**
 * The lifestyle section is JSONB rather than columns because none of it decides anything.
 *
 * Salt habits, activity days and a food recall describe a patient; they do not escalate a visit,
 * gate a permission, or drive a reminder. Everything in the interview that *does* decide something
 * is a typed column, and the split is deliberate: a column is expensive to add and cheap to
 * query, which is the right trade for the fifteen fields a clinician acts on and the wrong one for
 * the forty they read.
 *
 * Bump `HYPERTENSION_LIFESTYLE_SCHEMA_VERSION` whenever a key's meaning changes. Adding a key is
 * not a meaning change; renaming or re-scaling one is.
 */
export const HYPERTENSION_LIFESTYLE_SCHEMA_VERSION = 1;

export interface HypertensionLifestylePayload {
  saltDuringCooking: FrequencyNeverSometimesUsuallyValue;
  saltAtTable: FrequencyNeverSometimesUsuallyValue;
  saltyProcessedFoods: NkwapaAnswerValue;
  fruitVegetables: FrequencyRarelySomeMostValue;
  sugarSweetenedDrinks: FrequencyNeverSometimesDailyValue;
  foodInsecurity: FrequencyNeverSometimesOftenValue;
  wantsNutritionCounseling: NkwapaAnswerValue;
  breakfastYesterday: string | null;
  lunchYesterday: string | null;
  dinnerYesterday: string | null;
  activeDaysPerWeek: number | null;
  typicalActivity: PhysicalActivityTypeValue;
  typicalActivityOther: string | null;
  wantsMoreActivity: NkwapaAnswerValue;
  tobaccoUse: TobaccoUseStatusValue;
  alcoholUse: AlcoholUseStatusValue;
  wantsToReduceOrStop: NkwapaAnswerValue;
}

const LIFESTYLE_KEYS: readonly (keyof HypertensionLifestylePayload)[] = [
  'saltDuringCooking',
  'saltAtTable',
  'saltyProcessedFoods',
  'fruitVegetables',
  'sugarSweetenedDrinks',
  'foodInsecurity',
  'wantsNutritionCounseling',
  'breakfastYesterday',
  'lunchYesterday',
  'dinnerYesterday',
  'activeDaysPerWeek',
  'typicalActivity',
  'typicalActivityOther',
  'wantsMoreActivity',
  'tobaccoUse',
  'alcoholUse',
  'wantsToReduceOrStop',
];

export function emptyHypertensionLifestyle(): HypertensionLifestylePayload {
  return {
    saltDuringCooking: 'NOT_ASSESSED',
    saltAtTable: 'NOT_ASSESSED',
    saltyProcessedFoods: 'NOT_ASSESSED',
    fruitVegetables: 'NOT_ASSESSED',
    sugarSweetenedDrinks: 'NOT_ASSESSED',
    foodInsecurity: 'NOT_ASSESSED',
    wantsNutritionCounseling: 'NOT_ASSESSED',
    breakfastYesterday: null,
    lunchYesterday: null,
    dinnerYesterday: null,
    activeDaysPerWeek: null,
    typicalActivity: 'NOT_ASSESSED',
    typicalActivityOther: null,
    wantsMoreActivity: 'NOT_ASSESSED',
    tobaccoUse: 'NOT_ASSESSED',
    alcoholUse: 'NOT_ASSESSED',
    wantsToReduceOrStop: 'NOT_ASSESSED',
  };
}

export function parseHypertensionLifestyle(
  value: unknown,
): ParsedPayload<HypertensionLifestylePayload> {
  const issues = new PayloadIssues();
  const source = readObject(value, 'lifestyle', issues);
  const schemaVersion = readSchemaVersion(source, HYPERTENSION_LIFESTYLE_SCHEMA_VERSION, issues);

  rejectUnknownKeys(source, [...LIFESTYLE_KEYS, 'schemaVersion'], 'lifestyle', issues);

  const at = 'lifestyle';
  const payload: HypertensionLifestylePayload = {
    saltDuringCooking: readEnum(
      source,
      'saltDuringCooking',
      FREQUENCY_NEVER_SOMETIMES_USUALLY,
      'NOT_ASSESSED',
      at,
      issues,
    ),
    saltAtTable: readEnum(
      source,
      'saltAtTable',
      FREQUENCY_NEVER_SOMETIMES_USUALLY,
      'NOT_ASSESSED',
      at,
      issues,
    ),
    saltyProcessedFoods: readEnum(
      source,
      'saltyProcessedFoods',
      NKWAPA_ANSWERS,
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
    sugarSweetenedDrinks: readEnum(
      source,
      'sugarSweetenedDrinks',
      FREQUENCY_NEVER_SOMETIMES_DAILY,
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
    activeDaysPerWeek: readInteger(source, 'activeDaysPerWeek', { min: 0, max: 7 }, at, issues),
    typicalActivity: readEnum(
      source,
      'typicalActivity',
      PHYSICAL_ACTIVITY_TYPES,
      'NOT_ASSESSED',
      at,
      issues,
    ),
    typicalActivityOther: readText(
      source,
      'typicalActivityOther',
      FREE_TEXT_MAX_LENGTH,
      at,
      issues,
    ),
    wantsMoreActivity: readEnum(
      source,
      'wantsMoreActivity',
      NKWAPA_ANSWERS,
      'NOT_ASSESSED',
      at,
      issues,
    ),
    tobaccoUse: readEnum(source, 'tobaccoUse', TOBACCO_USE_STATUSES, 'NOT_ASSESSED', at, issues),
    alcoholUse: readEnum(source, 'alcoholUse', ALCOHOL_USE_STATUSES, 'NOT_ASSESSED', at, issues),
    wantsToReduceOrStop: readEnum(
      source,
      'wantsToReduceOrStop',
      NKWAPA_ANSWERS,
      'NOT_ASSESSED',
      at,
      issues,
    ),
  };

  return { schemaVersion, payload, issues: issues.list };
}

/** Serialize for storage. The version rides with the data so a reader never has to guess. */
export function serializeHypertensionLifestyle(
  payload: HypertensionLifestylePayload,
): Record<string, unknown> {
  return { ...payload, schemaVersion: HYPERTENSION_LIFESTYLE_SCHEMA_VERSION };
}

/* ------------------------------------------------------------- Escalation derivation */

/**
 * Why the reasons are codes rather than sentences.
 *
 * These are stored on the record, read back by the note generator, and rendered in the form. A
 * stored sentence would freeze today's wording into every historical row and make a copy-edit a
 * data migration.
 */
export type HypertensionEscalationReason =
  | 'URGENT_SYMPTOM_CHEST_PAIN'
  | 'URGENT_SYMPTOM_SHORTNESS_OF_BREATH'
  | 'URGENT_SYMPTOM_CONFUSION'
  | 'URGENT_SYMPTOM_FAINTING'
  | 'URGENT_SYMPTOM_NEUROLOGIC'
  | 'SEVERELY_ELEVATED_BP'
  | 'HYPOTENSION';

export const HYPERTENSION_ESCALATION_REASON_LABELS: Record<HypertensionEscalationReason, string> = {
  URGENT_SYMPTOM_CHEST_PAIN: 'Chest pain',
  URGENT_SYMPTOM_SHORTNESS_OF_BREATH: 'Shortness of breath',
  URGENT_SYMPTOM_CONFUSION: 'Confusion',
  URGENT_SYMPTOM_FAINTING: 'Fainting',
  URGENT_SYMPTOM_NEUROLOGIC: 'New neurologic symptoms',
  SEVERELY_ELEVATED_BP: `Blood pressure at or above ${BP_ESCALATION_SYSTOLIC}/${BP_ESCALATION_DIASTOLIC} mmHg`,
  HYPOTENSION: 'Low blood pressure',
};

/**
 * Symptoms the clinical specification names as requiring immediate clinician review.
 *
 * Weakness or numbness and difficulty speaking both map to the single "new neurologic symptoms"
 * reason, because a volunteer distinguishing a stroke's presentations is not the point -- getting
 * a clinician to the patient is.
 */
const ESCALATING_SYMPTOMS: ReadonlyArray<[HypertensionSymptomValue, HypertensionEscalationReason]> =
  [
    ['CHEST_PAIN', 'URGENT_SYMPTOM_CHEST_PAIN'],
    ['SHORTNESS_OF_BREATH', 'URGENT_SYMPTOM_SHORTNESS_OF_BREATH'],
    ['CONFUSION', 'URGENT_SYMPTOM_CONFUSION'],
    ['FAINTING', 'URGENT_SYMPTOM_FAINTING'],
    ['NEW_WEAKNESS_OR_NUMBNESS', 'URGENT_SYMPTOM_NEUROLOGIC'],
    ['DIFFICULTY_SPEAKING', 'URGENT_SYMPTOM_NEUROLOGIC'],
  ];

export interface HypertensionEscalationInput {
  symptoms?: readonly HypertensionSymptomValue[] | null;
  systolicBp?: number | null;
  diastolicBp?: number | null;
  repeatSystolicBp?: number | null;
  repeatDiastolicBp?: number | null;
}

export interface HypertensionEscalation {
  urgentReviewRequired: boolean;
  reasons: HypertensionEscalationReason[];
}

/**
 * Decide whether this visit needs a clinician now, and say why.
 *
 * The repeat reading wins when one exists. That is the whole purpose of asking for it: a single
 * high reading is frequently an artefact of a rushed cuff or the walk into the room, and the
 * repeat is what separates that from a finding. Escalating on the initial reading after a calm
 * repeat came back normal would train volunteers to ignore the alert.
 *
 * Symptoms are evaluated independently of the reading. Chest pain at 118/76 is still chest pain.
 */
export function deriveHypertensionEscalation(
  input: HypertensionEscalationInput,
): HypertensionEscalation {
  const reasons: HypertensionEscalationReason[] = [];
  const seen = new Set<HypertensionEscalationReason>();

  const symptoms = new Set<HypertensionSymptomValue>(input.symptoms ?? []);
  for (const [symptom, reason] of ESCALATING_SYMPTOMS) {
    if (symptoms.has(symptom) && !seen.has(reason)) {
      seen.add(reason);
      reasons.push(reason);
    }
  }

  const hasRepeat =
    isFiniteNumber(input.repeatSystolicBp) || isFiniteNumber(input.repeatDiastolicBp);
  const systolic = hasRepeat ? input.repeatSystolicBp : input.systolicBp;
  const diastolic = hasRepeat ? input.repeatDiastolicBp : input.diastolicBp;

  if (isSeverelyElevated(systolic, diastolic) && !seen.has('SEVERELY_ELEVATED_BP')) {
    seen.add('SEVERELY_ELEVATED_BP');
    reasons.push('SEVERELY_ELEVATED_BP');
  }
  if (isHypotensive(systolic, diastolic) && !seen.has('HYPOTENSION')) {
    seen.add('HYPOTENSION');
    reasons.push('HYPOTENSION');
  }

  return { urgentReviewRequired: reasons.length > 0, reasons };
}

/**
 * The review reason a derived escalation preselects in the guided plan.
 *
 * Returned rather than written, so the form can show the volunteer what it selected and let them
 * unselect it. An escalation that silently edits the plan is one a volunteer cannot argue with.
 */
export function reviewReasonsForEscalation(
  escalation: HypertensionEscalation,
): HypertensionReviewReasonValue[] {
  const out = new Set<HypertensionReviewReasonValue>();
  for (const reason of escalation.reasons) {
    if (reason === 'SEVERELY_ELEVATED_BP') out.add('SEVERELY_ELEVATED_BP');
    else if (reason === 'HYPOTENSION') out.add('LOW_BP_OR_DIZZINESS');
    else out.add('CONCERNING_SYMPTOMS');
  }
  return [...out];
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/* ------------------------------------------------- 5. Substance details (JSONB) */

/**
 * Per-substance detail for the contributors section.
 *
 * The substances themselves are a typed column array, because "is the patient taking an NSAID"
 * is a question a clinician acts on. The name and frequency are JSONB, because they colour that
 * answer without changing it.
 *
 * The section deliberately records a possible contributor and stops there. The clinical
 * specification is explicit that it must flag a substance for clinician review "without telling
 * the student that the substance caused the hypertension", so nothing here derives causation and
 * nothing here escalates on its own.
 */
export const HYPERTENSION_SUBSTANCE_SCHEMA_VERSION = 1;

export interface SubstanceDetail {
  substance: BpAffectingSubstanceValue;
  name: string | null;
  frequency: SubstanceFrequencyValue;
}

export interface HypertensionSubstanceDetails {
  entries: SubstanceDetail[];
}

export function parseHypertensionSubstanceDetails(
  value: unknown,
): ParsedPayload<HypertensionSubstanceDetails> {
  const issues = new PayloadIssues();
  const source = readObject(value, 'substances', issues);
  const schemaVersion = readSchemaVersion(source, HYPERTENSION_SUBSTANCE_SCHEMA_VERSION, issues);

  rejectUnknownKeys(source, ['entries', 'schemaVersion'], 'substances', issues);

  const raw = source.entries;
  if (raw === undefined || raw === null) {
    return { schemaVersion, payload: { entries: [] }, issues: issues.list };
  }
  if (!Array.isArray(raw)) {
    issues.add('substances.entries', 'WRONG_TYPE', 'Expected a list of substances.');
    return { schemaVersion, payload: { entries: [] }, issues: issues.list };
  }

  /*
    One entry per substance.

    A duplicate would let two different frequencies be recorded for the same thing, and the note
    generator would have no principled way to choose between them.
  */
  const seen = new Set<BpAffectingSubstanceValue>();
  const entries: SubstanceDetail[] = [];

  raw.forEach((entry, index) => {
    const at = `substances.entries[${index}]`;
    const row = readObject(entry, at, issues);
    rejectUnknownKeys(row, ['substance', 'name', 'frequency'], at, issues);

    if (row.substance === undefined || row.substance === null) {
      issues.add(`${at}.substance`, 'WRONG_TYPE', 'Each entry must name a substance.');
      return;
    }

    const substance = readEnum(row, 'substance', BP_AFFECTING_SUBSTANCES, 'UNSURE', at, issues);
    if (seen.has(substance)) {
      issues.add(`${at}.substance`, 'UNKNOWN_VALUE', 'This substance is already listed.');
      return;
    }
    seen.add(substance);

    entries.push({
      substance,
      name: readText(row, 'name', FREE_TEXT_MAX_LENGTH, at, issues),
      frequency: readEnum(row, 'frequency', SUBSTANCE_FREQUENCIES, 'NOT_ASSESSED', at, issues),
    });
  });

  return { schemaVersion, payload: { entries }, issues: issues.list };
}

export function serializeHypertensionSubstanceDetails(
  payload: HypertensionSubstanceDetails,
): Record<string, unknown> {
  return { entries: payload.entries, schemaVersion: HYPERTENSION_SUBSTANCE_SCHEMA_VERSION };
}

/**
 * Which listed substances are worth a clinician's eye.
 *
 * `NONE` and `UNSURE` are answers to the question, not substances, so they are excluded. An empty
 * result means nothing to flag, not that the question went unasked -- that is what the column's
 * own `NOT_ASSESSED`-free empty array already says.
 */
export function contributingSubstancesForReview(
  substances: readonly BpAffectingSubstanceValue[] | null | undefined,
): BpAffectingSubstanceValue[] {
  return (substances ?? []).filter((substance) => substance !== 'NONE' && substance !== 'UNSURE');
}
