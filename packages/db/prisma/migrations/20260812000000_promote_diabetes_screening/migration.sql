CREATE TYPE "DiabetesSymptom" AS ENUM (
  'POLYURIA',
  'POLYDIPSIA',
  'WEIGHT_LOSS',
  'BLURRED_VISION',
  'FATIGUE'
);

ALTER TABLE "DiabetesScreening"
  ADD COLUMN "symptoms" "DiabetesSymptom"[] NOT NULL DEFAULT ARRAY[]::"DiabetesSymptom"[],
  ADD COLUMN "legacySymptomsUnmapped" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "collectedAt" TIMESTAMP(3),
  ADD COLUMN "authoredByUserId" UUID;

UPDATE "DiabetesScreening" screening
SET
  "collectedAt" = screening."createdAt",
  "authoredByUserId" = encounter."createdByUserId"
FROM "Encounter" encounter
WHERE encounter."id" = screening."encounterId";

DO $$
DECLARE
  screening_row RECORD;
  parsed JSONB;
  mapped "DiabetesSymptom"[];
  source_count INTEGER;
  mapped_count INTEGER;
BEGIN
  FOR screening_row IN
    SELECT "id", "symptomsJson"
    FROM "DiabetesScreening"
    WHERE "symptomsJson" IS NOT NULL AND btrim("symptomsJson") <> ''
  LOOP
    BEGIN
      parsed := screening_row."symptomsJson"::JSONB;
      IF jsonb_typeof(parsed) <> 'array' THEN
        UPDATE "DiabetesScreening"
        SET "legacySymptomsUnmapped" = true
        WHERE "id" = screening_row."id";
        CONTINUE;
      END IF;

      SELECT
        COUNT(*),
        COALESCE(
          ARRAY_AGG(DISTINCT mapped_value ORDER BY mapped_value)
            FILTER (WHERE mapped_value IS NOT NULL),
          ARRAY[]::"DiabetesSymptom"[]
        ),
        COUNT(mapped_value)
      INTO source_count, mapped, mapped_count
      FROM (
        SELECT CASE value
          WHEN 'Polyuria' THEN 'POLYURIA'::"DiabetesSymptom"
          WHEN 'POLYURIA' THEN 'POLYURIA'::"DiabetesSymptom"
          WHEN 'Polydipsia' THEN 'POLYDIPSIA'::"DiabetesSymptom"
          WHEN 'POLYDIPSIA' THEN 'POLYDIPSIA'::"DiabetesSymptom"
          WHEN 'Weight loss' THEN 'WEIGHT_LOSS'::"DiabetesSymptom"
          WHEN 'WEIGHT_LOSS' THEN 'WEIGHT_LOSS'::"DiabetesSymptom"
          WHEN 'Blurred vision' THEN 'BLURRED_VISION'::"DiabetesSymptom"
          WHEN 'BLURRED_VISION' THEN 'BLURRED_VISION'::"DiabetesSymptom"
          WHEN 'Fatigue' THEN 'FATIGUE'::"DiabetesSymptom"
          WHEN 'FATIGUE' THEN 'FATIGUE'::"DiabetesSymptom"
          ELSE NULL
        END AS mapped_value
        FROM jsonb_array_elements_text(parsed) AS item(value)
      ) values_to_map;

      UPDATE "DiabetesScreening"
      SET
        "symptoms" = mapped,
        "legacySymptomsUnmapped" = source_count <> mapped_count
      WHERE "id" = screening_row."id";
    EXCEPTION WHEN OTHERS THEN
      UPDATE "DiabetesScreening"
      SET "legacySymptomsUnmapped" = true
      WHERE "id" = screening_row."id";
    END;
  END LOOP;
END $$;

ALTER TABLE "DiabetesScreening"
  ALTER COLUMN "collectedAt" SET NOT NULL,
  ALTER COLUMN "collectedAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "authoredByUserId" SET NOT NULL;

ALTER TABLE "DiabetesScreening"
  ADD CONSTRAINT "DiabetesScreening_glucose_range_check"
    CHECK ("glucoseMgDl" IS NULL OR ("glucoseMgDl" >= 0 AND "glucoseMgDl" <= 600)),
  ADD CONSTRAINT "DiabetesScreening_hba1c_range_check"
    CHECK ("hba1cPercent" IS NULL OR ("hba1cPercent" >= 0 AND "hba1cPercent" <= 100)),
  ADD CONSTRAINT "DiabetesScreening_authoredByUserId_fkey"
    FOREIGN KEY ("authoredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "DiabetesScreening_clinicId_collectedAt_idx"
  ON "DiabetesScreening"("clinicId", "collectedAt");
CREATE INDEX "DiabetesScreening_authoredByUserId_collectedAt_idx"
  ON "DiabetesScreening"("authoredByUserId", "collectedAt");
