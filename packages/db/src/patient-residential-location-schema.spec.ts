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

describe('patient residential position migration (#343)', () => {
  const migration = readFileSync(
    resolve(__dirname, '../prisma/migrations/20261115130000_residential_position/migration.sql'),
    'utf8',
  );

  it('adds nullable Digital Address, landmark and position columns', () => {
    expect(migration).toContain('"residentialDigitalAddress" VARCHAR(16)');
    expect(migration).toContain('"residentialLandmark" VARCHAR(160)');
    expect(migration).toContain('"residentialLatitude" DECIMAL(9,6)');
    expect(migration).toContain('"residentialLongitude" DECIMAL(9,6)');
    expect(migration).toContain('"residentialPositionSource" "ResidentialPositionSource"');
    expect(migration).toContain('"residentialPositionAccuracyM" INTEGER');
    expect(migration).toContain('"residentialPositionCapturedAt" TIMESTAMP(3)');
    expect(migration).not.toMatch(/residential(?:Latitude|Longitude|DigitalAddress)[^\n]*DEFAULT/);
  });

  it('keeps latitude and longitude paired', () => {
    expect(migration).toContain(
      'CHECK (("residentialLatitude" IS NULL) = ("residentialLongitude" IS NULL))',
    );
  });

  it('is safe to re-run after a partial deploy', () => {
    expect(migration).not.toMatch(/ON COMMIT DROP/i);
    expect(migration.match(/ADD COLUMN IF NOT EXISTS/g)).toHaveLength(7);
    expect(migration).toContain("WHERE typname = 'ResidentialPositionSource'");
  });
});
