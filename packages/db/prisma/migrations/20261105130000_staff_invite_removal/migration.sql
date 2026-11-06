-- Removing a closed staff invitation from the admin list.
--
-- A director can take an expired or cancelled invitation out of the list once it will not be
-- resent. The row stays (who invited whom, with what role, is audit-relevant); the list skips
-- rows with removedAt set, and the STAFF.INVITE.REMOVE audit entry records who removed it.
-- One nullable column, no backfill, safe to re-run on its own.

ALTER TABLE "StaffInvite" ADD COLUMN IF NOT EXISTS "removedAt" TIMESTAMP(3);
