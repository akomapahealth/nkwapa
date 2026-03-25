-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "ShiftRole" AS ENUM ('VOLUNTEER', 'DOCTOR', 'PRECEPTOR', 'MANAGER');

-- CreateEnum
CREATE TYPE "CheckInSource" AS ENUM ('STAFF', 'PATIENT_SELF');

-- CreateEnum
CREATE TYPE "CheckInStatus" AS ENUM ('WAITING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'REASSIGNED', 'CANCELLED');

-- CreateTable
CREATE TABLE "StaffShift" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleAtShift" "ShiftRole" NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL,
    "checkedOutAt" TIMESTAMP(3),
    "status" "ShiftStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientCheckIn" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL,
    "source" "CheckInSource" NOT NULL DEFAULT 'STAFF',
    "status" "CheckInStatus" NOT NULL DEFAULT 'WAITING',
    "encounterId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientAssignment" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientCheckInId" UUID NOT NULL,
    "assignedVolunteerId" UUID NOT NULL,
    "assignedDoctorId" UUID NOT NULL,
    "assignedByUserId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffShift_clinicId_status_checkedInAt_idx" ON "StaffShift"("clinicId", "status", "checkedInAt");

-- CreateIndex
CREATE INDEX "StaffShift_userId_checkedInAt_idx" ON "StaffShift"("userId", "checkedInAt");

-- CreateIndex
CREATE UNIQUE INDEX "StaffShift_active_unique_idx" ON "StaffShift"("clinicId", "userId") WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX "PatientCheckIn_encounterId_key" ON "PatientCheckIn"("encounterId");

-- CreateIndex
CREATE INDEX "PatientCheckIn_clinicId_status_checkedInAt_idx" ON "PatientCheckIn"("clinicId", "status", "checkedInAt");

-- CreateIndex
CREATE INDEX "PatientCheckIn_patientId_checkedInAt_idx" ON "PatientCheckIn"("patientId", "checkedInAt");

-- CreateIndex
CREATE INDEX "PatientAssignment_clinicId_status_assignedAt_idx" ON "PatientAssignment"("clinicId", "status", "assignedAt");

-- CreateIndex
CREATE INDEX "PatientAssignment_patientCheckInId_idx" ON "PatientAssignment"("patientCheckInId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientAssignment_active_unique_idx" ON "PatientAssignment"("patientCheckInId") WHERE "status" = 'ACTIVE';

-- AddForeignKey
ALTER TABLE "StaffShift" ADD CONSTRAINT "StaffShift_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffShift" ADD CONSTRAINT "StaffShift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientCheckIn" ADD CONSTRAINT "PatientCheckIn_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientCheckIn" ADD CONSTRAINT "PatientCheckIn_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientCheckIn" ADD CONSTRAINT "PatientCheckIn_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAssignment" ADD CONSTRAINT "PatientAssignment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAssignment" ADD CONSTRAINT "PatientAssignment_patientCheckInId_fkey" FOREIGN KEY ("patientCheckInId") REFERENCES "PatientCheckIn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAssignment" ADD CONSTRAINT "PatientAssignment_assignedVolunteerId_fkey" FOREIGN KEY ("assignedVolunteerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAssignment" ADD CONSTRAINT "PatientAssignment_assignedDoctorId_fkey" FOREIGN KEY ("assignedDoctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAssignment" ADD CONSTRAINT "PatientAssignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
