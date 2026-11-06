-- An invitee asking for a new invitation (#307, B7).
--
-- Set when a signed-in invitee whose invitation lapsed asks for another, at most once a day per
-- invitation. Staff see it on the invitation and resend as they already can; nothing is sent
-- automatically. Nullable, no backfill.

ALTER TABLE "PatientPortalInvite" ADD COLUMN IF NOT EXISTS "renewalRequestedAt" TIMESTAMP(3);
ALTER TABLE "StaffInvite" ADD COLUMN IF NOT EXISTS "renewalRequestedAt" TIMESTAMP(3);
