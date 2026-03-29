-- CreateEnum
CREATE TYPE "DrugCategory" AS ENUM ('ANTIHYPERTENSIVE', 'ANTIDIABETIC', 'DIURETIC', 'BETA_BLOCKER', 'OTHER');

-- CreateTable
CREATE TABLE "Drug" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "genericName" VARCHAR(200),
    "category" "DrugCategory" NOT NULL DEFAULT 'OTHER',
    "dosageForms" TEXT,
    "contraindications" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Drug_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "encounterId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "drugId" UUID NOT NULL,
    "dosage" VARCHAR(100) NOT NULL,
    "frequency" VARCHAR(100) NOT NULL,
    "duration" VARCHAR(100),
    "quantity" INTEGER,
    "instructions" TEXT,
    "prescribedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Drug_clinicId_category_idx" ON "Drug"("clinicId", "category");
CREATE INDEX "Drug_clinicId_isActive_idx" ON "Drug"("clinicId", "isActive");
CREATE INDEX "Drug_clinicId_name_idx" ON "Drug"("clinicId", "name");

-- CreateIndex
CREATE INDEX "Prescription_encounterId_idx" ON "Prescription"("encounterId");
CREATE INDEX "Prescription_clinicId_updatedAt_idx" ON "Prescription"("clinicId", "updatedAt");

-- AddForeignKey
ALTER TABLE "Drug" ADD CONSTRAINT "Drug_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "Drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_prescribedByUserId_fkey" FOREIGN KEY ("prescribedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
