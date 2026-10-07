-- Station-based patient flow. Issue #167.
--
-- Clinics run screening as a line of stations (intake, blood pressure, glucose, anthropometry,
-- counselling and review). A patient is not owned by one volunteer: whoever is free at a station
-- claims the next patient there, records that station's data and hands them on. These tables
-- replace the manager-made PatientAssignment when FEATURE_STATION_WORKFLOW_ENABLED is on; that
-- table stays for history and for the flag-off path.

-- CreateEnum
CREATE TYPE "StationKind" AS ENUM ('INTAKE', 'BLOOD_PRESSURE', 'GLUCOSE', 'ANTHROPOMETRY', 'REVIEW', 'CUSTOM');

-- CreateEnum
CREATE TYPE "StationVisitStatus" AS ENUM ('QUEUED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CounsellingTopic" AS ENUM ('BLOOD_PRESSURE', 'GLUCOSE_DIABETES', 'WEIGHT_NUTRITION', 'PHYSICAL_ACTIVITY', 'TOBACCO', 'ALCOHOL', 'MEDICATION_ADHERENCE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReferralUrgency" AS ENUM ('ROUTINE', 'SOON', 'URGENT');

-- AlterTable
ALTER TABLE "StaffShift" ADD COLUMN     "stationId" UUID;

-- CreateTable
CREATE TABLE "ClinicStation" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "kind" "StationKind" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicStation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientStationVisit" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientCheckInId" UUID NOT NULL,
    "encounterId" UUID,
    "stationId" UUID NOT NULL,
    "status" "StationVisitStatus" NOT NULL DEFAULT 'QUEUED',
    "queuedAt" TIMESTAMP(3) NOT NULL,
    "queuedByUserId" UUID NOT NULL,
    "claimedByUserId" UUID,
    "claimedAt" TIMESTAMP(3),
    "completedByUserId" UUID,
    "completedAt" TIMESTAMP(3),
    "handoffNote" TEXT,
    "endReason" VARCHAR(500),
    "releaseCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientStationVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CounsellingRecord" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "encounterId" UUID NOT NULL,
    "topics" "CounsellingTopic"[] DEFAULT ARRAY[]::"CounsellingTopic"[],
    "topicOther" VARCHAR(200),
    "adviceGiven" TEXT NOT NULL DEFAULT '',
    "followUpRecommended" BOOLEAN NOT NULL DEFAULT false,
    "followUpWindow" "FollowUpWindow" NOT NULL DEFAULT 'NOT_ASSESSED',
    "followUpOther" VARCHAR(120),
    "referralRecommended" BOOLEAN NOT NULL DEFAULT false,
    "referralTo" VARCHAR(200),
    "referralReason" TEXT,
    "referralUrgency" "ReferralUrgency",
    "authorUserId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CounsellingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicStation_clinicId_active_sortOrder_idx" ON "ClinicStation"("clinicId", "active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicStation_clinicId_sortOrder_key" ON "ClinicStation"("clinicId", "sortOrder");

-- CreateIndex
CREATE INDEX "PatientStationVisit_clinicId_stationId_status_queuedAt_idx" ON "PatientStationVisit"("clinicId", "stationId", "status", "queuedAt");

-- CreateIndex
CREATE INDEX "PatientStationVisit_patientCheckInId_queuedAt_idx" ON "PatientStationVisit"("patientCheckInId", "queuedAt");

-- CreateIndex
CREATE INDEX "PatientStationVisit_encounterId_idx" ON "PatientStationVisit"("encounterId");

-- CreateIndex
CREATE INDEX "PatientStationVisit_claimedByUserId_status_idx" ON "PatientStationVisit"("claimedByUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CounsellingRecord_encounterId_key" ON "CounsellingRecord"("encounterId");

-- CreateIndex
CREATE INDEX "CounsellingRecord_clinicId_updatedAt_idx" ON "CounsellingRecord"("clinicId", "updatedAt");

-- AddForeignKey
ALTER TABLE "StaffShift" ADD CONSTRAINT "StaffShift_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "ClinicStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicStation" ADD CONSTRAINT "ClinicStation_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientStationVisit" ADD CONSTRAINT "PatientStationVisit_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientStationVisit" ADD CONSTRAINT "PatientStationVisit_patientCheckInId_fkey" FOREIGN KEY ("patientCheckInId") REFERENCES "PatientCheckIn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientStationVisit" ADD CONSTRAINT "PatientStationVisit_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientStationVisit" ADD CONSTRAINT "PatientStationVisit_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "ClinicStation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientStationVisit" ADD CONSTRAINT "PatientStationVisit_queuedByUserId_fkey" FOREIGN KEY ("queuedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientStationVisit" ADD CONSTRAINT "PatientStationVisit_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientStationVisit" ADD CONSTRAINT "PatientStationVisit_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounsellingRecord" ADD CONSTRAINT "CounsellingRecord_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounsellingRecord" ADD CONSTRAINT "CounsellingRecord_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounsellingRecord" ADD CONSTRAINT "CounsellingRecord_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A patient is at exactly one station at a time. The service checks this before it writes; this
-- is what holds when two volunteers hand the same patient on at the same moment. Same shape as
-- "PatientAssignment_active_unique_idx".
CREATE UNIQUE INDEX "PatientStationVisit_open_unique_idx" ON "PatientStationVisit"("patientCheckInId")
  WHERE "status" IN ('QUEUED', 'IN_PROGRESS');

-- A claimed visit names who holds it, and an unclaimed one names nobody. The claim route is a
-- conditional update on status; this stops a later code path leaving the two out of step.
ALTER TABLE "PatientStationVisit" ADD CONSTRAINT "PatientStationVisit_claim_check" CHECK (
  ("status" = 'IN_PROGRESS' AND "claimedByUserId" IS NOT NULL AND "claimedAt" IS NOT NULL)
  OR "status" <> 'IN_PROGRESS'
);

-- One active review station per clinic: completing it is what completes a patient's session.
CREATE UNIQUE INDEX "ClinicStation_active_review_unique_idx" ON "ClinicStation"("clinicId")
  WHERE "kind" = 'REVIEW' AND "active";

-- Row level security, as 20260925120000_staff_invites sets it for a clinic-scoped table: ENABLE
-- and FORCE together, because the application connects as the table owner.
ALTER TABLE "ClinicStation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClinicStation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ClinicStation_clinic_scope_policy" ON "ClinicStation";
CREATE POLICY "ClinicStation_clinic_scope_policy" ON "ClinicStation"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

ALTER TABLE "PatientStationVisit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PatientStationVisit" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "PatientStationVisit_clinic_scope_policy" ON "PatientStationVisit";
CREATE POLICY "PatientStationVisit_clinic_scope_policy" ON "PatientStationVisit"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

ALTER TABLE "CounsellingRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CounsellingRecord" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CounsellingRecord_clinic_scope_policy" ON "CounsellingRecord";
CREATE POLICY "CounsellingRecord_clinic_scope_policy" ON "CounsellingRecord"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

-- Seed every existing clinic with the UCC station line. New clinics get the same template from
-- ClinicService (packages/db/src/clinic-stations.ts holds it). "Clinic" has forced row level
-- security, so the backfill reads it with system-admin scope for this session only.
SELECT set_config('app.is_system_admin', 'true', false);

INSERT INTO "ClinicStation" ("id", "clinicId", "kind", "name", "sortOrder", "updatedAt")
SELECT gen_random_uuid(), c."id", t."kind"::"StationKind", t."name", t."sortOrder", CURRENT_TIMESTAMP
FROM "Clinic" c
CROSS JOIN (
  VALUES
    ('INTAKE', 'Registration and medical history', 1),
    ('BLOOD_PRESSURE', 'Blood pressure', 2),
    ('GLUCOSE', 'Glucose testing', 3),
    ('ANTHROPOMETRY', 'Anthropometry', 4),
    ('REVIEW', 'Counselling and clinical review', 5)
) AS t("kind", "name", "sortOrder")
ON CONFLICT ("clinicId", "sortOrder") DO NOTHING;

SELECT set_config('app.is_system_admin', '', false);

-- Grants are not repeated here. 20260821130000_add_application_database_role set default
-- privileges on the public schema for nkwapa_app, so these tables are reachable without them.
