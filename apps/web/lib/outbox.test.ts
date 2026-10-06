import {
  buildMedicalHistoryOutboxPayload,
  buildMedicationReconciliationOutboxPayload,
  buildMedicationRevisionOutboxPayload,
  buildOutboxMutation,
  buildPharmacyPreferenceOutboxPayload,
  discardOutboxMutation,
  enqueueOutboxMutation,
  isBlockingFailure,
  retryOutboxMutation,
  outboxFailureUpdate,
  outboxSyncState,
  SYNC_OPERATION,
} from './outbox';
import type { NkwapaDb } from './db';
import { createFakeSyncDb, queuedRow } from './testing/fake-sync-db';

describe('buildOutboxMutation', () => {
  it('produces objects with all required fields', () => {
    const params = {
      clinicId: 'clinic-1',
      entityType: 'patient',
      entityId: 'patient-1',
      operation: SYNC_OPERATION.UPSERT,
      payloadJson: { firstName: 'John', lastName: 'Doe' },
    };

    const record = buildOutboxMutation(params);

    expect(record).toHaveProperty('id');
    expect(record).toHaveProperty('clinicId', 'clinic-1');
    expect(record).toHaveProperty('entityType', 'patient');
    expect(record).toHaveProperty('entityId', 'patient-1');
    expect(record).toHaveProperty('operation', 'UPSERT');
    expect(record).toHaveProperty('payloadJson', JSON.stringify(params.payloadJson));
    expect(record).toHaveProperty('idempotencyKey');
    expect(record).toHaveProperty('createdAt');
  });

  it('generates unique id and idempotencyKey on each call', () => {
    const params = {
      clinicId: 'clinic-1',
      entityType: 'encounter',
      entityId: 'enc-1',
      operation: SYNC_OPERATION.UPSERT,
      payloadJson: {},
    };

    const r1 = buildOutboxMutation(params);
    const r2 = buildOutboxMutation(params);

    expect(r1.id).not.toBe(r2.id);
    expect(r1.idempotencyKey).not.toBe(r2.idempotencyKey);
  });

  it('uses provided idempotencyKey when given', () => {
    const params = {
      clinicId: 'clinic-1',
      entityType: 'patient',
      entityId: 'patient-1',
      operation: SYNC_OPERATION.UPSERT,
      payloadJson: {},
      idempotencyKey: 'custom-key-123',
    };

    const record = buildOutboxMutation(params);

    expect(record.idempotencyKey).toBe('custom-key-123');
  });

  it('serializes payloadJson as JSON string', () => {
    const payload = { nested: { a: 1 }, list: [1, 2] };
    const record = buildOutboxMutation({
      clinicId: 'c1',
      entityType: 'vitals',
      entityId: 'v1',
      operation: SYNC_OPERATION.UPSERT,
      payloadJson: payload,
    });

    expect(record.payloadJson).toBe(JSON.stringify(payload));
    expect(JSON.parse(record.payloadJson)).toEqual(payload);
  });
});

describe('buildMedicalHistoryOutboxPayload', () => {
  it('preserves client revision identity and optimistic concurrency fields', () => {
    expect(
      buildMedicalHistoryOutboxPayload({
        patientId: 'patient-1',
        revisionId: 'revision-2',
        expectedCurrentRevisionId: 'revision-1',
        status: 'RESOLVED',
        resolvedDate: '2026-07-30',
        details: { conditionName: 'Hypertension' },
      }),
    ).toEqual({
      patientId: 'patient-1',
      revisionId: 'revision-2',
      expectedCurrentRevisionId: 'revision-1',
      status: 'RESOLVED',
      resolvedDate: '2026-07-30',
      details: { conditionName: 'Hypertension' },
    });
  });
});

describe('medication reconciliation outbox payloads', () => {
  it('preserves client revision IDs and omits undefined catalog links', () => {
    expect(
      buildMedicationRevisionOutboxPayload({
        patientId: 'patient-1',
        revisionId: 'revision-1',
        medicationName: 'External medicine',
        drugId: undefined,
      }),
    ).toEqual({
      patientId: 'patient-1',
      revisionId: 'revision-1',
      medicationName: 'External medicine',
    });
  });

  it('preserves exact revision sets for whole-list reconciliation', () => {
    const items = [
      {
        recordId: 'record-1',
        expectedCurrentRevisionId: 'revision-1',
        newRevisionId: 'revision-2',
      },
    ];
    expect(
      buildMedicationReconciliationOutboxPayload({
        patientId: 'patient-1',
        outcome: 'CURRENT_LIST_REVIEWED',
        items,
      }),
    ).toEqual({ patientId: 'patient-1', outcome: 'CURRENT_LIST_REVIEWED', items });
  });

  it('keeps preference mutations distinct from prescriptions', () => {
    expect(
      buildPharmacyPreferenceOutboxPayload({
        patientId: 'patient-1',
        action: 'SET',
        pharmacyRecordId: 'pharmacy-1',
      }),
    ).toEqual({ patientId: 'patient-1', action: 'SET', pharmacyRecordId: 'pharmacy-1' });
  });
});

