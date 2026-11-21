-- Screening-day feedback (2026-11-21).

-- Several BP readings per sitting; systolicBp/diastolicBp keep the averaged reading used for care.
ALTER TABLE "Vitals" ADD COLUMN "bpSystolicReadings" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "Vitals" ADD COLUMN "bpDiastolicReadings" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- Training charts, kept out of reports, research and outreach.
ALTER TABLE "Patient" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Patient_primaryClinicId_isDemo_idx" ON "Patient"("primaryClinicId", "isDemo");
