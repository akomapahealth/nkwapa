import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('expanded vitals and tobacco screening migration', () => {
  const migration = readFileSync(
    resolve(
      __dirname,
      '../prisma/migrations/20260811000000_expand_vitals_and_tobacco_screening/migration.sql',
    ),
    'utf8',
  );

  it('preserves legacy pulse data by renaming the existing column', () => {
    expect(migration).toContain('ALTER TABLE "Vitals" RENAME COLUMN "heartRate" TO "pulseBpm"');
    expect(migration).not.toContain('DROP COLUMN "heartRate"');
  });

  it('adds canonical measurement constraints and structured tobacco storage', () => {
    expect(migration).toContain('"Vitals_blood_pressure_pair_check"');
    expect(migration).toContain('"Vitals_temperature_check"');
    expect(migration).toContain('CREATE TABLE "TobaccoScreening"');
    expect(migration).toContain('"TobaccoScreening_review_pair_check"');
  });

  it('enforces clinic ownership through foreign keys and RLS', () => {
    expect(migration).toContain('ALTER TABLE "TobaccoScreening" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('"TobaccoScreening_clinic_scope_policy"');
    expect(migration).toContain('e."clinicId" = "clinicId"');
  });
});
