-- AlterTable
ALTER TABLE "ResearchExport" ADD COLUMN "rejectionReason" TEXT,
ADD COLUMN "filePath" VARCHAR(500),
ADD COLUMN "fileFormat" VARCHAR(10),
ADD COLUMN "recordCount" INTEGER;
