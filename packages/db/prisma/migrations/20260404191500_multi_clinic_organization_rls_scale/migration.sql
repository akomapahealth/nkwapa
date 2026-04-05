CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Africa/Accra',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

INSERT INTO "Organization" (
    "id",
    "name",
    "slug",
    "timezone",
    "createdAt",
    "updatedAt"
)
VALUES (
    gen_random_uuid(),
    'Nkwapa Health',
    'default',
    'Africa/Accra',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;

ALTER TABLE "Clinic"
    ADD COLUMN "organizationId" UUID,
    ADD COLUMN "timezone" VARCHAR(64),
    ADD COLUMN "locationCode" VARCHAR(64),
    ADD COLUMN "zoneCode" VARCHAR(64);

WITH default_org AS (
    SELECT "id"
    FROM "Organization"
    WHERE "slug" = 'default'
    LIMIT 1
)
UPDATE "Clinic"
SET
    "organizationId" = COALESCE("organizationId", (SELECT "id" FROM default_org)),
    "timezone" = COALESCE("timezone", 'Africa/Accra');

WITH ranked_clinics AS (
    SELECT
        c."id",
        c."organizationId",
        COALESCE(
            NULLIF(
                regexp_replace(
                    regexp_replace(lower(c."name"), '[^a-z0-9]+', '-', 'g'),
                    '(^-+|-+$)',
                    '',
                    'g'
                ),
                ''
            ),
            'clinic'
        ) AS "baseCode",
        row_number() OVER (
            PARTITION BY c."organizationId",
            COALESCE(
                NULLIF(
                    regexp_replace(
                        regexp_replace(lower(c."name"), '[^a-z0-9]+', '-', 'g'),
                        '(^-+|-+$)',
                        '',
                        'g'
                    ),
                    ''
                ),
                'clinic'
            )
            ORDER BY c."createdAt", c."id"
        ) AS "rowNumber"
    FROM "Clinic" c
)
UPDATE "Clinic" c
SET "locationCode" = CASE
    WHEN r."rowNumber" = 1 THEN left(r."baseCode", 64)
    ELSE left(r."baseCode", 56) || '-' || r."rowNumber"::text
END
FROM ranked_clinics r
WHERE c."id" = r."id";

ALTER TABLE "Clinic"
    ALTER COLUMN "organizationId" SET NOT NULL,
    ALTER COLUMN "timezone" SET NOT NULL,
    ALTER COLUMN "timezone" SET DEFAULT 'Africa/Accra',
    ALTER COLUMN "locationCode" SET NOT NULL;

ALTER TABLE "Clinic"
    ADD CONSTRAINT "Clinic_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Clinic_organizationId_locationCode_key"
ON "Clinic"("organizationId", "locationCode");

CREATE INDEX "Clinic_organizationId_idx"
ON "Clinic"("organizationId");

CREATE INDEX "Clinic_organizationId_zoneCode_idx"
ON "Clinic"("organizationId", "zoneCode");

CREATE INDEX "Clinic_organizationId_name_idx"
ON "Clinic"("organizationId", "name");

CREATE INDEX "Patient_primaryClinicId_updatedAt_id_idx"
ON "Patient"("primaryClinicId", "updatedAt" DESC, "id" DESC);

CREATE INDEX "ResearchExport_clinicId_requestedAt_id_idx"
ON "ResearchExport"("clinicId", "requestedAt" DESC, "id" DESC);

CREATE INDEX "AuditEvent_clinicId_createdAt_id_idx"
ON "AuditEvent"("clinicId", "createdAt" DESC, "id" DESC);

CREATE INDEX "SyncMutation_clinicId_createdAt_id_idx"
ON "SyncMutation"("clinicId", "createdAt" DESC, "id" DESC);

CREATE INDEX "Patient_fullName_trgm_idx"
ON "Patient"
USING GIN ((coalesce("firstName", '') || ' ' || coalesce("lastName", '')) gin_trgm_ops);

CREATE INDEX "Patient_patientCode_trgm_idx"
ON "Patient"
USING GIN ("patientCode" gin_trgm_ops);

CREATE INDEX "User_displayName_trgm_idx"
ON "User"
USING GIN ("displayName" gin_trgm_ops);

CREATE INDEX "User_email_trgm_idx"
ON "User"
USING GIN (coalesce("email", '') gin_trgm_ops);

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS UUID
LANGUAGE SQL
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.current_organization_id()
RETURNS UUID
LANGUAGE SQL
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_organization_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.current_active_clinic_id()
RETURNS UUID
LANGUAGE SQL
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_active_clinic_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.current_zone_code()
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_zone_code', true), '')
$$;

CREATE OR REPLACE FUNCTION app.current_clinic_ids()
RETURNS UUID[]
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(
    string_to_array(NULLIF(current_setting('app.current_clinic_ids', true), ''), ',')::uuid[],
    ARRAY[]::uuid[]
  )
$$;

CREATE OR REPLACE FUNCTION app.is_system_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.is_system_admin', true), '')::boolean, false)
$$;

CREATE OR REPLACE FUNCTION app.can_access_clinic(clinic_uuid UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT app.is_system_admin() OR clinic_uuid = ANY(app.current_clinic_ids())
$$;

CREATE OR REPLACE FUNCTION app.can_access_patient(patient_uuid UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "Patient" p
    WHERE p."id" = patient_uuid
      AND app.can_access_clinic(p."primaryClinicId")
  )
$$;

ALTER TABLE "Clinic" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Patient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PatientConsent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Encounter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffShift" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PatientCheckIn" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PatientAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vitals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DiabetesScreening" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HypertensionAssessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CarePlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Drug" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Prescription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Reminder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PatientAccountLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PatientPortalInvite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PatientCodeAlias" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PatientMeasurement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppointmentRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Appointment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PatientSelfReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClinicResearchSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResearchExport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncMutation" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinic_select_policy" ON "Clinic";
CREATE POLICY "Clinic_select_policy" ON "Clinic"
FOR SELECT
USING (app.is_system_admin() OR app.can_access_clinic("id"));

DROP POLICY IF EXISTS "Clinic_insert_policy" ON "Clinic";
CREATE POLICY "Clinic_insert_policy" ON "Clinic"
FOR INSERT
WITH CHECK (app.is_system_admin());

DROP POLICY IF EXISTS "Clinic_update_policy" ON "Clinic";
CREATE POLICY "Clinic_update_policy" ON "Clinic"
FOR UPDATE
USING (app.is_system_admin() OR app.can_access_clinic("id"))
WITH CHECK (app.is_system_admin() OR app.can_access_clinic("id"));

DROP POLICY IF EXISTS "Clinic_delete_policy" ON "Clinic";
CREATE POLICY "Clinic_delete_policy" ON "Clinic"
FOR DELETE
USING (app.is_system_admin() OR app.can_access_clinic("id"));

DROP POLICY IF EXISTS "Patient_clinic_scope_policy" ON "Patient";
CREATE POLICY "Patient_clinic_scope_policy" ON "Patient"
FOR ALL
USING (app.can_access_clinic("primaryClinicId"))
WITH CHECK (app.can_access_clinic("primaryClinicId"));

DROP POLICY IF EXISTS "PatientConsent_clinic_scope_policy" ON "PatientConsent";
CREATE POLICY "PatientConsent_clinic_scope_policy" ON "PatientConsent"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

DROP POLICY IF EXISTS "Encounter_clinic_scope_policy" ON "Encounter";
CREATE POLICY "Encounter_clinic_scope_policy" ON "Encounter"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

DROP POLICY IF EXISTS "StaffShift_clinic_scope_policy" ON "StaffShift";
CREATE POLICY "StaffShift_clinic_scope_policy" ON "StaffShift"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

DROP POLICY IF EXISTS "PatientCheckIn_clinic_scope_policy" ON "PatientCheckIn";
CREATE POLICY "PatientCheckIn_clinic_scope_policy" ON "PatientCheckIn"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

DROP POLICY IF EXISTS "PatientAssignment_clinic_scope_policy" ON "PatientAssignment";
CREATE POLICY "PatientAssignment_clinic_scope_policy" ON "PatientAssignment"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

DROP POLICY IF EXISTS "Vitals_clinic_scope_policy" ON "Vitals";
CREATE POLICY "Vitals_clinic_scope_policy" ON "Vitals"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

DROP POLICY IF EXISTS "DiabetesScreening_clinic_scope_policy" ON "DiabetesScreening";
CREATE POLICY "DiabetesScreening_clinic_scope_policy" ON "DiabetesScreening"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

DROP POLICY IF EXISTS "HypertensionAssessment_clinic_scope_policy" ON "HypertensionAssessment";
CREATE POLICY "HypertensionAssessment_clinic_scope_policy" ON "HypertensionAssessment"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

DROP POLICY IF EXISTS "CarePlan_clinic_scope_policy" ON "CarePlan";
CREATE POLICY "CarePlan_clinic_scope_policy" ON "CarePlan"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

DROP POLICY IF EXISTS "Drug_clinic_scope_policy" ON "Drug";
CREATE POLICY "Drug_clinic_scope_policy" ON "Drug"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

DROP POLICY IF EXISTS "Prescription_clinic_scope_policy" ON "Prescription";
CREATE POLICY "Prescription_clinic_scope_policy" ON "Prescription"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

DROP POLICY IF EXISTS "Reminder_clinic_scope_policy" ON "Reminder";
CREATE POLICY "Reminder_clinic_scope_policy" ON "Reminder"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

DROP POLICY IF EXISTS "PatientAccountLink_patient_scope_policy" ON "PatientAccountLink";
CREATE POLICY "PatientAccountLink_patient_scope_policy" ON "PatientAccountLink"
FOR ALL
USING (app.can_access_patient("patientId"))
WITH CHECK (app.can_access_patient("patientId"));

DROP POLICY IF EXISTS "PatientPortalInvite_clinic_scope_policy" ON "PatientPortalInvite";
CREATE POLICY "PatientPortalInvite_clinic_scope_policy" ON "PatientPortalInvite"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

DROP POLICY IF EXISTS "PatientCodeAlias_patient_scope_policy" ON "PatientCodeAlias";
CREATE POLICY "PatientCodeAlias_patient_scope_policy" ON "PatientCodeAlias"
FOR ALL
USING (app.can_access_patient("patientId"))
WITH CHECK (app.can_access_patient("patientId"));

DROP POLICY IF EXISTS "PatientMeasurement_clinic_scope_policy" ON "PatientMeasurement";
CREATE POLICY "PatientMeasurement_clinic_scope_policy" ON "PatientMeasurement"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

DROP POLICY IF EXISTS "AppointmentRequest_clinic_scope_policy" ON "AppointmentRequest";
CREATE POLICY "AppointmentRequest_clinic_scope_policy" ON "AppointmentRequest"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

DROP POLICY IF EXISTS "Appointment_clinic_scope_policy" ON "Appointment";
CREATE POLICY "Appointment_clinic_scope_policy" ON "Appointment"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

DROP POLICY IF EXISTS "PatientSelfReport_clinic_scope_policy" ON "PatientSelfReport";
CREATE POLICY "PatientSelfReport_clinic_scope_policy" ON "PatientSelfReport"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

DROP POLICY IF EXISTS "ClinicResearchSettings_clinic_scope_policy" ON "ClinicResearchSettings";
CREATE POLICY "ClinicResearchSettings_clinic_scope_policy" ON "ClinicResearchSettings"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

DROP POLICY IF EXISTS "ResearchExport_clinic_scope_policy" ON "ResearchExport";
CREATE POLICY "ResearchExport_clinic_scope_policy" ON "ResearchExport"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

DROP POLICY IF EXISTS "AuditEvent_scope_policy" ON "AuditEvent";
CREATE POLICY "AuditEvent_scope_policy" ON "AuditEvent"
FOR ALL
USING (
    ("clinicId" IS NULL AND app.is_system_admin())
    OR ("clinicId" IS NOT NULL AND app.can_access_clinic("clinicId"))
)
WITH CHECK (
    ("clinicId" IS NULL AND app.is_system_admin())
    OR ("clinicId" IS NOT NULL AND app.can_access_clinic("clinicId"))
);

DROP POLICY IF EXISTS "SyncMutation_clinic_scope_policy" ON "SyncMutation";
CREATE POLICY "SyncMutation_clinic_scope_policy" ON "SyncMutation"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));
