/**
 * Follow-up stratification: who is followed up, how urgently and how often (#333, #335).
 *
 * Source: Akomapa Follow-Up Criteria, 4 Oct 2026, adapted from WHO PEN and HEARTS. The document is
 * held by the programme team; the rules are reproduced in issues #333 and #335 and the open
 * decisions in #334. If this file and those issues disagree, the issues win.
 *
 * NOT SIGNED OFF. Nothing here may go live until a supervising clinician approves it (#334).
 * When they do, record the date here and in `DEFAULT_FOLLOW_UP_CONFIG.version`.
 *
 * Every patient passes three checks in order and stops at the first that catches them:
 *   1. Danger signs -> URGENT.
 *   2. Automatically high risk -> HIGH.
 *   3. The WHO CVD risk chart (Western Sub-Saharan Africa) -> HIGH, MODERATE, LOW_MODERATE or LOW.
 * A patient on treatment and at target is STABLE; see `assessFollowUp` for exactly where that sits.
 *
 * Pure functions only: no Prisma, Nest or DOM, so the API and the browser run the same rules.
 * Every number and every open decision lives in `DEFAULT_FOLLOW_UP_CONFIG`, so a decision is a
 * config change, not a code change. Missing data never produces a guess: a patient who cannot be
 * scored is `NOT_TIERED` with the missing items listed, and danger signs are always checked on
 * whatever is present.
 */

import { instantToWallClock } from './clinic-day';
import { type DiabetesGlucoseContext, DM_HYPOGLYCEMIA_MG_DL } from './diabetes-thresholds';
import { type DiabetesUrgentSymptomValue } from './diabetes-interview';
import {
  type CardiometabolicConditionValue,
  type HypertensionSymptomValue,
} from './hypertension-interview';
import { MG_DL_PER_MMOL_L } from './measurement-units';
import {
  CHART_BMI_EDGES,
  CHART_CHOLESTEROL_EDGES,
  CHART_MAX_AGE,
  CHART_MIN_AGE,
  LAB_CHART_WITH_DIABETES,
  LAB_CHART_WITHOUT_DIABETES,
  NON_LAB_CHART,
  chartCell,
} from './who-cvd-risk-chart-wssa';

/* ------------------------------------------------------------------------------- Codes */

export const FOLLOW_UP_TIERS = [
  'URGENT',
  'HIGH',
  'MODERATE',
  'LOW_MODERATE',
  'STABLE',
  'LOW',
  'NOT_TIERED',
] as const;
export type FollowUpTier = (typeof FOLLOW_UP_TIERS)[number];
export const FOLLOW_UP_TIER_LABELS: Record<FollowUpTier, string> = {
  URGENT: 'Urgent',
  HIGH: 'High',
  MODERATE: 'Moderate',
  LOW_MODERATE: 'Low-moderate',
  STABLE: 'Stable',
  LOW: 'Low',
  NOT_TIERED: 'Not yet tiered',
};

export const FOLLOW_UP_CAUGHT_BY = [
  'DANGER_SIGNS',
  'AUTO_HIGH',
  'RISK_CHART',
  'CONTROL_ONLY',
] as const;
export type FollowUpCaughtBy = (typeof FOLLOW_UP_CAUGHT_BY)[number];
export const FOLLOW_UP_CAUGHT_BY_LABELS: Record<FollowUpCaughtBy, string> = {
  DANGER_SIGNS: 'Danger signs',
  AUTO_HIGH: 'Automatically high risk',
  RISK_CHART: 'WHO heart risk chart',
  CONTROL_ONLY: 'Blood pressure and sugar control',
};

/** Every rule that can fire, in the order they are checked. */
export const FOLLOW_UP_REASONS = [
  // Check 1: danger signs
  'DANGER_BP_WITH_SYMPTOMS',
  'DANGER_GLUCOSE_VERY_HIGH',
  'DANGER_GLUCOSE_HIGH_WITH_KETONES',
  'DANGER_LOW_GLUCOSE_WITH_SYMPTOMS',
  'DANGER_PREGNANT_RAISED_GLUCOSE',
  // Check 2: automatically high, from something happening now
  'SEVERE_BP_ASYMPTOMATIC',
  'BP_PERSISTENTLY_HIGH',
  'UNTREATED_HYPERTENSION',
  'UNTREATED_DIABETES',
  'MEDICATION_CHANGED_RECENTLY',
  'HIGH_CHOLESTEROL',
  'ABOVE_TARGET_ON_TREATMENT',
  'STEP_DOWN_PENDING',
  'MISSED_CONTACT',
  'NEW_SYMPTOMS',
  // Check 2: automatically high, from a known condition
  'KNOWN_DIABETES',
  'KNOWN_HEART_STROKE_OR_KIDNEY_DISEASE',
  // Stable
  'ON_TREATMENT_AT_TARGET',
  // Check 3
  'CHART_RISK',
  // Outside the chart's ages
  'OUTSIDE_CHART_AGES_ABOVE_TARGET',
  'OUTSIDE_CHART_AGES_NORMAL',
] as const;
export type FollowUpReason = (typeof FOLLOW_UP_REASONS)[number];
export const FOLLOW_UP_REASON_LABELS: Record<FollowUpReason, string> = {
  DANGER_BP_WITH_SYMPTOMS: 'Very high blood pressure with a danger symptom',
  DANGER_GLUCOSE_VERY_HIGH: 'Very high blood sugar',
  DANGER_GLUCOSE_HIGH_WITH_KETONES: 'High blood sugar with ketones and symptoms',
  DANGER_LOW_GLUCOSE_WITH_SYMPTOMS: 'Low blood sugar with symptoms',
  DANGER_PREGNANT_RAISED_GLUCOSE: 'Pregnant with raised blood sugar',
  SEVERE_BP_ASYMPTOMATIC: 'Very high blood pressure, no danger symptoms',
  BP_PERSISTENTLY_HIGH: 'High blood pressure on two different days',
  UNTREATED_HYPERTENSION: 'Has high blood pressure but is not on medicine for it',
  UNTREATED_DIABETES: 'Has diabetes but is not on medicine for it',
  MEDICATION_CHANGED_RECENTLY: 'Medicine started or changed recently',
  HIGH_CHOLESTEROL: 'Very high cholesterol',
  ABOVE_TARGET_ON_TREATMENT: 'On medicine but above target',
  STEP_DOWN_PENDING: 'Back at target, but not yet on enough readings in a row',
  MISSED_CONTACT: 'Missed a follow-up contact',
  NEW_SYMPTOMS: 'New symptoms reported',
  KNOWN_DIABETES: 'Known diabetes',
  KNOWN_HEART_STROKE_OR_KIDNEY_DISEASE: 'Known heart disease, stroke or kidney disease',
  ON_TREATMENT_AT_TARGET: 'On medicine and at target',
  CHART_RISK: '10-year heart attack or stroke risk from the WHO chart',
  OUTSIDE_CHART_AGES_ABOVE_TARGET: 'Under 40 or over 74, and above target',
  OUTSIDE_CHART_AGES_NORMAL: 'Under 40 or over 74, with normal readings',
};

