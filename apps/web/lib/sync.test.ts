const emptyPull = {
  cursor: 'cursor-1',
  patients: [],
  encounters: [],
  vitals: [],
  tobaccoScreenings: [],
  diabetesScreenings: [],
  hypertensionAssessments: [],
  carePlans: [],
  patientConsents: [],
  prescriptions: [],
  medicalHistoryRecords: [],
  medicalHistoryRevisions: [],
  patientMedicationRecords: [],
  patientMedicationRevisions: [],
  medicationReconciliationEvents: [],
  patientPharmacyRecords: [],
  patientPharmacyRevisions: [],
  patientPharmacyPreferences: [],
};

const mutation = {
  id: 'mutation-1',
  clinicId: 'clinic-1',
  entityType: 'diabetes_screening',
  entityId: 'screening-1',
  operation: 'UPSERT',
  payloadJson: JSON.stringify({ encounterId: 'encounter-1' }),
  idempotencyKey: 'idempotency-1',
  createdAt: '2026-08-12T12:00:00.000Z',
};

jest.mock('./db', () => {
  const put = jest.fn();
  const mockSortBy = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([mutation]);
  const table = { put };
  return {
    db: {
      outbox: {
        where: jest.fn(() => ({ equals: jest.fn(() => ({ sortBy: mockSortBy })) })),
        delete: jest.fn(),
      },
      sync_state: { get: jest.fn(), put },
      patients: table,
      encounters: table,
      vitals: table,
      tobacco_screenings: table,
      diabetes_screenings: table,
      hypertension_assessments: table,
      care_plans: table,
      patient_consents: table,
      prescriptions: table,
      medical_history_records: table,
      medical_history_revisions: table,
      patient_medication_records: table,
      patient_medication_revisions: table,
      medication_reconciliation_events: table,
      patient_pharmacy_records: table,
      patient_pharmacy_revisions: table,
      patient_pharmacy_preferences: table,
    },
  };
});

import { syncNow } from './sync';

describe('sync coordinator', () => {
  it('runs a follow-up pass when a mutation is queued during an active sync', async () => {
    let resolveFirstPull!: (value: unknown) => void;
    const firstPull = new Promise((resolve) => {
      resolveFirstPull = resolve;
    });
    const fetchMock = jest
      .fn()
      .mockReturnValueOnce(firstPull)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ id: mutation.id, status: 'APPLIED' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...emptyPull, cursor: 'cursor-2' }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const first = syncNow({ clinicId: mutation.clinicId });
    const concurrent = syncNow({ clinicId: mutation.clinicId });
    expect(concurrent).toBe(first);

    resolveFirstPull({ ok: true, json: async () => emptyPull });

    await expect(first).resolves.toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/sync/push');
  });
});
