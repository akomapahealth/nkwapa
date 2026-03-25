-- CreateEnum
CREATE TYPE "PatientSelfReportType" AS ENUM ('FOLLOW_UP_UPDATE', 'HOME_BP', 'HOME_GLUCOSE', 'SYMPTOMS', 'GENERAL');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'PATIENT';

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN "portalUserId" UUID;

-- CreateTable
CREATE TABLE "PatientSelfReport" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "submittedByUserId" UUID NOT NULL,
    "type" "PatientSelfReportType" NOT NULL,
    "systolicBp" INTEGER,
    "diastolicBp" INTEGER,
    "glucoseMgDl" INTEGER,
    "glucoseType" "GlucoseType" DEFAULT 'UNKNOWN',
    "symptomsJson" TEXT,
    "notes" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientSelfReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Patient_portalUserId_key" ON "Patient"("portalUserId");

-- CreateIndex
CREATE INDEX "Patient_portalUserId_idx" ON "Patient"("portalUserId");

-- CreateIndex
CREATE INDEX "PatientSelfReport_patientId_createdAt_idx" ON "PatientSelfReport"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "PatientSelfReport_clinicId_createdAt_idx" ON "PatientSelfReport"("clinicId", "createdAt");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientSelfReport" ADD CONSTRAINT "PatientSelfReport_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientSelfReport" ADD CONSTRAINT "PatientSelfReport_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientSelfReport" ADD CONSTRAINT "PatientSelfReport_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