describe('outbox sync state', () => {
  it('reads a row written before sync states existed as pending', () => {
    expect(outboxSyncState({})).toBe('pending');
    expect(outboxSyncState({ syncState: 'blocked' })).toBe('blocked');
  });

  it('blocks on any conflict and on any refusal not explicitly retryable', () => {
    expect(isBlockingFailure({ status: 'CONFLICT', retryable: true })).toBe(true);
    expect(isBlockingFailure({ status: 'ERROR', retryable: false })).toBe(true);
    expect(isBlockingFailure({ status: 'ERROR' })).toBe(true);
    expect(isBlockingFailure({ status: 'ERROR', retryable: true })).toBe(false);
  });

  it('counts attempts and keeps the server answer verbatim', () => {
    const update = outboxFailureUpdate(
      { attempts: 2 },
      { status: 'ERROR', conflictType: 'FORBIDDEN', retryable: true, conflictDetails: { a: 1 } },
      '2026-09-27T00:00:00.000Z',
    );
    expect(update).toEqual({
      syncState: 'retrying',
      attempts: 3,
      lastAttemptAt: '2026-09-27T00:00:00.000Z',
      lastFailure: {
        status: 'ERROR',
        conflictType: 'FORBIDDEN',
        retryable: true,
        conflictDetails: { a: 1 },
        at: '2026-09-27T00:00:00.000Z',
      },
    });
  });
});

describe('enqueueOutboxMutation', () => {
  const params = {
    clinicId: 'clinic-1',
    entityType: 'patient_check_in',
    entityId: 'checkin-1',
    operation: SYNC_OPERATION.UPSERT,
    payloadJson: { patientId: 'patient-1' },
  };

  it('queues one row for one action, however many times it is submitted', async () => {
    const fake = createFakeSyncDb();
    const outboxDb = fake as unknown as NkwapaDb;

    const first = await enqueueOutboxMutation(outboxDb, { ...params, idempotencyKey: 'ops:k' });
    const second = await enqueueOutboxMutation(outboxDb, { ...params, idempotencyKey: 'ops:k' });

    expect(second.id).toBe(first.id);
    expect(fake.outbox.rows.size).toBe(1);
  });

  it('keeps the same key at two clinics as two changes, as the server does', async () => {
    const fake = createFakeSyncDb();
    const outboxDb = fake as unknown as NkwapaDb;

    const atA = await enqueueOutboxMutation(outboxDb, { ...params, idempotencyKey: 'ops:k' });
    const atB = await enqueueOutboxMutation(outboxDb, {
      ...params,
      clinicId: 'clinic-2',
      idempotencyKey: 'ops:k',
    });

    expect(atB.id).not.toBe(atA.id);
    expect(atB.clinicId).toBe('clinic-2');
    expect(fake.outbox.rows.size).toBe(2);
  });

  it('still queues every save that draws its own key', async () => {
    const fake = createFakeSyncDb();

    await enqueueOutboxMutation(fake as unknown as NkwapaDb, params);
    await enqueueOutboxMutation(fake as unknown as NkwapaDb, params);

    expect(fake.outbox.rows.size).toBe(2);
  });

  it('keeps the device-only context on the row and off the payload', async () => {
    const fake = createFakeSyncDb();

    const row = await enqueueOutboxMutation(fake as unknown as NkwapaDb, {
      ...params,
      localContext: { patientName: 'Ama Mensah' },
    });

    expect(row.localContext).toEqual({ patientName: 'Ama Mensah' });
    expect(JSON.parse(row.payloadJson)).toEqual({ patientId: 'patient-1' });
  });
});

describe('outbox recovery actions', () => {
  it('puts a blocked change back in line and keeps what went wrong last time', async () => {
    const fake = createFakeSyncDb();
    const failure = { status: 'CONFLICT', conflictType: 'STALE_MEDICAL_HISTORY_REVISION', at: 't' };
    await fake.outbox.put(queuedRow({ syncState: 'blocked', lastFailure: failure }));

    await retryOutboxMutation(fake as unknown as NkwapaDb, 'mutation-1');

    expect(await fake.outbox.get('mutation-1')).toMatchObject({
      syncState: 'pending',
      lastFailure: failure,
    });
  });

  it('discards only the local copy and makes the next sync restore the server version', async () => {
    const fake = createFakeSyncDb();
    const row = queuedRow({ entityType: 'patient', entityId: 'patient-1' });
    await fake.outbox.put(row);
    await fake.outbox.put(queuedRow({ id: 'other', entityId: 'patient-2' }));
    await fake.patients.put({ id: 'patient-1', firstName: 'Edited offline' });
    await fake.sync_state.put({ clinicId: 'clinic-1', cursor: 'c-9' });

    await discardOutboxMutation(fake as unknown as NkwapaDb, row);

    expect(await fake.outbox.get('mutation-1')).toBeUndefined();
    expect(await fake.outbox.get('other')).toBeDefined();
    expect(await fake.patients.get('patient-1')).toBeUndefined();
    expect(await fake.sync_state.get('clinic-1')).toBeUndefined();
  });

  it('leaves local stores alone for a change it cannot map to one row', async () => {
    const fake = createFakeSyncDb();
    const row = queuedRow({ entityType: 'medication_reconciliation', entityId: 'patient-1' });
    await fake.outbox.put(row);
    await fake.patients.put({ id: 'patient-1' });

    await discardOutboxMutation(fake as unknown as NkwapaDb, row);

    expect(await fake.patients.get('patient-1')).toBeDefined();
  });
});
