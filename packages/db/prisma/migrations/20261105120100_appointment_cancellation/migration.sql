-- Who cancelled an appointment, when, and why (#307, B1).
--
-- The schedule struck a cancelled visit through with nothing beside it; the answer was only in
-- the audit trail. All three columns are nullable: a visit cancelled before this migration with
-- no audit event to read stays "cancelled" with no who or when, rather than a guessed one.

ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "cancelledByUserId" UUID;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;

ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS "Appointment_cancelledByUserId_fkey";
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill from each cancelled visit's latest APPT.CANCEL audit event: its actor, its time, and
-- the reason the cancel transition wrote into afterJson. One self-contained statement, because a
-- Prisma deploy here does not run the file as one transaction. Re-running it changes nothing: it
-- only fills rows that are still empty. "Appointment" and "AuditEvent" have forced row level
-- security, so it reads them with system-admin scope for this session only.
SELECT set_config('app.is_system_admin', 'true', false);

UPDATE "Appointment" a
SET "cancelledAt" = e."createdAt",
    "cancelledByUserId" = e."actorUserId",
    "cancelReason" = NULLIF(btrim(e."reason"), '')
FROM (
  SELECT DISTINCT ON ("entityId")
    "entityId",
    "createdAt",
    "actorUserId",
    CASE
      WHEN "afterJson" ~ '^\s*\{' THEN ("afterJson"::jsonb ->> 'reason')
    END AS "reason"
  FROM "AuditEvent"
  WHERE "action" = 'APPT.CANCEL' AND "entityType" = 'Appointment'
  ORDER BY "entityId", "createdAt" DESC
) e
WHERE a."id"::text = e."entityId"
  AND a."status" = 'CANCELLED'
  AND a."cancelledAt" IS NULL;

SELECT set_config('app.is_system_admin', '', false);
