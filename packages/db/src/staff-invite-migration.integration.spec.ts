import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';

const describeMigration =
  process.env.RUN_STAFF_INVITE_MIGRATION_TESTS === '1' ? describe : describe.skip;

function databaseUrl(source: string, database: string): string {
  const url = new URL(source);
  url.pathname = `/${database}`;
  return url.toString();
}

const CLINIC_A = '72000000-0000-4000-8000-00000000000a';
const CLINIC_B = '72000000-0000-4000-8000-00000000000b';
const DIRECTOR = '72000000-0000-4000-8000-000000000001';

/**
 * What the database refuses on its own, whatever the service remembers to check.
 *
 * The service refuses these first with readable messages. These tests are about the layer that
 * still holds when a future code path forgets: a DIRECTOR invitation, two live links to one seat,
 * a staff invitation email with no recipient on it, and rows leaking across clinics.
 */
describeMigration('staff invite database safeguards', () => {
  jest.setTimeout(120_000);

  let admin: Client;
  let target: Client;
  let database: string;

  beforeAll(async () => {
    const sourceUrl = process.env.DATABASE_URL;
    if (!sourceUrl) throw new Error('DATABASE_URL is required');

    database = `nkwapa_staff_invites_${Date.now()}`;
    admin = new Client({ connectionString: databaseUrl(sourceUrl, 'postgres') });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);

    target = new Client({ connectionString: databaseUrl(sourceUrl, database) });
    await target.connect();
    const migrationsRoot = resolve(__dirname, '../prisma/migrations');
    const migrations = (await readdir(migrationsRoot)).filter((name) => /^\d/.test(name)).sort();
    for (const migration of migrations) {
      await target.query(
        await readFile(resolve(migrationsRoot, migration, 'migration.sql'), 'utf8'),
      );
    }

    await target.query(`
      INSERT INTO "Clinic" ("id", "name", "organizationId", "timezone", "locationCode", "updatedAt")
      SELECT '${CLINIC_A}', 'Invite Clinic A', "id", 'Africa/Accra', 'invite-a', CURRENT_TIMESTAMP
      FROM "Organization" LIMIT 1;
      INSERT INTO "Clinic" ("id", "name", "organizationId", "timezone", "locationCode", "updatedAt")
      SELECT '${CLINIC_B}', 'Invite Clinic B', "id", 'Africa/Accra', 'invite-b', CURRENT_TIMESTAMP
      FROM "Organization" LIMIT 1;
      INSERT INTO "User" ("id", "keycloakSub", "displayName", "updatedAt") VALUES
        ('${DIRECTOR}', 'invite-director', 'Invite Director', CURRENT_TIMESTAMP);
    `);
  });

  afterAll(async () => {
    await target?.end();
    await admin?.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin?.end();
  });

  let sequence = 0;
  async function insertInvite(
    fields: { clinicId?: string; email?: string; role?: string; status?: string } = {},
  ) {
    sequence += 1;
    const id = `72000000-0000-4000-8000-${String(100 + sequence).padStart(12, '0')}`;
    await target.query(
      `INSERT INTO "StaffInvite" ("id", "clinicId", "email", "role", "status", "createdByUserId", "expiresAt", "updatedAt")
       VALUES ($1, $2, $3, $4::"UserRole", $5::"StaffInviteStatus", $6, CURRENT_TIMESTAMP + interval '3 days', CURRENT_TIMESTAMP)`,
      [
        id,
        fields.clinicId ?? CLINIC_A,
        fields.email ?? `person${sequence}@clinic.org`,
        fields.role ?? 'DOCTOR',
        fields.status ?? 'PENDING',
        DIRECTOR,
      ],
    );
    return id;
  }

  it.each(['DIRECTOR', 'SYSTEM_ADMIN', 'PATIENT'])(
    'refuses an invitation carrying %s',
    async (role) => {
      await expect(insertInvite({ role })).rejects.toThrow(/StaffInvite_role_check/);
    },
  );

  it('refuses an address that is not stored lower-cased', async () => {
    await expect(insertInvite({ email: 'Ama@Clinic.org' })).rejects.toThrow(
      /StaffInvite_email_lowercase_check/,
    );
  });

  it('allows one live invitation per address per clinic, and any number of settled ones', async () => {
    await insertInvite({ email: 'kofi@clinic.org' });
    await expect(insertInvite({ email: 'kofi@clinic.org' })).rejects.toThrow(
      /StaffInvite_pending_unique_idx/,
    );
    await expect(
      insertInvite({ email: 'kofi@clinic.org', status: 'CANCELLED' }),
    ).resolves.toBeDefined();
    await expect(
      insertInvite({ email: 'kofi@clinic.org', clinicId: CLINIC_B }),
    ).resolves.toBeDefined();
  });

  describe('the notification ledger', () => {
    async function insertReminder(staffInviteId: string | null, recipientUserId: string | null) {
      await target.query(
        `INSERT INTO "Reminder" ("id", "clinicId", "recipientType", "recipientUserId", "staffInviteId", "channel", "toAddress", "templateKey", "payloadJson", "scheduledAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, 'USER', $2, $3, 'EMAIL', 'x@clinic.org', 'STAFF_INVITE_V1', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [CLINIC_A, recipientUserId, staffInviteId],
      );
    }

    // The invitee may have no User row yet, so the invitation itself is the recipient.
    it('accepts a staff invitation addressed through the invite alone', async () => {
      const inviteId = await insertInvite();
      await expect(insertReminder(inviteId, null)).resolves.toBeUndefined();
    });

    it('still refuses a USER notice addressed to nobody', async () => {
      await expect(insertReminder(null, null)).rejects.toThrow(/Reminder_recipient_identity_check/);
    });
  });

  describe('row level security', () => {
    async function asApplication<T>(clinicIds: string[], run: () => Promise<T>): Promise<T> {
      await target.query('BEGIN');
      try {
        await target.query('SET LOCAL ROLE nkwapa_app');
        await target.query(`SELECT set_config('app.current_clinic_ids', $1, true)`, [
          clinicIds.join(','),
        ]);
        await target.query(`SELECT set_config('app.is_system_admin', 'false', true)`);
        return await run();
      } finally {
        await target.query('ROLLBACK');
      }
    }

    it('shows a clinic its own invitations and nobody else’s', async () => {
      await insertInvite({ clinicId: CLINIC_B, email: 'only-b@clinic.org' });

      const seenFromA = await asApplication([CLINIC_A], () =>
        target.query(`SELECT "clinicId" FROM "StaffInvite"`),
      );
      expect(seenFromA.rows.length).toBeGreaterThan(0);
      expect(seenFromA.rows.every((row) => row.clinicId === CLINIC_A)).toBe(true);
    });

    it('refuses to write an invitation into a clinic outside the context', async () => {
      await expect(
        asApplication([CLINIC_A], () =>
          target.query(
            `INSERT INTO "StaffInvite" ("id", "clinicId", "email", "role", "createdByUserId", "expiresAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, 'sneaky@clinic.org', 'DOCTOR', $2, CURRENT_TIMESTAMP + interval '1 day', CURRENT_TIMESTAMP)`,
            [CLINIC_B, DIRECTOR],
          ),
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });
});
