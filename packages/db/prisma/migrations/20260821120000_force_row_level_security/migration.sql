-- Force row level security on every tenant-scoped table.
--
-- The application connects as the role that owns these tables, and PostgreSQL exempts a table's
-- owner from its own policies unless FORCE is set. Row level security was enabled everywhere but
-- forced only on the two chat tables, so for every other table the policies were parsed and never
-- applied: a query with an empty clinic context returned every row in the database.
--
-- After this migration the policies are the backstop the architecture documents claim they are.
-- Any code path that queries a scoped table outside a request context must establish one
-- explicitly through PrismaService.withClinicContext or withSystemContext.
--
-- FORCE is idempotent, so the two tables that already had it are unaffected.

ALTER TABLE "Appointment" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AppointmentRequest" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" FORCE ROW LEVEL SECURITY;
ALTER TABLE "CarePlan" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Clinic" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ClinicResearchSettings" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ClinicalNote" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ClinicalNoteAddendum" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Conversation" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ConversationParticipant" FORCE ROW LEVEL SECURITY;
ALTER TABLE "DiabetesScreening" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Drug" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Encounter" FORCE ROW LEVEL SECURITY;
ALTER TABLE "HypertensionAssessment" FORCE ROW LEVEL SECURITY;
ALTER TABLE "MedicalHistoryRecord" FORCE ROW LEVEL SECURITY;
ALTER TABLE "MedicalHistoryRevision" FORCE ROW LEVEL SECURITY;
ALTER TABLE "MedicationReconciliationEvent" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Message" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Patient" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PatientAccountLink" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PatientAssignment" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PatientCheckIn" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PatientCodeAlias" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PatientConsent" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PatientMeasurement" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PatientMedicationRecord" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PatientMedicationRevision" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PatientPharmacyPreference" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PatientPharmacyRecord" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PatientPharmacyRevision" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PatientPortalInvite" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PatientSelfReport" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Prescription" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Reminder" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ResearchExport" FORCE ROW LEVEL SECURITY;
ALTER TABLE "StaffShift" FORCE ROW LEVEL SECURITY;
ALTER TABLE "SyncMutation" FORCE ROW LEVEL SECURITY;
ALTER TABLE "TobaccoScreening" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Vitals" FORCE ROW LEVEL SECURITY;
