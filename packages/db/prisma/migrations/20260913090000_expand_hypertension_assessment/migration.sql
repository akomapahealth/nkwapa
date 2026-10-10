-- Expand HypertensionAssessment into the guided interview, and add per-visit medication adherence.
--
-- See issue #114. Three things about this migration are deliberate.
--
-- It extends rather than replaces. `classification`, `suspected` and `confirmed` stay exactly
-- where they are, because the dashboard groups by them, the research transform reads them, the
-- patient chart renders them, and two Playwright specs assert on them. Renaming the table or those
-- columns would touch all of that for no clinical gain.
--
-- Every existing row is marked `classificationOverridden = true`. From this release the server
-- derives a classification from the encounter's vitals on every write, and without that flag the
-- first save of an old encounter would silently replace a classification a clinician chose by hand
-- with one a threshold computed. An override is the honest description of what those rows are: a
-- human said so, and there is no vitals-derived value to compare against.
--
-- `collectedAt` and `authoredByUserId` are backfilled rather than defaulted. Defaulting collection
-- time to the migration's own clock would date every historical assessment to today, and the column
-- exists precisely so a longitudinal view can order them. The generated DDL wanted
-- `authoredByUserId UUID NOT NULL` in one statement, which cannot work on a populated table; it is
-- added nullable, filled from the encounter's creator, and only then constrained.

-- CreateEnum
CREATE TYPE "NkwapaAnswer" AS ENUM ('NOT_ASSESSED', 'YES', 'NO', 'UNSURE');

CREATE TYPE "ScreeningCompletionStatus" AS ENUM ('NOT_ASSESSED', 'COMPLETED', 'NOT_COMPLETED', 'PATIENT_UNSURE');

CREATE TYPE "MedicationUseStatus" AS ENUM ('NOT_ASSESSED', 'TAKING', 'NOT_TAKING', 'UNSURE');

CREATE TYPE "MedicationSupplyStatus" AS ENUM ('NOT_ASSESSED', 'NONE', 'LESS_THAN_ONE_WEEK', 'AT_LEAST_ONE_WEEK', 'UNSURE');

CREATE TYPE "MedicationAdherenceLevel" AS ENUM ('NOT_ASSESSED', 'ALWAYS', 'SOMETIMES', 'NOT_TAKING', 'UNSURE');

CREATE TYPE "MedicationDosesMissed" AS ENUM ('NOT_ASSESSED', 'ZERO', 'ONE', 'TWO_TO_THREE', 'FOUR_OR_MORE', 'UNSURE');

CREATE TYPE "MedicationProblem" AS ENUM ('NONE', 'SIDE_EFFECTS', 'COST', 'UNAVAILABLE', 'FORGETTING', 'DOES_NOT_UNDERSTAND', 'OTHER');

CREATE TYPE "MedicationReminderStrategy" AS ENUM ('SAME_TIME_DAILY', 'PILLBOX', 'PHONE_ALARM', 'FAMILY_REMINDER', 'WITH_ROUTINE_OR_MEAL', 'NONE', 'OTHER');

CREATE TYPE "FollowUpWindow" AS ENUM ('NOT_ASSESSED', 'TODAY', 'WITHIN_1_WEEK', 'WITHIN_1_MONTH', 'WITHIN_3_MONTHS', 'OTHER');

CREATE TYPE "FollowUpOwner" AS ENUM ('NOT_ASSESSED', 'AKOMAPA_TEAM', 'COMMUNITY_HEALTH_WORKER', 'PARTNER_FACILITY', 'PATIENT');

CREATE TYPE "MedicationAdherenceContext" AS ENUM ('HYPERTENSION', 'DIABETES');

CREATE TYPE "HypertensionStatus" AS ENUM ('NOT_ASSESSED', 'KNOWN_HYPERTENSION', 'NEWLY_ELEVATED_BP', 'NO_KNOWN_HYPERTENSION', 'UNSURE');

CREATE TYPE "HypertensionConcern" AS ENUM ('NOT_ASSESSED', 'NO_CONCERN', 'HIGH_BP', 'LOW_BP_OR_DIZZINESS', 'MEDICATION_PROBLEM', 'NEW_SYMPTOMS', 'DIET', 'OTHER');

CREATE TYPE "FacilityKnownStatus" AS ENUM ('NOT_ASSESSED', 'SELECTED', 'NONE', 'UNKNOWN');

CREATE TYPE "BpRepeatStatus" AS ENUM ('NOT_ASSESSED', 'YES', 'NO', 'NOT_REQUIRED');

