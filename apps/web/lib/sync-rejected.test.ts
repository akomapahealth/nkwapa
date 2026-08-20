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

const bundle = {
  id: 'mutation-bundle',
  clinicId: 'clinic-1',
  entityType: 'encounter_vitals_bundle',
  entityId: 'vitals-1',
  operation: 'UPSERT',
  payloadJson: JSON.stringify({ encounterId: 'encounter-1' }),
  idempotencyKey: 'idempotency-1',
  createdAt: '2026-08-20T12:00:00.000Z',
};

const mockDelete = jest.fn();

jest.mock('./db', () => {
  const put = jest.fn();
  const table = { put };
  return {
    db: {
      outbox: {
        where: jest.fn(() => ({
          equals: jest.fn(() => ({ sortBy: jest.fn().mockResolvedValue([bundle]) })),
        })),
        delete: mockDelete,
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

/**
 * A mutation the server refuses outright used to be invisible: it was neither applied nor
 * treated as a conflict, so it stayed queued and was re-pushed on every sync forever while
 * the pending counter never cleared and nothing told the user why.
 */
describe('sync push rejections', () => {
  beforeEach(() => {
    mockDelete.mockClear();
  });

  const pushResponding = (results: unknown) => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => results })
      .mockResolvedValueOnce({ ok: true, json: async () => emptyPull });
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  };

  it('surfaces a rejected mutation instead of retrying it silently', async () => {
    pushResponding({
      results: [
        {
          id: bundle.id,
          status: 'ERROR',
          conflictType: 'VALIDATION_ERROR',
          conflictDetails: {
            code: 'VALIDATION_ERROR',
            fieldErrors: [
              {
                field: 'vitals.temperatureValue',
                message: 'Temperature value, unit, and source are required together',
              },
            ],
          },
        },
      ],
    });

    const result = await syncNow({ clinicId: bundle.clinicId });

    expect(result.success).toBe(false);
    expect(result.error).toContain('could not be synced');
    expect(result.error).toContain('Temperature value, unit, and source are required together');
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected?.[0]?.id).toBe(bundle.id);
  });

  it('keeps the queued row so a clinician entry is never silently discarded', async () => {
    pushResponding({
      results: [{ id: bundle.id, status: 'ERROR', conflictType: 'VALIDATION_ERROR' }],
    });

    await syncNow({ clinicId: bundle.clinicId });

    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('still removes rows the server applied', async () => {
    pushResponding({ results: [{ id: bundle.id, status: 'APPLIED' }] });

    const result = await syncNow({ clinicId: bundle.clinicId });

    expect(result.success).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith(bundle.id);
  });

  it('reports a conflict as a conflict, not as a rejection', async () => {
    pushResponding({
      results: [{ id: bundle.id, status: 'CONFLICT', conflictType: 'CONFLICT_FINALIZED' }],
    });

    const result = await syncNow({ clinicId: bundle.clinicId });

    expect(result.success).toBe(true);
    expect(result.conflicts).toHaveLength(1);
    expect(result.rejected).toBeUndefined();
  });
});
