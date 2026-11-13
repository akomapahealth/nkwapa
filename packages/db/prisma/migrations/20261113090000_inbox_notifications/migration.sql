-- In-app notifications: what the bell lists for one person.
--
-- Idempotent throughout, because a Prisma deploy is not one transaction.

DO $$ BEGIN
  CREATE TYPE "InboxNotificationKind" AS ENUM (
    'MESSAGE', 'COSIGN', 'ASSIGNMENT', 'HEALTH_ALERT', 'APPOINTMENT_REQUEST', 'INVITE', 'REMINDER_FAILED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "InboxNotification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "clinicId" UUID,
    "kind" "InboxNotificationKind" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(500),
    "url" VARCHAR(500) NOT NULL,
    "tag" VARCHAR(120),
    "count" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "InboxNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InboxNotification_userId_updatedAt_idx"
  ON "InboxNotification"("userId", "updatedAt");

-- At most one unread notification per person and tag. Two events arriving at once (two chat
-- messages from different API instances) meet here and merge, instead of both inserting.
CREATE UNIQUE INDEX IF NOT EXISTS "InboxNotification_unread_tag_key"
  ON "InboxNotification"("userId", "tag") WHERE "readAt" IS NULL AND "tag" IS NOT NULL;

ALTER TABLE "InboxNotification" DROP CONSTRAINT IF EXISTS "InboxNotification_userId_fkey";
ALTER TABLE "InboxNotification" ADD CONSTRAINT "InboxNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row level security, the PushSubscription shape: a person reads and marks only their own. The
-- writer runs under a system context with no user, which may reach every row.
ALTER TABLE "InboxNotification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InboxNotification" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "InboxNotification_owner_policy" ON "InboxNotification";
CREATE POLICY "InboxNotification_owner_policy" ON "InboxNotification"
FOR ALL
USING (
  "userId" = app.current_user_id()
  OR (app.is_system_admin() AND app.current_user_id() IS NULL)
)
WITH CHECK (
  "userId" = app.current_user_id()
  OR (app.is_system_admin() AND app.current_user_id() IS NULL)
);
