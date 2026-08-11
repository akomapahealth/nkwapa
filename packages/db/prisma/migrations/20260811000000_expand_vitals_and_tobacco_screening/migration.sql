CREATE TYPE "BloodPressureSite" AS ENUM (
  'LEFT_ARM',
  'RIGHT_ARM',
  'LEFT_LEG',
  'RIGHT_LEG',
  'OTHER'
);

CREATE TYPE "PatientPosition" AS ENUM ('SITTING', 'STANDING', 'SUPINE', 'OTHER');

CREATE TYPE "BloodPressureCuffSize" AS ENUM (
  'INFANT',
  'CHILD',
  'SMALL_ADULT',
  'ADULT',
  'LARGE_ADULT',
  'THIGH',
  'OTHER'
);

CREATE TYPE "TemperatureSource" AS ENUM (
  'ORAL',
  'AXILLARY',
  'TYMPANIC',
  'TEMPORAL',
  'RECTAL',
  'OTHER'
);

CREATE TYPE "TobaccoUseStatus" AS ENUM ('NOT_ASSESSED', 'NEVER', 'FORMER', 'CURRENT');
CREATE TYPE "ScreeningAnswer" AS ENUM ('NOT_ASSESSED', 'NO', 'YES');
CREATE TYPE "ReadinessToQuit" AS ENUM (
  'NOT_ASSESSED',
  'NOT_READY',
  'CONSIDERING',
  'READY',
  'NOT_APPLICABLE'
);

ALTER TABLE "Vitals" RENAME COLUMN "heartRate" TO "pulseBpm";

ALTER TABLE "Vitals"
  ADD COLUMN "bpSite" "BloodPressureSite",
  ADD COLUMN "bpSiteOther" VARCHAR(120),
  ADD COLUMN "patientPosition" "PatientPosition",
  ADD COLUMN "patientPositionOther" VARCHAR(120),
  ADD COLUMN "cuffSize" "BloodPressureCuffSize",
  ADD COLUMN "cuffSizeOther" VARCHAR(120),
  ADD COLUMN "temperatureCelsius" DOUBLE PRECISION,
  ADD COLUMN "temperatureSource" "TemperatureSource",
  ADD COLUMN "temperatureSourceOther" VARCHAR(120),
  ADD COLUMN "respiratoryRate" INTEGER,
  ADD COLUMN "spo2Percent" INTEGER;

ALTER TABLE "Vitals"
  ADD CONSTRAINT "Vitals_blood_pressure_pair_check" CHECK (
    ("systolicBp" IS NULL AND "diastolicBp" IS NULL)
    OR (
      "systolicBp" BETWEEN 40 AND 300
      AND "diastolicBp" BETWEEN 20 AND 200
      AND "systolicBp" > "diastolicBp"
    )
  ),
  ADD CONSTRAINT "Vitals_bp_site_other_check" CHECK (
    ("bpSite" = 'OTHER' AND NULLIF(BTRIM("bpSiteOther"), '') IS NOT NULL)
    OR ("bpSite" IS DISTINCT FROM 'OTHER' AND "bpSiteOther" IS NULL)
  ),
  ADD CONSTRAINT "Vitals_position_other_check" CHECK (
    ("patientPosition" = 'OTHER' AND NULLIF(BTRIM("patientPositionOther"), '') IS NOT NULL)
    OR ("patientPosition" IS DISTINCT FROM 'OTHER' AND "patientPositionOther" IS NULL)
  ),
  ADD CONSTRAINT "Vitals_cuff_other_check" CHECK (
    ("cuffSize" = 'OTHER' AND NULLIF(BTRIM("cuffSizeOther"), '') IS NOT NULL)
    OR ("cuffSize" IS DISTINCT FROM 'OTHER' AND "cuffSizeOther" IS NULL)
  ),
  ADD CONSTRAINT "Vitals_pulse_check" CHECK ("pulseBpm" IS NULL OR "pulseBpm" BETWEEN 20 AND 300),
  ADD CONSTRAINT "Vitals_temperature_check" CHECK (
    ("temperatureCelsius" IS NULL AND "temperatureSource" IS NULL AND "temperatureSourceOther" IS NULL)
    OR (
      "temperatureCelsius" BETWEEN 25 AND 45
      AND "temperatureSource" IS NOT NULL
      AND (
        ("temperatureSource" = 'OTHER' AND NULLIF(BTRIM("temperatureSourceOther"), '') IS NOT NULL)
        OR ("temperatureSource" <> 'OTHER' AND "temperatureSourceOther" IS NULL)
      )
    )
  ),
  ADD CONSTRAINT "Vitals_respiratory_rate_check" CHECK (
    "respiratoryRate" IS NULL OR "respiratoryRate" BETWEEN 1 AND 100
  ),
  ADD CONSTRAINT "Vitals_spo2_check" CHECK ("spo2Percent" IS NULL OR "spo2Percent" BETWEEN 1 AND 100),
  ADD CONSTRAINT "Vitals_weight_check" CHECK ("weightKg" IS NULL OR "weightKg" BETWEEN 0.1 AND 700),
  ADD CONSTRAINT "Vitals_height_check" CHECK ("heightCm" IS NULL OR "heightCm" BETWEEN 20 AND 300),
  ADD CONSTRAINT "Vitals_bmi_check" CHECK ("bmi" IS NULL OR "bmi" > 0);

CREATE TABLE "TobaccoScreening" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "encounterId" UUID NOT NULL,
  "smokingStatus" "TobaccoUseStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
  "smokelessTobaccoStatus" "TobaccoUseStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
  "passiveExposure" "ScreeningAnswer" NOT NULL DEFAULT 'NOT_ASSESSED',
  "readinessToQuit" "ReadinessToQuit" NOT NULL DEFAULT 'NOT_ASSESSED',
  "counselingGiven" "ScreeningAnswer" NOT NULL DEFAULT 'NOT_ASSESSED',
  "reviewedByUserId" UUID,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TobaccoScreening_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TobaccoScreening_review_pair_check" CHECK (
    ("reviewedByUserId" IS NULL AND "reviewedAt" IS NULL)
    OR ("reviewedByUserId" IS NOT NULL AND "reviewedAt" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "TobaccoScreening_encounterId_key" ON "TobaccoScreening"("encounterId");
CREATE INDEX "TobaccoScreening_clinicId_updatedAt_idx" ON "TobaccoScreening"("clinicId", "updatedAt");
CREATE INDEX "TobaccoScreening_clinicId_reviewedAt_idx" ON "TobaccoScreening"("clinicId", "reviewedAt");
CREATE INDEX "TobaccoScreening_reviewedByUserId_idx" ON "TobaccoScreening"("reviewedByUserId");

ALTER TABLE "TobaccoScreening"
  ADD CONSTRAINT "TobaccoScreening_encounterId_fkey"
  FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TobaccoScreening"
  ADD CONSTRAINT "TobaccoScreening_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TobaccoScreening"
  ADD CONSTRAINT "TobaccoScreening_reviewedByUserId_fkey"
  FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TobaccoScreening" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "TobaccoScreening_clinic_scope_policy" ON "TobaccoScreening"
FOR ALL
USING (
  app.can_access_clinic("clinicId")
  AND EXISTS (
    SELECT 1 FROM "Encounter" e
    WHERE e."id" = "encounterId" AND e."clinicId" = "clinicId"
  )
)
WITH CHECK (
  app.can_access_clinic("clinicId")
  AND EXISTS (
    SELECT 1 FROM "Encounter" e
    WHERE e."id" = "encounterId" AND e."clinicId" = "clinicId"
  )
);
