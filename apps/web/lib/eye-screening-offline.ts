import type { NkwapaDb } from './db';
import type { EyeScreeningRecord, eyePayloadFromForm } from './eye-screening';
import { enqueueOutboxMutation, outboxSyncState, SYNC_OPERATION } from './outbox';
import { parseOutboxPayload } from './sync-conflicts';

/**
 * The eye examination saved without a connection (#423).
 *
 * One queued save per encounter: a later save replaces one not yet sent, so both carry the version
 * the form was opened at and the second never conflicts with the first.
 */
export const EYE_SCREENING_ENTITY = 'eye_screening';

type EyePayload = ReturnType<typeof eyePayloadFromForm>;

function queuedRows(dbInstance: Pick<NkwapaDb, 'outbox'>, clinicId: string, encounterId: string) {
  return dbInstance.outbox
    .where('clinicId')
    .equals(clinicId)
    .filter((row) => row.entityType === EYE_SCREENING_ENTITY && row.entityId === encounterId)
    .sortBy('createdAt');
}

export async function queueEyeScreening(
  dbInstance: NkwapaDb,
  input: { clinicId: string; encounterId: string; payload: EyePayload },
): Promise<EyeScreeningRecord> {
  await dbInstance.transaction('rw', dbInstance.outbox, async () => {
    // shortcut: a row already mid-push can still be replaced, and the replacement then conflicts
    // on version in the sync center; mark rows in flight if that is ever seen.
    const waiting = (await queuedRows(dbInstance, input.clinicId, input.encounterId)).filter(
      (row) => outboxSyncState(row) === 'pending' && !row.attempts,
    );
    await dbInstance.outbox.bulkDelete(waiting.map((row) => row.id));
    await enqueueOutboxMutation(dbInstance, {
      clinicId: input.clinicId,
      entityType: EYE_SCREENING_ENTITY,
      entityId: input.encounterId,
      operation: SYNC_OPERATION.UPSERT,
      // The encounter rides along for the sync center's link; the server reads entityId.
      payloadJson: { ...input.payload, encounterId: input.encounterId },
    });
  });
  return localRecord(input.encounterId, input.payload, new Date().toISOString());
}

/** This device's latest queued save for the encounter, drawn as a record, or null. */
export async function queuedEyeScreening(
  dbInstance: Pick<NkwapaDb, 'outbox'>,
  clinicId: string,
  encounterId: string,
): Promise<EyeScreeningRecord | null> {
  const rows = (await queuedRows(dbInstance, clinicId, encounterId)).filter(
    (row) => outboxSyncState(row) !== 'blocked',
  );
  const last = rows.at(-1);
  if (!last) return null;
  return localRecord(encounterId, parseOutboxPayload(last) as EyePayload, last.createdAt);
}

function localRecord(encounterId: string, payload: EyePayload, at: string): EyeScreeningRecord {
  const { expectedVersion, ...fields } = payload as EyePayload & { expectedVersion?: number };
  return {
    ...(fields as unknown as EyeScreeningRecord),
    id: '',
    encounterId,
    author: { id: '', displayName: 'this device (not sent yet)' },
    // The version it was opened at, so a further save still names the server's copy.
    version: expectedVersion ?? 0,
    updatedAt: at,
  };
}
