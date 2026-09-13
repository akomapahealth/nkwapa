/**
 * Form state for the guided diabetes interview.
 *
 * Mirrors `hypertension-interview.ts`: pure functions over plain values, unit-testable without
 * rendering anything, with every vocabulary and threshold coming from `@nkwapa/db` so the form
 * offers exactly what the API accepts.
 *
 * Unlike hypertension there is nothing to read across from another record -- today's glucose and
 * its timing live on this row already.
 */

import {
  DIABETES_GLUCOSE_MAX_MG_DL,
  DIABETES_GLUCOSE_MIN_MG_DL,
  DIABETES_HBA1C_MAX_PERCENT,
  DIABETES_HBA1C_MIN_PERCENT,
  emptyDiabetesNutrition,
  parseDiabetesNutrition,
  serializeDiabetesNutrition,
  type DiabetesNutritionPayload,
} from '@nkwapa/db';

export type ClinicalFieldErrors = Record<string, string>;

export interface DiabetesInterviewValues {
  diabetesStatus: string;
  diabetesType: string;
  yearDiagnosed: string;
  yearDiagnosedUnknown: boolean;
  mainConcern: string;
  mainConcernOther: string;

  glucoseMgDl: string;
  glucoseType: string;
  hba1cStatus: string;
  hba1cPercent: string;
  hba1cMeasuredOn: string;
  homeGlucoseMonitoring: string;
  homeGlucoseLowMgDl: string;
  homeGlucoseHighMgDl: string;

  /** The past month. */
  symptoms: string[];
  /** Right now. A different question, and the only one that stops a visit. */
  urgentSymptoms: string[];

  nutrition: DiabetesNutritionPayload;

  phq2Interest: string;
  phq2Mood: string;
  distressOverwhelmed: string;
  distressFailing: string;

  eyeExam: string;
  footExam: string;
  kidneyTesting: string;
  bpCheckedToday: string;
  currentFootWound: string;

  volunteerActions: string[];
  clinicianReviewRequested: boolean;
  reviewReasons: string[];
  reviewReasonOther: string;

  notes: string;
}

export function emptyDiabetesInterview(): DiabetesInterviewValues {
  return {
    diabetesStatus: 'NOT_ASSESSED',
    diabetesType: 'NOT_ASSESSED',
    yearDiagnosed: '',
    yearDiagnosedUnknown: false,
    mainConcern: 'NOT_ASSESSED',
    mainConcernOther: '',
    glucoseMgDl: '',
    glucoseType: 'UNKNOWN',
    hba1cStatus: 'NOT_ASSESSED',
    hba1cPercent: '',
    hba1cMeasuredOn: '',
    homeGlucoseMonitoring: 'NOT_ASSESSED',
    homeGlucoseLowMgDl: '',
    homeGlucoseHighMgDl: '',
    symptoms: [],
    urgentSymptoms: [],
    nutrition: emptyDiabetesNutrition(),
    phq2Interest: 'NOT_ASSESSED',
    phq2Mood: 'NOT_ASSESSED',
    distressOverwhelmed: 'NOT_ASSESSED',
    distressFailing: 'NOT_ASSESSED',
    eyeExam: 'NOT_ASSESSED',
    footExam: 'NOT_ASSESSED',
    kidneyTesting: 'NOT_ASSESSED',
    bpCheckedToday: 'NOT_ASSESSED',
    currentFootWound: 'NOT_ASSESSED',
    volunteerActions: [],
    clinicianReviewRequested: false,
    reviewReasons: [],
    reviewReasonOther: '',
    notes: '',
  };
}

