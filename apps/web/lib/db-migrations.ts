import { parseLegacyDiabetesSymptoms, type DiabetesSymptom } from '@nkwapa/db';

export interface LegacyPulseRecord {
  heartRate?: number;
  pulseBpm?: number;
}

/** Mutates a cached vitals row during the Dexie v4 upgrade. */
export function migrateLegacyPulse(record: LegacyPulseRecord): void {
  if (record.pulseBpm == null && record.heartRate != null) {
    record.pulseBpm = record.heartRate;
  }
  delete record.heartRate;
}

export interface LegacyDiabetesScreeningRecord {
  symptoms?: DiabetesSymptom[];
  symptomsJson?: string;
  legacySymptomsUnmapped?: boolean;
  collectedAt?: string;
  createdAt?: string;
}

/** Mutates a cached diabetes row during the Dexie v6 upgrade. */
export function migrateLegacyDiabetesScreening(record: LegacyDiabetesScreeningRecord): void {
  if (!record.symptoms) {
    const parsed = parseLegacyDiabetesSymptoms(record.symptomsJson);
    record.symptoms = parsed.symptoms;
    record.legacySymptomsUnmapped = parsed.hasUnmapped;
  }
  record.collectedAt ??= record.createdAt ?? new Date().toISOString();
}

/**
 * Remove the encrypted national id and its hash from a cached patient record.
 *
 * Both were pulled from the server and written to IndexedDB, and neither was ever read: the
 * client cannot decrypt the ciphertext, and the hash was only ever an unused index. They were
 * sensitive data sitting on every clinician's device for no purpose.
 */
export function stripStoredNationalIdSecrets(record: object): void {
  const stored = record as { nationalIdCiphertext?: unknown; nationalIdHash?: unknown };
  delete stored.nationalIdCiphertext;
  delete stored.nationalIdHash;
}

export interface LegacyHypertensionAssessmentRecord {
  classification?: string;
  derivedClassification?: string;
  classificationOverridden?: boolean;
  collectedAt?: string;
  createdAt?: string;
  hypertensionStatus?: string;
  currentSymptoms?: string[];
  urgentReviewRequired?: boolean;
  urgentReviewReasons?: string[];
  reviewReasons?: string[];
  relevantConditions?: string[];
  contributingSubstances?: string[];
  medicationReminderStrategies?: string[];
}

/**
 * Mutates a cached hypertension row during the Dexie v9 upgrade.
 *
 * The stored record predates the guided interview and holds a classification, two booleans and a
 * note. Every new field gets its unanswered value so the form can tell "not yet asked" from
 * "answered no" -- without that distinction a rehydrated old record would read as a patient who
 * denied every symptom.
 *
 * The existing classification becomes an override, mirroring the server migration. From this
 * release the server derives a classification from the encounter's vitals, and a cached row that
 * did not claim an override would have its clinician-entered finding replaced on the next save.
 */
export function migrateLegacyHypertensionAssessment(
  record: LegacyHypertensionAssessmentRecord,
): void {
  record.collectedAt ??= record.createdAt ?? new Date().toISOString();
  record.derivedClassification ??= record.classification ?? 'UNKNOWN';
  record.classificationOverridden ??= true;
  record.hypertensionStatus ??= 'NOT_ASSESSED';
  record.currentSymptoms ??= [];
  record.urgentReviewRequired ??= false;
  record.urgentReviewReasons ??= [];
  record.reviewReasons ??= [];
  record.relevantConditions ??= [];
  record.contributingSubstances ??= [];
  record.medicationReminderStrategies ??= [];
}
