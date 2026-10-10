import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('medication reconciliation migration', () => {
  const migration = readFileSync(
    resolve(
      __dirname,
      '../prisma/migrations/20260811150000_add_medication_reconciliation/migration.sql',
    ),
    'utf8',
  );

  it('creates dedicated append-only clinical and pharmacy history', () => {
    expect(migration).toContain('CREATE TABLE "PatientMedicationRecord"');
    expect(migration).toContain('CREATE TABLE "PatientMedicationRevision"');
    expect(migration).toContain('CREATE TABLE "MedicationReconciliationEvent"');
    expect(migration).toContain('CREATE TABLE "PatientPharmacyRecord"');
    expect(migration).toContain('CREATE TABLE "PatientPharmacyRevision"');
    expect(migration).toContain('CREATE TABLE "PatientPharmacyPreference"');
  });

  it('enforces revision, date, and preferred-pharmacy invariants', () => {
    expect(migration).toContain('"PatientMedicationRevision_revisionNumber_check"');
    expect(migration).toContain('"PatientMedicationRevision_current_end_date_check"');
    expect(migration).toContain('"PatientPharmacyPreference_date_order_check"');
    expect(migration).toContain('"PatientPharmacyPreference_one_open_per_patient_key"');
    expect(migration).toContain('WHERE "effectiveTo" IS NULL');
  });

  it('enables clinic-scoped RLS for every new table', () => {
    for (const table of [
      'PatientMedicationRecord',
      'PatientMedicationRevision',
      'MedicationReconciliationEvent',
      'PatientPharmacyRecord',
      'PatientPharmacyRevision',
      'PatientPharmacyPreference',
    ]) {
      expect(migration).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`CREATE POLICY "${table}_clinic_scope_policy"`);
    }
  });
});
