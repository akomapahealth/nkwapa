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

/** The Nkwapa value for a dropdown cell; undefined for a blank cell, which means "not asked". */
export function label<T>(table: LabelTable<T>, column: string, raw: string): T | undefined {
  const value = raw.trim();
  if (value === '') return undefined;
  if (!Object.prototype.hasOwnProperty.call(table, value)) {
    throw new UnknownLabelError(column, value);
  }
  return table[value];
}

export const YES_NO: LabelTable<boolean> = { Yes: true, No: false };
export const TICK: LabelTable<true> = { Yes: true };

export const SEX: LabelTable<Sex> = {
  Female: 'FEMALE',
  Male: 'MALE',
  Other: 'OTHER',
  Unknown: 'UNKNOWN',
};

export const ID_TYPE: LabelTable<NationalIdType> = {
  'Ghana Card': 'NATIONAL_ID',
  'Voter ID': 'VOTER_ID',
  Passport: 'PASSPORT',
  Other: 'OTHER',
  None: 'NONE',
};

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

/** Validated only: the station queue of a finished day is not imported. */
export const STATION: LabelTable<string> = Object.fromEntries(
  [
    'Check-in',
    '1 Intake & history',
    '2 Blood pressure',
    '3 Glucose',
    '4 Body & vitals',
    '5 Eye',
    '6 Counselling & review',
    'Done',
  ].map((s) => [s, s]),
);

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
};

export const ACUITY: LabelTable<VisualAcuity> = Object.fromEntries(
  VISUAL_ACUITY_VALUES.map((v) => [v, v]),
);

export const VISION_CAUSE: LabelTable<VisionLossCause> = {
  'Refractive (glasses)': 'REFRACTIVE',
  'Pathological (doctor)': 'PATHOLOGICAL',
  Undetermined: 'UNDETERMINED',
};

export const FOLLOW_UP: LabelTable<FollowUpWindow> = {
  Today: 'TODAY',
  'Within 1 week': 'WITHIN_1_WEEK',
  'Within 1 month': 'WITHIN_1_MONTH',
  'Within 3 months': 'WITHIN_3_MONTHS',
  Other: 'OTHER',
};

export const URGENCY: LabelTable<ReferralUrgency> = {
  Routine: 'ROUTINE',
  Soon: 'SOON',
  Urgent: 'URGENT',
};
