-- Convert the former PRECEPTOR operational role into DOCTOR before removing
-- PRECEPTOR from the assignable role enums.

DELETE FROM "UserClinicRole" preceptor_role
USING "UserClinicRole" doctor_role
WHERE preceptor_role."role" = 'PRECEPTOR'::"UserRole"
  AND doctor_role."role" = 'DOCTOR'::"UserRole"
  AND preceptor_role."userId" = doctor_role."userId"
  AND preceptor_role."clinicId" IS NOT DISTINCT FROM doctor_role."clinicId";

UPDATE "UserClinicRole"
SET "role" = 'DOCTOR'::"UserRole"
WHERE "role" = 'PRECEPTOR'::"UserRole";

UPDATE "StaffShift"
SET "roleAtShift" = 'DOCTOR'::"ShiftRole"
WHERE "roleAtShift" = 'PRECEPTOR'::"ShiftRole";

ALTER TYPE "UserRole" RENAME TO "UserRole_old";
CREATE TYPE "UserRole" AS ENUM (
  'SYSTEM_ADMIN',
  'DIRECTOR',
  'MANAGER',
  'DOCTOR',
  'VOLUNTEER',
  'PATIENT'
);
ALTER TABLE "UserClinicRole"
  ALTER COLUMN "role" TYPE "UserRole"
  USING ("role"::text::"UserRole");
DROP TYPE "UserRole_old";

ALTER TYPE "ShiftRole" RENAME TO "ShiftRole_old";
CREATE TYPE "ShiftRole" AS ENUM (
  'VOLUNTEER',
  'DOCTOR',
  'MANAGER'
);
ALTER TABLE "StaffShift"
  ALTER COLUMN "roleAtShift" TYPE "ShiftRole"
  USING ("roleAtShift"::text::"ShiftRole");
DROP TYPE "ShiftRole_old";