/** On-screen order, walked by `focusFirstInvalid`. See the note in hypertension-interview.ts. */
export const DIABETES_FIELD_ORDER: readonly string[] = [
  'dm-status',
  'dm-type',
  'dm-year-diagnosed',
  'dm-main-concern',
  'dm-main-concern-other',
  'dm-glucose',
  'dm-glucose-timing',
  'dm-hba1c-status',
  'dm-hba1c',
  'dm-hba1c-date',
  'dm-home-monitoring',
  'dm-home-low',
  'dm-home-high',
  'dm-symptoms',
  'dm-urgent-symptoms',
  'dm-nutrition-meals',
  'dm-nutrition-skips',
  'dm-nutrition-sugary-drinks',
  'dm-nutrition-adds-sugar',
  'dm-nutrition-fruit-veg',
  'dm-nutrition-food-insecurity',
  'dm-nutrition-counselling',
  'dm-nutrition-breakfast',
  'dm-nutrition-lunch',
  'dm-nutrition-dinner',
  'dm-phq2-interest',
  'dm-phq2-mood',
  'dm-distress-overwhelmed',
  'dm-distress-failing',
  'dm-eye-exam',
  'dm-foot-exam',
  'dm-kidney-testing',
  'dm-bp-checked',
  'dm-foot-wound',
  'dm-volunteer-actions',
  'dm-review-reasons',
  'dm-review-reason-other',
  'dm-notes',
];

const NUTRITION_FIELD_IDS: Record<string, string> = {
  mealsPerDay: 'dm-nutrition-meals',
  skipsMeals: 'dm-nutrition-skips',
  sugarSweetenedDrinks: 'dm-nutrition-sugary-drinks',
  addsSugar: 'dm-nutrition-adds-sugar',
  fruitVegetables: 'dm-nutrition-fruit-veg',
  foodInsecurity: 'dm-nutrition-food-insecurity',
  wantsNutritionCounseling: 'dm-nutrition-counselling',
  breakfastYesterday: 'dm-nutrition-breakfast',
  lunchYesterday: 'dm-nutrition-lunch',
  dinnerYesterday: 'dm-nutrition-dinner',
};

const YEAR_DIAGNOSED_MIN = 1900;

function parseOptionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^-?\d+$/.test(trimmed)) return Number.NaN;
  return Number.parseInt(trimmed, 10);
}

function parseOptionalFloat(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return Number.NaN;
  return Number.parseFloat(trimmed);
}