export const FOLLOW_UP_ACTIONS = [
  'SAME_DAY_REFERRAL',
  'CALL_TO_CONFIRM_CARE',
  'REPEAT_READING_TODAY',
  'PROMPT_CLINICAL_ASSESSMENT',
  'PROMPT_TELE_CONTACT',
  'CONFIRM_ON_ANOTHER_DAY',
  'RECORD_MISSING_DATA',
] as const;
export type FollowUpAction = (typeof FOLLOW_UP_ACTIONS)[number];
export const FOLLOW_UP_ACTION_LABELS: Record<FollowUpAction, string> = {
  SAME_DAY_REFERRAL: 'Refer today',
  CALL_TO_CONFIRM_CARE: 'Call to check they reached care',
  REPEAT_READING_TODAY: 'Repeat the blood pressure now',
  PROMPT_CLINICAL_ASSESSMENT: 'Still very high on repeat: refer for a prompt clinical assessment',
  PROMPT_TELE_CONTACT: 'Phone the patient soon to check on them',
  CONFIRM_ON_ANOTHER_DAY: 'Repeat the reading on another day to confirm',
  RECORD_MISSING_DATA: 'Record the missing items so the patient can be tiered',
};

export const FOLLOW_UP_MISSING_INPUTS = [
  'ageYears',
  'sex',
  'systolicBp',
  'bmi',
  'smoker',
  'totalCholesterol',
  'conditions',
  'onTreatment',
  'recentBpReading',
  'recentGlucoseOrHba1c',
  'frailOrElderly',
] as const;
export type FollowUpMissingInput = (typeof FOLLOW_UP_MISSING_INPUTS)[number];
export const FOLLOW_UP_MISSING_INPUT_LABELS: Record<FollowUpMissingInput, string> = {
  ageYears: 'Age',
  sex: 'Sex (male or female)',
  systolicBp: 'A measured blood pressure',
  bmi: 'Weight and height (BMI)',
  smoker: 'Whether they smoke',
  totalCholesterol: 'Total cholesterol',
  conditions: 'Known conditions (diabetes, heart, stroke, kidney)',
  onTreatment: 'Whether they take medicine for their condition',
  recentBpReading: 'A measured blood pressure in the last 3 months',
  recentGlucoseOrHba1c: 'A fasting sugar or HbA1c in the last 3 months',
  frailOrElderly: 'Whether they are frail or elderly',
};

export const FOLLOW_UP_CHARTS = ['LAB', 'NON_LAB'] as const;
export type FollowUpChart = (typeof FOLLOW_UP_CHARTS)[number];
export const FOLLOW_UP_CHART_LABELS: Record<FollowUpChart, string> = {
  LAB: 'Laboratory chart (with cholesterol)',
  NON_LAB: 'Non-laboratory chart (with BMI)',
};

export const FOLLOW_UP_CONTROL_STATUSES = [
  'CONTROLLED',
  'UNCONTROLLED',
  'NO_RECENT_READING',
  'NOT_ASSESSED',
] as const;
export type FollowUpControlStatus = (typeof FOLLOW_UP_CONTROL_STATUSES)[number];
export const FOLLOW_UP_CONTROL_STATUS_LABELS: Record<FollowUpControlStatus, string> = {
  CONTROLLED: 'Controlled',
  UNCONTROLLED: 'Not controlled',
  NO_RECENT_READING: 'No reading in 3 months',
  NOT_ASSESSED: 'Cannot tell without age',
};

export const FOLLOW_UP_SCREENING_GROUPS = [
  'DANGER_SIGNS',
  'NEW_RAISED_READING',
  'KNOWN_UNTREATED',
  'KNOWN_TREATED',
  'NORMAL_WITH_RISK_FACTORS',
] as const;
export type FollowUpScreeningGroup = (typeof FOLLOW_UP_SCREENING_GROUPS)[number];
export const FOLLOW_UP_SCREENING_GROUP_LABELS: Record<FollowUpScreeningGroup, string> = {
  DANGER_SIGNS: 'Danger signs',
  NEW_RAISED_READING: 'New raised reading, not yet diagnosed',
  KNOWN_UNTREATED: 'Known condition, not on medicine',
  KNOWN_TREATED: 'Known condition, on medicine',
  NORMAL_WITH_RISK_FACTORS: 'Normal readings with risk factors',
};

export const FOLLOW_UP_MOVEMENT_DIRECTIONS = ['UP', 'DOWN', 'SAME', 'NEW'] as const;
export type FollowUpMovementDirection = (typeof FOLLOW_UP_MOVEMENT_DIRECTIONS)[number];
export const FOLLOW_UP_MOVEMENT_DIRECTION_LABELS: Record<FollowUpMovementDirection, string> = {
  UP: 'Moved up',
  DOWN: 'Moved down',
  SAME: 'No change',
  NEW: 'First tier',
};

export const FOLLOW_UP_MOVEMENT_TRIGGERS = [
  'DANGER_SIGN',
  'READING_ABOVE_TARGET',
  'MISSED_CONTACT',
  'MEDICATION_CHANGE',
  'NEW_SYMPTOMS',
  'NEW_DIAGNOSIS',
  'REACHED_TARGET',
  'RISK_CHANGED',
] as const;
export type FollowUpMovementTrigger = (typeof FOLLOW_UP_MOVEMENT_TRIGGERS)[number];
export const FOLLOW_UP_MOVEMENT_TRIGGER_LABELS: Record<FollowUpMovementTrigger, string> = {
  DANGER_SIGN: 'Danger sign',
  READING_ABOVE_TARGET: 'Reading above target',
  MISSED_CONTACT: 'Missed contact',
  MEDICATION_CHANGE: 'Medicine started or changed',
  NEW_SYMPTOMS: 'New symptoms',
  NEW_DIAGNOSIS: 'New diagnosis',
  REACHED_TARGET: 'Reached target',
  RISK_CHANGED: 'Heart risk changed',
};

export const FOLLOW_UP_TELE_CHANNELS = ['PHONE_CALL', 'SMS', 'WHATSAPP', 'VIDEO'] as const;
export type FollowUpTeleChannel = (typeof FOLLOW_UP_TELE_CHANNELS)[number];
export const FOLLOW_UP_TELE_CHANNEL_LABELS: Record<FollowUpTeleChannel, string> = {
  PHONE_CALL: 'Phone call',
  SMS: 'SMS',
  WHATSAPP: 'WhatsApp',
  VIDEO: 'Video call',
};

/* ------------------------------------------------------------------------------ Config */

export interface BpLimit {
  systolic: number;
  diastolic: number;
}

/** How a tier is seen in person and contacted in between. Intervals in months. */
export interface TierSchedule {
  /** In-person interval while above target (or always, when there is no at-target interval). */
  inPersonMonths: number;
  /** In-person interval once at target; null when it does not change. */
  inPersonMonthsAtTarget: number | null;
  /**
   * BETWEEN_VISITS: one tele contact `teleMonthsAfterVisit` after each visit, or halfway when
   * that is null. BEFORE_VISIT: a reminder `reminderLeadDays` before each visit.
   */
  tele: 'BETWEEN_VISITS' | 'BEFORE_VISIT';
  teleMonthsAfterVisit: number | null;
}

export interface FollowUpConfig {
  /** Bump on every change. Stored with each assessment so a tier can be traced to its rules. */
  version: string;
  /** Who approved these rules and when (#334). Null until signed off. */
  signedOff: { by: string; role: string; date: string } | null;

