-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SYSTEM_ADMIN', 'DIRECTOR', 'MANAGER', 'DOCTOR', 'PRECEPTOR', 'VOLUNTEER');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('RESEARCH_DEIDENTIFIED');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "EncounterStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'FINALIZED');

-- CreateEnum
CREATE TYPE "GlucoseType" AS ENUM ('FASTING', 'RANDOM', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "HypertensionClassification" AS ENUM ('NORMAL', 'ELEVATED', 'STAGE1', 'STAGE2', 'CRISIS', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "ResearchExportStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "NationalIdType" AS ENUM ('VOTER_ID', 'NATIONAL_ID', 'PASSPORT', 'OTHER');

-- CreateTable
CREATE TABLE "Clinic" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT,
    "countryCode" VARCHAR(2) NOT NULL DEFAULT 'GH',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "keycloakSub" VARCHAR(255) NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" VARCHAR(320),
    "phoneE164" VARCHAR(32),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserClinicRole" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "clinicId" UUID,
    "role" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserClinicRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" UUID NOT NULL,
    "patientCode" VARCHAR(32) NOT NULL,
    "primaryClinicId" UUID NOT NULL,
    "firstName" VARCHAR(120) NOT NULL,
    "lastName" VARCHAR(120) NOT NULL,
    "dob" TIMESTAMP(3),
    "sex" "Sex" NOT NULL DEFAULT 'UNKNOWN',
    "phoneE164" VARCHAR(32),
    "email" VARCHAR(320),
    "nationalIdType" "NationalIdType" NOT NULL,
    "nationalIdCiphertext" TEXT NOT NULL,
    "nationalIdHash" VARCHAR(128) NOT NULL,
    "nationalIdLast4" VARCHAR(8),
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientConsent" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "consentType" "ConsentType" NOT NULL,
    "status" "ConsentStatus" NOT NULL,
    "consentVersion" VARCHAR(32) NOT NULL,
    "consentTextSnapshot" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "recordedByUserId" UUID NOT NULL,
    "witnessName" VARCHAR(200),
    "witnessPhoneE164" VARCHAR(32),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Encounter" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "status" "EncounterStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" UUID NOT NULL,
    "preceptorReviewedById" UUID,
    "doctorFinalizedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vitals" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "encounterId" UUID NOT NULL,
    "systolicBp" INTEGER,
    "diastolicBp" INTEGER,
    "heartRate" INTEGER,
    "weightKg" DOUBLE PRECISION,
    "heightCm" DOUBLE PRECISION,
    "bmi" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vitals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiabetesScreening" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "encounterId" UUID NOT NULL,
    "glucoseMgDl" INTEGER,
    "glucoseType" "GlucoseType" NOT NULL DEFAULT 'UNKNOWN',
    "hba1cPercent" DOUBLE PRECISION,
    "symptomsJson" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiabetesScreening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HypertensionAssessment" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "encounterId" UUID NOT NULL,
    "classification" "HypertensionClassification" NOT NULL DEFAULT 'UNKNOWN',
    "suspected" BOOLEAN NOT NULL DEFAULT false,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HypertensionAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlan" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "encounterId" UUID NOT NULL,
    "counselingGiven" BOOLEAN NOT NULL DEFAULT false,
    "medicationPrescribed" BOOLEAN NOT NULL DEFAULT false,
    "followUpDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "encounterId" UUID,
    "channel" "ReminderChannel" NOT NULL,
    "toAddress" VARCHAR(320) NOT NULL,
    "templateKey" VARCHAR(100) NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" "ReminderStatus" NOT NULL DEFAULT 'QUEUED',
    "providerMessageId" VARCHAR(255),
    "failureReason" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicResearchSettings" (
    "clinicId" UUID NOT NULL,
    "researchEnabled" BOOLEAN NOT NULL DEFAULT false,
    "requiresDirectorApprovalEachExport" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicResearchSettings_pkey" PRIMARY KEY ("clinicId")
);

-- CreateTable
CREATE TABLE "ResearchExport" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "requestedByUserId" UUID NOT NULL,
    "approvedByUserId" UUID,
    "status" "ResearchExportStatus" NOT NULL DEFAULT 'PENDING',
    "datasetVersion" INTEGER NOT NULL DEFAULT 1,
    "policyVersionSnapshot" VARCHAR(64) NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ResearchExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "clinicId" UUID,
    "actorUserId" UUID NOT NULL,
    "action" VARCHAR(200) NOT NULL,
    "entityType" VARCHAR(80) NOT NULL,
    "entityId" VARCHAR(80) NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "requestId" VARCHAR(80) NOT NULL,
    "ipAddress" VARCHAR(64),
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Clinic_countryCode_idx" ON "Clinic"("countryCode");

-- CreateIndex
CREATE INDEX "Clinic_isActive_idx" ON "Clinic"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "User_keycloakSub_key" ON "User"("keycloakSub");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE INDEX "UserClinicRole_userId_idx" ON "UserClinicRole"("userId");

-- CreateIndex
CREATE INDEX "UserClinicRole_clinicId_idx" ON "UserClinicRole"("clinicId");

-- CreateIndex
CREATE INDEX "UserClinicRole_role_idx" ON "UserClinicRole"("role");

-- CreateIndex
CREATE UNIQUE INDEX "UserClinicRole_userId_clinicId_role_key" ON "UserClinicRole"("userId", "clinicId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_patientCode_key" ON "Patient"("patientCode");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_nationalIdHash_key" ON "Patient"("nationalIdHash");

-- CreateIndex
CREATE INDEX "Patient_primaryClinicId_idx" ON "Patient"("primaryClinicId");

-- CreateIndex
CREATE INDEX "Patient_lastName_firstName_idx" ON "Patient"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Patient_phoneE164_idx" ON "Patient"("phoneE164");

-- CreateIndex
CREATE INDEX "Patient_updatedAt_idx" ON "Patient"("updatedAt");

-- CreateIndex
CREATE INDEX "PatientConsent_patientId_idx" ON "PatientConsent"("patientId");

-- CreateIndex
CREATE INDEX "PatientConsent_clinicId_idx" ON "PatientConsent"("clinicId");

-- CreateIndex
CREATE INDEX "PatientConsent_status_idx" ON "PatientConsent"("status");

-- CreateIndex
CREATE INDEX "PatientConsent_updatedAt_idx" ON "PatientConsent"("updatedAt");

-- CreateIndex
CREATE INDEX "PatientConsent_patientId_clinicId_consentType_idx" ON "PatientConsent"("patientId", "clinicId", "consentType");

-- CreateIndex
CREATE INDEX "Encounter_clinicId_updatedAt_idx" ON "Encounter"("clinicId", "updatedAt");

-- CreateIndex
CREATE INDEX "Encounter_patientId_updatedAt_idx" ON "Encounter"("patientId", "updatedAt");

-- CreateIndex
CREATE INDEX "Encounter_status_idx" ON "Encounter"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Vitals_encounterId_key" ON "Vitals"("encounterId");

-- CreateIndex
CREATE INDEX "Vitals_clinicId_updatedAt_idx" ON "Vitals"("clinicId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiabetesScreening_encounterId_key" ON "DiabetesScreening"("encounterId");

-- CreateIndex
CREATE INDEX "DiabetesScreening_clinicId_updatedAt_idx" ON "DiabetesScreening"("clinicId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HypertensionAssessment_encounterId_key" ON "HypertensionAssessment"("encounterId");

-- CreateIndex
CREATE INDEX "HypertensionAssessment_clinicId_updatedAt_idx" ON "HypertensionAssessment"("clinicId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CarePlan_encounterId_key" ON "CarePlan"("encounterId");

-- CreateIndex
CREATE INDEX "CarePlan_clinicId_updatedAt_idx" ON "CarePlan"("clinicId", "updatedAt");

-- CreateIndex
CREATE INDEX "Reminder_clinicId_scheduledAt_idx" ON "Reminder"("clinicId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Reminder_status_scheduledAt_idx" ON "Reminder"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Reminder_patientId_idx" ON "Reminder"("patientId");

-- CreateIndex
CREATE INDEX "ClinicResearchSettings_researchEnabled_idx" ON "ClinicResearchSettings"("researchEnabled");

-- CreateIndex
CREATE INDEX "ResearchExport_clinicId_status_idx" ON "ResearchExport"("clinicId", "status");

-- CreateIndex
CREATE INDEX "ResearchExport_requestedAt_idx" ON "ResearchExport"("requestedAt");

-- CreateIndex
CREATE INDEX "AuditEvent_clinicId_createdAt_idx" ON "AuditEvent"("clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_createdAt_idx" ON "AuditEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent"("action");

-- AddForeignKey
ALTER TABLE "UserClinicRole" ADD CONSTRAINT "UserClinicRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserClinicRole" ADD CONSTRAINT "UserClinicRole_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_primaryClinicId_fkey" FOREIGN KEY ("primaryClinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_preceptorReviewedById_fkey" FOREIGN KEY ("preceptorReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_doctorFinalizedById_fkey" FOREIGN KEY ("doctorFinalizedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vitals" ADD CONSTRAINT "Vitals_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vitals" ADD CONSTRAINT "Vitals_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiabetesScreening" ADD CONSTRAINT "DiabetesScreening_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiabetesScreening" ADD CONSTRAINT "DiabetesScreening_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HypertensionAssessment" ADD CONSTRAINT "HypertensionAssessment_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HypertensionAssessment" ADD CONSTRAINT "HypertensionAssessment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicResearchSettings" ADD CONSTRAINT "ClinicResearchSettings_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicResearchSettings" ADD CONSTRAINT "ClinicResearchSettings_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchExport" ADD CONSTRAINT "ResearchExport_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchExport" ADD CONSTRAINT "ResearchExport_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchExport" ADD CONSTRAINT "ResearchExport_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

