-- Staff confidentiality agreement (#330): who signed which version of the text, and when.
--
-- Idempotent throughout, because a Prisma deploy is not one transaction.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "staffAgreementVersion" INTEGER;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "staffAgreementAcceptedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "StaffAgreementAcceptance" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "agreementKey" VARCHAR(60) NOT NULL,
    "version" INTEGER NOT NULL,
    "textSha256" CHAR(64) NOT NULL,
    "signedName" VARCHAR(250) NOT NULL,
    "rolesAtSigning" TEXT[],
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" VARCHAR(64),
    "userAgent" VARCHAR(400),

    CONSTRAINT "StaffAgreementAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StaffAgreementAcceptance_userId_agreementKey_version_key"
  ON "StaffAgreementAcceptance"("userId", "agreementKey", "version");

ALTER TABLE "StaffAgreementAcceptance" DROP CONSTRAINT IF EXISTS "StaffAgreementAcceptance_userId_fkey";
ALTER TABLE "StaffAgreementAcceptance" ADD CONSTRAINT "StaffAgreementAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row level security: a person may add and read their own signature. There is no UPDATE or
-- DELETE policy on purpose, so the application role cannot alter or remove a signature once made.
ALTER TABLE "StaffAgreementAcceptance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffAgreementAcceptance" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "StaffAgreementAcceptance_owner_select" ON "StaffAgreementAcceptance";
CREATE POLICY "StaffAgreementAcceptance_owner_select" ON "StaffAgreementAcceptance"
FOR SELECT
USING ("userId" = app.current_user_id() OR app.is_system_admin());
DROP POLICY IF EXISTS "StaffAgreementAcceptance_owner_insert" ON "StaffAgreementAcceptance";
CREATE POLICY "StaffAgreementAcceptance_owner_insert" ON "StaffAgreementAcceptance"
FOR INSERT
WITH CHECK ("userId" = app.current_user_id());
