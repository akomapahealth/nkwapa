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

  it('indexes no clinical or demographic value, since indexes are stored in the clear (v16, #207)', () => {
    const indexed = (name: string) =>
      db.tables.find((table) => table.name === name)?.schema.indexes.map((index) => index.name) ??
      [];
    expect(indexed('patients')).not.toContain('residentialRegion');
    expect(indexed('medical_history_records')).not.toContain('category');
    expect(indexed('medical_history_revisions')).not.toContain('status');
    expect(indexed('medication_adherence')).not.toContain('context');
    expect(indexed('medication_adherence')).not.toContain('[encounterId+context]');
    expect(indexed('tobacco_screenings')).not.toContain('reviewedAt');
    expect(indexed('diabetes_screenings')).not.toContain('collectedAt');
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
