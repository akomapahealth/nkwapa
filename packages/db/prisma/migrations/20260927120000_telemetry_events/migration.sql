-- Product and operational telemetry (#29).
--
-- Counts and outcomes for high-value workflows, built from the allow-list in
-- packages/db/src/telemetry-events.ts. Nothing here identifies a person, and it is not a
-- compliance record: AuditEvent remains the source of truth for who did what.

-- CreateTable
CREATE TABLE "TelemetryEvent" (
    "id" UUID NOT NULL,
    "event" VARCHAR(64) NOT NULL,
    "category" VARCHAR(32) NOT NULL,
    "clinicId" UUID,
    "outcome" VARCHAR(16),
    "reason" VARCHAR(64),
    "bucket" VARCHAR(48),
    "properties" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelemetryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelemetryEvent_event_occurredAt_idx" ON "TelemetryEvent"("event", "occurredAt");

-- CreateIndex
CREATE INDEX "TelemetryEvent_clinicId_occurredAt_idx" ON "TelemetryEvent"("clinicId", "occurredAt");

-- CreateIndex
CREATE INDEX "TelemetryEvent_occurredAt_idx" ON "TelemetryEvent"("occurredAt");

-- AddForeignKey
ALTER TABLE "TelemetryEvent" ADD CONSTRAINT "TelemetryEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The API sanitizes every row before writing it. These constraints repeat the two rules that
-- matter most for privacy, so a future writer that bypasses the sanitizer still cannot store free
-- text in the columns the dashboard groups by.
ALTER TABLE "TelemetryEvent"
  ADD CONSTRAINT "TelemetryEvent_outcome_check"
  CHECK ("outcome" IS NULL OR "outcome" IN ('SUCCEEDED', 'FAILED'));
ALTER TABLE "TelemetryEvent"
  ADD CONSTRAINT "TelemetryEvent_reason_check"
  CHECK ("reason" IS NULL OR "reason" ~ '^[A-Z][A-Z0-9_]{1,63}$');
ALTER TABLE "TelemetryEvent"
  ADD CONSTRAINT "TelemetryEvent_bucket_check"
  CHECK ("bucket" IS NULL OR "bucket" ~ '^[a-z][a-z0-9_]{1,47}$');

-- Row level security.
--
-- ENABLE and FORCE together, for the reason 20260904120000_patient_merge_record gives: the
-- application connects as the table owner, and PostgreSQL exempts an owner from its own
-- policies unless FORCE is set.
--
-- A director or manager reads their own clinic's rows. A row with no clinic -- a throttled
-- request made before any clinic was chosen -- passes app.can_access_clinic() only for a system
-- administrator, because NULL is never in the caller's clinic list. The API writes rows under an
-- explicit system context, outside any request, so a batch can hold several clinics' events.
ALTER TABLE "TelemetryEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TelemetryEvent" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "TelemetryEvent_clinic_scope_policy" ON "TelemetryEvent";
CREATE POLICY "TelemetryEvent_clinic_scope_policy" ON "TelemetryEvent"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

-- Grants are not repeated here. 20260821130000_add_application_database_role set default
-- privileges on the public schema for nkwapa_app, so this table is reachable without them.