export function validateDiabetesInterview(values: DiabetesInterviewValues): ClinicalFieldErrors {
  const errors: ClinicalFieldErrors = {};

  const glucose = parseOptionalInt(values.glucoseMgDl);
  if (glucose !== null) {
    if (Number.isNaN(glucose)) {
      errors['dm-glucose'] = 'Glucose must be a whole number.';
    } else if (glucose < DIABETES_GLUCOSE_MIN_MG_DL || glucose > DIABETES_GLUCOSE_MAX_MG_DL) {
      errors['dm-glucose'] =
        `Glucose must be between ${DIABETES_GLUCOSE_MIN_MG_DL} and ${DIABETES_GLUCOSE_MAX_MG_DL} mg/dL.`;
    }
  }

  /*
    A reading without its timing cannot be interpreted.

    `09_DIABETES_SCREENING.md` is explicit that an unknown-context measurement is never classified,
    so a glucose recorded without one is a number nobody can act on. Better to ask now, while the
    patient is in front of the volunteer, than to store an uninterpretable value.
  */
  if (glucose !== null && !Number.isNaN(glucose) && values.glucoseType === 'UNKNOWN') {
    errors['dm-glucose-timing'] =
      'Record when the sample was taken. A glucose with no timing cannot be interpreted.';
  }

  const hba1c = parseOptionalFloat(values.hba1cPercent);
  if (hba1c !== null) {
    if (Number.isNaN(hba1c)) {
      errors['dm-hba1c'] = 'HbA1c must be a number.';
    } else if (hba1c < DIABETES_HBA1C_MIN_PERCENT || hba1c > DIABETES_HBA1C_MAX_PERCENT) {
      errors['dm-hba1c'] =
        `HbA1c must be between ${DIABETES_HBA1C_MIN_PERCENT} and ${DIABETES_HBA1C_MAX_PERCENT}%.`;
    }
  }

  /* A value and "never checked" cannot both be true, and the record has room to store both. */
  if (
    hba1c !== null &&
    !Number.isNaN(hba1c) &&
    (values.hba1cStatus === 'NEVER_CHECKED' || values.hba1cStatus === 'UNKNOWN')
  ) {
    errors['dm-hba1c-status'] =
      'Clear the HbA1c value, or change this answer. Only one of the two can be recorded.';
  }

  const low = parseOptionalInt(values.homeGlucoseLowMgDl);
  const high = parseOptionalInt(values.homeGlucoseHighMgDl);
  for (const [raw, key] of [
    [low, 'dm-home-low'],
    [high, 'dm-home-high'],
  ] as const) {
    if (raw === null) continue;
    if (Number.isNaN(raw)) {
      errors[key] = 'Enter a whole number.';
    } else if (raw < DIABETES_GLUCOSE_MIN_MG_DL || raw > DIABETES_GLUCOSE_MAX_MG_DL) {
      errors[key] =
        `Enter a value between ${DIABETES_GLUCOSE_MIN_MG_DL} and ${DIABETES_GLUCOSE_MAX_MG_DL} mg/dL.`;
    }
  }
  if (low !== null && high !== null && !Number.isNaN(low) && !Number.isNaN(high) && low > high) {
    const message = 'The lowest reading cannot be higher than the highest.';
    errors['dm-home-low'] = message;
    errors['dm-home-high'] = message;
  }

  const year = parseOptionalInt(values.yearDiagnosed);
  if (year !== null) {
    const thisYear = new Date().getUTCFullYear();
    if (Number.isNaN(year) || year < YEAR_DIAGNOSED_MIN || year > thisYear) {
      errors['dm-year-diagnosed'] = `Enter a year between ${YEAR_DIAGNOSED_MIN} and ${thisYear}.`;
    } else if (values.yearDiagnosedUnknown) {
      errors['dm-year-diagnosed'] =
        'Clear the year, or untick "year unknown". Only one of the two can be recorded.';
    }
  }

  if (values.mainConcern === 'OTHER' && !values.mainConcernOther.trim()) {
    errors['dm-main-concern-other'] = 'Describe the concern.';
  }
  if (values.reviewReasons.includes('OTHER') && !values.reviewReasonOther.trim()) {
    errors['dm-review-reason-other'] = 'Describe the reason for review.';
  }

  if (values.symptoms.includes('NONE') && values.symptoms.length > 1) {
    errors['dm-symptoms'] = 'Unselect "None" to record a symptom.';
  }
  if (values.urgentSymptoms.includes('NONE') && values.urgentSymptoms.length > 1) {
    errors['dm-urgent-symptoms'] = 'Unselect "None" to record a symptom.';
  }
  if (
    values.volunteerActions.includes('NO_INTERVENTION_COMPLETED') &&
    values.volunteerActions.length > 1
  ) {
    errors['dm-volunteer-actions'] = 'Unselect "No intervention completed" to record an action.';
  }
  if (values.reviewReasons.includes('ROUTINE_REVIEW_ONLY') && values.reviewReasons.length > 1) {
    errors['dm-review-reasons'] = 'Unselect "Routine review only" to record a specific reason.';
  }

  for (const issue of parseDiabetesNutrition(serializeDiabetesNutrition(values.nutrition)).issues) {
    const key = issue.path.replace(/^nutrition\./, '');
    const fieldId = NUTRITION_FIELD_IDS[key];
    if (fieldId) errors[fieldId] = issue.message;
  }

  return errors;
}

