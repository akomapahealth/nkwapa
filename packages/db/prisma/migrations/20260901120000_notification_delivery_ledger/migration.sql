-- The Reminder table becomes the delivery ledger for every outbound message, not just
-- patient reminders: portal invites, appointment lifecycle mail, and staff notices all
-- record here. Reusing it keeps one queue, one retry policy, one status machine, one
-- audit trail, and one operator view, rather than growing a second parallel system.
--
-- Two columns lose NOT NULL as a result. A staff notice has no patient, and a global
-- account deactivation is a SYSTEM_ADMIN action that belongs to no clinic — the audit
-- trail already writes clinicId NULL for exactly that event.

CREATE TYPE "ReminderRecipientType" AS ENUM ('PATIENT', 'USER');

ALTER TABLE "Reminder"
  ADD COLUMN "recipientType"   "ReminderRecipientType" NOT NULL DEFAULT 'PATIENT',
  ADD COLUMN "recipientUserId" UUID,
  ADD COLUMN "portalInviteId"  UUID;

ALTER TABLE "Reminder" ALTER COLUMN "patientId" DROP NOT NULL;
ALTER TABLE "Reminder" ALTER COLUMN "clinicId" DROP NOT NULL;

ALTER TABLE "Reminder"
  ADD CONSTRAINT "Reminder_recipientUserId_fkey"
    FOREIGN KEY ("recipientUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Reminder_portalInviteId_fkey"
    FOREIGN KEY ("portalInviteId") REFERENCES "PatientPortalInvite"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- The structural guarantee that a staff notice can never surface in a patient's own
-- portal feed. That feed selects on patientId, so enforcing patientId IS NULL for USER
-- rows makes the separation an invariant of the data rather than a filter every future
-- query has to remember to apply.
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_recipient_identity_check" CHECK (
  ("recipientType" = 'PATIENT' AND "patientId" IS NOT NULL AND "recipientUserId" IS NULL)
  OR
  ("recipientType" = 'USER' AND "recipientUserId" IS NOT NULL AND "patientId" IS NULL)
);

CREATE INDEX "Reminder_recipientUserId_idx" ON "Reminder"("recipientUserId");
CREATE INDEX "Reminder_portalInviteId_idx" ON "Reminder"("portalInviteId");
CREATE INDEX "Reminder_clinicId_templateKey_createdAt_idx" ON "Reminder"("clinicId", "templateKey", "createdAt");

-- Now that clinicId is nullable, the old policy would evaluate app.can_access_clinic(NULL)
-- for a global notice. That yields NULL, which a policy treats as false, so those rows
-- would be invisible to everyone including a system admin. This is the same shape the
-- AuditEvent policy already uses for its own nullable clinicId: global-scope rows are
-- readable by system admins, clinic-scoped rows by members of that clinic.
DROP POLICY IF EXISTS "Reminder_clinic_scope_policy" ON "Reminder";
CREATE POLICY "Reminder_clinic_scope_policy" ON "Reminder"
FOR ALL
USING (
    ("clinicId" IS NULL AND app.is_system_admin())
    OR ("clinicId" IS NOT NULL AND app.can_access_clinic("clinicId"))
)
WITH CHECK (
    ("clinicId" IS NULL AND app.is_system_admin())
    OR ("clinicId" IS NOT NULL AND app.can_access_clinic("clinicId"))
);
