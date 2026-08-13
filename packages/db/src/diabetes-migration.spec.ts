import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('diabetes screening migration', () => {
  const migration = readFileSync(
    resolve(
      __dirname,
      '../prisma/migrations/20260812000000_promote_diabetes_screening/migration.sql',
    ),
    'utf8',
  );

  it('adds structured symptoms and clinical provenance while retaining legacy JSON', () => {
    expect(migration).toContain('CREATE TYPE "DiabetesSymptom"');
    expect(migration).toContain('ADD COLUMN "symptoms"');
    expect(migration).not.toContain('DROP COLUMN "symptomsJson"');
    expect(migration).toContain('"legacySymptomsUnmapped"');
    expect(migration).toContain('"collectedAt" = screening."createdAt"');
    expect(migration).toContain('"authoredByUserId" = encounter."createdByUserId"');
  });

  it('maps every supported legacy label and catches malformed JSON', () => {
    for (const label of ['Polyuria', 'Polydipsia', 'Weight loss', 'Blurred vision', 'Fatigue']) {
      expect(migration).toContain(`WHEN '${label}'`);
    }
    expect(migration).toContain('EXCEPTION WHEN OTHERS');
  });

  it('adds bounds, provenance indexes, and the author foreign key', () => {
    expect(migration).toContain('"DiabetesScreening_glucose_range_check"');
    expect(migration).toContain('"DiabetesScreening_hba1c_range_check"');
    expect(migration).toContain('"DiabetesScreening_clinicId_collectedAt_idx"');
    expect(migration).toContain('"DiabetesScreening_authoredByUserId_fkey"');
  });
});
