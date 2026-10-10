-- What the Eye station found: one record per encounter, with one finding per examined structure
-- of each eye. See EyeScreening in schema.prisma.

-- CreateEnum
CREATE TYPE "Eye" AS ENUM ('OD', 'OS');

-- CreateEnum
CREATE TYPE "EyeStructure" AS ENUM ('LIDS_LASHES', 'CONJUNCTIVA_PALPEBRAL', 'CONJUNCTIVA_BULBAR', 'SCLERA', 'CORNEA', 'ANTERIOR_CHAMBER', 'IRIS', 'PUPIL', 'LENS', 'VITREOUS', 'OPTIC_DISC', 'MACULA', 'PERIPHERY');

-- CreateEnum
CREATE TYPE "EyeFindingResult" AS ENUM ('NORMAL', 'ABNORMAL', 'NOT_ASSESSED');

-- CreateEnum
CREATE TYPE "VisionLossCause" AS ENUM ('REFRACTIVE', 'PATHOLOGICAL', 'UNDETERMINED');

-- CreateTable
CREATE TABLE "EyeScreening" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "encounterId" UUID NOT NULL,
    "hasEyeComplaint" BOOLEAN NOT NULL DEFAULT false,
    "complaintHistory" TEXT,
    "wearsCorrection" BOOLEAN NOT NULL DEFAULT false,
    "vaOdUnaided" VARCHAR(8),
    "vaOsUnaided" VARCHAR(8),
    "vaOuUnaided" VARCHAR(8),
    "vaOdAided" VARCHAR(8),
    "vaOsAided" VARCHAR(8),
    "vaOuAided" VARCHAR(8),
    "vaOdPinhole" VARCHAR(8),
    "vaOsPinhole" VARCHAR(8),
    "cupDiscRatioOd" DECIMAL(3,2),
    "cupDiscRatioOs" DECIMAL(3,2),
    "visionLossCause" "VisionLossCause",
    "diabeticSignsSeen" BOOLEAN NOT NULL DEFAULT false,
    "hypertensiveSignsSeen" BOOLEAN NOT NULL DEFAULT false,
    "referralRecommended" BOOLEAN NOT NULL DEFAULT false,
    "referralNote" TEXT,
    "notes" TEXT,
    "authorUserId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EyeScreening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EyeExamFinding" (
    "id" UUID NOT NULL,
    "eyeScreeningId" UUID NOT NULL,
    "eye" "Eye" NOT NULL,
    "structure" "EyeStructure" NOT NULL,
    "result" "EyeFindingResult" NOT NULL,
    "note" VARCHAR(500),

    CONSTRAINT "EyeExamFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EyeScreening_encounterId_key" ON "EyeScreening"("encounterId");

-- CreateIndex
CREATE INDEX "EyeScreening_clinicId_updatedAt_idx" ON "EyeScreening"("clinicId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EyeExamFinding_eyeScreeningId_eye_structure_key" ON "EyeExamFinding"("eyeScreeningId", "eye", "structure");

-- AddForeignKey
ALTER TABLE "EyeScreening" ADD CONSTRAINT "EyeScreening_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EyeScreening" ADD CONSTRAINT "EyeScreening_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EyeScreening" ADD CONSTRAINT "EyeScreening_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EyeExamFinding" ADD CONSTRAINT "EyeExamFinding_eyeScreeningId_fkey" FOREIGN KEY ("eyeScreeningId") REFERENCES "EyeScreening"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Acuity comes off a fixed chart. The API validates it; this holds for every other writer.
-- Keep the list in step with VISUAL_ACUITY_VALUES in packages/db/src/eye-screening.ts.
-- Readings not taken are NULL, and array containment never matches a NULL, so they are dropped
-- before the comparison.
ALTER TABLE "EyeScreening" ADD CONSTRAINT "EyeScreening_acuity_check" CHECK (
  array_remove(
    ARRAY["vaOdUnaided", "vaOsUnaided", "vaOuUnaided", "vaOdAided", "vaOsAided", "vaOuAided",
          "vaOdPinhole", "vaOsPinhole"]::text[],
    NULL
  ) <@ ARRAY['6/5', '6/6', '6/7.5', '6/9', '6/12', '6/18', '6/24', '6/36', '6/60',
             'CF', 'HM', 'PL', 'NPL']::text[]
);

-- A cup-to-disc ratio is a fraction of the disc.
ALTER TABLE "EyeScreening" ADD CONSTRAINT "EyeScreening_cup_disc_ratio_check" CHECK (
  ("cupDiscRatioOd" IS NULL OR "cupDiscRatioOd" BETWEEN 0 AND 1)
  AND ("cupDiscRatioOs" IS NULL OR "cupDiscRatioOs" BETWEEN 0 AND 1)
);

-- Row level security, as 20261007120000_station_workflow sets it. A finding carries no clinicId
-- of its own, so it is visible exactly when its screening is.
ALTER TABLE "EyeScreening" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EyeScreening" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "EyeScreening_clinic_scope_policy" ON "EyeScreening";
CREATE POLICY "EyeScreening_clinic_scope_policy" ON "EyeScreening"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

ALTER TABLE "EyeExamFinding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EyeExamFinding" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "EyeExamFinding_clinic_scope_policy" ON "EyeExamFinding";
CREATE POLICY "EyeExamFinding_clinic_scope_policy" ON "EyeExamFinding"
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM "EyeScreening" s
    WHERE s."id" = "EyeExamFinding"."eyeScreeningId" AND app.can_access_clinic(s."clinicId")
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "EyeScreening" s
    WHERE s."id" = "EyeExamFinding"."eyeScreeningId" AND app.can_access_clinic(s."clinicId")
  )
);

-- Add the Eye station to every clinic that has a review station and no eye station, immediately
-- before review: completing review ends the session, so a station after it is never reached.
-- Review and anything after it move down one place. sortOrder is unique per clinic, so they move
-- out of the way first and then back. "Clinic" and "ClinicStation" have forced row level
-- security, so this reads them with system-admin scope for this session only.
SELECT set_config('app.is_system_admin', 'true', false);

UPDATE "ClinicStation" s
SET "sortOrder" = s."sortOrder" + 100000
FROM "ClinicStation" r
WHERE r."clinicId" = s."clinicId" AND r."kind" = 'REVIEW' AND r."active"
  AND s."sortOrder" >= r."sortOrder"
  AND NOT EXISTS (
    SELECT 1 FROM "ClinicStation" e WHERE e."clinicId" = r."clinicId" AND e."kind" = 'EYE'
  );

UPDATE "ClinicStation"
SET "sortOrder" = "sortOrder" - 100000 + 1
WHERE "sortOrder" >= 100000;

INSERT INTO "ClinicStation" ("id", "clinicId", "kind", "name", "sortOrder", "updatedAt")
SELECT gen_random_uuid(), r."clinicId", 'EYE', 'Eye station', r."sortOrder" - 1, CURRENT_TIMESTAMP
FROM "ClinicStation" r
WHERE r."kind" = 'REVIEW' AND r."active"
  AND NOT EXISTS (
    SELECT 1 FROM "ClinicStation" e WHERE e."clinicId" = r."clinicId" AND e."kind" = 'EYE'
  );

SELECT set_config('app.is_system_admin', '', false);