export function toDiabetesPayload(
  values: DiabetesInterviewValues,
  collectedAt: string,
): Record<string, unknown> {
  const int = (raw: string): number | null => {
    const parsed = parseOptionalInt(raw);
    return parsed === null || Number.isNaN(parsed) ? null : parsed;
  };
  const float = (raw: string): number | null => {
    const parsed = parseOptionalFloat(raw);
    return parsed === null || Number.isNaN(parsed) ? null : parsed;
  };
  const text = (raw: string): string | null => raw.trim() || null;
  const monitors = values.homeGlucoseMonitoring === 'YES';

  return {
    glucoseMgDl: int(values.glucoseMgDl),
    glucoseType: values.glucoseType,
    hba1cPercent: values.hba1cStatus === 'VALUE_KNOWN' ? float(values.hba1cPercent) : null,
    symptoms: values.symptoms,
    notes: text(values.notes),
    collectedAt,
    diabetesStatus: values.diabetesStatus,
    diabetesType: values.diabetesType,
    yearDiagnosed: values.yearDiagnosedUnknown ? null : int(values.yearDiagnosed),
    yearDiagnosedUnknown: values.yearDiagnosedUnknown,
    mainConcern: values.mainConcern,
    mainConcernOther: values.mainConcern === 'OTHER' ? text(values.mainConcernOther) : null,
    hba1cStatus: values.hba1cStatus,
    hba1cMeasuredOn:
      values.hba1cStatus === 'VALUE_KNOWN' && values.hba1cMeasuredOn
        ? new Date(values.hba1cMeasuredOn).toISOString()
        : null,
    homeGlucoseMonitoring: values.homeGlucoseMonitoring,
    /* Readings only mean something if the patient actually monitors. */
    homeGlucoseLowMgDl: monitors ? int(values.homeGlucoseLowMgDl) : null,
    homeGlucoseHighMgDl: monitors ? int(values.homeGlucoseHighMgDl) : null,
    urgentSymptoms: values.urgentSymptoms,
    nutrition: serializeDiabetesNutrition(values.nutrition),
    phq2Interest: values.phq2Interest,
    phq2Mood: values.phq2Mood,
    distressOverwhelmed: values.distressOverwhelmed,
    distressFailing: values.distressFailing,
    eyeExam: values.eyeExam,
    footExam: values.footExam,
    kidneyTesting: values.kidneyTesting,
    bpCheckedToday: values.bpCheckedToday,
    currentFootWound: values.currentFootWound,
    volunteerActions: { selected: values.volunteerActions },
    clinicianReviewRequested: values.clinicianReviewRequested,
    reviewReasons: values.reviewReasons,
    reviewReasonOther: values.reviewReasons.includes('OTHER')
      ? text(values.reviewReasonOther)
      : null,
  };
}

export function fromDiabetesRecord(
  record: Record<string, unknown> | null | undefined,
): DiabetesInterviewValues {
  const base = emptyDiabetesInterview();
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
    diabetesStatus: str(record.diabetesStatus, base.diabetesStatus),
    diabetesType: str(record.diabetesType, base.diabetesType),
    yearDiagnosed: num(record.yearDiagnosed),
    yearDiagnosedUnknown: bool(record.yearDiagnosedUnknown),
    mainConcern: str(record.mainConcern, base.mainConcern),
    mainConcernOther: str(record.mainConcernOther, ''),
    glucoseMgDl: num(record.glucoseMgDl),
    glucoseType: str(record.glucoseType, base.glucoseType),
    hba1cStatus: str(record.hba1cStatus, base.hba1cStatus),
    hba1cPercent: num(record.hba1cPercent),
    hba1cMeasuredOn:
      typeof record.hba1cMeasuredOn === 'string' ? record.hba1cMeasuredOn.slice(0, 10) : '',
    homeGlucoseMonitoring: str(record.homeGlucoseMonitoring, base.homeGlucoseMonitoring),
    homeGlucoseLowMgDl: num(record.homeGlucoseLowMgDl),
    homeGlucoseHighMgDl: num(record.homeGlucoseHighMgDl),
    symptoms: list(record.symptoms),
    urgentSymptoms: list(record.urgentSymptoms),
    nutrition: parseDiabetesNutrition(record.nutrition ?? null).payload,
    phq2Interest: str(record.phq2Interest, base.phq2Interest),
    phq2Mood: str(record.phq2Mood, base.phq2Mood),
    distressOverwhelmed: str(record.distressOverwhelmed, base.distressOverwhelmed),
    distressFailing: str(record.distressFailing, base.distressFailing),
    eyeExam: str(record.eyeExam, base.eyeExam),
    footExam: str(record.footExam, base.footExam),
    kidneyTesting: str(record.kidneyTesting, base.kidneyTesting),
    bpCheckedToday: str(record.bpCheckedToday, base.bpCheckedToday),
    currentFootWound: str(record.currentFootWound, base.currentFootWound),
    volunteerActions: list(
      (record.volunteerActions as { selected?: unknown } | null)?.selected ?? [],
    ),
    clinicianReviewRequested: bool(record.clinicianReviewRequested),
    reviewReasons: list(record.reviewReasons),
    reviewReasonOther: str(record.reviewReasonOther, ''),
    notes: str(record.notes, ''),
  };
}
