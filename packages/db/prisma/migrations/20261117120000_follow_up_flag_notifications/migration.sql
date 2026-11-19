-- Follow-up flag notifications (#337): new bell kinds, the flags staff were told about, and who
-- took an urgent one. Idempotent throughout, because a Prisma deploy is not one transaction.

ALTER TYPE "InboxNotificationKind" ADD VALUE IF NOT EXISTS 'RISK_TIER_CHANGE';
ALTER TYPE "InboxNotificationKind" ADD VALUE IF NOT EXISTS 'FOLLOW_UP_DUE';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RiskFlagKind') THEN
    CREATE TYPE "RiskFlagKind" AS ENUM ('URGENT', 'HIGH', 'SEVERE_BP', 'NOT_IMPROVING');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "PatientRiskFlag" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "kind" "RiskFlagKind" NOT NULL,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "escalatedAt" TIMESTAMP(3),

    CONSTRAINT "PatientRiskFlag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PatientRiskFlag_assessmentId_kind_key"
  ON "PatientRiskFlag"("assessmentId", "kind");
CREATE INDEX IF NOT EXISTS "PatientRiskFlag_patientId_kind_raisedAt_idx"
  ON "PatientRiskFlag"("patientId", "kind", "raisedAt");

ALTER TABLE "PatientRiskFlag" DROP CONSTRAINT IF EXISTS "PatientRiskFlag_clinicId_fkey";
ALTER TABLE "PatientRiskFlag" ADD CONSTRAINT "PatientRiskFlag_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientRiskFlag" DROP CONSTRAINT IF EXISTS "PatientRiskFlag_patientId_fkey";
ALTER TABLE "PatientRiskFlag" ADD CONSTRAINT "PatientRiskFlag_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientRiskFlag" DROP CONSTRAINT IF EXISTS "PatientRiskFlag_assessmentId_fkey";
ALTER TABLE "PatientRiskFlag" ADD CONSTRAINT "PatientRiskFlag_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "PatientRiskAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "RiskFlagAcknowledgement" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "flagId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskFlagAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- One acknowledgement per flag: two people pressing "I'm on it" at once meet here.
CREATE UNIQUE INDEX IF NOT EXISTS "RiskFlagAcknowledgement_flagId_key"
  ON "RiskFlagAcknowledgement"("flagId");

ALTER TABLE "RiskFlagAcknowledgement" DROP CONSTRAINT IF EXISTS "RiskFlagAcknowledgement_flagId_fkey";
ALTER TABLE "RiskFlagAcknowledgement" ADD CONSTRAINT "RiskFlagAcknowledgement_flagId_fkey"
  FOREIGN KEY ("flagId") REFERENCES "PatientRiskFlag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RiskFlagAcknowledgement" DROP CONSTRAINT IF EXISTS "RiskFlagAcknowledgement_userId_fkey";
ALTER TABLE "RiskFlagAcknowledgement" ADD CONSTRAINT "RiskFlagAcknowledgement_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InboxNotification" ADD COLUMN IF NOT EXISTS "riskFlagId" UUID;
CREATE INDEX IF NOT EXISTS "InboxNotification_riskFlagId_idx" ON "InboxNotification"("riskFlagId");
ALTER TABLE "InboxNotification" DROP CONSTRAINT IF EXISTS "InboxNotification_riskFlagId_fkey";
ALTER TABLE "InboxNotification" ADD CONSTRAINT "InboxNotification_riskFlagId_fkey"
  FOREIGN KEY ("riskFlagId") REFERENCES "PatientRiskFlag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row level security, the PatientRiskAssessment shape: clinical staff at the clinic read, only the
-- system writes. A flag's one update (escalatedAt) is the system's; an acknowledgement has no
-- UPDATE or DELETE policy at all, so who took a flag cannot be rewritten.
ALTER TABLE "PatientRiskFlag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PatientRiskFlag" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "PatientRiskFlag_clinical_select" ON "PatientRiskFlag";
CREATE POLICY "PatientRiskFlag_clinical_select" ON "PatientRiskFlag"
FOR SELECT
USING (
  app.is_system_admin()
  OR (
    app.can_access_clinic("clinicId")
    AND app.has_clinic_role("clinicId", ARRAY['DOCTOR', 'VOLUNTEER', 'MANAGER', 'DIRECTOR']::"UserRole"[])
  )
);
DROP POLICY IF EXISTS "PatientRiskFlag_system_insert" ON "PatientRiskFlag";
CREATE POLICY "PatientRiskFlag_system_insert" ON "PatientRiskFlag"
FOR INSERT
WITH CHECK (app.is_system_admin());
DROP POLICY IF EXISTS "PatientRiskFlag_system_update" ON "PatientRiskFlag";
CREATE POLICY "PatientRiskFlag_system_update" ON "PatientRiskFlag"
FOR UPDATE
USING (app.is_system_admin())
WITH CHECK (app.is_system_admin());

ALTER TABLE "RiskFlagAcknowledgement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RiskFlagAcknowledgement" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "RiskFlagAcknowledgement_clinical_select" ON "RiskFlagAcknowledgement";
CREATE POLICY "RiskFlagAcknowledgement_clinical_select" ON "RiskFlagAcknowledgement"
FOR SELECT
USING (
  app.is_system_admin()
  OR (
    app.can_access_clinic("clinicId")
    AND app.has_clinic_role("clinicId", ARRAY['DOCTOR', 'VOLUNTEER', 'MANAGER', 'DIRECTOR']::"UserRole"[])
  )
);
DROP POLICY IF EXISTS "RiskFlagAcknowledgement_system_insert" ON "RiskFlagAcknowledgement";
CREATE POLICY "RiskFlagAcknowledgement_system_insert" ON "RiskFlagAcknowledgement"
FOR INSERT
WITH CHECK (app.is_system_admin());
