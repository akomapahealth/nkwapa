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
