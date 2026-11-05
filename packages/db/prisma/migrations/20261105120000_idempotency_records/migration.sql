-- Idempotency keys for online writes (#307).
--
-- One row per (user, key): the response a write returned, written in the same transaction as the
-- write itself, so a key is recorded exactly when its write committed. A repeat of the key gets
-- the stored response back instead of a second record. Rows live 24 hours, then the API's
-- IdempotencyRetentionSweep deletes them.

CREATE TABLE IF NOT EXISTS "IdempotencyRecord" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "method" VARCHAR(10) NOT NULL,
    "path" VARCHAR(512) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");
CREATE UNIQUE INDEX IF NOT EXISTS "IdempotencyRecord_userId_key_key" ON "IdempotencyRecord"("userId", "key");

ALTER TABLE "IdempotencyRecord" DROP CONSTRAINT IF EXISTS "IdempotencyRecord_clinicId_fkey";
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdempotencyRecord" DROP CONSTRAINT IF EXISTS "IdempotencyRecord_userId_fkey";
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row level security. A stored response can hold clinical data, so it goes back only to the
-- person who made the request, in a clinic they can still reach. ENABLE and FORCE together,
-- because the application connects as the table owner. The retention sweep runs under a system
-- context, which can_access_clinic admits, and deletes by expiry only; current_user_id() is null
-- there, so the user clause is skipped for a system administrator context alone.
ALTER TABLE "IdempotencyRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IdempotencyRecord" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "IdempotencyRecord_owner_scope_policy" ON "IdempotencyRecord";
CREATE POLICY "IdempotencyRecord_owner_scope_policy" ON "IdempotencyRecord"
FOR ALL
USING (
  app.can_access_clinic("clinicId")
  AND (app.is_system_admin() OR "userId" = app.current_user_id())
)
WITH CHECK (
  app.can_access_clinic("clinicId")
  AND "userId" = app.current_user_id()
);
