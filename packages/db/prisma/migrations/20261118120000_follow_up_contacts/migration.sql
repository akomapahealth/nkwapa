-- Follow-up contacts and attempts (#338). Idempotent: every statement is safe to re-run after a
-- partial failure, because `prisma migrate deploy` does not run a migration as one transaction.

DO $$ BEGIN
  CREATE TYPE "FollowUpContactMode" AS ENUM ('IN_PERSON', 'PHONE', 'SMS', 'WHATSAPP', 'VIDEO', 'HOME_VISIT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "FollowUpContactPurpose" AS ENUM ('ROUTINE', 'URGENT_CONFIRMATION', 'CONFIRM_READING', 'REMINDER_BEFORE_VISIT', 'ADHERENCE_REFILL', 'RESCREEN', 'REFERRAL_CONFIRMATION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "FollowUpContactStatus" AS ENUM ('DUE', 'DONE', 'MISSED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "FollowUpOutcome" AS ENUM ('ATTEMPTED', 'REACHED', 'DECLINED', 'AGREED_TO_RETURN', 'RETURNED', 'REFERRED', 'REFERRAL_CONFIRMED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "FollowUpNotReachedReason" AS ENUM ('NO_ANSWER', 'WRONG_NUMBER', 'SWITCHED_OFF', 'UNAVAILABLE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "FollowUpCancelReason" AS ENUM ('DECEASED', 'MOVED', 'OPTED_OUT', 'NOT_NEEDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "FollowUpClosingStep" AS ENUM ('EXPLAINED_RESULT', 'NAMED_RISK_FACTOR', 'AGREED_ACTIONS', 'SET_NEXT_CONTACT', 'REFERRED_IF_INDICATED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "FollowUpContact" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "mode" "FollowUpContactMode" NOT NULL,
  "purpose" "FollowUpContactPurpose" NOT NULL,
  "dueOn" DATE NOT NULL,
  "tierAtScheduling" "FollowUpTier" NOT NULL,
  "status" "FollowUpContactStatus" NOT NULL DEFAULT 'DUE',
  "ownerUserId" UUID,
  "encounterId" UUID,
  "completedAt" TIMESTAMP(3),
  "missedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancelReason" "FollowUpCancelReason",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FollowUpContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FollowUpAttempt" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "contactId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "byUserId" UUID NOT NULL,
  "mode" "FollowUpContactMode" NOT NULL,
  "outcome" "FollowUpOutcome" NOT NULL,
  "notReachedReason" "FollowUpNotReachedReason",
  "closingSteps" "FollowUpClosingStep"[] DEFAULT ARRAY[]::"FollowUpClosingStep"[],
  "symptoms" "HypertensionSymptom"[] DEFAULT ARRAY[]::"HypertensionSymptom"[],
  "adherence" "MedicationAdherenceLevel",
  "measurementId" UUID,
  "referralDestination" VARCHAR(200),
  "notes" VARCHAR(1000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FollowUpAttempt_pkey" PRIMARY KEY ("id")
);
-- Its own step, so a database that already applied the table above gains the column on re-run.
ALTER TABLE "FollowUpAttempt"
  ADD COLUMN IF NOT EXISTS "diabetesSymptoms" "DiabetesUrgentSymptom"[] NOT NULL DEFAULT ARRAY[]::"DiabetesUrgentSymptom"[];


CREATE INDEX IF NOT EXISTS "FollowUpContact_clinicId_status_dueOn_idx" ON "FollowUpContact"("clinicId", "status", "dueOn");
CREATE INDEX IF NOT EXISTS "FollowUpContact_clinicId_status_completedAt_idx" ON "FollowUpContact"("clinicId", "status", "completedAt");
CREATE INDEX IF NOT EXISTS "FollowUpContact_patientId_status_idx" ON "FollowUpContact"("patientId", "status");
CREATE INDEX IF NOT EXISTS "FollowUpAttempt_contactId_at_idx" ON "FollowUpAttempt"("contactId", "at");
CREATE INDEX IF NOT EXISTS "FollowUpAttempt_patientId_at_idx" ON "FollowUpAttempt"("patientId", "at");

ALTER TABLE "FollowUpContact" DROP CONSTRAINT IF EXISTS "FollowUpContact_clinicId_fkey";
ALTER TABLE "FollowUpContact" ADD CONSTRAINT "FollowUpContact_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUpContact" DROP CONSTRAINT IF EXISTS "FollowUpContact_patientId_fkey";
ALTER TABLE "FollowUpContact" ADD CONSTRAINT "FollowUpContact_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUpContact" DROP CONSTRAINT IF EXISTS "FollowUpContact_ownerUserId_fkey";
ALTER TABLE "FollowUpContact" ADD CONSTRAINT "FollowUpContact_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FollowUpContact" DROP CONSTRAINT IF EXISTS "FollowUpContact_encounterId_fkey";
ALTER TABLE "FollowUpContact" ADD CONSTRAINT "FollowUpContact_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FollowUpAttempt" DROP CONSTRAINT IF EXISTS "FollowUpAttempt_clinicId_fkey";
ALTER TABLE "FollowUpAttempt" ADD CONSTRAINT "FollowUpAttempt_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUpAttempt" DROP CONSTRAINT IF EXISTS "FollowUpAttempt_contactId_fkey";
ALTER TABLE "FollowUpAttempt" ADD CONSTRAINT "FollowUpAttempt_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "FollowUpContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUpAttempt" DROP CONSTRAINT IF EXISTS "FollowUpAttempt_patientId_fkey";
ALTER TABLE "FollowUpAttempt" ADD CONSTRAINT "FollowUpAttempt_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUpAttempt" DROP CONSTRAINT IF EXISTS "FollowUpAttempt_byUserId_fkey";
ALTER TABLE "FollowUpAttempt" ADD CONSTRAINT "FollowUpAttempt_byUserId_fkey" FOREIGN KEY ("byUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- An urgent danger sign reported on a contact raises a flag of its own (#338, as #334 decided).
ALTER TABLE "PatientRiskFlag" ADD COLUMN IF NOT EXISTS "attemptId" UUID;
CREATE UNIQUE INDEX IF NOT EXISTS "PatientRiskFlag_attemptId_kind_key" ON "PatientRiskFlag"("attemptId", "kind");
ALTER TABLE "PatientRiskFlag" DROP CONSTRAINT IF EXISTS "PatientRiskFlag_attemptId_fkey";
ALTER TABLE "PatientRiskFlag" ADD CONSTRAINT "PatientRiskFlag_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "FollowUpAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientRiskFlag" DROP CONSTRAINT IF EXISTS "PatientRiskFlag_source_check";
ALTER TABLE "PatientRiskFlag" ADD CONSTRAINT "PatientRiskFlag_source_check"
  CHECK ("assessmentId" IS NOT NULL OR "encounterId" IS NOT NULL OR "attemptId" IS NOT NULL);

-- Row level security: clinical staff at the clinic read; only the system writes, after the
-- follow-up service has checked FOLLOW_UP.MANAGE. Attempts are append-only: no update or delete.
ALTER TABLE "FollowUpContact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FollowUpContact" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "FollowUpContact_clinical_select" ON "FollowUpContact";
CREATE POLICY "FollowUpContact_clinical_select" ON "FollowUpContact"
FOR SELECT
USING (
  app.is_system_admin()
  OR (
    app.can_access_clinic("clinicId")
    AND app.has_clinic_role("clinicId", ARRAY['DOCTOR', 'VOLUNTEER', 'MANAGER', 'DIRECTOR']::"UserRole"[])
  )
);
DROP POLICY IF EXISTS "FollowUpContact_system_insert" ON "FollowUpContact";
CREATE POLICY "FollowUpContact_system_insert" ON "FollowUpContact"
FOR INSERT
WITH CHECK (app.is_system_admin());
DROP POLICY IF EXISTS "FollowUpContact_system_update" ON "FollowUpContact";
CREATE POLICY "FollowUpContact_system_update" ON "FollowUpContact"
FOR UPDATE
USING (app.is_system_admin())
WITH CHECK (app.is_system_admin());

ALTER TABLE "FollowUpAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FollowUpAttempt" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "FollowUpAttempt_clinical_select" ON "FollowUpAttempt";
CREATE POLICY "FollowUpAttempt_clinical_select" ON "FollowUpAttempt"
FOR SELECT
USING (
  app.is_system_admin()
  OR (
    app.can_access_clinic("clinicId")
    AND app.has_clinic_role("clinicId", ARRAY['DOCTOR', 'VOLUNTEER', 'MANAGER', 'DIRECTOR']::"UserRole"[])
  )
);
DROP POLICY IF EXISTS "FollowUpAttempt_system_insert" ON "FollowUpAttempt";
CREATE POLICY "FollowUpAttempt_system_insert" ON "FollowUpAttempt"
FOR INSERT
WITH CHECK (app.is_system_admin());
