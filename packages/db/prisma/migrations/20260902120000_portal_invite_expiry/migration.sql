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
-- Untargeted, so a pre-existing row conflicting on either the primary key or the unique
-- keycloakSub is a no-op rather than a failed migration.
ON CONFLICT DO NOTHING;

-- 2. Lift FORCE row level security for the data changes below.
--
-- Not optional, and the reason it is easy to miss: PatientPortalInvite is FORCE'd, which
-- subjects the table's own owner to its policies, and a migration runs with no app.* context
-- set. `app.can_access_clinic(NULL)` is NULL, a policy treats that as false, and an UPDATE
-- that matches no visible row reports `UPDATE 0` without raising anything. The migration
-- would be recorded as applied while every legacy invite stayed open-ended forever — the
-- exact bug this file exists to fix, failing silently.
--
-- It does not reproduce on a superuser connection, because superusers hold BYPASSRLS and
-- never evaluate the policy at all. A local run against a Docker Postgres whose bootstrap
-- role is superuser therefore proves nothing about a managed deployment, where the role that
-- owns these tables usually is not one.
--
-- ALTER TABLE needs ownership, not superuser, which is the same privilege
-- 20260821120000_force_row_level_security already required. FORCE is restored below, inside
-- the same transaction, so a failure anywhere here rolls the exemption back with it.
ALTER TABLE "PatientPortalInvite" NO FORCE ROW LEVEL SECURITY;

-- 3. Give every open-ended pending invite an expiry.
--
-- GREATEST rather than a plain interval add: backfilling strictly by age would expire
-- long-lived invites the instant this deploys, including one a patient is part-way
-- through claiming. Every existing invite gets at least seven more days, and anything
-- issued recently keeps its full fourteen from creation.
UPDATE "PatientPortalInvite"
SET "expiresAt" = GREATEST("createdAt" + interval '14 days', now() + interval '7 days'),
    "updatedAt" = now()
WHERE "status" = 'PENDING'
  AND "expiresAt" IS NULL;

-- 4. Settle the rows that already carried a past expiry date.
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

-- 5. Restore the invariant. The table is scoped again from here on.
ALTER TABLE "PatientPortalInvite" FORCE ROW LEVEL SECURITY;

-- 6. The sweep's index. Its only query is overdue pending rows, oldest first.
CREATE INDEX "PatientPortalInvite_status_expiresAt_idx"
ON "PatientPortalInvite"("status", "expiresAt");
