-- CreateEnum
CREATE TYPE "GhanaRegion" AS ENUM (
  'AHAFO',
  'ASHANTI',
  'BONO',
  'BONO_EAST',
  'CENTRAL',
  'EASTERN',
  'GREATER_ACCRA',
  'NORTH_EAST',
  'NORTHERN',
  'OTI',
  'SAVANNAH',
  'UPPER_EAST',
  'UPPER_WEST',
  'VOLTA',
  'WESTERN',
  'WESTERN_NORTH'
);

-- CreateEnum
CREATE TYPE "PatientLocationStatus" AS ENUM ('RECORDED', 'UNKNOWN', 'NOT_RECORDED');

-- AlterTable
-- Existing patients backfill to NOT_RECORDED (never captured, no fabricated
-- location). Region/district/community/address-note stay NULL until recorded.
ALTER TABLE "Patient"
  ADD COLUMN "residentialLocationStatus" "PatientLocationStatus" NOT NULL DEFAULT 'NOT_RECORDED',
  ADD COLUMN "residentialRegion" "GhanaRegion",
  ADD COLUMN "residentialDistrict" VARCHAR(120),
  ADD COLUMN "residentialCommunity" VARCHAR(120),
  ADD COLUMN "residentialAddressNote" VARCHAR(280);

-- CreateIndex
CREATE INDEX "Patient_primaryClinicId_residentialRegion_idx"
  ON "Patient"("primaryClinicId", "residentialRegion");

-- CreateIndex
CREATE INDEX "Patient_primaryClinicId_residentialLocationStatus_idx"
  ON "Patient"("primaryClinicId", "residentialLocationStatus");
