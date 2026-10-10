-- CreateEnum
CREATE TYPE "PatientPortalInviteStatus" AS ENUM ('PENDING', 'CLAIMED', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Patient"
ADD COLUMN "mergedAt" TIMESTAMP(3),
ADD COLUMN "mergedByUserId" UUID,
ADD COLUMN "mergedIntoPatientId" UUID;

-- CreateTable
CREATE TABLE "PatientPortalInvite" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "status" "PatientPortalInviteStatus" NOT NULL DEFAULT 'PENDING',
    "email" VARCHAR(320),
    "phoneE164" VARCHAR(32),
    "createdByUserId" UUID NOT NULL,
    "claimedByUserId" UUID,
    "claimedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientPortalInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientCodeAlias" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientCodeAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Patient_mergedIntoPatientId_idx" ON "Patient"("mergedIntoPatientId");

-- CreateIndex
CREATE INDEX "PatientPortalInvite_patientId_status_idx" ON "PatientPortalInvite"("patientId", "status");

-- CreateIndex
CREATE INDEX "PatientPortalInvite_clinicId_status_createdAt_idx" ON "PatientPortalInvite"("clinicId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PatientPortalInvite_email_status_idx" ON "PatientPortalInvite"("email", "status");

-- CreateIndex
CREATE INDEX "PatientPortalInvite_phoneE164_status_idx" ON "PatientPortalInvite"("phoneE164", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PatientCodeAlias_code_key" ON "PatientCodeAlias"("code");

-- CreateIndex
CREATE INDEX "PatientCodeAlias_patientId_idx" ON "PatientCodeAlias"("patientId");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_mergedIntoPatientId_fkey" FOREIGN KEY ("mergedIntoPatientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_mergedByUserId_fkey" FOREIGN KEY ("mergedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPortalInvite" ADD CONSTRAINT "PatientPortalInvite_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPortalInvite" ADD CONSTRAINT "PatientPortalInvite_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPortalInvite" ADD CONSTRAINT "PatientPortalInvite_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPortalInvite" ADD CONSTRAINT "PatientPortalInvite_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientCodeAlias" ADD CONSTRAINT "PatientCodeAlias_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
