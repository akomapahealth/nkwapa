-- Patient data rights requests: access, correction, deletion and restriction.
--
-- A patient files one from the portal; clinic managers and directors answer it. Each row keeps
-- when it arrived, when the answer is due (30 days) and how it was answered, which is the record a
-- data protection authority asks for.
--
-- Safe to re-run: Prisma deploy is not one transaction, so a half-applied run must not block a retry.

DO $$
BEGIN
  CREATE TYPE "PatientDataRequestType" AS ENUM ('ACCESS', 'CORRECTION', 'DELETION', 'RESTRICTION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "PatientDataRequestStatus" AS ENUM ('RECEIVED', 'IN_PROGRESS', 'COMPLETED', 'DECLINED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "PatientDataRequest" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "requestedByUserId" UUID NOT NULL,
    "type" "PatientDataRequestType" NOT NULL,
    "details" TEXT,
    "status" "PatientDataRequestStatus" NOT NULL DEFAULT 'RECEIVED',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "responseNote" TEXT,
    "respondedByUserId" UUID,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientDataRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PatientDataRequest_clinicId_status_dueAt_idx" ON "PatientDataRequest"("clinicId", "status", "dueAt");
CREATE INDEX IF NOT EXISTS "PatientDataRequest_patientId_createdAt_idx" ON "PatientDataRequest"("patientId", "createdAt");

ALTER TABLE "PatientDataRequest" DROP CONSTRAINT IF EXISTS "PatientDataRequest_clinicId_fkey";
ALTER TABLE "PatientDataRequest" ADD CONSTRAINT "PatientDataRequest_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientDataRequest" DROP CONSTRAINT IF EXISTS "PatientDataRequest_patientId_fkey";
ALTER TABLE "PatientDataRequest" ADD CONSTRAINT "PatientDataRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientDataRequest" DROP CONSTRAINT IF EXISTS "PatientDataRequest_requestedByUserId_fkey";
ALTER TABLE "PatientDataRequest" ADD CONSTRAINT "PatientDataRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientDataRequest" DROP CONSTRAINT IF EXISTS "PatientDataRequest_respondedByUserId_fkey";
ALTER TABLE "PatientDataRequest" ADD CONSTRAINT "PatientDataRequest_respondedByUserId_fkey" FOREIGN KEY ("respondedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row level security, as 20261030120000_research_export_schedules sets it for a clinic-scoped
-- table: ENABLE and FORCE together, because the application connects as the table owner.
ALTER TABLE "PatientDataRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PatientDataRequest" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "PatientDataRequest_clinic_scope_policy" ON "PatientDataRequest";
CREATE POLICY "PatientDataRequest_clinic_scope_policy" ON "PatientDataRequest"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));
