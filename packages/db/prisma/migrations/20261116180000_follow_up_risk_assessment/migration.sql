-- Live follow-up tier (#336): an append-only history of computed tiers per patient, and a
-- pointer plus a copy of the tier on Patient so lists can filter without a join.
--
-- Idempotent throughout, because a Prisma deploy is not one transaction.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FollowUpTier') THEN
    CREATE TYPE "FollowUpTier" AS ENUM ('URGENT', 'HIGH', 'MODERATE', 'LOW_MODERATE', 'STABLE', 'LOW', 'NOT_TIERED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FollowUpCaughtBy') THEN
    CREATE TYPE "FollowUpCaughtBy" AS ENUM ('DANGER_SIGNS', 'AUTO_HIGH', 'RISK_CHART', 'CONTROL_ONLY');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FollowUpMovement') THEN
    CREATE TYPE "FollowUpMovement" AS ENUM ('UP', 'DOWN', 'SAME', 'NEW');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "PatientRiskAssessment" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "tier" "FollowUpTier" NOT NULL,
    "caughtBy" "FollowUpCaughtBy",
    "reasons" TEXT[],
    "missing" TEXT[],
    "actions" TEXT[],
    "cvdRiskPercent" INTEGER,
    "chart" VARCHAR(16),
    "atTarget" BOOLEAN,
    "controlStatus" VARCHAR(32) NOT NULL,
    "screeningGroup" VARCHAR(40),
    "inputSnapshot" JSONB NOT NULL,
    "configVersion" VARCHAR(64) NOT NULL,
    "trigger" VARCHAR(40) NOT NULL,
    "triggeredByUserId" UUID,
    "previousTier" "FollowUpTier",
    "movement" "FollowUpMovement" NOT NULL,
    "movementTrigger" VARCHAR(40),
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientRiskAssessment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PatientRiskAssessment_clinicId_patientId_computedAt_idx"
  ON "PatientRiskAssessment"("clinicId", "patientId", "computedAt");

ALTER TABLE "PatientRiskAssessment" DROP CONSTRAINT IF EXISTS "PatientRiskAssessment_clinicId_fkey";
ALTER TABLE "PatientRiskAssessment" ADD CONSTRAINT "PatientRiskAssessment_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientRiskAssessment" DROP CONSTRAINT IF EXISTS "PatientRiskAssessment_patientId_fkey";
ALTER TABLE "PatientRiskAssessment" ADD CONSTRAINT "PatientRiskAssessment_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "currentRiskAssessmentId" UUID;
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "currentRiskTier" "FollowUpTier";
CREATE UNIQUE INDEX IF NOT EXISTS "Patient_currentRiskAssessmentId_key" ON "Patient"("currentRiskAssessmentId");
CREATE INDEX IF NOT EXISTS "Patient_primaryClinicId_currentRiskTier_idx" ON "Patient"("primaryClinicId", "currentRiskTier");
ALTER TABLE "Patient" DROP CONSTRAINT IF EXISTS "Patient_currentRiskAssessmentId_fkey";
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_currentRiskAssessmentId_fkey"
  FOREIGN KEY ("currentRiskAssessmentId") REFERENCES "PatientRiskAssessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row level security. Clinical staff at the clinic read (#334.18 may narrow the roles). Only the
-- system writes: recompute runs as the system actor, never as the person whose save caused it.
-- There is no UPDATE or DELETE policy on purpose, so a computed tier cannot be altered or removed.
ALTER TABLE "PatientRiskAssessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PatientRiskAssessment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "PatientRiskAssessment_clinical_select" ON "PatientRiskAssessment";
CREATE POLICY "PatientRiskAssessment_clinical_select" ON "PatientRiskAssessment"
FOR SELECT
USING (
  app.is_system_admin()
  OR (
    app.can_access_clinic("clinicId")
    AND app.has_clinic_role("clinicId", ARRAY['DOCTOR', 'VOLUNTEER', 'MANAGER', 'DIRECTOR']::"UserRole"[])
  )
);
DROP POLICY IF EXISTS "PatientRiskAssessment_system_insert" ON "PatientRiskAssessment";
CREATE POLICY "PatientRiskAssessment_system_insert" ON "PatientRiskAssessment"
FOR INSERT
WITH CHECK (app.is_system_admin());
