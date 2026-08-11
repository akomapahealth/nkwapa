CREATE TYPE "PatientMedicationStatus" AS ENUM ('CURRENT', 'PAST', 'STOPPED');
CREATE TYPE "MedicationSourceType" AS ENUM (
  'PATIENT_REPORTED',
  'CAREGIVER_REPORTED',
  'CLINIC_RECORD',
  'EXTERNAL_DOCUMENT',
  'MEDICATION_CONTAINER',
  'OTHER'
);
CREATE TYPE "MedicationReconciliationOutcome" AS ENUM (
  'CURRENT_LIST_REVIEWED',
  'NO_KNOWN_CURRENT_MEDICATIONS'
);

CREATE TABLE "PatientMedicationRecord" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "currentRevisionId" UUID,
  "recordedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PatientMedicationRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientMedicationRevision" (
  "id" UUID NOT NULL,
  "recordId" UUID NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "medicationName" VARCHAR(200) NOT NULL,
  "drugId" UUID,
  "strength" VARCHAR(100),
  "dose" VARCHAR(100),
  "doseUnit" VARCHAR(80),
  "route" VARCHAR(100),
  "frequency" VARCHAR(120),
  "duration" VARCHAR(120),
  "startDate" DATE,
  "endDate" DATE,
  "indication" VARCHAR(300),
  "status" "PatientMedicationStatus" NOT NULL,
  "notes" TEXT,
  "sourceEncounterId" UUID,
  "sourceType" "MedicationSourceType" NOT NULL,
  "authoredByUserId" UUID NOT NULL,
  "reconciledByUserId" UUID,
  "lastReconciledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientMedicationRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PatientMedicationRevision_revisionNumber_check" CHECK ("revisionNumber" > 0),
  CONSTRAINT "PatientMedicationRevision_name_check" CHECK (length(btrim("medicationName")) > 0),
  CONSTRAINT "PatientMedicationRevision_date_order_check" CHECK (
    "endDate" IS NULL OR "startDate" IS NULL OR "endDate" >= "startDate"
  ),
  CONSTRAINT "PatientMedicationRevision_current_end_date_check" CHECK (
    "status" <> 'CURRENT' OR "endDate" IS NULL
  ),
  CONSTRAINT "PatientMedicationRevision_reconciliation_metadata_check" CHECK (
    ("reconciledByUserId" IS NULL AND "lastReconciledAt" IS NULL)
    OR ("reconciledByUserId" IS NOT NULL AND "lastReconciledAt" IS NOT NULL)
  )
);

CREATE TABLE "MedicationReconciliationEvent" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "outcome" "MedicationReconciliationOutcome" NOT NULL,
  "sourceEncounterId" UUID,
  "reconciledByUserId" UUID NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MedicationReconciliationEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientPharmacyRecord" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "currentRevisionId" UUID,
  "recordedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PatientPharmacyRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientPharmacyRevision" (
  "id" UUID NOT NULL,
  "recordId" UUID NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "phoneE164" VARCHAR(32),
  "addressLine1" VARCHAR(200),
  "addressLine2" VARCHAR(200),
  "city" VARCHAR(120),
  "region" VARCHAR(120),
  "postalCode" VARCHAR(32),
  "countryCode" VARCHAR(2),
  "addressText" TEXT,
  "notes" TEXT,
  "authoredByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientPharmacyRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PatientPharmacyRevision_revisionNumber_check" CHECK ("revisionNumber" > 0),
  CONSTRAINT "PatientPharmacyRevision_name_check" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "PatientPharmacyRevision_country_code_check" CHECK (
    "countryCode" IS NULL OR "countryCode" ~ '^[A-Z]{2}$'
  )
);

