-- The welcome tour version a user last finished or skipped (#189). Nullable, no default: every
-- existing user has seen no tour, which is exactly what null says.
ALTER TABLE "User" ADD COLUMN "welcomeTourVersion" INTEGER;
ALTER TABLE "User" ADD COLUMN "welcomeTourCompletedAt" TIMESTAMP(3);
