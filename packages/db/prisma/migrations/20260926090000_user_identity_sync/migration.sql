-- Record whether a user's Keycloak identity matches their Nkwapa access. Issue #126.
--
-- Deactivating a user set "User".isActive and stopped there: the Keycloak identity stayed
-- enabled, its password kept working, and its sessions lived until they expired. The API now
-- disables the identity (and ends its sessions) after a deactivation, and re-enables it after a
-- reactivation. That happens in a background job, after the local write has committed, so a
-- Keycloak outage can never delay or roll back the local block. These columns are how the admin
-- page says which half succeeded.
--
-- Existing rows read NOT_SYNCED rather than anything more flattering. Nothing is known about
-- their identities, and an inactive user from before this change may well still be able to sign
-- in; "never synced" is the honest description, and the admin page offers a sync for them.
--
-- "User" is not row-level-security scoped, and the application role's grants are table-level,
-- so new columns need no policy or grant.

-- CreateEnum
CREATE TYPE "UserIdentitySyncStatus" AS ENUM ('NOT_SYNCED', 'PENDING', 'IN_SYNC', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "identitySyncStatus" "UserIdentitySyncStatus" NOT NULL DEFAULT 'NOT_SYNCED',
  ADD COLUMN "identitySyncRequestedAt" TIMESTAMP(3),
  ADD COLUMN "identitySyncedAt" TIMESTAMP(3),
  ADD COLUMN "identitySyncFailureReason" VARCHAR(255);
