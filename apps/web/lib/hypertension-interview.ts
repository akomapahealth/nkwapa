/**
 * Form state for the guided hypertension interview.
 *
 * Everything here is a pure function over plain values, per MASTER.md section 10: the validator
 * and the payload builder are unit-testable without rendering anything, which matters because this
 * workspace has no component-render harness. Vocabularies, thresholds and JSONB contracts all come
 * from `@nkwapa/db`, so the form offers exactly the options the API accepts.
 *
 * Numeric fields are held as strings. A half-typed "14" has to round trip without becoming 14, and
 * an empty input has to stay distinguishable from a zero.
 */

import {
  BP_DIASTOLIC_MAX,
  BP_DIASTOLIC_MIN,
  BP_SYSTOLIC_MAX,
  BP_SYSTOLIC_MIN,
  emptyHypertensionLifestyle,
  parseHypertensionLifestyle,
  serializeHypertensionLifestyle,
  type HypertensionLifestylePayload,
} from '@nkwapa/db';

export type ClinicalFieldErrors = Record<string, string>;

export interface HypertensionInterviewValues {
  hypertensionStatus: string;
  yearDiagnosed: string;
  yearDiagnosedUnknown: boolean;
  mainConcern: string;
  mainConcernOther: string;
  usualCareFacility: string;
  usualCareFacilityStatus: string;

  repeatPerformed: string;
  repeatSystolicBp: string;
  repeatDiastolicBp: string;
  repeatPosition: string;
  repeatCuffSize: string;
  repeatPromptShown: boolean;
  homeMonitorStatus: string;
  homeCheckFrequency: string;
  homeSystolicAvg: string;
  homeDiastolicAvg: string;
  homeReadingsUnknown: boolean;
  homeReadingSource: string;

  currentSymptoms: string[];
  medicationReminderStrategies: string[];
  reminderStrategyOther: string;
  contributingSubstances: string[];

  lifestyle: HypertensionLifestylePayload;

  relevantConditions: string[];
  pregnantNow: string;
  planningPregnancy: string;

  kidneyFunctionTesting: string;
  urineProteinTesting: string;
  cholesterolTesting: string;
  ecgCompleted: string;
  statinUse: string;
  aspirinUse: string;

  volunteerActions: string[];
  clinicianReviewRequested: boolean;
  reviewReasons: string[];
  reviewReasonOther: string;

  classification: string;
  classificationOverridden: boolean;
  suspected: boolean;
  confirmed: boolean;
  notes: string;
}

export function emptyHypertensionInterview(): HypertensionInterviewValues {
  return {
    hypertensionStatus: 'NOT_ASSESSED',
    yearDiagnosed: '',
    yearDiagnosedUnknown: false,
    mainConcern: 'NOT_ASSESSED',
    mainConcernOther: '',
    usualCareFacility: '',
    usualCareFacilityStatus: 'NOT_ASSESSED',
    repeatPerformed: 'NOT_ASSESSED',
    repeatSystolicBp: '',
    repeatDiastolicBp: '',
    repeatPosition: '',
    repeatCuffSize: '',
    repeatPromptShown: false,
    homeMonitorStatus: 'NOT_ASSESSED',
    homeCheckFrequency: 'NOT_ASSESSED',
    homeSystolicAvg: '',
    homeDiastolicAvg: '',
    homeReadingsUnknown: false,
    homeReadingSource: 'NOT_ASSESSED',
    currentSymptoms: [],
    medicationReminderStrategies: [],
    reminderStrategyOther: '',
    contributingSubstances: [],
    lifestyle: emptyHypertensionLifestyle(),
    relevantConditions: [],
    pregnantNow: 'NOT_ASSESSED',
    planningPregnancy: 'NOT_ASSESSED',
    kidneyFunctionTesting: 'NOT_ASSESSED',
    urineProteinTesting: 'NOT_ASSESSED',
    cholesterolTesting: 'NOT_ASSESSED',
    ecgCompleted: 'NOT_ASSESSED',
    statinUse: 'NOT_ASSESSED',
    aspirinUse: 'NOT_ASSESSED',
    volunteerActions: [],
    clinicianReviewRequested: false,
    reviewReasons: [],
    reviewReasonOther: '',
    classification: 'UNKNOWN',
    classificationOverridden: false,
    suspected: false,
    confirmed: false,
    notes: '',
  };
}

