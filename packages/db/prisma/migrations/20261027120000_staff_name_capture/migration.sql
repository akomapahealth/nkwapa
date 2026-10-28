-- Staff names (#225). Nullable, no defaults, no data rewritten: names can't be guessed, so
-- staff without them are asked at their next sign-in.
ALTER TABLE "User" ADD COLUMN "middleInitial" VARCHAR(1);

ALTER TABLE "StaffInvite" ADD COLUMN "firstName" VARCHAR(120);
ALTER TABLE "StaffInvite" ADD COLUMN "lastName" VARCHAR(120);
ALTER TABLE "StaffInvite" ADD COLUMN "middleInitial" VARCHAR(1);
