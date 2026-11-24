-- Red flags carried with a patient along the station line (#415). Safe to re-run.
ALTER TABLE "PatientCheckIn" ADD COLUMN IF NOT EXISTS "lineFlags" JSONB NOT NULL DEFAULT '[]';
