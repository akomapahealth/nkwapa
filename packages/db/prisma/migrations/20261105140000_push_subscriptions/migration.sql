-- Web Push subscriptions (#250).
--
-- One row per browser profile that asked for background notifications: the push service endpoint
-- and the keys the payload is encrypted with. Every statement is idempotent, because a Prisma
-- deploy is not one transaction: a failed run leaves whatever already applied, and re-running this
-- file must finish the job rather than fail on it.

CREATE TABLE IF NOT EXISTS "PushSubscription" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "endpoint" VARCHAR(1024) NOT NULL,
    "p256dh" VARCHAR(256) NOT NULL,
    "auth" VARCHAR(64) NOT NULL,
    "userAgent" VARCHAR(512),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription"("userId");

ALTER TABLE "PushSubscription" DROP CONSTRAINT IF EXISTS "PushSubscription_userId_fkey";
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row level security. A subscription belongs to one person and no clinic, so the user clause is
-- the whole policy: a person reads and removes only their own. The sender and the subscribe
-- endpoint run under a system context with no user (current_user_id() is null there), which may
-- reach every row; a signed-in system administrator has a user id and gets only their own, like
-- everyone else. ENABLE and FORCE together, because the application connects as the table owner.
ALTER TABLE "PushSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PushSubscription" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "PushSubscription_owner_policy" ON "PushSubscription";
CREATE POLICY "PushSubscription_owner_policy" ON "PushSubscription"
FOR ALL
USING (
  "userId" = app.current_user_id()
  OR (app.is_system_admin() AND app.current_user_id() IS NULL)
)
WITH CHECK (
  "userId" = app.current_user_id()
  OR (app.is_system_admin() AND app.current_user_id() IS NULL)
);
