-- Scheduled, consent-gated research exports and a storage port (#166).
--
-- A director approves a weekly or monthly schedule once; each run gets a deterministic run key,
-- can be SKIPPED for a recorded governance reason, and is published to GitHub, R2 or a local
-- folder. The repo* columns become storage* because GitHub is now one destination of three.
--
-- Safe to re-run: Prisma deploy is not one transaction, so a half-applied run must not block a retry.

ALTER TYPE "ResearchExportStatus" ADD VALUE IF NOT EXISTS 'SKIPPED';

DO $$
BEGIN
  CREATE TYPE "ResearchScheduleCadence" AS ENUM ('WEEKLY', 'MONTHLY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ResearchScheduleStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'PAUSED', 'EXPIRED', 'REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ResearchExportTrigger" AS ENUM ('MANUAL', 'SCHEDULED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ResearchStorageProvider" AS ENUM ('GITHUB', 'R2', 'LOCAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- repo* -> storage*. Each rename runs only while the old column is still there.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'ResearchExport' AND column_name = 'repoProvider') THEN
    ALTER TABLE "ResearchExport" RENAME COLUMN "repoProvider" TO "storageProvider";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'ResearchExport' AND column_name = 'repoPath') THEN
    ALTER TABLE "ResearchExport" RENAME COLUMN "repoPath" TO "storagePath";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'ResearchExport' AND column_name = 'repoCommitSha') THEN
    ALTER TABLE "ResearchExport" RENAME COLUMN "repoCommitSha" TO "storageRef";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'ResearchExport' AND column_name = 'repoCommitUrl') THEN
    ALTER TABLE "ResearchExport" RENAME COLUMN "repoCommitUrl" TO "storageUrl";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'ResearchExport' AND column_name = 'storageProvider'
               AND data_type = 'character varying') THEN
    ALTER TABLE "ResearchExport" ALTER COLUMN "storageProvider" TYPE "ResearchStorageProvider"
      USING upper("storageProvider")::"ResearchStorageProvider";
  END IF;
END $$;

ALTER TABLE "ResearchExport" ADD COLUMN IF NOT EXISTS "runKey" VARCHAR(64);
ALTER TABLE "ResearchExport" ADD COLUMN IF NOT EXISTS "trigger" "ResearchExportTrigger" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "ResearchExport" ADD COLUMN IF NOT EXISTS "scheduleId" UUID;
ALTER TABLE "ResearchExport" ADD COLUMN IF NOT EXISTS "consentedSubjectCount" INTEGER;
ALTER TABLE "ResearchExport" ADD COLUMN IF NOT EXISTS "revokedSinceLastCount" INTEGER;
ALTER TABLE "ResearchExport" ADD COLUMN IF NOT EXISTS "contentSha256" VARCHAR(64);
ALTER TABLE "ResearchExport" ADD COLUMN IF NOT EXISTS "skipReason" VARCHAR(64);
ALTER TABLE "ResearchExport" ADD COLUMN IF NOT EXISTS "changesJson" TEXT;

-- Exports made before run keys existed get an ad-hoc key from their request date and a random
-- suffix. The research clinic key needs the HMAC secret, which SQL does not have, so these say
-- "legacy" in its place; nothing in them is an internal id.
UPDATE "ResearchExport"
SET "runKey" = 'rx-legacy-a' || to_char("requestedAt", 'YYYYMMDD') || '-'
  || substr(md5(random()::text || "id"::text), 1, 6)
WHERE "runKey" IS NULL;

ALTER TABLE "ResearchExport" ALTER COLUMN "runKey" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "ResearchExport_runKey_key" ON "ResearchExport"("runKey");

CREATE TABLE IF NOT EXISTS "ResearchExportSchedule" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "cadence" "ResearchScheduleCadence" NOT NULL,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "localHour" INTEGER NOT NULL,
    "coverageStartDate" VARCHAR(10) NOT NULL,
    "destination" "ResearchStorageProvider" NOT NULL,
    "status" "ResearchScheduleStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "statusReason" VARCHAR(500),
    "reviewBy" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "approvedByUserId" UUID,
    "approvedAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchExportSchedule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ResearchExportSchedule_status_nextRunAt_idx" ON "ResearchExportSchedule"("status", "nextRunAt");
CREATE INDEX IF NOT EXISTS "ResearchExportSchedule_clinicId_idx" ON "ResearchExportSchedule"("clinicId");
CREATE INDEX IF NOT EXISTS "ResearchExport_scheduleId_requestedAt_idx" ON "ResearchExport"("scheduleId", "requestedAt");

ALTER TABLE "ResearchExportSchedule" DROP CONSTRAINT IF EXISTS "ResearchExportSchedule_clinicId_fkey";
ALTER TABLE "ResearchExportSchedule" ADD CONSTRAINT "ResearchExportSchedule_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchExportSchedule" DROP CONSTRAINT IF EXISTS "ResearchExportSchedule_createdByUserId_fkey";
ALTER TABLE "ResearchExportSchedule" ADD CONSTRAINT "ResearchExportSchedule_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResearchExportSchedule" DROP CONSTRAINT IF EXISTS "ResearchExportSchedule_approvedByUserId_fkey";
ALTER TABLE "ResearchExportSchedule" ADD CONSTRAINT "ResearchExportSchedule_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ResearchExport" DROP CONSTRAINT IF EXISTS "ResearchExport_scheduleId_fkey";
ALTER TABLE "ResearchExport" ADD CONSTRAINT "ResearchExport_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ResearchExportSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The API validates these first; the constraint is the backstop.
ALTER TABLE "ResearchExportSchedule" DROP CONSTRAINT IF EXISTS "ResearchExportSchedule_cadence_check";
ALTER TABLE "ResearchExportSchedule" ADD CONSTRAINT "ResearchExportSchedule_cadence_check" CHECK (
  "localHour" BETWEEN 0 AND 23
  AND (
    ("cadence" = 'WEEKLY' AND "dayOfWeek" BETWEEN 1 AND 7 AND "dayOfMonth" IS NULL)
    OR
    ("cadence" = 'MONTHLY' AND "dayOfMonth" BETWEEN 1 AND 28 AND "dayOfWeek" IS NULL)
  )
);

-- Row level security, as 20261029120000_volunteer_roster sets it for a clinic-scoped table: ENABLE
-- and FORCE together, because the application connects as the table owner.
ALTER TABLE "ResearchExportSchedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResearchExportSchedule" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ResearchExportSchedule_clinic_scope_policy" ON "ResearchExportSchedule";
CREATE POLICY "ResearchExportSchedule_clinic_scope_policy" ON "ResearchExportSchedule"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));
