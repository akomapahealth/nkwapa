-- CreateEnum
CREATE TYPE "SyncOperation" AS ENUM ('UPSERT', 'DELETE');

-- CreateEnum
CREATE TYPE "SyncMutationStatus" AS ENUM ('APPLIED', 'CONFLICT', 'ERROR');

-- CreateTable
CREATE TABLE "SyncMutation" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "entityType" VARCHAR(80) NOT NULL,
    "entityId" VARCHAR(80) NOT NULL,
    "operation" "SyncOperation" NOT NULL,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "status" "SyncMutationStatus" NOT NULL,
    "conflictType" VARCHAR(80),
    "conflictDetailsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncMutation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncMutation_clinicId_idx" ON "SyncMutation"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncMutation_clinicId_idempotencyKey_key" ON "SyncMutation"("clinicId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "SyncMutation" ADD CONSTRAINT "SyncMutation_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
