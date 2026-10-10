import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('portal invite identity provisioning migration', () => {
  const migration = readFileSync(
    resolve(
      __dirname,
      '../prisma/migrations/20260914120000_portal_invite_identity_provisioning/migration.sql',
    ),
    'utf8',
  );

  const schema = readFileSync(resolve(__dirname, '../prisma/schema.prisma'), 'utf8');

  it('creates every state the provisioning path can report', () => {
    expect(migration).toContain(
      `CREATE TYPE "PortalInviteIdentityStatus" AS ENUM ('NOT_REQUESTED', 'PROVISIONED', 'EXISTING_PENDING', 'ALREADY_ACTIVE', 'SKIPPED', 'FAILED')`,
    );
  });

  it('adds the four columns the chart reads', () => {
    for (const column of [
      '"identityStatus" "PortalInviteIdentityStatus" NOT NULL DEFAULT \'NOT_REQUESTED\'',
      '"keycloakUserId" VARCHAR(255)',
      '"identityProvisionedAt" TIMESTAMP(3)',
      '"identityFailureReason" VARCHAR(255)',
    ]) {
      expect(migration).toContain(column);
    }
  });

  /*
    The defect this guards: an earlier invite migration wrote rows that row level security
    then silently discarded, leaving a backfill that looked applied and was not. Adding
    columns with a default writes nothing, and that is the property worth pinning -- a
    future edit that adds an UPDATE here would be making the same mistake again.
  */
  it('writes no rows, so row level security has nothing to silently discard', () => {
    expect(migration).not.toMatch(/^\s*UPDATE\s/im);
    expect(migration).not.toMatch(/^\s*INSERT\s/im);
  });

  it('leaves historical invites unclaimed rather than inventing a provenance for them', () => {
    expect(migration).toContain("DEFAULT 'NOT_REQUESTED'");
  });

  it('keeps the schema and the migration describing the same columns', () => {
    const model = schema.slice(
      schema.indexOf('model PatientPortalInvite {'),
      schema.indexOf('model PatientCodeAlias {'),
    );

    expect(model).toContain(
      'identityStatus        PortalInviteIdentityStatus @default(NOT_REQUESTED)',
    );
    expect(model).toContain('keycloakUserId');
    expect(model).toContain('identityProvisionedAt DateTime?');
    expect(model).toContain('identityFailureReason');
  });

  it('states that the failure reason is a code, not a patient-identifying string', () => {
    expect(schema).toContain('/// A stable code such as KEYCLOAK_ADMIN_TIMEOUT.');
  });
});
