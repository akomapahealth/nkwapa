-- Expand DiabetesScreening into the guided interview.
--
-- See issue #114, and 20260913090000_expand_hypertension_assessment for the hypertension half.
-- Three notes.
--
-- Unlike hypertension, nothing is read across from another record: `glucoseMgDl` and `glucoseType`
-- already live on this row, so today's reading and its timing are where they always were. What is
-- new is a second symptom list. `symptoms` asks about the past month; `urgentSymptoms` asks about
-- this minute. The clinical specification names vomiting, confusion, difficulty breathing, loss of
-- consciousness and an active foot wound as requiring immediate review while listing none of them
-- except the wound in its own checklist, and that checklist is a recall question. Asking them
-- separately is what makes its escalation rule implementable.
--
-- The enum values are added with plain ADD VALUE. PostgreSQL forbids *using* a value added in the
-- same transaction, not adding it, and the backfill below touches only members that already
-- existed. The rename-create-cast-drop dance is therefore unnecessary here.
--
-- `derivedSuspicion` is backfilled for existing rows rather than left NOT_ASSESSED, so a
-- longitudinal view is honest about history from the first deploy. It applies only the two
-- approved thresholds, and leaves an unknown-context measurement unclassified -- the rule
-- 09_DIABETES_SCREENING.md already states.

-- CreateEnum
CREATE TYPE "DiabetesStatus" AS ENUM ('NOT_ASSESSED', 'KNOWN_DIABETES', 'NEWLY_ELEVATED_GLUCOSE', 'NO_KNOWN_DIABETES', 'UNSURE');

CREATE TYPE "DiabetesType" AS ENUM ('NOT_ASSESSED', 'TYPE_1', 'TYPE_2', 'GESTATIONAL', 'UNKNOWN');

CREATE TYPE "DiabetesConcern" AS ENUM ('NOT_ASSESSED', 'NO_CONCERN', 'HIGH_GLUCOSE', 'LOW_GLUCOSE', 'MEDICATION_PROBLEM', 'DIET', 'NEW_SYMPTOMS', 'OTHER');

CREATE TYPE "Hba1cStatus" AS ENUM ('NOT_ASSESSED', 'VALUE_KNOWN', 'UNKNOWN', 'NEVER_CHECKED');

CREATE TYPE "DiabetesUrgentSymptom" AS ENUM ('VOMITING', 'CONFUSION', 'DIFFICULTY_BREATHING', 'LOSS_OF_CONSCIOUSNESS', 'ACTIVE_FOOT_WOUND', 'NONE');

CREATE TYPE "PhqResponse" AS ENUM ('NOT_ASSESSED', 'NOT_AT_ALL', 'SEVERAL_DAYS', 'MORE_THAN_HALF_THE_DAYS', 'NEARLY_EVERY_DAY');

CREATE TYPE "DiabetesDistressResponse" AS ENUM ('NOT_ASSESSED', 'NOT_A_PROBLEM', 'SLIGHT_PROBLEM', 'MODERATE_PROBLEM', 'SERIOUS_PROBLEM', 'VERY_SERIOUS_PROBLEM');

CREATE TYPE "DiabetesSuspicion" AS ENUM ('NOT_ASSESSED', 'SUSPECTED', 'NOT_SUSPECTED');

CREATE TYPE "DiabetesReviewReason" AS ENUM ('ABNORMAL_GLUCOSE', 'HYPOGLYCEMIA_SYMPTOMS', 'HYPERGLYCEMIA_SYMPTOMS', 'MEDICATION_PROBLEM', 'POSITIVE_MENTAL_HEALTH_SCREEN', 'DIABETES_DISTRESS', 'FOOT_WOUND', 'OVERDUE_DIABETES_SCREENING', 'OTHER', 'ROUTINE_REVIEW_ONLY');

CREATE TYPE "DiabetesClinicianPlanItem" AS ENUM ('CONTINUE_CURRENT_MANAGEMENT', 'MEDICATION_REFILL', 'MEDICATION_CHANGE', 'ORDER_LABORATORY_TESTING', 'NUTRITION_REFERRAL', 'EYE_EXAMINATION_REFERRAL', 'FOOT_OR_WOUND_CARE_REFERRAL', 'MENTAL_HEALTH_SUPPORT', 'LINK_TO_COMMUNITY_HEALTH_WORKER', 'REFER_TO_PARTNER_FACILITY', 'URGENT_TRANSFER', 'OTHER');