  /* #334 decisions, each defaulting to the criteria's proposed value. */
  /** #334.1. Applies to ages `under65TargetAges`. WHO 140/90; Ghana 2024 130/80. */
  bpTargetUnder65: BpLimit;
  /** #334.2. Fasting sugar at or above this, and below the diabetes line, is prediabetes. */
  prediabetesFastingMmol: number;
  /** #334.3. On-target readings in a row before leaving the High rhythm. */
  stepDownOnTargetReadings: number;
  /** #334.4. Whether a home or pharmacy reading reported by phone counts toward control. */
  selfReportedCountsTowardControl: boolean;
  /** #334.5. How tele contacts are made. */
  teleChannels: readonly FollowUpTeleChannel[];
  /** #334.6. Days after a due date before a contact counts as missed. Placeholder. */
  missedContactGraceDays: number;
  /** #334.7. Days within which a new raised reading is repeated. Placeholder. */
  confirmationIntervalDays: number;
  /** #334.8. Use the laboratory chart when a total cholesterol is recorded. */
  laboratoryChartEnabled: boolean;
  /** #334.9. Days within which a repeat >=180/110 without symptoms is assessed. */
  asymptomaticSevereAssessmentDays: number;
  /**
   * #335 Stable precedence. True: a patient with known diabetes or heart, stroke or kidney
   * disease who is on treatment and at target is STABLE, as #335 states. False: they stay HIGH.
   */
  stableOverridesKnownDisease: boolean;

  /* Check 1: danger signs. */
  /** Systolic OR diastolic at or above (the higher row applies). */
  dangerBp: BpLimit;
  dangerBpSymptoms: readonly HypertensionSymptomValue[];
  /** A sign counts as current for this many days after it was recorded. Placeholder (#334). */
  dangerSignWindowDays: number;
  /** Above this, in any timing, is a danger sign. */
  dangerGlucoseMmol: number;
  /** Above this with ketones and symptoms is a danger sign. */
  ketoneGlucoseMmol: number;
  ketoneSymptoms: readonly DiabetesUrgentSymptomValue[];
  /** At or below this, with symptoms, is a danger sign. The screening line, in mmol/L. */
  hypoglycaemiaMmol: number;
  /** Diabetes in pregnancy (WHO 2013): fasting or before a meal. Placeholder (#334). */
  pregnancyRaisedFastingMmol: number;
  /** Diabetes in pregnancy (WHO 2013): any other timing. Placeholder (#334). */
  pregnancyRaisedRandomMmol: number;

  /* Check 2: automatically high. */
  /** Both of the two most recent measured readings, on different days, at or above. */
  persistentBp: BpLimit;
  medicationChangeWindowMonths: number;
  highCholesterolMmol: number;
  /** Conditions that count as known heart, stroke or kidney disease. */
  knownDiseaseConditions: readonly CardiometabolicConditionValue[];

  /* Check 3: the WHO chart. */
  /** Lower edge of each tier, in percent 10-year risk. Below `lowModerate` is LOW. */
  chartRiskTiers: { high: number; moderate: number; lowModerate: number };
  /** Fasting sugar at or above this counts as diabetes on the laboratory chart (WHO). */
  chartDiabetesFastingMmol: number;

  /* Targets. */
  /** Hypertension only, aged 65 or over (and under 18). */
  bpTarget: BpLimit;
  under65TargetAges: { min: number; max: number };
  /**
   * With diabetes, heart, stroke or kidney disease. The criteria give systolic <130 only; the
   * general diastolic limit still applies, so no one is at target with a diastolic of 90 or more.
   */
  bpTargetWithDisease: BpLimit;
  /** Fasting sugar on target from min to max inclusive. */
  fastingGlucoseTargetMmol: { min: number; max: number };
  /** HbA1c below this is on target. */
  hba1cTargetPercent: number;
  hba1cTargetFrailPercent: number;

  /* Control (HEARTS360). */
  controlWindowMonths: number;
  underCareWindowMonths: number;

  /* Screening groups. */
  /** At or above this, with no diagnosis, is a new raised reading. The criteria's 140/90 band. */
  raisedBp: BpLimit;
  /** Diabetes lines, matching the approved screening lines in `diabetes-thresholds.ts`. */
  diabetesFastingMmol: number;
  diabetesRandomMmol: number;
  riskFactorMinAge: number;
  obesityBmi: number;

  /* Contact schedule. */
  schedules: Record<Exclude<FollowUpTier, 'URGENT' | 'NOT_TIERED'>, TierSchedule>;
  /** In person no more often than this. */
  minInPersonIntervalMonths: number;
  reminderLeadDays: number;
  urgentCallWithinHours: number;

  /*
    Flag notifications (#337). They change who is told and when, never a tier, so changing them
    needs no `version` bump (a bump rewrites every patient's history row on the next sweep).
  */
  /** Minutes an urgent flag may go unacknowledged before managers and directors are told. */
  urgentEscalationMinutes: number;
  /** Months a patient may stay High before the clinic's doctors are asked to review them. */
  notImprovingMonths: number;
  /**
   * Hours an urgent screening finding the engine does not call Urgent (chest pain alone, low blood
   * pressure) stays open to take. A same-day finding: after that it is history, not a call to act.
   */
  screeningFlagOpenHours: number;
  /** When the directors' daily counts arrive, as a cron hour and minute in the clinic's zone. */
  dailyDigestCron: string;
}

/**
 * The rules as written, with every open decision at its proposed default. Changing a decision
 * means changing a value here (and `version`), never the functions below.
 */
export const DEFAULT_FOLLOW_UP_CONFIG: FollowUpConfig = {
  version: '2026-11-16-draft',
  signedOff: null,

  bpTargetUnder65: { systolic: 140, diastolic: 90 },
  prediabetesFastingMmol: 5.6,
  stepDownOnTargetReadings: 2,
  selfReportedCountsTowardControl: false,
  teleChannels: ['PHONE_CALL'],
  missedContactGraceDays: 7,
  confirmationIntervalDays: 14,
  laboratoryChartEnabled: false,
  asymptomaticSevereAssessmentDays: 7,
  stableOverridesKnownDisease: true,

  dangerBp: { systolic: 180, diastolic: 110 },
  dangerBpSymptoms: [
    'CHEST_PAIN',
    'SEVERE_HEADACHE',
    'CONFUSION',
    'NEW_WEAKNESS_OR_NUMBNESS',
    'DIFFICULTY_SPEAKING',
    'SHORTNESS_OF_BREATH',
    // "Sudden change in vision" in the criteria; #334.16.
    'BLURRED_VISION',
  ],
  dangerSignWindowDays: 7,
  dangerGlucoseMmol: 18,
  ketoneGlucoseMmol: 13.9,
  ketoneSymptoms: ['VOMITING', 'CONFUSION', 'DIFFICULTY_BREATHING', 'LOSS_OF_CONSCIOUSNESS'],
  hypoglycaemiaMmol: DM_HYPOGLYCEMIA_MG_DL / MG_DL_PER_MMOL_L,
  pregnancyRaisedFastingMmol: 7.0,
  pregnancyRaisedRandomMmol: 11.1,

  persistentBp: { systolic: 160, diastolic: 100 },
  medicationChangeWindowMonths: 1,
  highCholesterolMmol: 8,
  knownDiseaseConditions: [
    'HEART_DISEASE_OR_MI',
    'HEART_FAILURE',
    'PERIPHERAL_VASCULAR_DISEASE',
    'STROKE_OR_TIA',
    'KIDNEY_DISEASE',
  ],

  chartRiskTiers: { high: 20, moderate: 10, lowModerate: 5 },
  chartDiabetesFastingMmol: 7.0,

  bpTarget: { systolic: 140, diastolic: 90 },
  under65TargetAges: { min: 18, max: 64 },
  bpTargetWithDisease: { systolic: 130, diastolic: 90 },
  fastingGlucoseTargetMmol: { min: 4, max: 7 },
  hba1cTargetPercent: 7,
  hba1cTargetFrailPercent: 8,

  controlWindowMonths: 3,
  underCareWindowMonths: 12,

  raisedBp: { systolic: 140, diastolic: 90 },
  diabetesFastingMmol: 7.0,
  diabetesRandomMmol: 11.1,
  riskFactorMinAge: 40,
  obesityBmi: 30,

  schedules: {
    HIGH: {
      inPersonMonths: 2,
      inPersonMonthsAtTarget: 3,
      tele: 'BETWEEN_VISITS',
      teleMonthsAfterVisit: 1,
    },
    MODERATE: {
      inPersonMonths: 3,
      inPersonMonthsAtTarget: null,
      tele: 'BEFORE_VISIT',
      teleMonthsAfterVisit: null,
    },
    // "Every 6 to 9 months" at target: the shortest interval the range allows.
    LOW_MODERATE: {
      inPersonMonths: 3,
      inPersonMonthsAtTarget: 6,
      tele: 'BEFORE_VISIT',
      teleMonthsAfterVisit: null,
    },
    STABLE: {
      inPersonMonths: 3,
      inPersonMonthsAtTarget: null,
      tele: 'BETWEEN_VISITS',
      teleMonthsAfterVisit: null,
    },
    LOW: {
      inPersonMonths: 12,
      inPersonMonthsAtTarget: null,
      tele: 'BEFORE_VISIT',
      teleMonthsAfterVisit: null,
    },
  },
  minInPersonIntervalMonths: 2,
  reminderLeadDays: 3,
  urgentCallWithinHours: 48,

  urgentEscalationMinutes: 15,
  notImprovingMonths: 6,
  screeningFlagOpenHours: 24,
  // 07:00, before the clinic day starts.
  dailyDigestCron: '0 7 * * *',
};

