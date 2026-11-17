import type {
  CardiometabolicCondition,
  DiabetesStatus,
  DiabetesSymptom,
  DiabetesUrgentSymptom,
  DrugCategory,
  GlucoseType,
  HypertensionStatus,
  HypertensionSymptom,
  NkwapaAnswer,
  PatientMeasurementSource,
  PatientMeasurementType,
  PatientMedicationStatus,
  PatientSelfReportType,
  Sex,
  TobaccoUseStatus,
} from '@prisma/client';
import {
  addMonths,
  computeBmi,
  DEFAULT_FOLLOW_UP_CONFIG,
  type FollowUpBpReading,
  type FollowUpConfig,
  type FollowUpInput,
} from '@nkwapa/db';

/**
 * Turning a patient's records into the follow-up engine's input (#336).
 *
 * Every judgement about what the records mean lives here, in one pure function, so it can be
 * tested without a database and read beside the engine: which readings count, how "persistently"
 * gets its two days, when a medicine counts as changed, how long a symptom stays current. The
 * engine (`packages/db/src/follow-up-stratification.ts`) then applies the criteria.
 */

/** Drug categories that treat each condition. A medicine with no linked drug is not counted. */
export const HYPERTENSION_DRUG_CATEGORIES: readonly DrugCategory[] = [
  'ANTIHYPERTENSIVE',
  'DIURETIC',
  'BETA_BLOCKER',
];
export const DIABETES_DRUG_CATEGORIES: readonly DrugCategory[] = ['ANTIDIABETIC'];

/**
 * How long a "pregnant now" answer is believed. shortcut: a fixed nine months from the answer,
 * not a due date; upgrade when the interview records one.
 */
const PREGNANCY_ANSWER_VALID_MONTHS = 9;

export interface FollowUpRecords {
  today: Date;
  timeZone: string | null;
  patient: { dob: Date | null; sex: Sex };
  /** Newest first. */
  encounters: Array<{
    createdAt: Date;
    vitals: {
      systolicBp: number | null;
      diastolicBp: number | null;
      bmi: number | null;
      weightKg: number | null;
      heightCm: number | null;
    } | null;
    tobacco: { smokingStatus: TobaccoUseStatus } | null;
    hypertension: {
      collectedAt: Date;
      hypertensionStatus: HypertensionStatus;
      confirmed: boolean;
      repeatSystolicBp: number | null;
      repeatDiastolicBp: number | null;
      repeatMeasuredAt: Date | null;
      homeSystolicAvg: number | null;
      homeDiastolicAvg: number | null;
      currentSymptoms: HypertensionSymptom[];
      relevantConditions: CardiometabolicCondition[];
      pregnantNow: NkwapaAnswer;
    } | null;
    diabetes: {
      collectedAt: Date;
      glucoseMgDl: number | null;
      glucoseType: GlucoseType;
      hba1cPercent: number | null;
      hba1cMeasuredOn: Date | null;
      diabetesStatus: DiabetesStatus;
      urgentSymptoms: DiabetesUrgentSymptom[];
      symptoms: DiabetesSymptom[];
    } | null;
  }>;
  selfReports: Array<{
    type: PatientSelfReportType;
    systolicBp: number | null;
    diastolicBp: number | null;
    glucoseMgDl: number | null;
    glucoseType: GlucoseType | null;
    recordedAt: Date;
  }>;
  measurements: Array<{
    type: PatientMeasurementType;
    source: PatientMeasurementSource;
    recordedAt: Date;
    payloadJson: string;
  }>;
  /** Medication list entries for a hypertension or diabetes drug, each with every revision. */
  medications: Array<{
    category: DrugCategory;
    revisions: Array<{
      revisionNumber: number;
      status: PatientMedicationStatus;
      strength: string | null;
      dose: string | null;
      frequency: string | null;
      createdAt: Date;
    }>;
  }>;
  /**
   * Follow-up contacts (#338). Absent before any were scheduled, which the engine reads as "no
   * contact due", so a patient who was never scheduled is never late.
   */
  followUp?: {
    /** When each attempt that reached the patient happened (any outcome but ATTEMPTED). */
    completedAt: Date[];
    /** Due dates of contacts not yet done or cancelled, missed ones included. */
    unresolvedDueOn: Date[];
    /** Symptoms reported on contact attempts, for the danger signs. */
    reportedSymptoms: Array<{
      at: Date;
      symptoms: HypertensionSymptom[];
      diabetesSymptoms?: DiabetesUrgentSymptom[];
    }>;
  };
  /** Prescriptions for a hypertension or diabetes drug. */
  prescriptions: Array<{
    drugId: string;
    category: DrugCategory;
    dosage: string;
    frequency: string;
    createdAt: Date;
  }>;
  /** Whether the medication list was ever reconciled, so an empty list means "none". */
  medicationListReconciled: boolean;
}

