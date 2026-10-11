import type {
  BloodPressureCuffSize,
  BloodPressureSite,
  CheckInStatus,
  DiabetesStatus,
  FollowUpWindow,
  GhanaRegion,
  GlucoseType,
  HypertensionStatus,
  NationalIdType,
  NkwapaAnswer,
  PatientPosition,
  ReadinessToQuit,
  ReferralUrgency,
  ScreeningAnswer,
  Sex,
  TobaccoUseStatus,
  VisionLossCause,
} from '@prisma/client';
import { VISUAL_ACUITY_VALUES, type VisualAcuity } from '@nkwapa/db';

/**
 * Every dropdown on the screening sheet, label → Nkwapa value.
 *
 * The labels are the `LISTS` in scripts/screening-fallback/build_screening_sheet.py, verbatim. A
 * label that is not here is refused, never guessed: a guessed clinical value is worse than a
 * rejected row someone fixes by hand.
 */
export class UnknownLabelError extends Error {
  constructor(
    readonly column: string,
    readonly value: string,
  ) {
    super(`"${value}" is not an allowed value for ${column}`);
    this.name = 'UnknownLabelError';
  }
}

type LabelTable<T> = Readonly<Record<string, T>>;

/** Case and spacing never change an answer: "Left  arm", "left arm" and "LEFT ARM" are one label. */
export const normalize = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();

/** The Nkwapa value for a dropdown cell; undefined for a blank cell, which means "not asked". */
export function label<T>(table: LabelTable<T>, column: string, raw: string): T | undefined {
  const value = normalize(raw);
  if (value === '') return undefined;
  const key = Object.keys(table).find((k) => normalize(k) === value);
  if (key === undefined) throw new UnknownLabelError(column, raw.trim());
  return table[key];
}

/**
 * A yes/no cell that volunteers often filled with words. Plain yes/no (and "normal" or "none",
 * which on this sheet mean no) map directly. "Yes, during the night" is yes, and the words are kept.
 * Anything else ("sometimes", "wears glasses") is not an answer: undefined, with the words kept.
 */
export function answer(raw: string): { value: boolean | undefined; note: string | null } {
  const text = normalize(raw);
  if (text === '') return { value: undefined, note: null };
  if (YES_WORDS.has(text)) return { value: true, note: null };
  if (NO_WORDS.has(text)) return { value: false, note: null };
  if (/^yes\b/.test(text)) return { value: true, note: raw.trim() };
  if (/^no\b/.test(text)) return { value: false, note: raw.trim() };
  return { value: undefined, note: raw.trim() };
}

/**
 * A tick box or yes/no cell that volunteers used to write what they found or discussed ("108/67"
 * under BP, "copper wiring present ou" under hypertensive signs). Writing something there means
 * yes, and the words are kept; only an explicit no/none means no.
 */
export function flag(raw: string): { value: boolean | undefined; note: string | null } {
  const text = normalize(raw);
  if (text === '') return { value: undefined, note: null };
  if (YES_WORDS.has(text)) return { value: true, note: null };
  if (NO_WORDS.has(text)) return { value: false, note: null };
  return { value: true, note: raw.trim() };
}

const YES_WORDS = new Set(['yes', 'y']);
const NO_WORDS = new Set(['no', 'n', 'none', 'normal', 'nil', 'n/a', 'na', 'nope']);

/**
 * Visual acuity as the eye team wrote it: a Snellen line, optionally with letters missed or gained
 * ("6/6-2" is the 6/6 line less two letters). Nkwapa stores whole lines, so the line is kept and
 * the exact notation goes to the notes. A line Nkwapa does not list (6/4) is not stored.
 */
export function acuity(raw: string): { value: VisualAcuity | null; note: string | null } {
  const text = raw.trim().replace(/\s+/g, '');
  if (text === '') return { value: null, note: null };
  const exact = (VISUAL_ACUITY_VALUES as readonly string[]).find(
    (v) => v.toLowerCase() === text.toLowerCase(),
  );
  if (exact) return { value: exact as VisualAcuity, note: null };
  const m = /^(6\/\d+(?:\.\d)?)[+-]\d$/.exec(text);
  const line = m && (VISUAL_ACUITY_VALUES as readonly string[]).find((v) => v === m[1]);
  return { value: (line as VisualAcuity | undefined) ?? null, note: raw.trim() };
}

export const YES_NO: LabelTable<boolean> = { Yes: true, No: false };
export const TICK: LabelTable<true> = { Yes: true };

export const SEX: LabelTable<Sex> = {
  Female: 'FEMALE',
  Male: 'MALE',
  Other: 'OTHER',
  Unknown: 'UNKNOWN',
  F: 'FEMALE',
  M: 'MALE',
};

export const ID_TYPE: LabelTable<NationalIdType> = {
  'Ghana Card': 'NATIONAL_ID',
  'Voter ID': 'VOTER_ID',
  Passport: 'PASSPORT',
  Other: 'OTHER',
  None: 'NONE',
  // Written by hand on the day.
  Ghana: 'NATIONAL_ID',
  'NHIS card': 'OTHER',
  NHIS: 'OTHER',
};

/** Consent is a yes the patient gave; only the spellings seen on the sheet are accepted. */
export const CONSENT: LabelTable<boolean> = { Yes: true, No: false, Yea: true };