CREATE TYPE "HomeBpMonitorStatus" AS ENUM ('NOT_ASSESSED', 'HAS_ONE', 'DOES_NOT_HAVE_ONE', 'UNABLE_TO_AFFORD', 'DOES_NOT_WISH_TO_MONITOR');

CREATE TYPE "HomeBpCheckFrequency" AS ENUM ('NOT_ASSESSED', 'NEVER', 'OCCASIONALLY', 'SEVERAL_TIMES_WEEKLY', 'DAILY');

CREATE TYPE "HomeBpSource" AS ENUM ('NOT_ASSESSED', 'MONITOR_REVIEWED', 'WRITTEN_READINGS_REVIEWED', 'PATIENT_RECALL');

CREATE TYPE "HypertensionSymptom" AS ENUM ('SEVERE_HEADACHE', 'BLURRED_VISION', 'CHEST_PAIN', 'SHORTNESS_OF_BREATH', 'NEW_WEAKNESS_OR_NUMBNESS', 'DIFFICULTY_SPEAKING', 'CONFUSION', 'FAINTING', 'SEVERE_DIZZINESS', 'NONE');

CREATE TYPE "BpAffectingSubstance" AS ENUM ('NSAID', 'STEROIDS', 'HERBAL_OR_TRADITIONAL', 'DECONGESTANTS', 'STIMULANTS', 'HORMONAL_CONTRACEPTION', 'NONE', 'UNSURE');

CREATE TYPE "CardiometabolicCondition" AS ENUM ('DIABETES', 'KIDNEY_DISEASE', 'HEART_DISEASE_OR_MI', 'STROKE_OR_TIA', 'PERIPHERAL_VASCULAR_DISEASE', 'HEART_FAILURE', 'HIGH_CHOLESTEROL', 'PREGNANCY', 'NONE_KNOWN', 'UNSURE');

CREATE TYPE "PregnancyPlanningAnswer" AS ENUM ('NOT_ASSESSED', 'YES', 'NO', 'UNSURE', 'PREFER_NOT_TO_ANSWER');

CREATE TYPE "HypertensionReviewReason" AS ENUM ('SEVERELY_ELEVATED_BP', 'LOW_BP_OR_DIZZINESS', 'CONCERNING_SYMPTOMS', 'MEDICATION_PROBLEM', 'MISSED_MEDICATIONS', 'POSSIBLE_CONTRIBUTING_SUBSTANCE', 'PREGNANCY_OR_PLANNING', 'OVERDUE_SCREENING', 'OTHER', 'ROUTINE_REVIEW_ONLY');

CREATE TYPE "HypertensionClinicianPlanItem" AS ENUM ('CONTINUE_CURRENT_MANAGEMENT', 'MEDICATION_REFILL', 'RESTART_PREVIOUS_MEDICATION', 'ADJUST_MEDICATION', 'START_MEDICATION', 'STOP_MEDICATION', 'ORDER_LABORATORY_TESTING', 'ARRANGE_HOME_BP_MONITORING', 'NUTRITION_COUNSELING', 'TOBACCO_OR_ALCOHOL_SUPPORT', 'LINK_TO_COMMUNITY_HEALTH_WORKER', 'REFER_TO_PARTNER_FACILITY', 'URGENT_TRANSFER', 'OTHER');

CREATE TYPE "HypertensionEscalationReason" AS ENUM ('URGENT_SYMPTOM_CHEST_PAIN', 'URGENT_SYMPTOM_SHORTNESS_OF_BREATH', 'URGENT_SYMPTOM_CONFUSION', 'URGENT_SYMPTOM_FAINTING', 'URGENT_SYMPTOM_NEUROLOGIC', 'SEVERELY_ELEVATED_BP', 'HYPOTENSION');

-- AlterEnum
--
-- The guided interview asks whether tobacco use is occasional or daily; the existing scale stops
-- at CURRENT. Adding members is safe here because nothing in this migration writes them: PostgreSQL
-- forbids *using* a value added in the same transaction, not adding it. CURRENT is kept so existing
-- rows stay readable and so a client that has not shipped the finer options can still record
-- something true.
ALTER TYPE "TobaccoUseStatus" ADD VALUE 'CURRENT_OCCASIONAL';
ALTER TYPE "TobaccoUseStatus" ADD VALUE 'CURRENT_DAILY';

-- AlterTable
ALTER TABLE "HypertensionAssessment" ADD COLUMN     "authoredByUserId" UUID;

