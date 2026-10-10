import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('patient residential location migration', () => {
  const migration = readFileSync(
    resolve(
      __dirname,
      '../prisma/migrations/20260819120000_add_patient_residential_location/migration.sql',
    ),
    'utf8',
  );

  it('creates the region and deliberate-status enums', () => {
    expect(migration).toContain('CREATE TYPE "GhanaRegion" AS ENUM');
    expect(migration).toContain("'GREATER_ACCRA'");
    expect(migration).toContain("'WESTERN_NORTH'");
    expect(migration).toContain(
      "CREATE TYPE \"PatientLocationStatus\" AS ENUM ('RECORDED', 'UNKNOWN', 'NOT_RECORDED')",
    );
  });

  it('adds residential columns keeping location separate from primary clinic', () => {
    expect(migration).toContain('ALTER TABLE "Patient"');
    expect(migration).toContain('"residentialLocationStatus" "PatientLocationStatus"');
    expect(migration).toContain('"residentialRegion" "GhanaRegion"');
    expect(migration).toContain('"residentialDistrict" VARCHAR(120)');
    expect(migration).toContain('"residentialCommunity" VARCHAR(120)');
    expect(migration).toContain('"residentialAddressNote" VARCHAR(280)');
  });

  it('backfills existing patients to NOT_RECORDED without fabricating a location', () => {
    expect(migration).toContain("NOT NULL DEFAULT 'NOT_RECORDED'");
    // Region/district/community/address-note must remain nullable (no default).
    expect(migration).not.toMatch(/"residentialRegion"[^\n]*DEFAULT/);
  });

  it('indexes location filters within the clinic scope', () => {
    expect(migration).toContain('CREATE INDEX "Patient_primaryClinicId_residentialRegion_idx"');
    expect(migration).toContain(
      'CREATE INDEX "Patient_primaryClinicId_residentialLocationStatus_idx"',
    );
  });
});
