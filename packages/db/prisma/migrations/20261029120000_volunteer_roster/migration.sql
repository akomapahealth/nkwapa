-- Volunteer directory, screening-day roster and roster emails (#226).
--
-- A clinic keeps its own list of volunteers, with or without a Nkwapa account, plans screening
-- days ahead, and emails the people it rosters. This is future scheduling; StaffShift still
-- records who is on duty now.
--
-- Safe to re-run: Prisma deploy is not one transaction, so a half-applied run must not block a retry.

DO $$
BEGIN
  CREATE TYPE "ScreeningEventStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ScreeningAssignmentStatus" AS ENUM ('ASSIGNED', 'REMOVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "VolunteerContact" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "displayName" VARCHAR(120) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "phoneE164" VARCHAR(32),
    "notes" VARCHAR(500),
    "linkedUserId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolunteerContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ScreeningEvent" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "siteName" VARCHAR(160) NOT NULL,
    "siteAddress" VARCHAR(300),
    "notes" VARCHAR(1000),
    "status" "ScreeningEventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdByUserId" UUID NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" VARCHAR(500),
    "detailsChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScreeningEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ScreeningEventAssignment" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "volunteerContactId" UUID NOT NULL,
    "status" "ScreeningAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "assignedByUserId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "removedByUserId" UUID,
    "lastNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScreeningEventAssignment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Reminder" ADD COLUMN IF NOT EXISTS "screeningEventAssignmentId" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS "VolunteerContact_clinicId_email_key" ON "VolunteerContact"("clinicId", "email");
CREATE INDEX IF NOT EXISTS "VolunteerContact_clinicId_isActive_displayName_idx" ON "VolunteerContact"("clinicId", "isActive", "displayName");
CREATE INDEX IF NOT EXISTS "VolunteerContact_linkedUserId_idx" ON "VolunteerContact"("linkedUserId");
CREATE INDEX IF NOT EXISTS "ScreeningEvent_clinicId_startsAt_idx" ON "ScreeningEvent"("clinicId", "startsAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ScreeningEventAssignment_eventId_volunteerContactId_key" ON "ScreeningEventAssignment"("eventId", "volunteerContactId");
CREATE INDEX IF NOT EXISTS "ScreeningEventAssignment_clinicId_idx" ON "ScreeningEventAssignment"("clinicId");
CREATE INDEX IF NOT EXISTS "ScreeningEventAssignment_volunteerContactId_idx" ON "ScreeningEventAssignment"("volunteerContactId");
CREATE INDEX IF NOT EXISTS "Reminder_screeningEventAssignmentId_idx" ON "Reminder"("screeningEventAssignmentId");

ALTER TABLE "VolunteerContact" DROP CONSTRAINT IF EXISTS "VolunteerContact_clinicId_fkey";
ALTER TABLE "VolunteerContact" ADD CONSTRAINT "VolunteerContact_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VolunteerContact" DROP CONSTRAINT IF EXISTS "VolunteerContact_linkedUserId_fkey";
ALTER TABLE "VolunteerContact" ADD CONSTRAINT "VolunteerContact_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VolunteerContact" DROP CONSTRAINT IF EXISTS "VolunteerContact_createdByUserId_fkey";
ALTER TABLE "VolunteerContact" ADD CONSTRAINT "VolunteerContact_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScreeningEvent" DROP CONSTRAINT IF EXISTS "ScreeningEvent_clinicId_fkey";
ALTER TABLE "ScreeningEvent" ADD CONSTRAINT "ScreeningEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScreeningEvent" DROP CONSTRAINT IF EXISTS "ScreeningEvent_createdByUserId_fkey";
ALTER TABLE "ScreeningEvent" ADD CONSTRAINT "ScreeningEvent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScreeningEventAssignment" DROP CONSTRAINT IF EXISTS "ScreeningEventAssignment_clinicId_fkey";
ALTER TABLE "ScreeningEventAssignment" ADD CONSTRAINT "ScreeningEventAssignment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScreeningEventAssignment" DROP CONSTRAINT IF EXISTS "ScreeningEventAssignment_eventId_fkey";
ALTER TABLE "ScreeningEventAssignment" ADD CONSTRAINT "ScreeningEventAssignment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ScreeningEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScreeningEventAssignment" DROP CONSTRAINT IF EXISTS "ScreeningEventAssignment_volunteerContactId_fkey";
ALTER TABLE "ScreeningEventAssignment" ADD CONSTRAINT "ScreeningEventAssignment_volunteerContactId_fkey" FOREIGN KEY ("volunteerContactId") REFERENCES "VolunteerContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScreeningEventAssignment" DROP CONSTRAINT IF EXISTS "ScreeningEventAssignment_assignedByUserId_fkey";
ALTER TABLE "ScreeningEventAssignment" ADD CONSTRAINT "ScreeningEventAssignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScreeningEventAssignment" DROP CONSTRAINT IF EXISTS "ScreeningEventAssignment_removedByUserId_fkey";
ALTER TABLE "ScreeningEventAssignment" ADD CONSTRAINT "ScreeningEventAssignment_removedByUserId_fkey" FOREIGN KEY ("removedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Reminder" DROP CONSTRAINT IF EXISTS "Reminder_screeningEventAssignmentId_fkey";
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_screeningEventAssignmentId_fkey" FOREIGN KEY ("screeningEventAssignmentId") REFERENCES "ScreeningEventAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- An event ends after it starts. The API refuses this first; the constraint is the backstop.
ALTER TABLE "ScreeningEvent" DROP CONSTRAINT IF EXISTS "ScreeningEvent_time_order_check";
ALTER TABLE "ScreeningEvent" ADD CONSTRAINT "ScreeningEvent_time_order_check" CHECK ("endsAt" > "startsAt");

-- A rostered volunteer may have no "User" row, so a roster email is a USER notice keyed on the
-- assignment, the way 20260925120000_staff_invites keys an invitation on the invite.
ALTER TABLE "Reminder" DROP CONSTRAINT IF EXISTS "Reminder_recipient_identity_check";
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_recipient_identity_check" CHECK (
  ("recipientType" = 'PATIENT' AND "patientId" IS NOT NULL AND "recipientUserId" IS NULL)
  OR
  ("recipientType" = 'USER' AND "patientId" IS NULL
    AND ("recipientUserId" IS NOT NULL OR "staffInviteId" IS NOT NULL
      OR "screeningEventAssignmentId" IS NOT NULL))
);

-- Row level security, as 20261007120000_station_workflow sets it for a clinic-scoped table: ENABLE
-- and FORCE together, because the application connects as the table owner.
ALTER TABLE "VolunteerContact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VolunteerContact" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "VolunteerContact_clinic_scope_policy" ON "VolunteerContact";
CREATE POLICY "VolunteerContact_clinic_scope_policy" ON "VolunteerContact"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

ALTER TABLE "ScreeningEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScreeningEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ScreeningEvent_clinic_scope_policy" ON "ScreeningEvent";
CREATE POLICY "ScreeningEvent_clinic_scope_policy" ON "ScreeningEvent"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

ALTER TABLE "ScreeningEventAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScreeningEventAssignment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ScreeningEventAssignment_clinic_scope_policy" ON "ScreeningEventAssignment";
CREATE POLICY "ScreeningEventAssignment_clinic_scope_policy" ON "ScreeningEventAssignment"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));
