-- A place to record that someone looked at a suspected duplicate pair.
--
-- Duplicate candidates are computed on demand from columns that already exist, so nothing
-- here stores a candidate. What it stores is the operator's decision about one, which is the
-- part that cannot be recomputed: whether a pair that keeps matching the heuristics has
-- already been examined and ruled out. Without it the review queue is a report rather than a
-- queue, and the same false positive greets whoever opens it next, forever.
--
-- No column on "Patient" is touched by this migration or by the surface it backs. Merging two
-- charts stays exactly where it is, behind POST /admin/patients/merge and SYSTEM_ADMIN.

-- 1. The decision states.
--
-- OPEN exists as the default so a row can carry a note without asserting an outcome. A pair
-- with no row at all is also open; the difference is that the row says a person has been here.
CREATE TYPE "PatientDuplicateReviewStatus" AS ENUM ('OPEN', 'DISMISSED', 'CONFIRMED');

-- 2. The table.
--
-- "pairKey" is "<lower uuid>:<higher uuid>" and is the real identity of a row. The candidate
-- query joins on a.id < b.id, but nothing stops a future caller passing the two ids the other
-- way round, and a duplicate decision recorded twice with the sides swapped would be worse
-- than useless. The unique constraint makes that impossible rather than merely unlikely.
--
-- "clinicId" is nullable on purpose. A pair whose two charts live in different clinics belongs
-- to neither of them, and the policy in step 4 reads NULL as "system admins only" — the same
-- shape "AuditEvent" and "Reminder" already use for rows with no single tenant. It is not a
-- convenience: a clinic manager must not be able to read a decision about a chart they cannot
-- see, and a nullable owner column is how that boundary is expressed in this schema.
CREATE TABLE "PatientDuplicateReview" (
    "id" UUID NOT NULL,
    "clinicId" UUID,
    "pairKey" VARCHAR(80) NOT NULL,
    "patientAId" UUID NOT NULL,
    "patientBId" UUID NOT NULL,
    "status" "PatientDuplicateReviewStatus" NOT NULL DEFAULT 'OPEN',
    "note" VARCHAR(280),
    "reviewedByUserId" UUID NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientDuplicateReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatientDuplicateReview_pairKey_key" ON "PatientDuplicateReview"("pairKey");

-- The queue's own read: this clinic's rows, filtered by decision.
CREATE INDEX "PatientDuplicateReview_clinicId_status_idx" ON "PatientDuplicateReview"("clinicId", "status");

-- Both sides are indexed because a decision is reached from either chart, and because the
-- cascade below has to find every row referencing a patient that is being removed.
CREATE INDEX "PatientDuplicateReview_patientAId_idx" ON "PatientDuplicateReview"("patientAId");
CREATE INDEX "PatientDuplicateReview_patientBId_idx" ON "PatientDuplicateReview"("patientBId");

-- 3. Foreign keys.
--
-- Every reference cascades on delete. A decision about a chart that no longer exists is not a
-- record worth keeping, and leaving orphans behind would put pairs back in the queue pointing
-- at nothing.
ALTER TABLE "PatientDuplicateReview" ADD CONSTRAINT "PatientDuplicateReview_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientDuplicateReview" ADD CONSTRAINT "PatientDuplicateReview_patientAId_fkey" FOREIGN KEY ("patientAId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientDuplicateReview" ADD CONSTRAINT "PatientDuplicateReview_patientBId_fkey" FOREIGN KEY ("patientBId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientDuplicateReview" ADD CONSTRAINT "PatientDuplicateReview_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Row level security.
--
-- ENABLE and FORCE are both declared here rather than left to a later sweep.
-- 20260821120000_force_row_level_security exists because ENABLE alone did nothing for a year:
-- the application connects as the role that owns these tables, and Postgres exempts a table's
-- owner from its own policies unless FORCE is set, so the policies were parsed and never
-- applied. A new table that only ENABLEs is a new instance of that same bug.
ALTER TABLE "PatientDuplicateReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PatientDuplicateReview" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "PatientDuplicateReview_scope_policy" ON "PatientDuplicateReview";
CREATE POLICY "PatientDuplicateReview_scope_policy" ON "PatientDuplicateReview"
FOR ALL
USING (
    ("clinicId" IS NULL AND app.is_system_admin())
    OR ("clinicId" IS NOT NULL AND app.can_access_clinic("clinicId"))
)
WITH CHECK (
    ("clinicId" IS NULL AND app.is_system_admin())
    OR ("clinicId" IS NOT NULL AND app.can_access_clinic("clinicId"))
);

-- Grants are not repeated here. 20260821130000_add_application_database_role set default
-- privileges on the public schema for nkwapa_app, so a table created after it is reachable
-- without an explicit GRANT.