/* ------------------------------------------------------------------------------- Input */

export interface FollowUpBpReading {
  systolic: number;
  diastolic: number;
  at: Date;
  /** True when taken by staff; false when the patient reported a home or pharmacy reading. */
  measured: boolean;
}

/** One plain object the caller assembles (#336). Everything is optional; absent means unknown. */
export interface FollowUpInput {
  ageYears?: number | null;
  sex?: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN' | null;
  /** Newest first. Order is re-checked, so an unsorted list is still read correctly. */
  readings?: readonly FollowUpBpReading[] | null;
  /** The latest glucose measured by staff, stored whole mg/dL. */
  glucose?: { mgDl: number; context: DiabetesGlucoseContext; at: Date } | null;
  /**
   * The latest glucose the patient reported (home meter, phone). Checked for danger signs only:
   * it never decides whether diabetes is at target or which chart applies.
   */
  selfReportedGlucose?: { mgDl: number; context: DiabetesGlucoseContext; at: Date } | null;
  hba1c?: { percent: number; at: Date } | null;
  /** Symptoms the patient has now, from the latest assessment or phone contact. */
  symptoms?: {
    hypertension?: readonly HypertensionSymptomValue[] | null;
    diabetes?: readonly DiabetesUrgentSymptomValue[] | null;
  } | null;
  hypoglycaemiaSymptoms?: boolean | null;
  /** Not recorded anywhere yet (#334.14), so the ketone rule cannot fire until it is. */
  ketonesPresent?: boolean | null;
  pregnant?: boolean | null;
  /** Known conditions from the medical history. Null means the history was never taken. */
  conditions?: readonly CardiometabolicConditionValue[] | null;
  hypertensionDiagnosed?: boolean | null;
  onTreatment?: { hypertension?: boolean | null; diabetes?: boolean | null } | null;
  medicationChangedAt?: Date | null;
  totalCholesterolMmol?: number | null;
  bmi?: number | null;
  smoker?: boolean | null;
  familyHistory?: boolean | null;
  frailOrElderly?: boolean | null;
  lastCompletedContactAt?: Date | null;
  nextContactDueAt?: Date | null;
  today: Date;
  /** The clinic's zone, for "different days". Defaults to the house default (Africa/Accra). */
  timeZone?: string | null;
}

/* ------------------------------------------------------------------------------ Output */

export interface FollowUpControl {
  status: FollowUpControlStatus;
  /** No reading in the control window (3 months). */
  lostToFollowUp3m: boolean;
  /** No reading in the under-care window (12 months). */
  lostToFollowUp12m: boolean;
  underCare: boolean;
}

export interface FollowUpAssessment {
  tier: FollowUpTier;
  caughtBy: FollowUpCaughtBy | null;
  /** Every rule that fired, in check order. */
  reasons: FollowUpReason[];
  /** What stopped a fuller answer. */
  missing: FollowUpMissingInput[];
  cvdRiskPercent: number | null;
  chart: FollowUpChart | null;
  atTarget: boolean | null;
  control: FollowUpControl;
  screeningGroup: FollowUpScreeningGroup | null;
  actions: FollowUpAction[];
  configVersion: string;
}

/* ----------------------------------------------------------------------------- Helpers */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Glucose lines are written in mmol/L; readings are stored in whole mg/dL. Converted here only. */
function mgDl(mmol: number): number {
  return Math.round(mmol * MG_DL_PER_MMOL_L);
}

/** The higher row applies: either number at or above its limit puts the reading in the band. */
function atOrAbove(reading: { systolic: number; diastolic: number }, limit: BpLimit): boolean {
  return reading.systolic >= limit.systolic || reading.diastolic >= limit.diastolic;
}

/** Same calendar day of month, clamped to the month's last day (31 Jan + 1 month = 28 Feb). */
export function addMonths(date: Date, months: number): Date {
  const out = new Date(date.getTime());
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, lastDay));
  return out;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function earliest(a: Date, b: Date): Date {
  return a <= b ? a : b;
}

function present<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * True when every candidate says true, false when every candidate says false, null otherwise.
 * Used where an unknown input (age, frailty) could change the answer: if it cannot, there is no
 * need to know it; if it can, the answer is unknown rather than guessed.
 */
function agree(values: readonly (boolean | null)[]): boolean | null {
  if (values.length > 0 && values.every((value) => value === true)) return true;
  if (values.length > 0 && values.every((value) => value === false)) return false;
  return null;
}

/** The clinic-local calendar day of an instant. */
function dayKey(at: Date, timeZone: string | null | undefined): string {
  return instantToWallClock(at, timeZone).slice(0, 10);
}

/** One reading per day, newest day first. A day is represented by its last reading: the repeat. */
function lastReadingPerDay(
  readings: readonly FollowUpBpReading[],
  timeZone: string | null | undefined,
): FollowUpBpReading[] {
  const sorted = [...readings].sort((a, b) => b.at.getTime() - a.at.getTime());
  const seen = new Set<string>();
  return sorted.filter((reading) => {
    const day = dayKey(reading.at, timeZone);
    if (seen.has(day)) return false;
    seen.add(day);
    return true;
  });
}

function isFastingContext(context: DiabetesGlucoseContext): boolean {
  return context === 'FASTING' || context === 'BEFORE_MEAL';
}

/**
 * Whether a glucose is at or above a fasting / any-timing pair of lines. An unknown timing is
 * judged against the higher, any-timing line only: above it the timing cannot matter, below it
 * the reading cannot be judged (null), never assumed fasting.
 */
function glucoseAtOrAbove(
  glucose: { mgDl: number; context: DiabetesGlucoseContext },
  fastingMmol: number,
  randomMmol: number,
): boolean | null {
  if (isFastingContext(glucose.context)) return glucose.mgDl >= mgDl(fastingMmol);
  if (glucose.context !== 'UNKNOWN') return glucose.mgDl >= mgDl(randomMmol);
  return glucose.mgDl >= mgDl(randomMmol) ? true : null;
}

