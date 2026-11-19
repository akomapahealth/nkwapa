-- Screening urgent findings get an owner too (#337): a flag a visit raises, for findings the
-- follow-up engine does not call Urgent (chest pain alone, low blood pressure). Idempotent.

ALTER TYPE "RiskFlagKind" ADD VALUE IF NOT EXISTS 'SCREENING_URGENT';

ALTER TABLE "PatientRiskFlag" ALTER COLUMN "assessmentId" DROP NOT NULL;
ALTER TABLE "PatientRiskFlag" ADD COLUMN IF NOT EXISTS "encounterId" UUID;
ALTER TABLE "PatientRiskFlag" ADD COLUMN IF NOT EXISTS "detail" VARCHAR(300);

-- One screening flag per visit: a second finding on the same visit joins the first.
CREATE UNIQUE INDEX IF NOT EXISTS "PatientRiskFlag_encounterId_kind_key"
  ON "PatientRiskFlag"("encounterId", "kind");

ALTER TABLE "PatientRiskFlag" DROP CONSTRAINT IF EXISTS "PatientRiskFlag_encounterId_fkey";
ALTER TABLE "PatientRiskFlag" ADD CONSTRAINT "PatientRiskFlag_encounterId_fkey"
  FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every flag comes from an assessment or a visit.
ALTER TABLE "PatientRiskFlag" DROP CONSTRAINT IF EXISTS "PatientRiskFlag_source_check";
ALTER TABLE "PatientRiskFlag" ADD CONSTRAINT "PatientRiskFlag_source_check"
  CHECK ("assessmentId" IS NOT NULL OR "encounterId" IS NOT NULL);
