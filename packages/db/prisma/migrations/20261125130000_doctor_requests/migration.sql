-- "Ask a doctor" from any station (#418). Safe to re-run after a partial deploy.

ALTER TYPE "InboxNotificationKind" ADD VALUE IF NOT EXISTS 'DOCTOR_REQUEST';

DO $$ BEGIN
  CREATE TYPE "DoctorRequestUrgency" AS ENUM ('NOW', 'BEFORE_LEAVING');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DoctorRequestReason" AS ENUM ('HIGH_BP', 'HIGH_GLUCOSE', 'SYMPTOMS', 'MEDICATION', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "DoctorRequest" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "checkInId" UUID NOT NULL,
    "stationVisitId" UUID,
    "urgency" "DoctorRequestUrgency" NOT NULL,
    "reason" "DoctorRequestReason",
    "auto" BOOLEAN NOT NULL DEFAULT false,
    "requestedByUserId" UUID,
    "claimedByUserId" UUID,
    "claimedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DoctorRequest_clinicId_createdAt_idx" ON "DoctorRequest"("clinicId", "createdAt");
CREATE INDEX IF NOT EXISTS "DoctorRequest_checkInId_idx" ON "DoctorRequest"("checkInId");
-- One open request per check-in: a second ask updates the first, so doctors get one tile.
CREATE UNIQUE INDEX IF NOT EXISTS "DoctorRequest_one_open_per_check_in"
  ON "DoctorRequest"("checkInId") WHERE "resolvedAt" IS NULL;

ALTER TABLE "DoctorRequest" DROP CONSTRAINT IF EXISTS "DoctorRequest_clinicId_fkey";
ALTER TABLE "DoctorRequest" ADD CONSTRAINT "DoctorRequest_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DoctorRequest" DROP CONSTRAINT IF EXISTS "DoctorRequest_checkInId_fkey";
ALTER TABLE "DoctorRequest" ADD CONSTRAINT "DoctorRequest_checkInId_fkey" FOREIGN KEY ("checkInId") REFERENCES "PatientCheckIn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DoctorRequest" DROP CONSTRAINT IF EXISTS "DoctorRequest_stationVisitId_fkey";
ALTER TABLE "DoctorRequest" ADD CONSTRAINT "DoctorRequest_stationVisitId_fkey" FOREIGN KEY ("stationVisitId") REFERENCES "PatientStationVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DoctorRequest" DROP CONSTRAINT IF EXISTS "DoctorRequest_requestedByUserId_fkey";
ALTER TABLE "DoctorRequest" ADD CONSTRAINT "DoctorRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DoctorRequest" DROP CONSTRAINT IF EXISTS "DoctorRequest_claimedByUserId_fkey";
ALTER TABLE "DoctorRequest" ADD CONSTRAINT "DoctorRequest_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InboxNotification" ADD COLUMN IF NOT EXISTS "doctorRequestId" UUID;
CREATE INDEX IF NOT EXISTS "InboxNotification_doctorRequestId_idx" ON "InboxNotification"("doctorRequestId");
ALTER TABLE "InboxNotification" DROP CONSTRAINT IF EXISTS "InboxNotification_doctorRequestId_fkey";
ALTER TABLE "InboxNotification" ADD CONSTRAINT "InboxNotification_doctorRequestId_fkey" FOREIGN KEY ("doctorRequestId") REFERENCES "DoctorRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row level security: ENABLE and FORCE, since the application connects as the table owner.
ALTER TABLE "DoctorRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DoctorRequest" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "DoctorRequest_clinic_scope_policy" ON "DoctorRequest";
CREATE POLICY "DoctorRequest_clinic_scope_policy" ON "DoctorRequest"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));
