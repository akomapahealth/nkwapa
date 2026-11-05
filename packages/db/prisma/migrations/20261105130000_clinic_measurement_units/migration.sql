-- The units each clinic types and reads screening measurements in.
--
-- Stored values do not change: glucose stays whole mg/dL, weight kg, height cm, HbA1c %. These
-- columns only steer entry and display, so no measurement row is touched here.
--
-- Rollback: DROP the three columns, then the three types. Nothing else depends on them.

DO $$ BEGIN
  CREATE TYPE "GlucoseUnit" AS ENUM ('MG_DL', 'MMOL_L');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "BodyMeasureUnit" AS ENUM ('METRIC', 'US');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "Hba1cUnit" AS ENUM ('PERCENT', 'MMOL_MOL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "glucoseUnit" "GlucoseUnit" NOT NULL DEFAULT 'MMOL_L';
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "bodyUnit" "BodyMeasureUnit" NOT NULL DEFAULT 'METRIC';
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "hba1cUnit" "Hba1cUnit" NOT NULL DEFAULT 'PERCENT';

-- Clinics in countries that work in mg/dL or US body units start there. The lists must match
-- MG_DL_COUNTRY_CODES and US_BODY_COUNTRY_CODES in packages/db/src/measurement-units.ts (a spec
-- checks). Every other clinic, including every Ghana clinic, keeps the column default. Each
-- statement stands alone, because a Prisma deploy here does not run the file as one transaction:
-- a deploy that stops halfway leaves valid units, and a retry reaches the same result. "Clinic" has forced row
-- level security, so it is updated with system-admin scope for this session only.
SELECT set_config('app.is_system_admin', 'true', false);

UPDATE "Clinic" SET "glucoseUnit" = 'MG_DL'
WHERE upper("countryCode") IN ('US', 'IN', 'JP', 'FR', 'IL', 'EG', 'BR', 'MX');

UPDATE "Clinic" SET "bodyUnit" = 'US'
WHERE upper("countryCode") IN ('US', 'LR', 'MM');
