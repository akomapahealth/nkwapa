-- CreateEnum
CREATE TYPE "PatientMeasurementSource" AS ENUM ('PATIENT', 'STAFF');

-- CreateEnum
CREATE TYPE "PatientMeasurementType" AS ENUM ('BP', 'GLUCOSE', 'WEIGHT');

-- CreateEnum
CREATE TYPE "AppointmentRequestStatus" AS ENUM ('REQUESTED', 'TRIAGED', 'CONFIRMED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

-- CreateTable
CREATE TABLE "PatientAccountLink" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "keycloakSub" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientAccountLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientMeasurement" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "source" "PatientMeasurementSource" NOT NULL,
    "type" "PatientMeasurementType" NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "notes" TEXT,
    "linkedEncounterId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentRequest" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "preferredStartDate" TIMESTAMP(3) NOT NULL,
    "preferredEndDate" TIMESTAMP(3) NOT NULL,
    "reason" VARCHAR(120),
    "notes" TEXT,
    "status" "AppointmentRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "triagedByUserId" UUID,
    "triagedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "linkedRequestId" UUID,
    "assignedDoctorId" UUID,
    "assignedVolunteerId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientAccountLink_patientId_key" ON "PatientAccountLink"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientAccountLink_keycloakSub_key" ON "PatientAccountLink"("keycloakSub");

-- CreateIndex
CREATE INDEX "PatientMeasurement_patientId_recordedAt_idx" ON "PatientMeasurement"("patientId", "recordedAt");

-- CreateIndex
CREATE INDEX "PatientMeasurement_patientId_type_recordedAt_idx" ON "PatientMeasurement"("patientId", "type", "recordedAt");

-- CreateIndex
CREATE INDEX "AppointmentRequest_clinicId_status_createdAt_idx" ON "AppointmentRequest"("clinicId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AppointmentRequest_patientId_createdAt_idx" ON "AppointmentRequest"("patientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_linkedRequestId_key" ON "Appointment"("linkedRequestId");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_startsAt_idx" ON "Appointment"("clinicId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_patientId_startsAt_idx" ON "Appointment"("patientId", "startsAt");

-- Backfill data
INSERT INTO "PatientAccountLink" ("id", "patientId", "keycloakSub", "createdAt")
SELECT
    p."portalUserId",
    p."id",
    u."keycloakSub",
    CURRENT_TIMESTAMP
FROM "Patient" p
JOIN "User" u ON u."id" = p."portalUserId"
WHERE p."portalUserId" IS NOT NULL;

INSERT INTO "PatientMeasurement" (
    "id",
    "patientId",
    "clinicId",
    "recordedAt",
    "source",
    "type",
    "payloadJson",
    "notes",
    "linkedEncounterId",
    "createdAt",
    "updatedAt"
)
SELECT
    psr."id",
    psr."patientId",
    p."primaryClinicId",
    psr."recordedAt",
    'PATIENT'::"PatientMeasurementSource",
    'BP'::"PatientMeasurementType",
    jsonb_build_object(
        'systolic', psr."systolicBp",
        'diastolic', psr."diastolicBp",
        'pulse', NULL
    )::text,
    psr."notes",
    NULL,
    psr."createdAt",
    psr."createdAt"
FROM "PatientSelfReport" psr
JOIN "Patient" p ON p."id" = psr."patientId"
WHERE psr."type" = 'HOME_BP'
  AND psr."systolicBp" IS NOT NULL
  AND psr."diastolicBp" IS NOT NULL;

INSERT INTO "PatientMeasurement" (
    "id",
    "patientId",
    "clinicId",
    "recordedAt",
    "source",
    "type",
    "payloadJson",
    "notes",
    "linkedEncounterId",
    "createdAt",
    "updatedAt"
)
SELECT
    psr."id",
    psr."patientId",
    p."primaryClinicId",
    psr."recordedAt",
    'PATIENT'::"PatientMeasurementSource",
    'GLUCOSE'::"PatientMeasurementType",
    jsonb_build_object(
        'value', psr."glucoseMgDl",
        'glucoseType', COALESCE(psr."glucoseType"::text, 'UNKNOWN')
    )::text,
    psr."notes",
    NULL,
    psr."createdAt",
    psr."createdAt"
FROM "PatientSelfReport" psr
JOIN "Patient" p ON p."id" = psr."patientId"
WHERE psr."type" = 'HOME_GLUCOSE'
  AND psr."glucoseMgDl" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "PatientAccountLink" ADD CONSTRAINT "PatientAccountLink_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMeasurement" ADD CONSTRAINT "PatientMeasurement_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMeasurement" ADD CONSTRAINT "PatientMeasurement_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMeasurement" ADD CONSTRAINT "PatientMeasurement_linkedEncounterId_fkey" FOREIGN KEY ("linkedEncounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentRequest" ADD CONSTRAINT "AppointmentRequest_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentRequest" ADD CONSTRAINT "AppointmentRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentRequest" ADD CONSTRAINT "AppointmentRequest_triagedByUserId_fkey" FOREIGN KEY ("triagedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_linkedRequestId_fkey" FOREIGN KEY ("linkedRequestId") REFERENCES "AppointmentRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_assignedDoctorId_fkey" FOREIGN KEY ("assignedDoctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_assignedVolunteerId_fkey" FOREIGN KEY ("assignedVolunteerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
