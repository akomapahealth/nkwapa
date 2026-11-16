-- Full middle names (#342). Patients get an optional middle name; staff's one-letter initial is
-- renamed and widened, so an existing "K" stays "K" until the person edits it. Nothing is split or
-- guessed from existing first names. Each step is safe to re-run after a partial deploy.
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "middleName" VARCHAR(120);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'User' AND column_name = 'middleInitial') THEN
    ALTER TABLE "User" RENAME COLUMN "middleInitial" TO "middleName";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'StaffInvite' AND column_name = 'middleInitial') THEN
    ALTER TABLE "StaffInvite" RENAME COLUMN "middleInitial" TO "middleName";
  END IF;
END $$;

ALTER TABLE "User" ALTER COLUMN "middleName" TYPE VARCHAR(120);
ALTER TABLE "StaffInvite" ALTER COLUMN "middleName" TYPE VARCHAR(120);
