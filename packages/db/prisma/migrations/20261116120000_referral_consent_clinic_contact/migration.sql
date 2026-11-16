-- Referral report follow-ups (#344): a separate consent for sharing a named record with another
-- facility, and contact details a referral report can print for the sending clinic. All nullable,
-- nothing backfilled. Each step is safe to re-run after a partial deploy.
ALTER TYPE "ConsentType" ADD VALUE IF NOT EXISTS 'REFERRAL_SHARING';

ALTER TABLE "Clinic"
  ADD COLUMN IF NOT EXISTS "contactPhone" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "contactEmail" VARCHAR(254),
  ADD COLUMN IF NOT EXISTS "address" VARCHAR(200);
