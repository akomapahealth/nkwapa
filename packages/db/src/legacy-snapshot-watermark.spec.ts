import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FIRST_CLINICAL_RECORDS_MIGRATION,
  PRE_CLINICAL_RECORDS_WATERMARK,
} from './migration-watermarks';

describe('migration rehearsal watermark', () => {
  const migrations = readdirSync(resolve(__dirname, '../prisma/migrations'))
    .filter((name) => /^\d/.test(name))
    .sort();

  it('still sits immediately before the clinical records initiative', () => {
    // The rehearsal loads its snapshot at this point. If a migration is inserted between the
    // watermark and the first clinical-records migration, the snapshot would be written against a
    // schema that no longer matches and the rehearsal would quietly stop testing the real upgrade.
    const watermarkIndex = migrations.indexOf(PRE_CLINICAL_RECORDS_WATERMARK);
    const firstClinicalIndex = migrations.indexOf(FIRST_CLINICAL_RECORDS_MIGRATION);

    expect(watermarkIndex).toBeGreaterThanOrEqual(0);
    expect(firstClinicalIndex).toBe(watermarkIndex + 1);
  });

  it('keeps the clinical records migrations after the watermark', () => {
    const watermarkIndex = migrations.indexOf(PRE_CLINICAL_RECORDS_WATERMARK);
    for (const migration of [
      '20260811000000_expand_vitals_and_tobacco_screening',
      '20260811150000_add_medication_reconciliation',
      '20260812000000_promote_diabetes_screening',
      '20260813090000_add_clinical_notes',
      '20260819120000_add_patient_residential_location',
    ]) {
      expect(migrations.indexOf(migration)).toBeGreaterThan(watermarkIndex);
    }
  });
});
