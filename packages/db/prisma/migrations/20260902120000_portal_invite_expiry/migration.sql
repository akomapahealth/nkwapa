-- Portal invites gain an enforced lifetime.
--
-- The PatientPortalInviteStatus enum has carried EXPIRED since the table was created and
-- nothing has ever written it: expiresAt was recorded and then never read, so an invite
-- staged last year was still claimable today and still widened the claimant's RLS clinic
-- set. This migration makes the stored data agree with the rule the application now
-- enforces, and gives machine-written audit a real actor to write as.

-- 1. The system actor.
--
-- AuditEvent.actorUserId is a UUID with a foreign key to User, and the reminder delivery
-- paths were passing the literal string 'system' — a value Postgres cannot store in that
-- column, so those audit writes could only ever fail. The expiry sweep needs the same
-- thing done properly, so it is done once, here, for every machine-written event.
--
-- The row is deliberately inert: isActive false keeps it out of every staff picker and
-- every notification recipient query, and it holds no clinic role, so it grants nothing.
-- The keycloakSub is a reserved, non-resolvable value; no Keycloak token can ever mint
-- this subject, so nobody can sign in as it.
INSERT INTO "User" ("id", "keycloakSub", "displayName", "isActive", "createdAt", "updatedAt")
VALUES (
  '00000000-0000-4000-8000-00000000dead',
  'system:nkwapa',
  'Nkwapa system',
  false,
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;

-- 2. Give every open-ended pending invite an expiry.
--
-- GREATEST rather than a plain interval add: backfilling strictly by age would expire
-- long-lived invites the instant this deploys, including one a patient is part-way
-- through claiming. Every existing invite gets at least seven more days, and anything
-- issued recently keeps its full fourteen from creation.
UPDATE "PatientPortalInvite"
SET "expiresAt" = GREATEST("createdAt" + interval '14 days', now() + interval '7 days')
WHERE "status" = 'PENDING'
  AND "expiresAt" IS NULL;

-- 3. Settle the rows that already carried a past expiry date.
--
-- These are the invites staff explicitly time-limited and that the application then
-- ignored. They are already expired by the rule; this only records it, so the operator
-- view and the audit trail stop disagreeing with what the claim endpoint now does.
UPDATE "PatientPortalInvite"
SET "status" = 'EXPIRED',
    "updatedAt" = now()
WHERE "status" = 'PENDING'
  AND "expiresAt" IS NOT NULL
  AND "expiresAt" <= now();

-- 4. The sweep's index. Its only query is overdue pending rows, oldest first.
CREATE INDEX "PatientPortalInvite_status_expiresAt_idx"
ON "PatientPortalInvite"("status", "expiresAt");