CREATE TYPE "DiabetesEscalationReason" AS ENUM ('URGENT_SYMPTOM_VOMITING', 'URGENT_SYMPTOM_CONFUSION', 'URGENT_SYMPTOM_DIFFICULTY_BREATHING', 'URGENT_SYMPTOM_LOSS_OF_CONSCIOUSNESS', 'ACTIVE_FOOT_WOUND', 'HYPOGLYCEMIA');

-- AlterEnum
ALTER TYPE "GlucoseType" ADD VALUE 'BEFORE_MEAL';
ALTER TYPE "GlucoseType" ADD VALUE 'POST_PRANDIAL_2H';
ALTER TYPE "DiabetesSymptom" ADD VALUE 'HYPOGLYCEMIA_SYMPTOMS';
ALTER TYPE "DiabetesSymptom" ADD VALUE 'FOOT_WOUND';
ALTER TYPE "DiabetesSymptom" ADD VALUE 'NONE';

-- AlterTable
ALTER TABLE "DiabetesScreening" ADD COLUMN     "bpCheckedToday" "ScreeningCompletionStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "clinicianComments" TEXT,
ADD COLUMN     "clinicianPlanAuthorId" UUID,
ADD COLUMN     "clinicianPlanAuthoredAt" TIMESTAMP(3),
ADD COLUMN     "clinicianPlanItems" "DiabetesClinicianPlanItem"[] DEFAULT ARRAY[]::"DiabetesClinicianPlanItem"[],
ADD COLUMN     "clinicianPlanOther" VARCHAR(200),
ADD COLUMN     "clinicianReviewRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "currentFootWound" "NkwapaAnswer" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "derivedSuspicion" "DiabetesSuspicion" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "diabetesStatus" "DiabetesStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "diabetesType" "DiabetesType" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "distressFailing" "DiabetesDistressResponse" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "distressOverwhelmed" "DiabetesDistressResponse" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "distressPositive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "eyeExam" "ScreeningCompletionStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "followUpOther" VARCHAR(120),
ADD COLUMN     "followUpOwner" "FollowUpOwner" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "followUpWindow" "FollowUpWindow" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "footExam" "ScreeningCompletionStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "hba1cMeasuredOn" DATE,
ADD COLUMN     "hba1cStatus" "Hba1cStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "homeGlucoseHighMgDl" INTEGER,
ADD COLUMN     "homeGlucoseLowMgDl" INTEGER,
ADD COLUMN     "homeGlucoseMonitoring" "NkwapaAnswer" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "kidneyTesting" "ScreeningCompletionStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "mainConcern" "DiabetesConcern" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "mainConcernOther" VARCHAR(200),
ADD COLUMN     "nutrition" JSONB,
ADD COLUMN     "nutritionSchemaVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "phq2Interest" "PhqResponse" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "phq2Mood" "PhqResponse" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "phq2Positive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phq2Total" INTEGER,
ADD COLUMN     "reviewReasonOther" VARCHAR(200),
ADD COLUMN     "reviewReasons" "DiabetesReviewReason"[] DEFAULT ARRAY[]::"DiabetesReviewReason"[],
ADD COLUMN     "urgentReviewReasons" "DiabetesEscalationReason"[] DEFAULT ARRAY[]::"DiabetesEscalationReason"[],
ADD COLUMN     "urgentReviewRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "urgentSymptoms" "DiabetesUrgentSymptom"[] DEFAULT ARRAY[]::"DiabetesUrgentSymptom"[],
ADD COLUMN     "volunteerActions" JSONB,
ADD COLUMN     "volunteerActionsSchemaVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "yearDiagnosed" INTEGER,
ADD COLUMN     "yearDiagnosedUnknown" BOOLEAN NOT NULL DEFAULT false;

