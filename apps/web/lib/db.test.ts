import { db } from './db';

describe('NkwapaDb longitudinal clinical schema', () => {
  it('registers medication, pharmacy, and history stores without replacing existing stores', () => {
    const tableNames = db.tables.map((table) => table.name);

    expect(tableNames).toEqual(
      expect.arrayContaining([
        'patients',
        'encounters',
        'outbox',
        'medical_history_records',
        'medical_history_revisions',
        'patient_medication_records',
        'patient_medication_revisions',
        'medication_reconciliation_events',
        'patient_pharmacy_records',
        'patient_pharmacy_revisions',
        'patient_pharmacy_preferences',
      ]),
    );
  });
});