/* ------------------------------------------------------------------------------ Checks */

interface Facts {
  input: FollowUpInput;
  config: FollowUpConfig;
  conditions: readonly CardiometabolicConditionValue[];
  knownDiabetes: boolean;
  knownDisease: boolean;
  hypertension: boolean;
  diagnosed: boolean;
  onTreatment: boolean;
  /** Measured readings, one per day, newest first. */
  measuredDays: FollowUpBpReading[];
  /** Readings that count toward control, one per day, newest first. */
  controlDays: FollowUpBpReading[];
  controlSince: Date;
}

function gatherFacts(input: FollowUpInput, config: FollowUpConfig): Facts {
  const conditions = input.conditions ?? [];
  const knownDiabetes = conditions.includes('DIABETES');
  const knownDisease = conditions.some((c) => config.knownDiseaseConditions.includes(c));
  const hypertension = input.hypertensionDiagnosed === true;
  const readings = input.readings ?? [];
  return {
    input,
    config,
    conditions,
    knownDiabetes,
    knownDisease,
    hypertension,
    diagnosed: hypertension || knownDiabetes,
    onTreatment:
      (hypertension && input.onTreatment?.hypertension === true) ||
      (knownDiabetes && input.onTreatment?.diabetes === true),
    measuredDays: lastReadingPerDay(
      readings.filter((r) => r.measured),
      input.timeZone,
    ),
    controlDays: lastReadingPerDay(
      readings.filter((r) => r.measured || config.selfReportedCountsTowardControl),
      input.timeZone,
    ),
    controlSince: addMonths(input.today, -config.controlWindowMonths),
  };
}

/** Check 1. Any reading source counts: a danger sign reported by phone is still a danger sign. */
function dangerSigns({ input, config }: Facts): FollowUpReason[] {
  const reasons: FollowUpReason[] = [];
  const since = addDays(input.today, -config.dangerSignWindowDays);
  const recentReadings = (input.readings ?? []).filter((r) => r.at >= since);
  const glucoses = [input.glucose, input.selfReportedGlucose].filter(
    (g): g is NonNullable<typeof g> => !!g && g.at >= since,
  );
  const htnSymptoms = input.symptoms?.hypertension ?? [];
  const dmSymptoms = input.symptoms?.diabetes ?? [];

  if (
    recentReadings.some((r) => atOrAbove(r, config.dangerBp)) &&
    htnSymptoms.some((s) => config.dangerBpSymptoms.includes(s))
  ) {
    reasons.push('DANGER_BP_WITH_SYMPTOMS');
  }
  if (glucoses.some((g) => g.mgDl > mgDl(config.dangerGlucoseMmol))) {
    reasons.push('DANGER_GLUCOSE_VERY_HIGH');
  }
  if (
    glucoses.some((g) => g.mgDl > mgDl(config.ketoneGlucoseMmol)) &&
    input.ketonesPresent === true &&
    dmSymptoms.some((s) => config.ketoneSymptoms.includes(s))
  ) {
    reasons.push('DANGER_GLUCOSE_HIGH_WITH_KETONES');
  }
  if (
    glucoses.some((g) => g.mgDl <= mgDl(config.hypoglycaemiaMmol)) &&
    input.hypoglycaemiaSymptoms === true
  ) {
    reasons.push('DANGER_LOW_GLUCOSE_WITH_SYMPTOMS');
  }
  const pregnant = input.pregnant === true || input.conditions?.includes('PREGNANCY') === true;
  if (
    pregnant &&
    glucoses.some((g) =>
      glucoseAtOrAbove(g, config.pregnancyRaisedFastingMmol, config.pregnancyRaisedRandomMmol),
    )
  ) {
    reasons.push('DANGER_PREGNANT_RAISED_GLUCOSE');
  }
  return reasons;
}

/** The BP limits that could apply. Two when age is unknown and the age-based targets differ. */
function bpTargetsFor(facts: Facts): BpLimit[] {
  const { input, config } = facts;
  if (facts.knownDiabetes || facts.knownDisease) return [config.bpTargetWithDisease];
  const { min, max } = config.under65TargetAges;
  if (present(input.ageYears)) {
    return [
      input.ageYears >= min && input.ageYears <= max ? config.bpTargetUnder65 : config.bpTarget,
    ];
  }
  return [config.bpTargetUnder65, config.bpTarget];
}

function bpAtTarget(reading: FollowUpBpReading, targets: readonly BpLimit[]): boolean | null {
  return agree(targets.map((target) => !atOrAbove(reading, target)));
}

/** Diabetes only: HbA1c when there is a recent one, else a recent fasting sugar. */
function glycaemicAtTarget(facts: Facts): boolean | null {
  const { input, config, controlSince } = facts;
  if (input.hba1c && input.hba1c.at >= controlSince) {
    const limits = present(input.frailOrElderly)
      ? [input.frailOrElderly ? config.hba1cTargetFrailPercent : config.hba1cTargetPercent]
      : [config.hba1cTargetPercent, config.hba1cTargetFrailPercent];
    return agree(limits.map((limit) => input.hba1c!.percent < limit));
  }
  const glucose = input.glucose;
  if (glucose && glucose.at >= controlSince && isFastingContext(glucose.context)) {
    const { min, max } = config.fastingGlucoseTargetMmol;
    return glucose.mgDl >= mgDl(min) && glucose.mgDl <= mgDl(max);
  }
  return null;
}

interface TargetFacts {
  /** The latest control reading in the window, judged against the patient's target(s). */
  latestBp: boolean | null;
  glycaemic: boolean | null;
  /** Latest BP and, with diabetes, glycaemic: the patient's overall `atTarget`. */
  overall: boolean | null;
  /** On target on the last `stepDownOnTargetReadings` days (or every day, if fewer). */
  stepDownMet: boolean;
  /** At least one of those days above target. */
  aboveInStepDownRun: boolean;
}

function targetFacts(facts: Facts): TargetFacts {
  const { config, controlDays, controlSince } = facts;
  const targets = bpTargetsFor(facts);
  const latest = controlDays[0];
  const latestBp = latest && latest.at >= controlSince ? bpAtTarget(latest, targets) : null;
  const glycaemic = facts.knownDiabetes ? glycaemicAtTarget(facts) : true;
  const overall = latestBp === false || glycaemic === false ? false : agree([latestBp, glycaemic]);
  const run = controlDays
    .slice(0, Math.max(1, config.stepDownOnTargetReadings))
    .map((r) => bpAtTarget(r, targets));
  return {
    latestBp,
    glycaemic: facts.knownDiabetes ? glycaemic : null,
    overall,
    stepDownMet: overall === true && run.every((v) => v === true),
    aboveInStepDownRun: run.some((v) => v === false) || glycaemic === false,
  };
}

function missedContact({ input, config }: Facts): boolean {
  if (!input.nextContactDueAt) return false;
  const lateAfter = addDays(input.nextContactDueAt, config.missedContactGraceDays);
  const reached =
    input.lastCompletedContactAt && input.lastCompletedContactAt >= input.nextContactDueAt;
  return input.today > lateAfter && !reached;
}

/**
 * Check 2, split in two. "Active" rules are something happening now and always beat Stable.
 * "Condition" rules are a known diagnosis and give way to Stable when
 * `stableOverridesKnownDisease` is on.
 *
 * Reading above target, a missed contact, a medication change and new symptoms are here because
 * the criteria move a patient "up to the High rhythm" on each (#333).
 */