CREATE TABLE "PatientPharmacyPreference" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "pharmacyRecordId" UUID NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  "notes" TEXT,
  "setByUserId" UUID NOT NULL,
  "endedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PatientPharmacyPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PatientPharmacyPreference_date_order_check" CHECK (
    "effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"
  ),
  CONSTRAINT "PatientPharmacyPreference_end_actor_check" CHECK (
    ("effectiveTo" IS NULL AND "endedByUserId" IS NULL)
    OR ("effectiveTo" IS NOT NULL AND "endedByUserId" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "PatientMedicationRecord_currentRevisionId_key" ON "PatientMedicationRecord"("currentRevisionId");
CREATE INDEX "PatientMedicationRecord_clinicId_patientId_updatedAt_idx" ON "PatientMedicationRecord"("clinicId", "patientId", "updatedAt");
CREATE INDEX "PatientMedicationRecord_clinicId_updatedAt_id_idx" ON "PatientMedicationRecord"("clinicId", "updatedAt", "id");
CREATE INDEX "PatientMedicationRecord_patientId_updatedAt_idx" ON "PatientMedicationRecord"("patientId", "updatedAt");
CREATE INDEX "PatientMedicationRecord_recordedByUserId_createdAt_idx" ON "PatientMedicationRecord"("recordedByUserId", "createdAt");
CREATE UNIQUE INDEX "PatientMedicationRevision_recordId_revisionNumber_key" ON "PatientMedicationRevision"("recordId", "revisionNumber");
CREATE INDEX "PatientMedicationRevision_recordId_createdAt_idx" ON "PatientMedicationRevision"("recordId", "createdAt");
CREATE INDEX "PatientMedicationRevision_drugId_idx" ON "PatientMedicationRevision"("drugId");
CREATE INDEX "PatientMedicationRevision_sourceEncounterId_idx" ON "PatientMedicationRevision"("sourceEncounterId");
CREATE INDEX "PatientMedicationRevision_authoredByUserId_createdAt_idx" ON "PatientMedicationRevision"("authoredByUserId", "createdAt");
CREATE INDEX "PatientMedicationRevision_reconciledByUserId_lastReconciledAt_idx" ON "PatientMedicationRevision"("reconciledByUserId", "lastReconciledAt");
CREATE INDEX "PatientMedicationRevision_status_createdAt_idx" ON "PatientMedicationRevision"("status", "createdAt");
CREATE INDEX "MedicationReconciliationEvent_clinicId_patientId_createdAt_idx" ON "MedicationReconciliationEvent"("clinicId", "patientId", "createdAt");
CREATE INDEX "MedicationReconciliationEvent_clinicId_createdAt_id_idx" ON "MedicationReconciliationEvent"("clinicId", "createdAt", "id");
CREATE INDEX "MedicationReconciliationEvent_sourceEncounterId_idx" ON "MedicationReconciliationEvent"("sourceEncounterId");
CREATE INDEX "MedicationReconciliationEvent_reconciledByUserId_createdAt_idx" ON "MedicationReconciliationEvent"("reconciledByUserId", "createdAt");

CREATE UNIQUE INDEX "PatientPharmacyRecord_currentRevisionId_key" ON "PatientPharmacyRecord"("currentRevisionId");
CREATE UNIQUE INDEX "PatientPharmacyRecord_identity_scope_key" ON "PatientPharmacyRecord"("id", "clinicId", "patientId");
CREATE INDEX "PatientPharmacyRecord_clinicId_patientId_updatedAt_idx" ON "PatientPharmacyRecord"("clinicId", "patientId", "updatedAt");
CREATE INDEX "PatientPharmacyRecord_clinicId_updatedAt_id_idx" ON "PatientPharmacyRecord"("clinicId", "updatedAt", "id");
CREATE INDEX "PatientPharmacyRecord_patientId_updatedAt_idx" ON "PatientPharmacyRecord"("patientId", "updatedAt");
CREATE INDEX "PatientPharmacyRecord_recordedByUserId_createdAt_idx" ON "PatientPharmacyRecord"("recordedByUserId", "createdAt");
CREATE UNIQUE INDEX "PatientPharmacyRevision_recordId_revisionNumber_key" ON "PatientPharmacyRevision"("recordId", "revisionNumber");
CREATE INDEX "PatientPharmacyRevision_recordId_createdAt_idx" ON "PatientPharmacyRevision"("recordId", "createdAt");
CREATE INDEX "PatientPharmacyRevision_authoredByUserId_createdAt_idx" ON "PatientPharmacyRevision"("authoredByUserId", "createdAt");
CREATE INDEX "PatientPharmacyPreference_clinicId_patientId_effectiveFrom_idx" ON "PatientPharmacyPreference"("clinicId", "patientId", "effectiveFrom");
CREATE INDEX "PatientPharmacyPreference_clinicId_updatedAt_id_idx" ON "PatientPharmacyPreference"("clinicId", "updatedAt", "id");
CREATE INDEX "PatientPharmacyPreference_pharmacyRecordId_effectiveFrom_idx" ON "PatientPharmacyPreference"("pharmacyRecordId", "effectiveFrom");
CREATE INDEX "PatientPharmacyPreference_setByUserId_createdAt_idx" ON "PatientPharmacyPreference"("setByUserId", "createdAt");
CREATE INDEX "PatientPharmacyPreference_endedByUserId_effectiveTo_idx" ON "PatientPharmacyPreference"("endedByUserId", "effectiveTo");
CREATE UNIQUE INDEX "PatientPharmacyPreference_one_open_per_patient_key"
  ON "PatientPharmacyPreference"("clinicId", "patientId") WHERE "effectiveTo" IS NULL;

ALTER TABLE "PatientMedicationRecord" ADD CONSTRAINT "PatientMedicationRecord_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientMedicationRecord" ADD CONSTRAINT "PatientMedicationRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientMedicationRecord" ADD CONSTRAINT "PatientMedicationRecord_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientMedicationRevision" ADD CONSTRAINT "PatientMedicationRevision_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "PatientMedicationRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientMedicationRevision" ADD CONSTRAINT "PatientMedicationRevision_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "Drug"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PatientMedicationRevision" ADD CONSTRAINT "PatientMedicationRevision_sourceEncounterId_fkey" FOREIGN KEY ("sourceEncounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PatientMedicationRevision" ADD CONSTRAINT "PatientMedicationRevision_authoredByUserId_fkey" FOREIGN KEY ("authoredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientMedicationRevision" ADD CONSTRAINT "PatientMedicationRevision_reconciledByUserId_fkey" FOREIGN KEY ("reconciledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PatientMedicationRecord" ADD CONSTRAINT "PatientMedicationRecord_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "PatientMedicationRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MedicationReconciliationEvent" ADD CONSTRAINT "MedicationReconciliationEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicationReconciliationEvent" ADD CONSTRAINT "MedicationReconciliationEvent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicationReconciliationEvent" ADD CONSTRAINT "MedicationReconciliationEvent_sourceEncounterId_fkey" FOREIGN KEY ("sourceEncounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MedicationReconciliationEvent" ADD CONSTRAINT "MedicationReconciliationEvent_reconciledByUserId_fkey" FOREIGN KEY ("reconciledByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientPharmacyRecord" ADD CONSTRAINT "PatientPharmacyRecord_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientPharmacyRecord" ADD CONSTRAINT "PatientPharmacyRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientPharmacyRecord" ADD CONSTRAINT "PatientPharmacyRecord_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientPharmacyRevision" ADD CONSTRAINT "PatientPharmacyRevision_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "PatientPharmacyRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientPharmacyRevision" ADD CONSTRAINT "PatientPharmacyRevision_authoredByUserId_fkey" FOREIGN KEY ("authoredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientPharmacyRecord" ADD CONSTRAINT "PatientPharmacyRecord_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "PatientPharmacyRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PatientPharmacyPreference" ADD CONSTRAINT "PatientPharmacyPreference_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientPharmacyPreference" ADD CONSTRAINT "PatientPharmacyPreference_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientPharmacyPreference" ADD CONSTRAINT "PatientPharmacyPreference_pharmacy_scope_fkey" FOREIGN KEY ("pharmacyRecordId", "clinicId", "patientId") REFERENCES "PatientPharmacyRecord"("id", "clinicId", "patientId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientPharmacyPreference" ADD CONSTRAINT "PatientPharmacyPreference_setByUserId_fkey" FOREIGN KEY ("setByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientPharmacyPreference" ADD CONSTRAINT "PatientPharmacyPreference_endedByUserId_fkey" FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PatientMedicationRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PatientMedicationRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MedicationReconciliationEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PatientPharmacyRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PatientPharmacyRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PatientPharmacyPreference" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "PatientMedicationRecord_clinic_scope_policy" ON "PatientMedicationRecord" FOR ALL
USING (app.can_access_clinic("clinicId") AND EXISTS (SELECT 1 FROM "Patient" p WHERE p."id" = "patientId" AND p."primaryClinicId" = "clinicId"))
WITH CHECK (app.can_access_clinic("clinicId") AND EXISTS (SELECT 1 FROM "Patient" p WHERE p."id" = "patientId" AND p."primaryClinicId" = "clinicId"));
CREATE POLICY "PatientMedicationRevision_clinic_scope_policy" ON "PatientMedicationRevision" FOR ALL
USING (EXISTS (SELECT 1 FROM "PatientMedicationRecord" r WHERE r."id" = "recordId" AND app.can_access_clinic(r."clinicId")))
WITH CHECK (EXISTS (SELECT 1 FROM "PatientMedicationRecord" r WHERE r."id" = "recordId" AND app.can_access_clinic(r."clinicId")));
CREATE POLICY "MedicationReconciliationEvent_clinic_scope_policy" ON "MedicationReconciliationEvent" FOR ALL
USING (app.can_access_clinic("clinicId") AND EXISTS (SELECT 1 FROM "Patient" p WHERE p."id" = "patientId" AND p."primaryClinicId" = "clinicId"))
WITH CHECK (app.can_access_clinic("clinicId") AND EXISTS (SELECT 1 FROM "Patient" p WHERE p."id" = "patientId" AND p."primaryClinicId" = "clinicId"));
CREATE POLICY "PatientPharmacyRecord_clinic_scope_policy" ON "PatientPharmacyRecord" FOR ALL
USING (app.can_access_clinic("clinicId") AND EXISTS (SELECT 1 FROM "Patient" p WHERE p."id" = "patientId" AND p."primaryClinicId" = "clinicId"))
WITH CHECK (app.can_access_clinic("clinicId") AND EXISTS (SELECT 1 FROM "Patient" p WHERE p."id" = "patientId" AND p."primaryClinicId" = "clinicId"));
CREATE POLICY "PatientPharmacyRevision_clinic_scope_policy" ON "PatientPharmacyRevision" FOR ALL
USING (EXISTS (SELECT 1 FROM "PatientPharmacyRecord" r WHERE r."id" = "recordId" AND app.can_access_clinic(r."clinicId")))
WITH CHECK (EXISTS (SELECT 1 FROM "PatientPharmacyRecord" r WHERE r."id" = "recordId" AND app.can_access_clinic(r."clinicId")));
CREATE POLICY "PatientPharmacyPreference_clinic_scope_policy" ON "PatientPharmacyPreference" FOR ALL
USING (app.can_access_clinic("clinicId") AND EXISTS (SELECT 1 FROM "PatientPharmacyRecord" r WHERE r."id" = "pharmacyRecordId" AND r."clinicId" = "clinicId" AND r."patientId" = "patientId"))
WITH CHECK (app.can_access_clinic("clinicId") AND EXISTS (SELECT 1 FROM "PatientPharmacyRecord" r WHERE r."id" = "pharmacyRecordId" AND r."clinicId" = "clinicId" AND r."patientId" = "patientId"));
