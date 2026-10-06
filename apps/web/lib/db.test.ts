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

  it('indexes the residential region on the patients store for offline filtering', () => {
    const patients = db.tables.find((table) => table.name === 'patients');
    const indexNames = patients?.schema.indexes.map((index) => index.name) ?? [];
    expect(indexNames).toContain('residentialRegion');
  });

  it('keeps one offline copy per clinic view, keyed by clinic and view (v12)', () => {
    const cache = db.tables.find((table) => table.name === 'ops_cache');
    expect(cache?.schema.primKey.name).toBe('key');
    expect(cache?.schema.indexes.map((index) => index.name)).toEqual(
      expect.arrayContaining(['clinicId', 'updatedAt']),
    );
  });

  it('keeps portal copies keyed by account, with the account indexed for purges (v13)', () => {
    const cache = db.tables.find((table) => table.name === 'portal_cache');
    expect(cache?.schema.primKey.name).toBe('key');
    expect(cache?.schema.indexes.map((index) => index.name)).toEqual(
      expect.arrayContaining(['userId', 'updatedAt']),
    );
  });
});