ALTER TABLE "HypertensionAssessment" ADD COLUMN     "aspirinUse" "MedicationUseStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "bpGoalDiastolic" INTEGER,
ADD COLUMN     "bpGoalSystolic" INTEGER,
ADD COLUMN     "cholesterolTesting" "ScreeningCompletionStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "classificationOverridden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "clinicianComments" TEXT,
ADD COLUMN     "clinicianPlanAuthorId" UUID,
ADD COLUMN     "clinicianPlanAuthoredAt" TIMESTAMP(3),
ADD COLUMN     "clinicianPlanItems" "HypertensionClinicianPlanItem"[] DEFAULT ARRAY[]::"HypertensionClinicianPlanItem"[],
ADD COLUMN     "clinicianPlanOther" VARCHAR(200),
ADD COLUMN     "clinicianReviewRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "collectedAt" TIMESTAMP(3),
ADD COLUMN     "contributingSubstances" "BpAffectingSubstance"[] DEFAULT ARRAY[]::"BpAffectingSubstance"[],
ADD COLUMN     "currentSymptoms" "HypertensionSymptom"[] DEFAULT ARRAY[]::"HypertensionSymptom"[],
ADD COLUMN     "derivedClassification" "HypertensionClassification" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "ecgCompleted" "ScreeningCompletionStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "followUpOther" VARCHAR(120),
ADD COLUMN     "followUpOwner" "FollowUpOwner" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "followUpWindow" "FollowUpWindow" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "homeCheckFrequency" "HomeBpCheckFrequency" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "homeDiastolicAvg" INTEGER,
ADD COLUMN     "homeMonitorStatus" "HomeBpMonitorStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "homeReadingSource" "HomeBpSource" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "homeReadingsUnknown" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "homeSystolicAvg" INTEGER,
ADD COLUMN     "hypertensionStatus" "HypertensionStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "kidneyFunctionTesting" "ScreeningCompletionStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "lifestyle" JSONB,
ADD COLUMN     "lifestyleSchemaVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "mainConcern" "HypertensionConcern" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "mainConcernOther" VARCHAR(200),
ADD COLUMN     "medicationReminderStrategies" "MedicationReminderStrategy"[] DEFAULT ARRAY[]::"MedicationReminderStrategy"[],
ADD COLUMN     "planningPregnancy" "PregnancyPlanningAnswer" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "pregnantNow" "NkwapaAnswer" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "relevantConditions" "CardiometabolicCondition"[] DEFAULT ARRAY[]::"CardiometabolicCondition"[],
ADD COLUMN     "reminderStrategyOther" VARCHAR(200),
ADD COLUMN     "repeatCuffSize" "BloodPressureCuffSize",
ADD COLUMN     "repeatDiastolicBp" INTEGER,
ADD COLUMN     "repeatMeasuredAt" TIMESTAMP(3),
ADD COLUMN     "repeatPerformed" "BpRepeatStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "repeatPosition" "PatientPosition",
ADD COLUMN     "repeatPromptShown" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "repeatSystolicBp" INTEGER,
ADD COLUMN     "reviewReasonOther" VARCHAR(200),
ADD COLUMN     "reviewReasons" "HypertensionReviewReason"[] DEFAULT ARRAY[]::"HypertensionReviewReason"[],
ADD COLUMN     "statinUse" "MedicationUseStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "substanceDetails" JSONB,
ADD COLUMN     "substanceSchemaVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "urgentReviewReasons" "HypertensionEscalationReason"[] DEFAULT ARRAY[]::"HypertensionEscalationReason"[],
ADD COLUMN     "urgentReviewRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "urineProteinTesting" "ScreeningCompletionStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "usualCareFacility" VARCHAR(200),
ADD COLUMN     "usualCareFacilityStatus" "FacilityKnownStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "volunteerActions" JSONB,
ADD COLUMN     "volunteerActionsSchemaVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "yearDiagnosed" INTEGER,
ADD COLUMN     "yearDiagnosedUnknown" BOOLEAN NOT NULL DEFAULT false;

-- Backfill.
--
-- Collection time comes from the row's own creation, and authorship from whoever opened the
-- encounter -- the same provenance rule `20260812000000_promote_diabetes_screening` used for
-- DiabetesScreening, so the two conditions answer "who recorded this, and when" the same way.
--
-- `classificationOverridden` is set for every surviving row: see the header.
UPDATE "HypertensionAssessment" a
SET "collectedAt" = a."createdAt",
    "authoredByUserId" = e."createdByUserId",
    "derivedClassification" = a."classification",
    "classificationOverridden" = true
FROM "Encounter" e
WHERE e."id" = a."encounterId";