/**
 * The on-screen order of every field the validator can name.
 *
 * `focusFirstInvalid` walks this list, not the error object: iterating the errors gives insertion
 * order, which is whatever order the validator happened to run in. On a form this long that is the
 * difference between landing on the first problem and landing on an arbitrary one three sections
 * away. A test asserts every key the validator can emit appears here.
 */
export const HYPERTENSION_FIELD_ORDER: readonly string[] = [
  'htn-status',
  'htn-year-diagnosed',
  'htn-main-concern',
  'htn-main-concern-other',
  'htn-usual-care-facility',
  'htn-repeat-performed',
  'htn-repeat-systolic',
  'htn-repeat-diastolic',
  'htn-repeat-position',
  'htn-repeat-cuff',
  'htn-home-monitor',
  'htn-home-frequency',
  'htn-home-systolic',
  'htn-home-diastolic',
  'htn-home-source',
  'htn-symptoms',
  'htn-reminder-strategies',
  'htn-reminder-other',
  'htn-substances',
  'htn-lifestyle-salt-cooking',
  'htn-lifestyle-salt-table',
  'htn-lifestyle-processed',
  'htn-lifestyle-fruit-veg',
  'htn-lifestyle-sugary-drinks',
  'htn-lifestyle-food-insecurity',
  'htn-lifestyle-counselling',
  'htn-lifestyle-breakfast',
  'htn-lifestyle-lunch',
  'htn-lifestyle-dinner',
  'htn-lifestyle-active-days',
  'htn-lifestyle-activity',
  'htn-lifestyle-activity-other',
  'htn-lifestyle-more-activity',
  'htn-lifestyle-alcohol',
  'htn-lifestyle-reduce',
  'htn-conditions',
  'htn-pregnant-now',
  'htn-planning-pregnancy',
  'htn-kidney-testing',
  'htn-urine-protein',
  'htn-cholesterol',
  'htn-ecg',
  'htn-statin',
  'htn-aspirin',
  'htn-volunteer-actions',
  'htn-review-reasons',
  'htn-review-reason-other',
  'htn-classification',
  'htn-notes',
];

/** Maps a JSONB issue path onto the form control that produced it. */
const LIFESTYLE_FIELD_IDS: Record<string, string> = {
  saltDuringCooking: 'htn-lifestyle-salt-cooking',
  saltAtTable: 'htn-lifestyle-salt-table',
  saltyProcessedFoods: 'htn-lifestyle-processed',
  fruitVegetables: 'htn-lifestyle-fruit-veg',
  sugarSweetenedDrinks: 'htn-lifestyle-sugary-drinks',
  foodInsecurity: 'htn-lifestyle-food-insecurity',
  wantsNutritionCounseling: 'htn-lifestyle-counselling',
  breakfastYesterday: 'htn-lifestyle-breakfast',
  lunchYesterday: 'htn-lifestyle-lunch',
  dinnerYesterday: 'htn-lifestyle-dinner',
  activeDaysPerWeek: 'htn-lifestyle-active-days',
  typicalActivity: 'htn-lifestyle-activity',
  typicalActivityOther: 'htn-lifestyle-activity-other',
  wantsMoreActivity: 'htn-lifestyle-more-activity',
  alcoholUse: 'htn-lifestyle-alcohol',
  wantsToReduceOrStop: 'htn-lifestyle-reduce',
};

const YEAR_DIAGNOSED_MIN = 1900;

function parseOptionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^-?\d+$/.test(trimmed)) return Number.NaN;
  return Number.parseInt(trimmed, 10);
}

function requireWholeNumberInRange(
  raw: string,
  bounds: { min: number; max: number },
  label: string,
): string | null {
  const parsed = parseOptionalInt(raw);
  if (parsed === null) return null;
  if (Number.isNaN(parsed)) return `${label} must be a whole number.`;
  if (parsed < bounds.min || parsed > bounds.max) {
    return `${label} must be between ${bounds.min} and ${bounds.max}.`;
  }
  return null;
}

/**
 * Validate the whole interview.
 *
 * Returns messages rather than throwing, so the caller can render them beside their fields and,
 * on a failed submit, focus the first one. Every rule here is also enforced by the API DTO and by
 * a database CHECK; this layer exists so a volunteer finds out before the round trip, not instead
 * of it.
 */
