-- Who actually screened at a station (#227). A volunteer without an account often works on
-- someone else's. The shift holds the current screener; each station visit snapshots it when the
-- stop ends. No backfill: old visits stay null and show the account holder, as before.
--
-- Safe to re-run: Prisma deploy is not one transaction, so a half-applied run must not block a retry.

ALTER TABLE "StaffShift" ADD COLUMN IF NOT EXISTS "screenerIsAccountHolder" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "StaffShift" ADD COLUMN IF NOT EXISTS "screenerName" VARCHAR(120);

ALTER TABLE "PatientStationVisit" ADD COLUMN IF NOT EXISTS "performedByIsAccountHolder" BOOLEAN;
ALTER TABLE "PatientStationVisit" ADD COLUMN IF NOT EXISTS "performedByName" VARCHAR(120);

-- Someone other than the account holder must have a name.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffShift_screener_name_check') THEN
    ALTER TABLE "StaffShift" ADD CONSTRAINT "StaffShift_screener_name_check"
      CHECK ("screenerIsAccountHolder" OR btrim(coalesce("screenerName", '')) <> '');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PatientStationVisit_performer_name_check') THEN
    ALTER TABLE "PatientStationVisit" ADD CONSTRAINT "PatientStationVisit_performer_name_check"
      CHECK ("performedByIsAccountHolder" IS DISTINCT FROM false OR btrim(coalesce("performedByName", '')) <> '');
  END IF;
END $$;