-- An assessment whose encounter vanished has no author to inherit, and the foreign key below would
-- reject it. There should be none, because the encounter relation cascades, so failing loudly beats
-- inventing an author for a clinical record.
DO $$
DECLARE orphaned INTEGER;
BEGIN
  SELECT count(*) INTO orphaned
  FROM "HypertensionAssessment"
  WHERE "authoredByUserId" IS NULL;

  IF orphaned > 0 THEN
    RAISE EXCEPTION
      'Cannot backfill HypertensionAssessment.authoredByUserId: % row(s) have no source encounter.',
      orphaned;
  END IF;
END $$;

ALTER TABLE "HypertensionAssessment" ALTER COLUMN "authoredByUserId" SET NOT NULL;
ALTER TABLE "HypertensionAssessment" ALTER COLUMN "collectedAt" SET NOT NULL;
ALTER TABLE "HypertensionAssessment" ALTER COLUMN "collectedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- Invariants the application also enforces, repeated here because a boundary that depends on one
-- layer is one refactor from not being a boundary.
ALTER TABLE "HypertensionAssessment"
  ADD CONSTRAINT "HypertensionAssessment_repeat_bp_range_check" CHECK (
    ("repeatSystolicBp" IS NULL OR "repeatSystolicBp" BETWEEN 40 AND 300)
    AND ("repeatDiastolicBp" IS NULL OR "repeatDiastolicBp" BETWEEN 20 AND 200)
  );

-- A systolic at or below its diastolic is a transposed or mistyped reading, not a rare patient.
ALTER TABLE "HypertensionAssessment"
  ADD CONSTRAINT "HypertensionAssessment_repeat_bp_order_check" CHECK (
    "repeatSystolicBp" IS NULL
    OR "repeatDiastolicBp" IS NULL
    OR "repeatSystolicBp" > "repeatDiastolicBp"
  );

ALTER TABLE "HypertensionAssessment"
  ADD CONSTRAINT "HypertensionAssessment_home_bp_check" CHECK (
    ("homeSystolicAvg" IS NULL OR "homeSystolicAvg" BETWEEN 40 AND 300)
    AND ("homeDiastolicAvg" IS NULL OR "homeDiastolicAvg" BETWEEN 20 AND 200)
    AND (
      "homeSystolicAvg" IS NULL
      OR "homeDiastolicAvg" IS NULL
      OR "homeSystolicAvg" > "homeDiastolicAvg"
    )
  );

ALTER TABLE "HypertensionAssessment"
  ADD CONSTRAINT "HypertensionAssessment_bp_goal_check" CHECK (
    ("bpGoalSystolic" IS NULL OR "bpGoalSystolic" BETWEEN 40 AND 300)
    AND ("bpGoalDiastolic" IS NULL OR "bpGoalDiastolic" BETWEEN 20 AND 200)
    AND (
      "bpGoalSystolic" IS NULL
      OR "bpGoalDiastolic" IS NULL
      OR "bpGoalSystolic" > "bpGoalDiastolic"
    )
  );

-- A diagnosis year in the future, or before blood pressure was routinely measured, is a typo.
ALTER TABLE "HypertensionAssessment"
  ADD CONSTRAINT "HypertensionAssessment_year_diagnosed_check" CHECK (
    "yearDiagnosed" IS NULL
    OR "yearDiagnosed" BETWEEN 1900 AND EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
  );

-- The JSONB sections are objects, matching MedicalHistoryRevision_details_object_check. An array or
-- a bare scalar would parse into an empty section and lose the answers without an error.
ALTER TABLE "HypertensionAssessment"
  ADD CONSTRAINT "HypertensionAssessment_jsonb_object_check" CHECK (
    ("lifestyle" IS NULL OR jsonb_typeof("lifestyle") = 'object')
    AND ("substanceDetails" IS NULL OR jsonb_typeof("substanceDetails") = 'object')
    AND ("volunteerActions" IS NULL OR jsonb_typeof("volunteerActions") = 'object')
  );

ALTER TABLE "HypertensionAssessment"
  ADD CONSTRAINT "HypertensionAssessment_schema_version_check" CHECK (
    "lifestyleSchemaVersion" > 0
    AND "substanceSchemaVersion" > 0
    AND "volunteerActionsSchemaVersion" > 0
  );

-- An escalation with no reason, or reasons without the flag, means the derivation half-ran.
ALTER TABLE "HypertensionAssessment"
  ADD CONSTRAINT "HypertensionAssessment_escalation_consistency_check" CHECK (
    "urgentReviewRequired" = (array_length("urgentReviewReasons", 1) IS NOT NULL)
  );