-- Backfill.
--
-- Fasting >= 126 and random >= 200 are the approved thresholds. An UNKNOWN context is never
-- classified: a glucose without a timing is not a weaker finding, it is a different kind of thing,
-- and guessing its context is how a random 150 becomes a fasting 150.
UPDATE "DiabetesScreening"
SET "derivedSuspicion" = CASE
  WHEN "glucoseMgDl" IS NULL THEN 'NOT_ASSESSED'::"DiabetesSuspicion"
  WHEN "glucoseType" = 'FASTING' AND "glucoseMgDl" >= 126 THEN 'SUSPECTED'::"DiabetesSuspicion"
  WHEN "glucoseType" = 'FASTING' THEN 'NOT_SUSPECTED'::"DiabetesSuspicion"
  WHEN "glucoseType" = 'RANDOM' AND "glucoseMgDl" >= 200 THEN 'SUSPECTED'::"DiabetesSuspicion"
  WHEN "glucoseType" = 'RANDOM' THEN 'NOT_SUSPECTED'::"DiabetesSuspicion"
  ELSE 'NOT_ASSESSED'::"DiabetesSuspicion"
END;

-- A visit that recorded a blood pressure did check one, and the interview asks. Answering it from
-- the vitals already on the encounter saves a volunteer re-stating a fact the record holds, and is
-- deliberately one-directional: an absent reading stays NOT_ASSESSED rather than becoming
-- NOT_COMPLETED, because nobody has been asked yet.
UPDATE "DiabetesScreening" d
SET "bpCheckedToday" = 'COMPLETED'::"ScreeningCompletionStatus"
FROM "Vitals" v
WHERE v."encounterId" = d."encounterId"
  AND v."systolicBp" IS NOT NULL
  AND v."diastolicBp" IS NOT NULL;

-- Invariants the application also enforces.
ALTER TABLE "DiabetesScreening"
  ADD CONSTRAINT "DiabetesScreening_phq2_total_check" CHECK (
    "phq2Total" IS NULL OR "phq2Total" BETWEEN 0 AND 6
  );

-- A positive screen without a score, or a score of 3 or more that is not positive, means the
-- derivation half-ran. The cut-off lives in packages/db/src/phq2.ts; this is the database half.
ALTER TABLE "DiabetesScreening"
  ADD CONSTRAINT "DiabetesScreening_phq2_positive_check" CHECK (
    "phq2Positive" = (COALESCE("phq2Total", -1) >= 3)
  );

ALTER TABLE "DiabetesScreening"
  ADD CONSTRAINT "DiabetesScreening_home_glucose_check" CHECK (
    ("homeGlucoseLowMgDl" IS NULL OR "homeGlucoseLowMgDl" BETWEEN 0 AND 600)
    AND ("homeGlucoseHighMgDl" IS NULL OR "homeGlucoseHighMgDl" BETWEEN 0 AND 600)
    AND (
      "homeGlucoseLowMgDl" IS NULL
      OR "homeGlucoseHighMgDl" IS NULL
      OR "homeGlucoseLowMgDl" <= "homeGlucoseHighMgDl"
    )
  );

ALTER TABLE "DiabetesScreening"
  ADD CONSTRAINT "DiabetesScreening_year_diagnosed_check" CHECK (
    "yearDiagnosed" IS NULL
    OR "yearDiagnosed" BETWEEN 1900 AND EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
  );

ALTER TABLE "DiabetesScreening"
  ADD CONSTRAINT "DiabetesScreening_jsonb_object_check" CHECK (
    ("nutrition" IS NULL OR jsonb_typeof("nutrition") = 'object')
    AND ("volunteerActions" IS NULL OR jsonb_typeof("volunteerActions") = 'object')
  );

ALTER TABLE "DiabetesScreening"
  ADD CONSTRAINT "DiabetesScreening_schema_version_check" CHECK (
    "nutritionSchemaVersion" > 0 AND "volunteerActionsSchemaVersion" > 0
  );

ALTER TABLE "DiabetesScreening"
  ADD CONSTRAINT "DiabetesScreening_escalation_consistency_check" CHECK (
    "urgentReviewRequired" = (array_length("urgentReviewReasons", 1) IS NOT NULL)
  );

-- AddForeignKey
ALTER TABLE "DiabetesScreening" ADD CONSTRAINT "DiabetesScreening_clinicianPlanAuthorId_fkey" FOREIGN KEY ("clinicianPlanAuthorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
