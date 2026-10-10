-- Invite staff by email instead of creating their Keycloak accounts by hand. Issue #124.
--
-- #115 did this for patients. Staff were still onboarded across three systems: create the
-- identity in Keycloak, have the person sign in once so a "User" row exists, then assign a role
-- in /admin/users. This table is what lets a director do all of that from one form.
--
-- It is not the patient invite with a role column, and the constraints below are where that
-- difference is enforced rather than only intended. A patient invite grants one record the
-- invitee must still identify with a patient code and a date of birth. A staff invite grants a
-- role over other people's clinical data, and possession of the inbox is the only check.

-- CreateEnum
CREATE TYPE "StaffInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Reminder" ADD COLUMN     "staffInviteId" UUID;

-- CreateTable
CREATE TABLE "StaffInvite" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "StaffInviteStatus" NOT NULL DEFAULT 'PENDING',
    "createdByUserId" UUID NOT NULL,
    "acceptedByUserId" UUID,
    "acceptedAt" TIMESTAMP(3),
    "cancelledByUserId" UUID,
    "cancelledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "identityStatus" "PortalInviteIdentityStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "keycloakUserId" VARCHAR(255),
    "identityProvisionedAt" TIMESTAMP(3),
    "identityFailureReason" VARCHAR(255),

    CONSTRAINT "StaffInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffInvite_clinicId_status_createdAt_idx" ON "StaffInvite"("clinicId", "status", "createdAt");

-- Only the roles an invitation may carry. DIRECTOR and SYSTEM_ADMIN stay manual and
-- deliberate, and PATIENT has its own invitation with its own second factor. The service
-- refuses these first with a readable message; this is what holds if a future code path forgets.
ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_role_check"
  CHECK ("role" IN ('MANAGER', 'DOCTOR', 'VOLUNTEER'));

-- Invitations are matched case-insensitively to a verified address. Storing them lower-cased
-- is what lets the partial unique index below mean what it says.
ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_email_lowercase_check"
  CHECK ("email" = lower("email"));

-- CreateIndex
CREATE INDEX "StaffInvite_email_status_idx" ON "StaffInvite"("email", "status");

-- CreateIndex
CREATE INDEX "StaffInvite_status_expiresAt_idx" ON "StaffInvite"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Reminder_staffInviteId_idx" ON "Reminder"("staffInviteId");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_staffInviteId_fkey" FOREIGN KEY ("staffInviteId") REFERENCES "StaffInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One live invitation per address per clinic. Issuing a new one cancels the previous one in the
-- same transaction; this makes a race between two directors fail loudly instead of leaving two
-- live links to the same seat. Same shape as "StaffShift_active_unique_idx".
CREATE UNIQUE INDEX "StaffInvite_pending_unique_idx" ON "StaffInvite"("clinicId", "email") WHERE "status" = 'PENDING';


-- AddForeignKey
ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A staff invitation is addressed to someone who may not have a "User" row yet, so it cannot be
-- a USER-recipient row keyed on recipientUserId. It is still a USER notice (it is not patient
-- outreach), keyed on the invite instead. The patient shape is unchanged.
ALTER TABLE "Reminder" DROP CONSTRAINT "Reminder_recipient_identity_check";
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_recipient_identity_check" CHECK (
  ("recipientType" = 'PATIENT' AND "patientId" IS NOT NULL AND "recipientUserId" IS NULL)
  OR
  ("recipientType" = 'USER' AND "patientId" IS NULL
    AND ("recipientUserId" IS NOT NULL OR "staffInviteId" IS NOT NULL))
);

-- Row level security.
--
-- ENABLE and FORCE together, for the reason 20260904120000_patient_merge_record gives: the
-- application connects as the table owner, and PostgreSQL exempts an owner from its own
-- policies unless FORCE is set.
--
-- The ordinary clinic policy. A director sees their own clinic's invitations; a system admin
-- sees every clinic's through app.can_access_clinic(). An invitee sees theirs because the RLS
-- interceptor widens their scope to the clinic of any claimable invitation addressed to their
-- verified email, exactly as it already does for a patient invitation. That widening grants no
-- permission; an invitee with no role still reaches nothing but the acceptance routes.
ALTER TABLE "StaffInvite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffInvite" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "StaffInvite_clinic_scope_policy" ON "StaffInvite";
CREATE POLICY "StaffInvite_clinic_scope_policy" ON "StaffInvite"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

-- Grants are not repeated here. 20260821130000_add_application_database_role set default
-- privileges on the public schema for nkwapa_app, so this table is reachable without them.
