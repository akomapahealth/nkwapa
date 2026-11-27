-- A day number per clinic per clinic-local day (#413), called out instead of a patient's name.
-- Each statement is safe to re-run: prisma migrate deploy is not one transaction.

ALTER TABLE "PatientCheckIn" ADD COLUMN IF NOT EXISTS "dayNumber" INTEGER;
ALTER TABLE "PatientCheckIn" ADD COLUMN IF NOT EXISTS "dayDate" DATE;

-- Number earlier check-ins in arrival order, so a deploy mid-day carries on from today's count.
-- Deterministic (checkedInAt, id), so a re-run gives already-numbered rows the same numbers.
UPDATE "PatientCheckIn" AS ci
SET "dayDate" = numbered."dayDate", "dayNumber" = numbered."dayNumber"
FROM (
  SELECT c.id,
         (c."checkedInAt" AT TIME ZONE 'UTC' AT TIME ZONE cl.timezone)::date AS "dayDate",
         ROW_NUMBER() OVER (
           PARTITION BY c."clinicId", (c."checkedInAt" AT TIME ZONE 'UTC' AT TIME ZONE cl.timezone)::date
           ORDER BY c."checkedInAt", c.id
         )::int AS "dayNumber"
  FROM "PatientCheckIn" c
  JOIN "Clinic" cl ON cl.id = c."clinicId"
) AS numbered
WHERE ci.id = numbered.id AND ci."dayNumber" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "PatientCheckIn_clinicId_dayDate_dayNumber_key"
  ON "PatientCheckIn"("clinicId", "dayDate", "dayNumber");
