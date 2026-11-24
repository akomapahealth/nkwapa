-- Problems staff report from inside the app (#422). Safe to re-run after a partial deploy.
--
-- The free text may carry patient detail despite the warning on the field, so the table is
-- clinic-scoped like clinical data. It is excluded from research exports and swept after the
-- retention period (StaffFeedbackRetentionSweep).

DO $$ BEGIN
  CREATE TYPE "StaffFeedbackCategory" AS ENUM ('NOT_SAVED', 'ERROR_MESSAGE', 'SLOW', 'CONFUSING', 'WRONG_INFO', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "StaffFeedback" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "category" "StaffFeedbackCategory" NOT NULL,
    "text" VARCHAR(500),
    "stationKind" "StationKind",
    "context" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StaffFeedback_clinicId_createdAt_idx" ON "StaffFeedback"("clinicId", "createdAt");
CREATE INDEX IF NOT EXISTS "StaffFeedback_createdAt_idx" ON "StaffFeedback"("createdAt");

ALTER TABLE "StaffFeedback" DROP CONSTRAINT IF EXISTS "StaffFeedback_clinicId_fkey";
ALTER TABLE "StaffFeedback" ADD CONSTRAINT "StaffFeedback_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffFeedback" DROP CONSTRAINT IF EXISTS "StaffFeedback_userId_fkey";
ALTER TABLE "StaffFeedback" ADD CONSTRAINT "StaffFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row level security: ENABLE and FORCE, since the application connects as the table owner.
ALTER TABLE "StaffFeedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffFeedback" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "StaffFeedback_clinic_scope_policy" ON "StaffFeedback";
CREATE POLICY "StaffFeedback_clinic_scope_policy" ON "StaffFeedback"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));