-- CreateTable
CREATE TABLE "EncounterMedicationAdherence" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "encounterId" UUID NOT NULL,
    "context" "MedicationAdherenceContext" NOT NULL,
    "medicationRecordId" UUID NOT NULL,
    "observedRevisionId" UUID NOT NULL,
    "tookToday" "NkwapaAnswer" NOT NULL DEFAULT 'NOT_ASSESSED',
    "dosesMissed7d" "MedicationDosesMissed" NOT NULL DEFAULT 'NOT_ASSESSED',
    "takingAsPrescribed" "MedicationAdherenceLevel" NOT NULL DEFAULT 'NOT_ASSESSED',
    "supplyRemaining" "MedicationSupplyStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
    "problems" "MedicationProblem"[] DEFAULT ARRAY[]::"MedicationProblem"[],
    "problemsOther" VARCHAR(200),
    "authoredByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EncounterMedicationAdherence_pkey" PRIMARY KEY ("id")
);

-- One condition's columns stay at NOT_ASSESSED in the other condition's row.
--
-- The alternative was two tables whose columns were a near-superset of each other. One table keeps
-- "this question does not apply here" a represented fact rather than a null that could equally mean
-- "not yet asked".
ALTER TABLE "EncounterMedicationAdherence"
  ADD CONSTRAINT "EncounterMedicationAdherence_context_fields_check" CHECK (
    ("context" = 'HYPERTENSION' AND "takingAsPrescribed" = 'NOT_ASSESSED')
    OR (
      "context" = 'DIABETES'
      AND "tookToday" = 'NOT_ASSESSED'
      AND "dosesMissed7d" = 'NOT_ASSESSED'
    )
  );

-- CreateIndex
CREATE INDEX "EncounterMedicationAdherence_clinicId_updatedAt_idx" ON "EncounterMedicationAdherence"("clinicId", "updatedAt");

-- CreateIndex
CREATE INDEX "EncounterMedicationAdherence_medicationRecordId_createdAt_idx" ON "EncounterMedicationAdherence"("medicationRecordId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EncounterMedicationAdherence_encounterId_context_medication_key" ON "EncounterMedicationAdherence"("encounterId", "context", "medicationRecordId");

-- CreateIndex
CREATE INDEX "HypertensionAssessment_clinicId_collectedAt_idx" ON "HypertensionAssessment"("clinicId", "collectedAt");

-- CreateIndex
CREATE INDEX "HypertensionAssessment_authoredByUserId_collectedAt_idx" ON "HypertensionAssessment"("authoredByUserId", "collectedAt");

-- AddForeignKey
ALTER TABLE "HypertensionAssessment" ADD CONSTRAINT "HypertensionAssessment_authoredByUserId_fkey" FOREIGN KEY ("authoredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HypertensionAssessment" ADD CONSTRAINT "HypertensionAssessment_clinicianPlanAuthorId_fkey" FOREIGN KEY ("clinicianPlanAuthorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterMedicationAdherence" ADD CONSTRAINT "EncounterMedicationAdherence_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterMedicationAdherence" ADD CONSTRAINT "EncounterMedicationAdherence_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterMedicationAdherence" ADD CONSTRAINT "EncounterMedicationAdherence_medicationRecordId_fkey" FOREIGN KEY ("medicationRecordId") REFERENCES "PatientMedicationRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterMedicationAdherence" ADD CONSTRAINT "EncounterMedicationAdherence_observedRevisionId_fkey" FOREIGN KEY ("observedRevisionId") REFERENCES "PatientMedicationRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterMedicationAdherence" ADD CONSTRAINT "EncounterMedicationAdherence_authoredByUserId_fkey" FOREIGN KEY ("authoredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row level security.
--
-- Declared here rather than appended to 20260821120000_force_row_level_security, which was a
-- one-time backfill and not a registry. `packages/db/src/rls-coverage.spec.ts` discovers any model
-- carrying a clinicId and asserts ENABLE, FORCE and at least one policy exist somewhere in the
-- migration history, so omitting any of the three fails the unit suite rather than shipping an
-- unprotected clinical table.
--
-- FORCE matters independently of ENABLE: PostgreSQL exempts a table's owner from its own policies
-- unless the table is forced, and the application connects as the owner.
ALTER TABLE "EncounterMedicationAdherence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EncounterMedicationAdherence" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "EncounterMedicationAdherence_clinic_scope_policy" ON "EncounterMedicationAdherence";
CREATE POLICY "EncounterMedicationAdherence_clinic_scope_policy" ON "EncounterMedicationAdherence"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));
