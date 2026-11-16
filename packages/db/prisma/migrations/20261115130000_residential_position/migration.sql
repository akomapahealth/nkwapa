-- Residential position (#343): Ghana Digital Address, nearest landmark and an optional home
-- position. All nullable, nothing backfilled. Each step is safe to re-run after a partial deploy.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ResidentialPositionSource') THEN
    CREATE TYPE "ResidentialPositionSource" AS ENUM ('DEVICE', 'PASTED');
  END IF;
END $$;

ALTER TABLE "Patient"
  ADD COLUMN IF NOT EXISTS "residentialDigitalAddress" VARCHAR(16),
  ADD COLUMN IF NOT EXISTS "residentialLandmark" VARCHAR(160),
  ADD COLUMN IF NOT EXISTS "residentialLatitude" DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS "residentialLongitude" DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS "residentialPositionSource" "ResidentialPositionSource",
  ADD COLUMN IF NOT EXISTS "residentialPositionAccuracyM" INTEGER,
  ADD COLUMN IF NOT EXISTS "residentialPositionCapturedAt" TIMESTAMP(3);

-- Latitude and longitude are both present or both absent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Patient_residential_position_pair') THEN
    ALTER TABLE "Patient" ADD CONSTRAINT "Patient_residential_position_pair"
      CHECK (("residentialLatitude" IS NULL) = ("residentialLongitude" IS NULL));
  END IF;
END $$;
