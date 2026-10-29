-- Who actually screened (#227), linked to the volunteer directory (#226). A screener picked from
-- the directory carries the contact's id beside the name. The name stays the snapshot: renaming
-- or deactivating a contact never rewrites who did a stop.
--
-- Safe to re-run: Prisma deploy is not one transaction, so a half-applied run must not block a retry.

ALTER TABLE "StaffShift" ADD COLUMN IF NOT EXISTS "screenerVolunteerContactId" UUID;
ALTER TABLE "PatientStationVisit" ADD COLUMN IF NOT EXISTS "performedByVolunteerContactId" UUID;

ALTER TABLE "StaffShift" DROP CONSTRAINT IF EXISTS "StaffShift_screenerVolunteerContactId_fkey";
ALTER TABLE "StaffShift" ADD CONSTRAINT "StaffShift_screenerVolunteerContactId_fkey" FOREIGN KEY ("screenerVolunteerContactId") REFERENCES "VolunteerContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PatientStationVisit" DROP CONSTRAINT IF EXISTS "PatientStationVisit_performedByVolunteerContactId_fkey";
ALTER TABLE "PatientStationVisit" ADD CONSTRAINT "PatientStationVisit_performedByVolunteerContactId_fkey" FOREIGN KEY ("performedByVolunteerContactId") REFERENCES "VolunteerContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