export function validateHypertensionInterview(
  values: HypertensionInterviewValues,
): ClinicalFieldErrors {
  const errors: ClinicalFieldErrors = {};

  const systolicMessage = requireWholeNumberInRange(
    values.repeatSystolicBp,
    { min: BP_SYSTOLIC_MIN, max: BP_SYSTOLIC_MAX },
    'Repeat systolic',
  );
  if (systolicMessage) errors['htn-repeat-systolic'] = systolicMessage;

  const diastolicMessage = requireWholeNumberInRange(
    values.repeatDiastolicBp,
    { min: BP_DIASTOLIC_MIN, max: BP_DIASTOLIC_MAX },
    'Repeat diastolic',
  );
  if (diastolicMessage) errors['htn-repeat-diastolic'] = diastolicMessage;

  const systolic = parseOptionalInt(values.repeatSystolicBp);
  const diastolic = parseOptionalInt(values.repeatDiastolicBp);

  /*
    A repeat is a reading, and half a reading is not one.

    The trend and the escalation both treat the repeat as a pair; a systolic entered without its
    diastolic would be silently ignored by both, which looks to a volunteer like the value simply
    did not save.
  */
  if (!systolicMessage && !diastolicMessage) {
    const hasSystolic = systolic !== null;
    const hasDiastolic = diastolic !== null;
    if (hasSystolic !== hasDiastolic) {
      const message = 'Enter both repeat readings, or neither.';
      errors['htn-repeat-systolic'] = message;
      errors['htn-repeat-diastolic'] = message;
    } else if (hasSystolic && hasDiastolic && systolic! <= diastolic!) {
      const message = 'Systolic must be higher than diastolic. Check the two are not swapped.';
      errors['htn-repeat-systolic'] = message;
      errors['htn-repeat-diastolic'] = message;
    }
  }

  const homeSystolicMessage = requireWholeNumberInRange(
    values.homeSystolicAvg,
    { min: BP_SYSTOLIC_MIN, max: BP_SYSTOLIC_MAX },
    'Usual home systolic',
  );
  if (homeSystolicMessage) errors['htn-home-systolic'] = homeSystolicMessage;

  const homeDiastolicMessage = requireWholeNumberInRange(
    values.homeDiastolicAvg,
    { min: BP_DIASTOLIC_MIN, max: BP_DIASTOLIC_MAX },
    'Usual home diastolic',
  );
  if (homeDiastolicMessage) errors['htn-home-diastolic'] = homeDiastolicMessage;

  const homeSystolic = parseOptionalInt(values.homeSystolicAvg);
  const homeDiastolic = parseOptionalInt(values.homeDiastolicAvg);
  if (
    !homeSystolicMessage &&
    !homeDiastolicMessage &&
    homeSystolic !== null &&
    homeDiastolic !== null &&
    homeSystolic <= homeDiastolic
  ) {
    const message = 'Systolic must be higher than diastolic.';
    errors['htn-home-systolic'] = message;
    errors['htn-home-diastolic'] = message;
  }

  const year = parseOptionalInt(values.yearDiagnosed);
  if (year !== null) {
    const thisYear = new Date().getUTCFullYear();
    if (Number.isNaN(year) || year < YEAR_DIAGNOSED_MIN || year > thisYear) {
      errors['htn-year-diagnosed'] = `Enter a year between ${YEAR_DIAGNOSED_MIN} and ${thisYear}.`;
    } else if (values.yearDiagnosedUnknown) {
      /*
        Both cannot be true, and the record has room to store both.

        Marking the year unknown while a year is typed leaves two answers with nothing saying
        which the note should render.
      */
      errors['htn-year-diagnosed'] =
        'Clear the year, or untick "year unknown". Only one of the two can be recorded.';
    }
  }

  if (values.mainConcern === 'OTHER' && !values.mainConcernOther.trim()) {
    errors['htn-main-concern-other'] = 'Describe the concern.';
  }
  if (values.reviewReasons.includes('OTHER') && !values.reviewReasonOther.trim()) {
    errors['htn-review-reason-other'] = 'Describe the reason for review.';
  }
  if (
    values.medicationReminderStrategies.includes('OTHER') &&
    !values.reminderStrategyOther.trim()
  ) {
    errors['htn-reminder-other'] = 'Describe how the patient remembers their medicines.';
  }
  if (values.usualCareFacilityStatus === 'SELECTED' && !values.usualCareFacility.trim()) {
    errors['htn-usual-care-facility'] = 'Name the facility, or choose None or Unknown.';
  }

  /*
    "None" is an answer, not an absence, and it cannot be true alongside a symptom.
  */
  if (values.currentSymptoms.includes('NONE') && values.currentSymptoms.length > 1) {
    errors['htn-symptoms'] = 'Unselect "None" to record a symptom.';
  }
  if (values.relevantConditions.includes('NONE_KNOWN') && values.relevantConditions.length > 1) {
    errors['htn-conditions'] = 'Unselect "None known" to record a condition.';
  }
  if (values.contributingSubstances.includes('NONE') && values.contributingSubstances.length > 1) {
    errors['htn-substances'] = 'Unselect "None" to record a substance.';
  }
  if (
    values.volunteerActions.includes('NO_INTERVENTION_COMPLETED') &&
    values.volunteerActions.length > 1
  ) {
    errors['htn-volunteer-actions'] = 'Unselect "No intervention completed" to record an action.';
  }
  if (values.reviewReasons.includes('ROUTINE_REVIEW_ONLY') && values.reviewReasons.length > 1) {
    errors['htn-review-reasons'] = 'Unselect "Routine review only" to record a specific reason.';
  }

  // The shared parser owns the JSONB contract; map its paths onto the controls that produced them.
  for (const issue of parseHypertensionLifestyle(serializeHypertensionLifestyle(values.lifestyle))
    .issues) {
    const key = issue.path.replace(/^lifestyle\./, '');
    const fieldId = LIFESTYLE_FIELD_IDS[key];
    if (fieldId) errors[fieldId] = issue.message;
  }

  return errors;
}