export const REGION: LabelTable<GhanaRegion> = {
  Ahafo: 'AHAFO',
  Ashanti: 'ASHANTI',
  Bono: 'BONO',
  'Bono East': 'BONO_EAST',
  Central: 'CENTRAL',
  Eastern: 'EASTERN',
  'Greater Accra': 'GREATER_ACCRA',
  'North East': 'NORTH_EAST',
  Northern: 'NORTHERN',
  Oti: 'OTI',
  Savannah: 'SAVANNAH',
  'Upper East': 'UPPER_EAST',
  'Upper West': 'UPPER_WEST',
  Volta: 'VOLTA',
  Western: 'WESTERN',
  'Western North': 'WESTERN_NORTH',
};

/**
 * The day is over, so nothing imported may sit in a queue. A patient the sheet still shows as
 * waiting or in progress was simply never closed on the sheet; the original status is kept in the
 * check-in notes.
 */
export const CHECK_IN_STATUS: LabelTable<CheckInStatus> = {
  Waiting: 'COMPLETED',
  'In progress': 'COMPLETED',
  Completed: 'COMPLETED',
  'Left before finishing': 'CANCELLED',
};

export const HYPERTENSION_STATUS: LabelTable<HypertensionStatus> = {
  Yes: 'KNOWN_HYPERTENSION',
  No: 'NO_KNOWN_HYPERTENSION',
  Unsure: 'UNSURE',
};

export const DIABETES_STATUS: LabelTable<DiabetesStatus> = {
  Yes: 'KNOWN_DIABETES',
  No: 'NO_KNOWN_DIABETES',
  Unsure: 'UNSURE',
};

/** Kept as the sheet's words: Nkwapa records adherence per medicine, the sheet asked once. */
export const ADHERENCE: LabelTable<string> = {
  Always: 'Always takes medicines as prescribed',
  'Sometimes misses': 'Sometimes misses doses',
  'Often misses': 'Often misses doses',
  'Not on medication': 'Not on medication',
};

export const TOBACCO: LabelTable<TobaccoUseStatus> = {
  Never: 'NEVER',
  Former: 'FORMER',
  'Current - occasional': 'CURRENT_OCCASIONAL',
  'Current - daily': 'CURRENT_DAILY',
};

export const SCREENING_YES_NO: LabelTable<ScreeningAnswer> = { Yes: 'YES', No: 'NO' };

export const QUIT: LabelTable<ReadinessToQuit> = {
  'Not ready': 'NOT_READY',
  Considering: 'CONSIDERING',
  Ready: 'READY',
  'Not applicable': 'NOT_APPLICABLE',
};

/** Social history description; "None" is a real answer and is recorded. */
export const ALCOHOL: LabelTable<string> = {
  None: 'No alcohol',
  Occasional: 'Drinks alcohol occasionally',
  Weekly: 'Drinks alcohol weekly',
  Daily: 'Drinks alcohol daily',
};

export const PREGNANT: LabelTable<NkwapaAnswer> = {
  Yes: 'YES',
  No: 'NO',
  Unsure: 'UNSURE',
  'Not applicable': 'NO',
};

export const ARM: LabelTable<BloodPressureSite> = {
  'Left arm': 'LEFT_ARM',
  'Right arm': 'RIGHT_ARM',
  Other: 'OTHER',
};

export const POSITION: LabelTable<PatientPosition> = {
  Sitting: 'SITTING',
  Standing: 'STANDING',
  'Lying down': 'SUPINE',
};

export const CUFF: LabelTable<BloodPressureCuffSize> = {
  'Small adult': 'SMALL_ADULT',
  Adult: 'ADULT',
  'Large adult': 'LARGE_ADULT',
  Thigh: 'THIGH',
  Other: 'OTHER',
};

export const GLUCOSE_TYPE: LabelTable<GlucoseType> = {
  'Fasting (8h+)': 'FASTING',
  'Before meal': 'BEFORE_MEAL',
  '2h after meal': 'POST_PRANDIAL_2H',
  Random: 'RANDOM',
  Unknown: 'UNKNOWN',
  // The lab abbreviations the glucose station used.
  RBS: 'RANDOM',
  FBS: 'FASTING',
};

export const ACUITY: LabelTable<VisualAcuity> = Object.fromEntries(
  VISUAL_ACUITY_VALUES.map((v) => [v, v]),
);

export const VISION_CAUSE: LabelTable<VisionLossCause> = {
  'Refractive (glasses)': 'REFRACTIVE',
  'Pathological (doctor)': 'PATHOLOGICAL',
  Undetermined: 'UNDETERMINED',
  'Refractive error': 'REFRACTIVE',
};

export const FOLLOW_UP: LabelTable<FollowUpWindow> = {
  Today: 'TODAY',
  'Within 1 week': 'WITHIN_1_WEEK',
  'Within 1 month': 'WITHIN_1_MONTH',
  'Within 3 months': 'WITHIN_3_MONTHS',
  Other: 'OTHER',
  '1 week': 'WITHIN_1_WEEK',
  'In a week': 'WITHIN_1_WEEK',
  'A week': 'WITHIN_1_WEEK',
  '1 month': 'WITHIN_1_MONTH',
  '3 months': 'WITHIN_3_MONTHS',
};

export const URGENCY: LabelTable<ReferralUrgency> = {
  Routine: 'ROUTINE',
  Soon: 'SOON',
  Urgent: 'URGENT',
  'Very urgent': 'URGENT',
};
