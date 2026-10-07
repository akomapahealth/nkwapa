import { evaluateGlucoseSuspicion } from '@nkwapa/db';
import { generateClinicalId } from './clinical-measurements';
import { db, type DiabetesScreeningRecord } from './db';
import { claimEncounterRecord } from './encounter-record';
import { enqueueOutboxMutation, SYNC_OPERATION } from './outbox';

export const GLUCOSE_READING_TYPES = [
  'FASTING',
  'BEFORE_MEAL',
  'POST_PRANDIAL_2H',
  'RANDOM',
  'UNKNOWN',
] as const;
export type GlucoseReadingType = (typeof GLUCOSE_READING_TYPES)[number];

export type GlucoseReadingInput = {
  glucoseMgDl: number | null;
  glucoseType: GlucoseReadingType;
  collectedAt: string;
};

/**
 * Queue today's glucose reading on its own (`diabetes_glucose_reading`).
 *
 * The glucose station records only the reading. Queuing a full `diabetes_screening` instead would
 * reset every guided-interview answer on the server, so this writes the reading into the
 * encounter's one screening row and leaves the rest of the local copy as it is.
 */
export async function saveGlucoseReadingOffline(params: {
  clinicId: string;
  encounterId: string;
  reading: GlucoseReadingInput;
}): Promise<DiabetesScreeningRecord> {
  const claimed = await claimEncounterRecord(
    db.diabetes_screenings,
    params.encounterId,
    generateClinicalId,
  );
  const existing = await db.diabetes_screenings.get(claimed.id);
  const now = new Date().toISOString();
  const record: DiabetesScreeningRecord = {
    ...(existing ?? {}),
    id: claimed.id,
    clinicId: params.clinicId,
    encounterId: params.encounterId,
    glucoseMgDl: params.reading.glucoseMgDl ?? undefined,
    glucoseType: params.reading.glucoseType,
    collectedAt: params.reading.collectedAt,
    // Cached so the station can show the consequence offline; the server recomputes it.
    derivedSuspicion: evaluateGlucoseSuspicion(
      params.reading.glucoseMgDl,
      params.reading.glucoseType,
    ),
    createdAt: claimed.createdAt ?? existing?.createdAt ?? now,
    updatedAt: now,
  };

  await db.transaction('rw', db.diabetes_screenings, db.outbox, async () => {
    await db.diabetes_screenings.put(record);
    await enqueueOutboxMutation(db, {
      clinicId: params.clinicId,
      entityType: 'diabetes_glucose_reading',
      entityId: claimed.id,
      operation: SYNC_OPERATION.UPSERT,
      payloadJson: {
        encounterId: params.encounterId,
        clinicId: params.clinicId,
        glucoseMgDl: params.reading.glucoseMgDl,
        glucoseType: params.reading.glucoseType,
        collectedAt: params.reading.collectedAt,
      },
    });
  });
  return record;
}
