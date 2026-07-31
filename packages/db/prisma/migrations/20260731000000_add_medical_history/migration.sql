CREATE TYPE "MedicalHistoryCategory" AS ENUM (
  'CONDITION',
  'ALLERGY',
  'SURGERY_PROCEDURE',
  'FAMILY_HISTORY',
  'SOCIAL_HISTORY'
);

CREATE TYPE "MedicalHistoryStatus" AS ENUM (
  'ACTIVE',
  'RESOLVED',
  'INACTIVE',
  'HISTORICAL',
  'ENTERED_IN_ERROR'
);

CREATE TABLE "MedicalHistoryRecord" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "category" "MedicalHistoryCategory" NOT NULL,
  "currentRevisionId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MedicalHistoryRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MedicalHistoryRevision" (
  "id" UUID NOT NULL,
  "recordId" UUID NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "status" "MedicalHistoryStatus" NOT NULL,
  "onsetDate" DATE,
  "occurrenceDate" DATE,
  "resolvedDate" DATE,
  "detailsSchemaVersion" INTEGER NOT NULL DEFAULT 1,
  "details" JSONB NOT NULL,
  "notes" TEXT,
  "sourceEncounterId" UUID,
  "authoredByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MedicalHistoryRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MedicalHistoryRevision_revisionNumber_check" CHECK ("revisionNumber" > 0),
  CONSTRAINT "MedicalHistoryRevision_detailsSchemaVersion_check" CHECK ("detailsSchemaVersion" > 0),
  CONSTRAINT "MedicalHistoryRevision_details_object_check" CHECK (jsonb_typeof("details") = 'object'),
  CONSTRAINT "MedicalHistoryRevision_resolved_date_check" CHECK (
    "resolvedDate" IS NULL
    OR (
      ("onsetDate" IS NULL OR "resolvedDate" >= "onsetDate")
      AND ("occurrenceDate" IS NULL OR "resolvedDate" >= "occurrenceDate")
    )
  )
);

CREATE UNIQUE INDEX "MedicalHistoryRecord_currentRevisionId_key"
  ON "MedicalHistoryRecord"("currentRevisionId");
CREATE INDEX "MedicalHistoryRecord_clinicId_patientId_category_idx"
  ON "MedicalHistoryRecord"("clinicId", "patientId", "category");
CREATE INDEX "MedicalHistoryRecord_clinicId_updatedAt_id_idx"
  ON "MedicalHistoryRecord"("clinicId", "updatedAt", "id");
CREATE INDEX "MedicalHistoryRecord_patientId_updatedAt_idx"
  ON "MedicalHistoryRecord"("patientId", "updatedAt");

CREATE UNIQUE INDEX "MedicalHistoryRevision_recordId_revisionNumber_key"
  ON "MedicalHistoryRevision"("recordId", "revisionNumber");
CREATE INDEX "MedicalHistoryRevision_recordId_createdAt_idx"
  ON "MedicalHistoryRevision"("recordId", "createdAt");
CREATE INDEX "MedicalHistoryRevision_sourceEncounterId_idx"
  ON "MedicalHistoryRevision"("sourceEncounterId");
CREATE INDEX "MedicalHistoryRevision_authoredByUserId_createdAt_idx"
  ON "MedicalHistoryRevision"("authoredByUserId", "createdAt");
CREATE INDEX "MedicalHistoryRevision_status_createdAt_idx"
  ON "MedicalHistoryRevision"("status", "createdAt");

ALTER TABLE "MedicalHistoryRecord"
  ADD CONSTRAINT "MedicalHistoryRecord_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicalHistoryRecord"
  ADD CONSTRAINT "MedicalHistoryRecord_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicalHistoryRevision"
  ADD CONSTRAINT "MedicalHistoryRevision_recordId_fkey"
  FOREIGN KEY ("recordId") REFERENCES "MedicalHistoryRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicalHistoryRevision"
  ADD CONSTRAINT "MedicalHistoryRevision_sourceEncounterId_fkey"
  FOREIGN KEY ("sourceEncounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MedicalHistoryRevision"
  ADD CONSTRAINT "MedicalHistoryRevision_authoredByUserId_fkey"
  FOREIGN KEY ("authoredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicalHistoryRecord"
  ADD CONSTRAINT "MedicalHistoryRecord_currentRevisionId_fkey"
  FOREIGN KEY ("currentRevisionId") REFERENCES "MedicalHistoryRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MedicalHistoryRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MedicalHistoryRevision" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "MedicalHistoryRecord_clinic_scope_policy" ON "MedicalHistoryRecord"
FOR ALL
USING (
  app.can_access_clinic("clinicId")
  AND EXISTS (
    SELECT 1
    FROM "Patient" p
    WHERE p."id" = "patientId"
      AND p."primaryClinicId" = "clinicId"
  )
)
WITH CHECK (
  app.can_access_clinic("clinicId")
  AND EXISTS (
    SELECT 1
    FROM "Patient" p
    WHERE p."id" = "patientId"
      AND p."primaryClinicId" = "clinicId"
  )
);

CREATE POLICY "MedicalHistoryRevision_clinic_scope_policy" ON "MedicalHistoryRevision"
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM "MedicalHistoryRecord" r
    WHERE r."id" = "recordId"
      AND app.can_access_clinic(r."clinicId")
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "MedicalHistoryRecord" r
    WHERE r."id" = "recordId"
      AND app.can_access_clinic(r."clinicId")
  )
);