/** Build the API payload. Strings become numbers or null exactly once, here. */
export function toHypertensionPayload(
  values: HypertensionInterviewValues,
  collectedAt: string,
): Record<string, unknown> {
  const optional = (raw: string): number | null => {
    const parsed = parseOptionalInt(raw);
    return parsed === null || Number.isNaN(parsed) ? null : parsed;
  };
  const text = (raw: string): string | null => raw.trim() || null;

  return {
    hypertensionStatus: values.hypertensionStatus,
    yearDiagnosed: values.yearDiagnosedUnknown ? null : optional(values.yearDiagnosed),
    yearDiagnosedUnknown: values.yearDiagnosedUnknown,
    mainConcern: values.mainConcern,
    mainConcernOther: values.mainConcern === 'OTHER' ? text(values.mainConcernOther) : null,
    usualCareFacility:
      values.usualCareFacilityStatus === 'SELECTED' ? text(values.usualCareFacility) : null,
    usualCareFacilityStatus: values.usualCareFacilityStatus,
    repeatPerformed: values.repeatPerformed,
    repeatSystolicBp: optional(values.repeatSystolicBp),
    repeatDiastolicBp: optional(values.repeatDiastolicBp),
    repeatPosition: values.repeatPosition || null,
    repeatCuffSize: values.repeatCuffSize || null,
    repeatPromptShown: values.repeatPromptShown,
    homeMonitorStatus: values.homeMonitorStatus,
    homeCheckFrequency: values.homeCheckFrequency,
    homeSystolicAvg: values.homeReadingsUnknown ? null : optional(values.homeSystolicAvg),
    homeDiastolicAvg: values.homeReadingsUnknown ? null : optional(values.homeDiastolicAvg),
    homeReadingsUnknown: values.homeReadingsUnknown,
    homeReadingSource: values.homeReadingSource,
    currentSymptoms: values.currentSymptoms,
    medicationReminderStrategies: values.medicationReminderStrategies,
    reminderStrategyOther: values.medicationReminderStrategies.includes('OTHER')
      ? text(values.reminderStrategyOther)
      : null,
    contributingSubstances: values.contributingSubstances,
    lifestyle: serializeHypertensionLifestyle(values.lifestyle),
    relevantConditions: values.relevantConditions,
    pregnantNow: values.pregnantNow,
    planningPregnancy: values.planningPregnancy,
    kidneyFunctionTesting: values.kidneyFunctionTesting,
    urineProteinTesting: values.urineProteinTesting,
    cholesterolTesting: values.cholesterolTesting,
    ecgCompleted: values.ecgCompleted,
    statinUse: values.statinUse,
    aspirinUse: values.aspirinUse,
    volunteerActions: { selected: values.volunteerActions },
    clinicianReviewRequested: values.clinicianReviewRequested,
    reviewReasons: values.reviewReasons,
    reviewReasonOther: values.reviewReasons.includes('OTHER')
      ? text(values.reviewReasonOther)
      : null,
    classificationOverridden: values.classificationOverridden,
    ...(values.classificationOverridden ? { classification: values.classification } : {}),
    suspected: values.suspected,
    confirmed: values.confirmed,
    notes: text(values.notes),
    collectedAt,
  };
}

