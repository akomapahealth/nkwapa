-- Offline session resume (#207): the devices a staff member may resume a session on with no
-- signal, and where an audit event records that a write was queued in one.
--
-- Idempotent throughout, because a Prisma deploy is not one transaction.

ALTER TABLE "AuditEvent" ADD COLUMN IF NOT EXISTS "offlineSession" JSONB;

CREATE TABLE IF NOT EXISTS "OfflineGrant" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" VARCHAR(40),
    "userAgent" VARCHAR(400),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfflineGrant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OfflineGrant_userId_deviceId_idx" ON "OfflineGrant"("userId", "deviceId");

-- One live grant per person and device. A refresh moves it forward in place; a revoked one stays
-- revoked, and opting in again creates a new row.
CREATE UNIQUE INDEX IF NOT EXISTS "OfflineGrant_live_device_key"
  ON "OfflineGrant"("userId", "deviceId") WHERE "revokedAt" IS NULL;

ALTER TABLE "OfflineGrant" DROP CONSTRAINT IF EXISTS "OfflineGrant_userId_fkey";
ALTER TABLE "OfflineGrant" ADD CONSTRAINT "OfflineGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row level security: a person reads, creates and refreshes their own grants. Revocation on someone
-- else's behalf (offboarding, a role removed, a manager signing them out) runs in a system context.
-- No DELETE policy: a grant is revoked, never removed, so the record of what was issued survives.
ALTER TABLE "OfflineGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OfflineGrant" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "OfflineGrant_owner_select" ON "OfflineGrant";
CREATE POLICY "OfflineGrant_owner_select" ON "OfflineGrant"
FOR SELECT
USING ("userId" = app.current_user_id() OR app.is_system_admin());
DROP POLICY IF EXISTS "OfflineGrant_owner_insert" ON "OfflineGrant";
CREATE POLICY "OfflineGrant_owner_insert" ON "OfflineGrant"
FOR INSERT
WITH CHECK ("userId" = app.current_user_id() OR app.is_system_admin());
DROP POLICY IF EXISTS "OfflineGrant_owner_update" ON "OfflineGrant";
CREATE POLICY "OfflineGrant_owner_update" ON "OfflineGrant"
FOR UPDATE
USING ("userId" = app.current_user_id() OR app.is_system_admin())
WITH CHECK ("userId" = app.current_user_id() OR app.is_system_admin());