function autoHigh(
  facts: Facts,
  target: TargetFacts,
  danger: readonly FollowUpReason[],
): { active: FollowUpReason[]; condition: FollowUpReason[]; missing: FollowUpMissingInput[] } {
  const { input, config, measuredDays } = facts;
  const active: FollowUpReason[] = [];
  const condition: FollowUpReason[] = [];
  const missing: FollowUpMissingInput[] = [];

  const recentSince = addDays(input.today, -config.dangerSignWindowDays);
  const latestAny = [...(input.readings ?? [])].sort((a, b) => b.at.getTime() - a.at.getTime())[0];
  if (
    !danger.includes('DANGER_BP_WITH_SYMPTOMS') &&
    latestAny &&
    latestAny.at >= recentSince &&
    atOrAbove(latestAny, config.dangerBp)
  ) {
    active.push('SEVERE_BP_ASYMPTOMATIC');
  }
  const [lastDay, dayBefore] = measuredDays;
  if (
    lastDay &&
    dayBefore &&
    atOrAbove(lastDay, config.persistentBp) &&
    atOrAbove(dayBefore, config.persistentBp)
  ) {
    active.push('BP_PERSISTENTLY_HIGH');
  }
  const treatment = input.onTreatment ?? {};
  if (facts.hypertension && treatment.hypertension === false) active.push('UNTREATED_HYPERTENSION');
  if (facts.knownDiabetes && treatment.diabetes === false) active.push('UNTREATED_DIABETES');
  if (
    (facts.hypertension && !present(treatment.hypertension)) ||
    (facts.knownDiabetes && !present(treatment.diabetes))
  ) {
    missing.push('onTreatment');
  }
  if (
    input.medicationChangedAt &&
    input.medicationChangedAt >= addMonths(input.today, -config.medicationChangeWindowMonths)
  ) {
    active.push('MEDICATION_CHANGED_RECENTLY');
  }
  if (
    present(input.totalCholesterolMmol) &&
    input.totalCholesterolMmol >= config.highCholesterolMmol
  ) {
    active.push('HIGH_CHOLESTEROL');
  }
  if (facts.onTreatment) {
    if (target.overall === false) active.push('ABOVE_TARGET_ON_TREATMENT');
    else if (target.overall === true && !target.stepDownMet && target.aboveInStepDownRun) {
      active.push('STEP_DOWN_PENDING');
    }
  }
  if (missedContact(facts)) active.push('MISSED_CONTACT');
  const symptoms = [...(input.symptoms?.hypertension ?? []), ...(input.symptoms?.diabetes ?? [])];
  if (symptoms.some((s) => s !== 'NONE') || input.hypoglycaemiaSymptoms === true) {
    active.push('NEW_SYMPTOMS');
  }

  if (facts.knownDiabetes) condition.push('KNOWN_DIABETES');
  if (facts.knownDisease) condition.push('KNOWN_HEART_STROKE_OR_KIDNEY_DISEASE');
  if (!present(input.conditions)) missing.push('conditions');
  return { active, condition, missing };
}

/** Check 3. Null risk with the missing items when the chart cannot be read. */
function chartRisk(facts: Facts): {
  risk: number | null;
  chart: FollowUpChart | null;
  missing: FollowUpMissingInput[];
} {
  const { input, config, measuredDays } = facts;
  const missing: FollowUpMissingInput[] = [];
  const sex = input.sex === 'MALE' || input.sex === 'FEMALE' ? input.sex : null;
  const systolic = measuredDays[0]?.systolic;
  const useLab = config.laboratoryChartEnabled && present(input.totalCholesterolMmol);
  if (config.laboratoryChartEnabled && !useLab) missing.push('totalCholesterol');

  if (!present(input.ageYears)) missing.push('ageYears');
  if (!sex) missing.push('sex');
  if (!present(systolic)) missing.push('systolicBp');
  if (!useLab && !present(input.bmi)) missing.push('bmi');
  if (!present(input.smoker)) missing.push('smoker');
  if (missing.some((m) => m !== 'totalCholesterol')) return { risk: null, chart: null, missing };

  const chartDiabetes =
    facts.knownDiabetes ||
    (input.glucose != null &&
      isFastingContext(input.glucose.context) &&
      input.glucose.mgDl >= mgDl(config.chartDiabetesFastingMmol));
  const risk = chartCell({
    table: useLab
      ? chartDiabetes
        ? LAB_CHART_WITH_DIABETES
        : LAB_CHART_WITHOUT_DIABETES
      : NON_LAB_CHART,
    sex: sex!,
    smoker: input.smoker!,
    ageYears: input.ageYears!,
    systolic: systolic!,
    columnValue: useLab ? input.totalCholesterolMmol! : input.bmi!,
    columnEdges: useLab ? CHART_CHOLESTEROL_EDGES : CHART_BMI_EDGES,
  });
  return { risk, chart: risk === null ? null : useLab ? 'LAB' : 'NON_LAB', missing };
}

function tierForRisk(risk: number, config: FollowUpConfig): FollowUpTier {
  if (risk >= config.chartRiskTiers.high) return 'HIGH';
  if (risk >= config.chartRiskTiers.moderate) return 'MODERATE';
  if (risk >= config.chartRiskTiers.lowModerate) return 'LOW_MODERATE';
  return 'LOW';
}

/** HEARTS360 control, judged on the latest reading that counts toward control. */
function controlFor(facts: Facts): FollowUpControl {
  const { input, config, controlDays, controlSince } = facts;
  const latest = controlDays[0];
  const recent = latest && latest.at >= controlSince ? latest : null;
  const underCare = !!latest && latest.at >= addMonths(input.today, -config.underCareWindowMonths);
  const atTarget = recent ? bpAtTarget(recent, bpTargetsFor(facts)) : null;
  return {
    status: !recent
      ? 'NO_RECENT_READING'
      : atTarget === null
        ? 'NOT_ASSESSED'
        : atTarget
          ? 'CONTROLLED'
          : 'UNCONTROLLED',
    lostToFollowUp3m: !recent,
    lostToFollowUp12m: !underCare,
    underCare,
  };
}

/** Raised glucose by the diabetes lines; null when the reading cannot be judged or is absent. */
function glucoseRaised(facts: Facts): boolean | null {
  const glucose = facts.input.glucose;
  if (!glucose) return null;
  return glucoseAtOrAbove(
    glucose,
    facts.config.diabetesFastingMmol,
    facts.config.diabetesRandomMmol,
  );
}

function screeningGroupFor(
  facts: Facts,
  danger: boolean,
): { group: FollowUpScreeningGroup | null; confirmed: boolean } {
  const { input, config, measuredDays } = facts;
  if (danger) return { group: 'DANGER_SIGNS', confirmed: true };
  if (facts.diagnosed) {
    const untreated =
      (facts.hypertension && input.onTreatment?.hypertension === false) ||
      (facts.knownDiabetes && input.onTreatment?.diabetes === false);
    if (untreated) return { group: 'KNOWN_UNTREATED', confirmed: true };
    return { group: facts.onTreatment ? 'KNOWN_TREATED' : null, confirmed: true };
  }
  const [lastDay, dayBefore] = measuredDays;
  const bpRaised = lastDay ? atOrAbove(lastDay, config.raisedBp) : null;
  if (bpRaised || glucoseRaised(facts)) {
    // Hypertension is not diagnosed on one day's readings.
    const confirmed = !bpRaised || (!!dayBefore && atOrAbove(dayBefore, config.raisedBp));
    return { group: 'NEW_RAISED_READING', confirmed };
  }
  if (bpRaised === null) return { group: null, confirmed: true };
  const glucose = input.glucose;
  const riskFactor =
    (present(input.ageYears) && input.ageYears >= config.riskFactorMinAge) ||
    input.smoker === true ||
    (present(input.bmi) && input.bmi >= config.obesityBmi) ||
    input.familyHistory === true ||
    (!!glucose &&
      isFastingContext(glucose.context) &&
      glucose.mgDl >= mgDl(config.prediabetesFastingMmol));
  return { group: riskFactor ? 'NORMAL_WITH_RISK_FACTORS' : null, confirmed: true };
}

