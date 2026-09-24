-- Records when a screening was completed, where the patient could say.
--
-- Nullable with no default and no backfill, on purpose. Existing rows have never been asked the
-- question, and NULL is the honest answer to "when was this done" for them. NULL therefore means
-- "not recorded" and never "not completed": the ScreeningCompletionStatus column beside each one
-- remains the only thing that says whether the screening happened.
--
-- No date for bpCheckedToday. That question asks about today by definition.

-- AlterTable
ALTER TABLE "DiabetesScreening"
  ADD COLUMN "eyeExamCompletedOn" DATE,
  ADD COLUMN "footExamCompletedOn" DATE,
  ADD COLUMN "kidneyTestingCompletedOn" DATE;

-- AlterTable
ALTER TABLE "HypertensionAssessment"
  ADD COLUMN "kidneyFunctionTestingCompletedOn" DATE,
  ADD COLUMN "urineProteinTestingCompletedOn" DATE,
  ADD COLUMN "cholesterolTestingCompletedOn" DATE,
  ADD COLUMN "ecgCompletedOn" DATE;
