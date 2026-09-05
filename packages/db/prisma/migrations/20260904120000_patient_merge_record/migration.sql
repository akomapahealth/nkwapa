-- What an executed patient merge actually moved.
--
-- Merging two charts is the only action in this product a person cannot undo from the product,
-- and until now the only trace it left was three identifiers: "Patient".mergedIntoPatientId, a
-- "PatientCodeAlias" row for the code the retired chart gave up, and an "AuditEvent" whose
-- beforeJson repeats the same two ids. None of that says how much moved, so a merge that a
-- clinic later queries -- "her visits are gone, what happened?" -- cannot be answered without
-- someone reading the database by hand. That is the support call this table removes.
--
-- It is a record of an action, not a queue and not a workflow. Nothing reads it to decide
-- anything; the preview is recomputed from live rows every time it is opened.

-- 1. The table.
--
-- "clinicId" is NOT NULL, unlike the one on "PatientDuplicateReview". Noticing a suspected
-- duplicate spans clinics; merging does not, because AdminService.mergePatients refuses two
-- charts whose primaryClinicId differs. A merge therefore always has exactly one owning clinic,
-- and the policy in step 4 is the ordinary clinic policy rather than the nullable-owner shape.
--
-- The counts land as JSON text, matching "ResearchExport".rowCountsJson and "AuditEvent"'s
-- before/after columns rather than introducing this schema's first jsonb or text[] column. They
-- are read back to be displayed to a person, never filtered on.
CREATE TABLE "PatientMergeRecord" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "canonicalPatientId" UUID NOT NULL,
    "sourcePatientId" UUID NOT NULL,
    "sourcePatientCode" VARCHAR(32) NOT NULL,
    "tombstonePatientCode" VARCHAR(32) NOT NULL,
    "portalLinkStrategy" VARCHAR(16) NOT NULL,
    "inviteStrategy" VARCHAR(16) NOT NULL,
    "movedCountsJson" TEXT NOT NULL,
    "warningCodesJson" TEXT,
    "mergedByUserId" UUID NOT NULL,
    "mergedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientMergeRecord_pkey" PRIMARY KEY ("id")
);

-- 2. Indexes.
--
-- A chart is merged away exactly once: "Patient".mergedIntoPatientId is already set on the
-- source when this row is written, and the merge refuses a chart that carries it. The unique
-- constraint says so in the schema rather than relying on that ordering holding forever, and it
-- makes a retried request idempotent instead of duplicating history.
CREATE UNIQUE INDEX "PatientMergeRecord_sourcePatientId_key" ON "PatientMergeRecord"("sourcePatientId");

-- "What has been merged in this clinic lately", which is the only listing this table has.
CREATE INDEX "PatientMergeRecord_clinicId_mergedAt_idx" ON "PatientMergeRecord"("clinicId", "mergedAt");

-- Reached from the surviving chart: "what was folded into this record".
CREATE INDEX "PatientMergeRecord_canonicalPatientId_idx" ON "PatientMergeRecord"("canonicalPatientId");

CREATE INDEX "PatientMergeRecord_mergedByUserId_idx" ON "PatientMergeRecord"("mergedByUserId");

-- 3. Foreign keys.
--
-- Every reference cascades, matching "PatientDuplicateReview". A record explaining a merge
-- between charts that no longer exist explains nothing, and the immutable trail of who did what
-- is "AuditEvent"'s job -- that table is deliberately not referenced here, so removing a clinic
-- never removes the audit event describing its merges.
ALTER TABLE "PatientMergeRecord" ADD CONSTRAINT "PatientMergeRecord_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientMergeRecord" ADD CONSTRAINT "PatientMergeRecord_canonicalPatientId_fkey" FOREIGN KEY ("canonicalPatientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientMergeRecord" ADD CONSTRAINT "PatientMergeRecord_sourcePatientId_fkey" FOREIGN KEY ("sourcePatientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientMergeRecord" ADD CONSTRAINT "PatientMergeRecord_mergedByUserId_fkey" FOREIGN KEY ("mergedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Row level security.
--
-- ENABLE and FORCE are both declared here rather than left to a later sweep.
-- 20260821120000_force_row_level_security exists because ENABLE alone did nothing for a year:
-- the application connects as the role that owns these tables, and PostgreSQL exempts a table's
-- owner from its own policies unless FORCE is set, so the policies were parsed and never
-- applied. A new table that only ENABLEs is a new instance of that same bug.
--
-- app.can_access_clinic() already returns true for a system administrator, so the single
-- disjunct covers both the only role that can write here and the clinic staff who may read what
-- was done to their own charts.
ALTER TABLE "PatientMergeRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PatientMergeRecord" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "PatientMergeRecord_scope_policy" ON "PatientMergeRecord";
CREATE POLICY "PatientMergeRecord_scope_policy" ON "PatientMergeRecord"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

-- Grants are not repeated here. 20260821130000_add_application_database_role set default
-- privileges on the public schema for nkwapa_app, so a table created after it is reachable
-- without an explicit GRANT.
