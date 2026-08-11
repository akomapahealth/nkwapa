import {
  buildMedicalHistoryOutboxPayload,
  buildMedicationReconciliationOutboxPayload,
  buildMedicationRevisionOutboxPayload,
  buildOutboxMutation,
  buildPharmacyPreferenceOutboxPayload,
  SYNC_OPERATION,
} from './outbox';

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
