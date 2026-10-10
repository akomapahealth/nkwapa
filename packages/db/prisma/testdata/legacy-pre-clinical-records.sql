-- SYNTHETIC DATA. Every value here is fabricated for migration rehearsal.
-- It contains no real patient information and must never be replaced with any.
--
-- Targets the schema as of migration 20260615110000_appointment_reminder_lifecycle, the last one
-- before the clinical-records initiative begins at 20260731000000_add_medical_history.
--
-- Rows are chosen to exercise each column the clinical-records migrations add, rename, or backfill:
-- a legacy heart rate that becomes pulseBpm, diabetes symptom text in three shapes (mappable,
-- partly mappable, and unparseable), patients with and without optional identifiers, and encounters
-- in every lifecycle state including FINALIZED.

INSERT INTO "Organization" ("id", "name", "slug", "timezone", "updatedAt")
VALUES ('10000000-0000-4000-8000-000000000001', 'Legacy Org', 'legacy-org', 'Africa/Accra', CURRENT_TIMESTAMP);

INSERT INTO "Clinic" ("id", "organizationId", "name", "timezone", "locationCode", "updatedAt")
VALUES
  ('10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000001', 'Legacy Clinic One', 'Africa/Accra', 'legacy-one', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000001', 'Legacy Clinic Two', 'Africa/Accra', 'legacy-two', CURRENT_TIMESTAMP);

INSERT INTO "User" ("id", "keycloakSub", "displayName", "updatedAt")
VALUES
  ('10000000-0000-4000-8000-000000000021', 'legacy-director', 'Legacy Director', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000022', 'legacy-doctor', 'Legacy Doctor', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000023', 'legacy-volunteer', 'Legacy Volunteer', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000024', 'legacy-manager', 'Legacy Manager', CURRENT_TIMESTAMP);

INSERT INTO "UserClinicRole" ("id", "userId", "clinicId", "role")
VALUES
  ('10000000-0000-4000-8000-000000000031', '10000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000011', 'DIRECTOR'),
  ('10000000-0000-4000-8000-000000000032', '10000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000011', 'DOCTOR'),
  ('10000000-0000-4000-8000-000000000033', '10000000-0000-4000-8000-000000000023', '10000000-0000-4000-8000-000000000011', 'VOLUNTEER'),
  ('10000000-0000-4000-8000-000000000034', '10000000-0000-4000-8000-000000000024', '10000000-0000-4000-8000-000000000012', 'MANAGER');

-- One patient per interesting shape: full identifiers, no last-4, no phone, and a merged record.
INSERT INTO "Patient" (
  "id", "patientCode", "primaryClinicId", "firstName", "lastName", "dob", "sex",
  "phoneE164", "email", "nationalIdType", "nationalIdCiphertext", "nationalIdHash",
  "nationalIdLast4", "mergedIntoPatientId", "updatedAt"
) VALUES
  ('10000000-0000-4000-8000-000000000041', 'NKP-LEGACY-0001', '10000000-0000-4000-8000-000000000011', 'Legacy', 'Alpha', '1970-04-02', 'FEMALE', '+233200000001', 'legacy.alpha@example.invalid', 'NATIONAL_ID', 'legacy-cipher-1', 'legacy-hash-1', '0001', NULL, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000042', 'NKP-LEGACY-0002', '10000000-0000-4000-8000-000000000011', 'Legacy', 'Beta', '1985-11-30', 'MALE', NULL, NULL, 'OTHER', 'legacy-cipher-2', 'legacy-hash-2', NULL, NULL, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000043', 'NKP-LEGACY-0003', '10000000-0000-4000-8000-000000000012', 'Legacy', 'Gamma', NULL, 'UNKNOWN', '+233200000003', NULL, 'OTHER', 'legacy-cipher-3', 'legacy-hash-3', '0003', NULL, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000044', 'NKP-LEGACY-0004', '10000000-0000-4000-8000-000000000011', 'Legacy', 'Delta', '1992-01-15', 'FEMALE', NULL, NULL, 'OTHER', 'legacy-cipher-4', 'legacy-hash-4', '0004', '10000000-0000-4000-8000-000000000041', CURRENT_TIMESTAMP);

INSERT INTO "Encounter" ("id", "clinicId", "patientId", "createdByUserId", "status", "updatedAt")
VALUES
  ('10000000-0000-4000-8000-000000000051', '10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000041', '10000000-0000-4000-8000-000000000023', 'DRAFT', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000052', '10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000041', '10000000-0000-4000-8000-000000000023', 'IN_REVIEW', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000053', '10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000042', '10000000-0000-4000-8000-000000000022', 'FINALIZED', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000054', '10000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000043', '10000000-0000-4000-8000-000000000024', 'FINALIZED', CURRENT_TIMESTAMP);

-- Legacy vitals: heartRate is renamed to pulseBpm, and the expanded columns do not exist yet.
INSERT INTO "Vitals" (
  "id", "clinicId", "encounterId", "systolicBp", "diastolicBp", "heartRate",
  "weightKg", "heightCm", "bmi", "notes", "updatedAt"
) VALUES
  ('10000000-0000-4000-8000-000000000061', '10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000051', 128, 82, 74, 68.5, 165.0, 25.2, 'Legacy note alpha', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000062', '10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000053', 145, 95, NULL, NULL, NULL, NULL, NULL, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000063', '10000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000054', 118, 76, 61, 72.0, 178.0, 22.7, NULL, CURRENT_TIMESTAMP);

-- Diabetes screenings: fully mappable symptoms, partly mappable, unparseable, and none.
INSERT INTO "DiabetesScreening" (
  "id", "clinicId", "encounterId", "glucoseMgDl", "glucoseType", "hba1cPercent",
  "symptomsJson", "notes", "updatedAt"
) VALUES
  ('10000000-0000-4000-8000-000000000071', '10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000051', 132, 'FASTING', 6.8, '["POLYURIA","POLYDIPSIA"]', 'Legacy screening alpha', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000072', '10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000053', 210, 'RANDOM', NULL, '["POLYURIA","tingling feet"]', NULL, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000073', '10000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000054', 98, 'FASTING', 5.2, 'patient reports feeling tired', NULL, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000074', '10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000052', 105, 'FASTING', NULL, NULL, NULL, CURRENT_TIMESTAMP);

INSERT INTO "HypertensionAssessment" ("id", "clinicId", "encounterId", "classification", "updatedAt")
VALUES ('10000000-0000-4000-8000-000000000081', '10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000051', 'STAGE1', CURRENT_TIMESTAMP);

INSERT INTO "CarePlan" ("id", "clinicId", "encounterId", "counselingGiven", "medicationPrescribed", "followUpDate", "notes", "updatedAt")
VALUES ('10000000-0000-4000-8000-000000000091', '10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000051', true, false, '2026-09-01', 'Legacy care plan note', CURRENT_TIMESTAMP);

INSERT INTO "PatientConsent" (
  "id", "clinicId", "patientId", "consentType", "status", "consentVersion",
  "consentTextSnapshot", "grantedAt", "revokedAt", "recordedByUserId", "updatedAt"
) VALUES
  ('10000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000041', 'RESEARCH_DEIDENTIFIED', 'GRANTED', 'v1', 'Legacy consent text', '2026-05-01', NULL, '10000000-0000-4000-8000-000000000023', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000042', 'RESEARCH_DEIDENTIFIED', 'REVOKED', 'v1', 'Legacy consent text', '2026-05-01', '2026-06-01', '10000000-0000-4000-8000-000000000023', CURRENT_TIMESTAMP);

INSERT INTO "AuditEvent" ("id", "clinicId", "actorUserId", "action", "entityType", "entityId", "requestId")
VALUES ('10000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000023', 'ENCOUNTER.CREATE', 'Encounter', '10000000-0000-4000-8000-000000000051', 'legacy-request-1');

INSERT INTO "SyncMutation" ("id", "clinicId", "entityType", "entityId", "operation", "idempotencyKey", "status", "updatedAt")
VALUES ('10000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-000000000011', 'vitals', '10000000-0000-4000-8000-000000000061', 'UPSERT', 'legacy-idem-1', 'APPLIED', CURRENT_TIMESTAMP);