type Glucose = NonNullable<FollowUpInput['glucose']>;

export function ageOn(dob: Date, today: Date): number {
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < dob.getUTCMonth() ||
    (today.getUTCMonth() === dob.getUTCMonth() && today.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function latest<T extends { at: Date }>(items: T[]): T | null {
  return items.reduce<T | null>((best, item) => (!best || item.at > best.at ? item : best), null);
}

function readJson(payloadJson: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(payloadJson);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function glucoseContext(value: unknown): Glucose['context'] {
  return value === 'FASTING' ||
    value === 'BEFORE_MEAL' ||
    value === 'POST_PRANDIAL_2H' ||
    value === 'RANDOM'
    ? value
    : 'UNKNOWN';
}

type Encounter = FollowUpRecords['encounters'][number];
type HypertensionRow = NonNullable<Encounter['hypertension']>;

/** Just what BP readings are read from, so the monthly indicators (#339) load no more. */
export interface FollowUpReadingRecords {
  encounters: Array<{
    createdAt: Date;
    vitals: Pick<NonNullable<Encounter['vitals']>, 'systolicBp' | 'diastolicBp'> | null;
    hypertension: Pick<
      HypertensionRow,
      | 'collectedAt'
      | 'repeatSystolicBp'
      | 'repeatDiastolicBp'
      | 'repeatMeasuredAt'
      | 'homeSystolicAvg'
      | 'homeDiastolicAvg'
    > | null;
  }>;
  selfReports: Array<
    Pick<
      FollowUpRecords['selfReports'][number],
      'type' | 'systolicBp' | 'diastolicBp' | 'recordedAt'
    >
  >;
  measurements: FollowUpRecords['measurements'];
}

/** Every BP reading in the records, newest first. */
export function readingsFrom(records: FollowUpReadingRecords): FollowUpBpReading[] {
  const readings: FollowUpBpReading[] = [];
  for (const encounter of records.encounters) {
    const { vitals, hypertension } = encounter;
    // A reading is dated by its visit: an offline visit's vitals row is stamped when it synced.
    if (vitals?.systolicBp != null && vitals.diastolicBp != null) {
      readings.push({
        systolic: vitals.systolicBp,
        diastolic: vitals.diastolicBp,
        at: encounter.createdAt,
        measured: true,
      });
    }
    if (hypertension?.repeatSystolicBp != null && hypertension.repeatDiastolicBp != null) {
      // The repeat represents its day, so it must sort after the first reading of the visit.
      const at =
        hypertension.repeatMeasuredAt && hypertension.repeatMeasuredAt > encounter.createdAt
          ? hypertension.repeatMeasuredAt
          : new Date(encounter.createdAt.getTime() + 1);
      readings.push({
        systolic: hypertension.repeatSystolicBp,
        diastolic: hypertension.repeatDiastolicBp,
        at,
        measured: true,
      });
    }
    if (hypertension?.homeSystolicAvg != null && hypertension.homeDiastolicAvg != null) {
      readings.push({
        systolic: hypertension.homeSystolicAvg,
        diastolic: hypertension.homeDiastolicAvg,
        at: hypertension.collectedAt,
        measured: false,
      });
    }
  }
  for (const report of records.selfReports) {
    if (report.type === 'HOME_BP' && report.systolicBp != null && report.diastolicBp != null) {
      readings.push({
        systolic: report.systolicBp,
        diastolic: report.diastolicBp,
        at: report.recordedAt,
        measured: false,
      });
    }
  }
  for (const measurement of records.measurements) {
    if (measurement.type !== 'BP') continue;
    const payload = readJson(measurement.payloadJson);
    const systolic = num(payload.systolic);
    const diastolic = num(payload.diastolic);
    if (systolic === null || diastolic === null) continue;
    readings.push({
      systolic,
      diastolic,
      at: measurement.recordedAt,
      measured: measurement.source === 'STAFF',
    });
  }
  return readings.sort((a, b) => b.at.getTime() - a.at.getTime());
}

function glucosesFrom(records: FollowUpRecords): { measured: Glucose[]; reported: Glucose[] } {
  const measured: Glucose[] = [];
  const reported: Glucose[] = [];
  for (const { diabetes } of records.encounters) {
    if (diabetes?.glucoseMgDl != null) {
      measured.push({
        mgDl: diabetes.glucoseMgDl,
        context: glucoseContext(diabetes.glucoseType),
        at: diabetes.collectedAt,
      });
    }
  }
  for (const report of records.selfReports) {
    if (report.type === 'HOME_GLUCOSE' && report.glucoseMgDl != null) {
      reported.push({
        mgDl: report.glucoseMgDl,
        context: glucoseContext(report.glucoseType),
        at: report.recordedAt,
      });
    }
  }
  for (const measurement of records.measurements) {
    if (measurement.type !== 'GLUCOSE') continue;
    const payload = readJson(measurement.payloadJson);
    const value = num(payload.value);
    if (value === null) continue;
    const glucose = {
      mgDl: Math.round(value),
      context: glucoseContext(payload.glucoseType),
      at: measurement.recordedAt,
    };
    (measurement.source === 'STAFF' ? measured : reported).push(glucose);
  }
  return { measured, reported };
}

/**
 * When a hypertension or diabetes medicine last started or changed. A revision counts when it is
 * the first for that medicine or changes its status, strength, dose or frequency; a prescription
 * counts when it is the first for that drug or changes the dosage or frequency. Writing the same
 * prescription again at a routine visit is not a change.
 */
export function lastMedicationChange(
  records: Pick<FollowUpRecords, 'medications' | 'prescriptions'>,
): Date | null {
  const changes: Date[] = [];
  for (const medication of records.medications) {
    const revisions = [...medication.revisions].sort((a, b) => a.revisionNumber - b.revisionNumber);
    revisions.forEach((revision, index) => {
      const before = revisions[index - 1];
      if (
        !before ||
        before.status !== revision.status ||
        before.strength !== revision.strength ||
        before.dose !== revision.dose ||
        before.frequency !== revision.frequency
      ) {
        changes.push(revision.createdAt);
      }
    });
  }
  const prescriptions = [...records.prescriptions].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  prescriptions.forEach((prescription, index) => {
    const before = prescriptions
      .slice(0, index)
      .reverse()
      .find((p) => p.drugId === prescription.drugId);
    if (
      !before ||
      before.dosage.trim().toLowerCase() !== prescription.dosage.trim().toLowerCase() ||
      before.frequency.trim().toLowerCase() !== prescription.frequency.trim().toLowerCase()
    ) {
      changes.push(prescription.createdAt);
    }
  });
  return changes.reduce<Date | null>((max, at) => (!max || at > max ? at : max), null);
}

function treatedFor(
  records: FollowUpRecords,
  categories: readonly DrugCategory[],
  since: Date,
): boolean | null {
  const onList = records.medications.some((medication) => {
    if (!categories.includes(medication.category)) return false;
    const current = medication.revisions.reduce((a, b) =>
      b.revisionNumber > a.revisionNumber ? b : a,
    );
    return current.status === 'CURRENT';
  });
  const prescribed = records.prescriptions.some(
    (p) => categories.includes(p.category) && p.createdAt >= since,
  );
  if (onList || prescribed) return true;
  return records.medicationListReconciled ? false : null;
}

export function assembleFollowUpInput(
  records: FollowUpRecords,
  config: FollowUpConfig = DEFAULT_FOLLOW_UP_CONFIG,
): FollowUpInput {
  const { today, encounters } = records;
  const symptomsSince = new Date(today.getTime() - config.dangerSignWindowDays * 86_400_000);
  const controlSince = addMonths(today, -config.controlWindowMonths);

  const hypertensionRows = encounters.flatMap((e) => (e.hypertension ? [e.hypertension] : []));
  const diabetesRows = encounters.flatMap((e) => (e.diabetes ? [e.diabetes] : []));
  const latestHypertension = latest(hypertensionRows.map((h) => ({ ...h, at: h.collectedAt })));
  const latestDiabetes = latest(diabetesRows.map((d) => ({ ...d, at: d.collectedAt })));

  const assessedStatuses = hypertensionRows.filter(
    (h) => h.hypertensionStatus !== 'NOT_ASSESSED' && h.hypertensionStatus !== 'UNSURE',
  );
  const hypertensionDiagnosed = hypertensionRows.some(
    (h) => h.hypertensionStatus === 'KNOWN_HYPERTENSION' || h.confirmed,
  )
    ? true
    : assessedStatuses.length > 0
      ? false
      : null;
  const knownDiabetes = diabetesRows.some((d) => d.diabetesStatus === 'KNOWN_DIABETES');

  // Conditions are chronic, so every assessment adds to the list. Pregnancy is not: it is read
  // from the latest answer below.
  const conditionLists = hypertensionRows
    .map((h) => h.relevantConditions)
    .filter((list) => list.length > 0);
  let conditions: CardiometabolicCondition[] | null = null;
  if (conditionLists.length > 0 || knownDiabetes) {
    const union = new Set(
      conditionLists
        .flat()
        .filter((c) => c !== 'NONE_KNOWN' && c !== 'UNSURE' && c !== 'PREGNANCY'),
    );
    if (knownDiabetes) union.add('DIABETES');
    conditions = union.size > 0 ? [...union] : ['NONE_KNOWN'];
  }

  const pregnancySince = addMonths(today, -PREGNANCY_ANSWER_VALID_MONTHS);
  const pregnancyAnswer = latest(
    hypertensionRows
      .filter((h) => h.pregnantNow !== 'NOT_ASSESSED' || h.relevantConditions.includes('PREGNANCY'))
      .map((h) => ({ ...h, at: h.collectedAt })),
  );
  const pregnant =
    pregnancyAnswer && pregnancyAnswer.at >= pregnancySince
      ? pregnancyAnswer.pregnantNow === 'YES' ||
        pregnancyAnswer.relevantConditions.includes('PREGNANCY')
      : null;

  const recentHypertension =
    latestHypertension && latestHypertension.at >= symptomsSince ? latestHypertension : null;
  const recentDiabetes =
    latestDiabetes && latestDiabetes.at >= symptomsSince ? latestDiabetes : null;

  const glucoses = glucosesFrom(records);
  const contact = contactFacts(records);
  // Danger symptoms reported by phone count like those from the latest assessment (#338).
  const recentReports = (records.followUp?.reportedSymptoms ?? []).filter(
    (report) => report.at >= symptomsSince,
  );
  const reportedSymptoms = recentReports.flatMap((report) => report.symptoms);
  const diabetesSymptoms = [
    ...new Set([
      ...(recentDiabetes?.urgentSymptoms ?? []),
      ...recentReports.flatMap((report) => report.diabetesSymptoms ?? []),
    ]),
  ].filter((symptom) => symptom !== 'NONE');
  const hypertensionSymptoms = [
    ...new Set([...(recentHypertension?.currentSymptoms ?? []), ...reportedSymptoms]),
  ].filter((symptom) => symptom !== 'NONE');
  const hba1c = latest(
    diabetesRows
      .filter((d) => d.hba1cPercent != null)
      .map((d) => ({ percent: d.hba1cPercent!, at: d.hba1cMeasuredOn ?? d.collectedAt })),
  );

  const bodyRow = encounters.find(
    (e) => e.vitals?.bmi != null || (e.vitals?.weightKg != null && e.vitals?.heightCm != null),
  )?.vitals;
  const bmi = bodyRow
    ? (bodyRow.bmi ?? computeBmi(bodyRow.weightKg, bodyRow.heightCm) ?? null)
    : null;

  const smokingStatus = encounters.find(
    (e) => e.tobacco && e.tobacco.smokingStatus !== 'NOT_ASSESSED',
  )?.tobacco?.smokingStatus;
  const smoker =
    smokingStatus === undefined
      ? null
      : smokingStatus === 'CURRENT' ||
        smokingStatus === 'CURRENT_DAILY' ||
        smokingStatus === 'CURRENT_OCCASIONAL';

  return {
    today,
    timeZone: records.timeZone,
    ageYears: records.patient.dob ? ageOn(records.patient.dob, today) : null,
    sex: records.patient.sex,
    readings: readingsFrom(records),
    glucose: latest(glucoses.measured),
    selfReportedGlucose: latest(glucoses.reported),
    hba1c: hba1c ? { percent: hba1c.percent, at: hba1c.at } : null,
    symptoms: {
      hypertension: hypertensionSymptoms,
      diabetes: diabetesSymptoms,
    },
    hypoglycaemiaSymptoms: recentDiabetes
      ? recentDiabetes.symptoms.includes('HYPOGLYCEMIA_SYMPTOMS')
      : null,
    pregnant,
    conditions,
    hypertensionDiagnosed,
    onTreatment: {
      hypertension: treatedFor(records, HYPERTENSION_DRUG_CATEGORIES, controlSince),
      diabetes: treatedFor(records, DIABETES_DRUG_CATEGORIES, controlSince),
    },
    medicationChangedAt: lastMedicationChange(records),
    bmi,
    smoker,
    ...contact,
  };
}

/**
 * The missed-contact rule's two dates (#338). A visit is a completed contact, and so is any call
 * that reached the patient. The due date is the oldest one still unresolved after the last
 * completed contact, so a missed contact keeps counting until someone actually reaches them.
 */
function contactFacts(
  records: FollowUpRecords,
): Pick<FollowUpInput, 'lastCompletedContactAt' | 'nextContactDueAt'> {
  if (!records.followUp) return {};
  const completed = [
    ...records.followUp.completedAt,
    ...records.encounters.map((e) => e.createdAt),
  ];
  const last = completed.reduce<Date | null>((max, at) => (!max || at > max ? at : max), null);
  const due = records.followUp.unresolvedDueOn
    .filter((dueOn) => !last || dueOn > last)
    .reduce<Date | null>((min, at) => (!min || at < min ? at : min), null);
  return { lastCompletedContactAt: last, nextContactDueAt: due };
}
