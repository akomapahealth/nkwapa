-- Upgrade ResearchExport for the v1 pack/queue/sync pipeline.

CREATE TYPE "ResearchExportStatus_new" AS ENUM (
    'PENDING_APPROVAL',
    'APPROVED',
    'PROCESSING',
    'COMPLETED',
    'FAILED',
    'REJECTED'
);

ALTER TABLE "ResearchExport"
ADD COLUMN "fromDate" VARCHAR(10),
ADD COLUMN "toDate" VARCHAR(10),
ADD COLUMN "failureReason" TEXT,
ADD COLUMN "rowCountsJson" TEXT,
ADD COLUMN "artifactSha256" VARCHAR(128),
ADD COLUMN "artifactSizeBytes" INTEGER,
ADD COLUMN "repoProvider" VARCHAR(40),
ADD COLUMN "repoPath" VARCHAR(500),
ADD COLUMN "repoCommitSha" VARCHAR(80),
ADD COLUMN "repoCommitUrl" VARCHAR(500),
ADD COLUMN "syncedAt" TIMESTAMP(3),
ADD COLUMN "startedAt" TIMESTAMP(3);

UPDATE "ResearchExport"
SET
    "fromDate" = TO_CHAR((("requestedAt" AT TIME ZONE 'UTC')::date), 'YYYY-MM-DD'),
    "toDate" = TO_CHAR((("requestedAt" AT TIME ZONE 'UTC')::date), 'YYYY-MM-DD'),
    "fileFormat" = COALESCE("fileFormat", 'zip');

ALTER TABLE "ResearchExport"
ALTER COLUMN "fromDate" SET NOT NULL,
ALTER COLUMN "toDate" SET NOT NULL,
ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "ResearchExport"
ALTER COLUMN "status" TYPE "ResearchExportStatus_new"
USING (
  CASE "status"::text
    WHEN 'PENDING' THEN 'PENDING_APPROVAL'::"ResearchExportStatus_new"
    WHEN 'APPROVED' THEN 'APPROVED'::"ResearchExportStatus_new"
    WHEN 'COMPLETED' THEN 'COMPLETED'::"ResearchExportStatus_new"
    WHEN 'REJECTED' THEN 'REJECTED'::"ResearchExportStatus_new"
  END
);

ALTER TYPE "ResearchExportStatus" RENAME TO "ResearchExportStatus_old";
ALTER TYPE "ResearchExportStatus_new" RENAME TO "ResearchExportStatus";
DROP TYPE "ResearchExportStatus_old";

ALTER TABLE "ResearchExport"
ALTER COLUMN "status" SET DEFAULT 'PENDING_APPROVAL';