/* ------------------------------------------------------------------ Danger signs alone */

export interface DangerSignCheck {
  /** The Check 1 rules that fire. Any one means: refer today. */
  reasons: FollowUpReason[];
  /**
   * Set when a reading is at or above the danger line but no danger symptom is recorded: repeat
   * the reading now and ask about these symptoms. Empty otherwise.
   */
  askAboutSymptoms: readonly HypertensionSymptomValue[];
}

/**
 * Check 1 on its own, for a form to run as values are typed (#336). Needs no age, history or
 * network: it reads only what is passed in, so it works offline and before anything is saved.
 */
export function checkDangerSigns(
  input: FollowUpInput,
  config: FollowUpConfig = DEFAULT_FOLLOW_UP_CONFIG,
): DangerSignCheck {
  const facts = gatherFacts(input, config);
  const reasons = dangerSigns(facts);
  const since = addDays(input.today, -config.dangerSignWindowDays);
  const severe = (input.readings ?? []).some((r) => r.at >= since && atOrAbove(r, config.dangerBp));
  return {
    reasons,
    askAboutSymptoms:
      severe && !reasons.includes('DANGER_BP_WITH_SYMPTOMS') ? config.dangerBpSymptoms : [],
  };
}

/* ---------------------------------------------------------------------------- Assess */

/**
 * The tier for one patient, and why.
 *
 * Precedence, in order (the first that applies decides the tier; every rule that fires is still
 * listed in `reasons`):
 *   1. Any danger sign -> URGENT.
 *   2. Any active Check 2 rule (something happening now) -> HIGH.
 *   3. On treatment and at target on the last `stepDownOnTargetReadings` days, the latest within
 *      the control window -> STABLE, even with known diabetes or heart, stroke or kidney disease,
 *      as #335 states. `stableOverridesKnownDisease: false` makes those patients HIGH instead.
 *   4. Known diabetes or heart, stroke or kidney disease -> HIGH.
 *   5. Aged 40 to 74 -> the WHO chart.
 *   6. Under 40 or over 74 -> control alone: above target HIGH, no diagnosis and normal LOW.
 *   7. Otherwise NOT_TIERED, with what is missing.
 */
export function assessFollowUp(
  input: FollowUpInput,
  config: FollowUpConfig = DEFAULT_FOLLOW_UP_CONFIG,
): FollowUpAssessment {
  const facts = gatherFacts(input, config);
  const target = targetFacts(facts);
  const danger = dangerSigns(facts);
  const auto = autoHigh(facts, target, danger);
  const control = controlFor(facts);
  const screening = screeningGroupFor(facts, danger.length > 0);
  const missing = new Set<FollowUpMissingInput>(auto.missing);
  const latestControl = facts.controlDays[0];
  const recentControl = !!latestControl && latestControl.at >= facts.controlSince;
  // A recent reading that cannot be judged: only age (which target applies) can cause that.
  if (recentControl && target.latestBp === null) missing.add('ageYears');
  if (!recentControl && facts.diagnosed) missing.add('recentBpReading');
  if (facts.knownDiabetes && target.glycaemic === null) {
    const hba1cRecent = input.hba1c && input.hba1c.at >= facts.controlSince;
    missing.add(
      hba1cRecent && !present(input.frailOrElderly) ? 'frailOrElderly' : 'recentGlucoseOrHba1c',
    );
  }

  const actions: FollowUpAction[] = [];
  if (danger.length > 0) actions.push('SAME_DAY_REFERRAL', 'CALL_TO_CONFIRM_CARE');
  if (auto.active.includes('SEVERE_BP_ASYMPTOMATIC')) {
    const [lastDay] = lastReadingPerDay(input.readings ?? [], input.timeZone);
    const sameDay = (input.readings ?? []).filter(
      (r) => dayKey(r.at, input.timeZone) === dayKey(lastDay.at, input.timeZone),
    );
    const stillHighOnRepeat =
      sameDay.length >= 2 && sameDay.every((r) => atOrAbove(r, config.dangerBp));
    if (danger.length === 0) {
      actions.push(
        stillHighOnRepeat ? 'PROMPT_CLINICAL_ASSESSMENT' : 'REPEAT_READING_TODAY',
        'PROMPT_TELE_CONTACT',
      );
    }
  }
  // A very high reading has its own pathway (repeat now, refer if still high), which replaces
  // the routine second-day confirmation.
  if (
    screening.group === 'NEW_RAISED_READING' &&
    !screening.confirmed &&
    !auto.active.includes('SEVERE_BP_ASYMPTOMATIC')
  ) {
    actions.push('CONFIRM_ON_ANOTHER_DAY');
  }

  const base = {
    control,
    screeningGroup: screening.group,
    atTarget: target.overall,
    configVersion: config.version,
  };
  const result = (
    tier: FollowUpTier,
    caughtBy: FollowUpCaughtBy | null,
    reasons: FollowUpReason[],
    chart: { risk: number | null; chart: FollowUpChart | null } = { risk: null, chart: null },
  ): FollowUpAssessment => {
    if (tier === 'NOT_TIERED') actions.push('RECORD_MISSING_DATA');
    return {
      ...base,
      tier,
      caughtBy,
      reasons: FOLLOW_UP_REASONS.filter((r) => reasons.includes(r)),
      missing: FOLLOW_UP_MISSING_INPUTS.filter((m) => missing.has(m)),
      cvdRiskPercent: chart.risk,
      chart: chart.chart,
      actions,
    };
  };
  const fired = [...danger, ...auto.active, ...auto.condition];

  if (danger.length > 0) return result('URGENT', 'DANGER_SIGNS', fired);
  if (auto.active.length > 0) return result('HIGH', 'AUTO_HIGH', fired);

  const stable =
    facts.onTreatment &&
    target.stepDownMet &&
    (auto.condition.length === 0 || config.stableOverridesKnownDisease);
  if (stable) return result('STABLE', 'CONTROL_ONLY', [...fired, 'ON_TREATMENT_AT_TARGET']);
  if (auto.condition.length > 0) return result('HIGH', 'AUTO_HIGH', fired);

  const age = input.ageYears;
  if (present(age) && age >= CHART_MIN_AGE && Math.floor(age) <= CHART_MAX_AGE) {
    const chart = chartRisk(facts);
    chart.missing.forEach((m) => missing.add(m));
    if (chart.risk === null) return result('NOT_TIERED', null, fired);
    return result(tierForRisk(chart.risk, config), 'RISK_CHART', [...fired, 'CHART_RISK'], chart);
  }
  if (present(age)) {
    // Someone never diagnosed is judged on a reading from the rescreening window, not the
    // 3-month control window: a normal reading 5 months ago still makes them LOW.
    const screened = facts.measuredDays[0];
    const withinRescreen =
      !!screened && screened.at >= addMonths(input.today, -config.underCareWindowMonths);
    const bpOk = facts.diagnosed
      ? target.overall
      : withinRescreen
        ? bpAtTarget(screened, bpTargetsFor(facts))
        : null;
    if (bpOk === false || (!facts.diagnosed && glucoseRaised(facts) === true)) {
      return result('HIGH', 'CONTROL_ONLY', [...fired, 'OUTSIDE_CHART_AGES_ABOVE_TARGET']);
    }
    if (!facts.diagnosed && bpOk === true) {
      return result('LOW', 'CONTROL_ONLY', [...fired, 'OUTSIDE_CHART_AGES_NORMAL']);
    }
    if (!facts.diagnosed && !withinRescreen) missing.add('recentBpReading');
    return result('NOT_TIERED', null, fired);
  }
  // Age unknown: the chart cannot be read, so list everything it would need.
  chartRisk(facts).missing.forEach((m) => missing.add(m));
  return result('NOT_TIERED', null, fired);
}

