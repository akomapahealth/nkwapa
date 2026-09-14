-- Record what happened to the patient's Keycloak identity when a portal invite was sent.
--
-- See issue #115. Until now an invite said only that an invitation existed, never whether
-- the patient could act on it. Staff found out that an account had not been created when a
-- patient rang to say the link did not work, which is the worst possible place to learn it.
--
-- Three notes.
--
-- Existing rows are deliberately left at NOT_REQUESTED rather than backfilled to anything
-- more flattering. Every invite issued before this migration was claimed against an
-- identity somebody made by hand, and we have no record of which; inventing PROVISIONED for
-- them would put a claim in the chart that no evidence supports.
--
-- The columns are nullable additions with a defaulted enum, so no table rewrite is needed
-- and nothing has to be written while row level security is in force. The invite backfill
-- in 20260902120000_portal_invite_expiry had to be repaired precisely because a migration
-- wrote rows that RLS then silently discarded; this one writes none.
--
-- Privileges need no change. The application role's grants in
-- 20260821130000_add_application_database_role are table-level, so new columns inherit them.

-- CreateEnum
CREATE TYPE "PortalInviteIdentityStatus" AS ENUM ('NOT_REQUESTED', 'PROVISIONED', 'EXISTING_PENDING', 'ALREADY_ACTIVE', 'SKIPPED', 'FAILED');

-- AlterTable
ALTER TABLE "PatientPortalInvite"
  ADD COLUMN "identityStatus" "PortalInviteIdentityStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  ADD COLUMN "keycloakUserId" VARCHAR(255),
  ADD COLUMN "identityProvisionedAt" TIMESTAMP(3),
  ADD COLUMN "identityFailureReason" VARCHAR(255);