/** Rehydrate form values from a stored record, local or remote. */
export function fromHypertensionRecord(
  record: Record<string, unknown> | null | undefined,
): HypertensionInterviewValues {
  const base = emptyHypertensionInterview();
  if (!record) return base;

  const str = (value: unknown, fallback: string): string =>
    typeof value === 'string' && value ? value : fallback;
  const num = (value: unknown): string =>
    typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
  const bool = (value: unknown): boolean => value === true;
  const list = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

  return {
    ...base,
    hypertensionStatus: str(record.hypertensionStatus, base.hypertensionStatus),
    yearDiagnosed: num(record.yearDiagnosed),
    yearDiagnosedUnknown: bool(record.yearDiagnosedUnknown),
    mainConcern: str(record.mainConcern, base.mainConcern),
    mainConcernOther: str(record.mainConcernOther, ''),
    usualCareFacility: str(record.usualCareFacility, ''),
    usualCareFacilityStatus: str(record.usualCareFacilityStatus, base.usualCareFacilityStatus),
    repeatPerformed: str(record.repeatPerformed, base.repeatPerformed),
    repeatSystolicBp: num(record.repeatSystolicBp),
    repeatDiastolicBp: num(record.repeatDiastolicBp),
    repeatPosition: str(record.repeatPosition, ''),
    repeatCuffSize: str(record.repeatCuffSize, ''),
    repeatPromptShown: bool(record.repeatPromptShown),
    homeMonitorStatus: str(record.homeMonitorStatus, base.homeMonitorStatus),
    homeCheckFrequency: str(record.homeCheckFrequency, base.homeCheckFrequency),
    homeSystolicAvg: num(record.homeSystolicAvg),
    homeDiastolicAvg: num(record.homeDiastolicAvg),
    homeReadingsUnknown: bool(record.homeReadingsUnknown),
    homeReadingSource: str(record.homeReadingSource, base.homeReadingSource),
    currentSymptoms: list(record.currentSymptoms),
    medicationReminderStrategies: list(record.medicationReminderStrategies),
    reminderStrategyOther: str(record.reminderStrategyOther, ''),
    contributingSubstances: list(record.contributingSubstances),
    lifestyle: parseHypertensionLifestyle(record.lifestyle ?? null).payload,
    relevantConditions: list(record.relevantConditions),
    pregnantNow: str(record.pregnantNow, base.pregnantNow),
    planningPregnancy: str(record.planningPregnancy, base.planningPregnancy),
    kidneyFunctionTesting: str(record.kidneyFunctionTesting, base.kidneyFunctionTesting),
    urineProteinTesting: str(record.urineProteinTesting, base.urineProteinTesting),
    cholesterolTesting: str(record.cholesterolTesting, base.cholesterolTesting),
    ecgCompleted: str(record.ecgCompleted, base.ecgCompleted),
    statinUse: str(record.statinUse, base.statinUse),
    aspirinUse: str(record.aspirinUse, base.aspirinUse),
    volunteerActions: list(
      (record.volunteerActions as { selected?: unknown } | null)?.selected ?? [],
    ),
    clinicianReviewRequested: bool(record.clinicianReviewRequested),
    reviewReasons: list(record.reviewReasons),
    reviewReasonOther: str(record.reviewReasonOther, ''),
    classification: str(record.classification, base.classification),
    classificationOverridden: bool(record.classificationOverridden),
    suspected: bool(record.suspected),
    confirmed: bool(record.confirmed),
    notes: str(record.notes, ''),
  };
}