/* ------------------------------------------------------------------------ Next contact */

export interface NextContactInput {
  tier: FollowUpTier;
  atTarget: boolean | null;
  /** The assessment's actions: a pending confirmation or prompt tele contact pulls a date in. */
  actions?: readonly FollowUpAction[];
  lastInPersonAt: Date | null;
  lastTeleAt: Date | null;
  today: Date;
}

export interface NextContact {
  inPersonDueAt: Date | null;
  teleDueAt: Date | null;
}

/**
 * When the patient is next due in person and by tele contact, from the tier's schedule (#333).
 *
 * A patient never seen in person is due today. Each tele contact belongs to the gap between two
 * visits; once it is made, the next one is in the following gap. NOT_TIERED has no schedule
 * until it can be tiered. A date a clinician set by hand wins when it is sooner; that is the
 * caller's comparison, not this function's.
 */
export function nextContact(
  { tier, atTarget, actions = [], lastInPersonAt, lastTeleAt, today }: NextContactInput,
  config: FollowUpConfig = DEFAULT_FOLLOW_UP_CONFIG,
): NextContact {
  if (tier === 'NOT_TIERED') return { inPersonDueAt: null, teleDueAt: null };
  if (tier === 'URGENT') {
    return {
      inPersonDueAt: today,
      teleDueAt: new Date(today.getTime() + config.urgentCallWithinHours * 60 * 60 * 1000),
    };
  }
  const schedule = config.schedules[tier];
  const months = Math.max(
    config.minInPersonIntervalMonths,
    atTarget === true && schedule.inPersonMonthsAtTarget !== null
      ? schedule.inPersonMonthsAtTarget
      : schedule.inPersonMonths,
  );
  let inPersonDueAt = lastInPersonAt ? addMonths(lastInPersonAt, months) : today;
  if (actions.includes('CONFIRM_ON_ANOTHER_DAY')) {
    inPersonDueAt = earliest(
      inPersonDueAt,
      addDays(lastInPersonAt ?? today, config.confirmationIntervalDays),
    );
  }
  const teleDoneThisGap = !!lastTeleAt && (!lastInPersonAt || lastTeleAt >= lastInPersonAt);
  const gapStart = lastInPersonAt && !teleDoneThisGap ? lastInPersonAt : inPersonDueAt;
  const gapEnd = gapStart === inPersonDueAt ? addMonths(inPersonDueAt, months) : inPersonDueAt;

  const scheduledTele =
    schedule.tele === 'BEFORE_VISIT'
      ? addDays(gapEnd, -config.reminderLeadDays)
      : schedule.teleMonthsAfterVisit !== null
        ? addMonths(gapStart, schedule.teleMonthsAfterVisit)
        : new Date((gapStart.getTime() + gapEnd.getTime()) / 2);
  const teleDueAt = actions.includes('PROMPT_TELE_CONTACT')
    ? earliest(scheduledTele, addDays(today, config.asymptomaticSevereAssessmentDays))
    : scheduledTele;
  return { inPersonDueAt, teleDueAt };
}

/* ---------------------------------------------------------------------------- Movement */

/** Lowest follow-up intensity first. STABLE sits between LOW and LOW_MODERATE. */
const TIER_ORDER: readonly FollowUpTier[] = [
  'LOW',
  'STABLE',
  'LOW_MODERATE',
  'MODERATE',
  'HIGH',
  'URGENT',
];

const REASON_TRIGGERS: Partial<Record<FollowUpReason, FollowUpMovementTrigger>> = {
  DANGER_BP_WITH_SYMPTOMS: 'DANGER_SIGN',
  DANGER_GLUCOSE_VERY_HIGH: 'DANGER_SIGN',
  DANGER_GLUCOSE_HIGH_WITH_KETONES: 'DANGER_SIGN',
  DANGER_LOW_GLUCOSE_WITH_SYMPTOMS: 'DANGER_SIGN',
  DANGER_PREGNANT_RAISED_GLUCOSE: 'DANGER_SIGN',
  SEVERE_BP_ASYMPTOMATIC: 'READING_ABOVE_TARGET',
  BP_PERSISTENTLY_HIGH: 'READING_ABOVE_TARGET',
  ABOVE_TARGET_ON_TREATMENT: 'READING_ABOVE_TARGET',
  OUTSIDE_CHART_AGES_ABOVE_TARGET: 'READING_ABOVE_TARGET',
  HIGH_CHOLESTEROL: 'READING_ABOVE_TARGET',
  MISSED_CONTACT: 'MISSED_CONTACT',
  MEDICATION_CHANGED_RECENTLY: 'MEDICATION_CHANGE',
  NEW_SYMPTOMS: 'NEW_SYMPTOMS',
  UNTREATED_HYPERTENSION: 'NEW_DIAGNOSIS',
  UNTREATED_DIABETES: 'NEW_DIAGNOSIS',
  KNOWN_DIABETES: 'NEW_DIAGNOSIS',
  KNOWN_HEART_STROKE_OR_KIDNEY_DISEASE: 'NEW_DIAGNOSIS',
};

export interface FollowUpMovement {
  direction: FollowUpMovementDirection;
  trigger: FollowUpMovementTrigger | null;
}

/**
 * How the tier moved between two assessments, and the first new reason that moved it.
 *
 * NEW when there was no earlier tier. A move to NOT_TIERED is SAME with no trigger: losing data
 * is not a change in risk. Stepping down is decided in `assessFollowUp` (the
 * `stepDownOnTargetReadings` rule); this only names it.
 */
export function movement(
  previous: Pick<FollowUpAssessment, 'tier' | 'reasons' | 'atTarget'> | null,
  current: Pick<FollowUpAssessment, 'tier' | 'reasons' | 'atTarget'>,
): FollowUpMovement {
  if (current.tier === 'NOT_TIERED') return { direction: 'SAME', trigger: null };
  if (!previous || previous.tier === 'NOT_TIERED') return { direction: 'NEW', trigger: null };
  const delta = TIER_ORDER.indexOf(current.tier) - TIER_ORDER.indexOf(previous.tier);
  if (delta === 0) return { direction: 'SAME', trigger: null };
  if (delta < 0) {
    const reached =
      current.tier === 'STABLE' || (current.atTarget === true && previous.atTarget !== true);
    return { direction: 'DOWN', trigger: reached ? 'REACHED_TARGET' : 'RISK_CHANGED' };
  }
  const added = current.reasons.filter((r) => !previous.reasons.includes(r));
  const trigger = added.map((r) => REASON_TRIGGERS[r]).find(present) ?? 'RISK_CHANGED';
  return { direction: 'UP', trigger };
}
