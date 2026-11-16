import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';

const describeMigration =
  process.env.RUN_MIDDLE_NAME_MIGRATION_TESTS === '1' ? describe : describe.skip;

const MIDDLE_NAME_MIGRATION = '20261115120000_middle_names';

function databaseUrl(source: string, database: string): string {
  const url = new URL(source);
  url.pathname = `/${database}`;
  return url.toString();
}

const WITH_INITIAL = '76000000-0000-4000-8000-000000000001';
const WITHOUT = '76000000-0000-4000-8000-000000000002';
const INVITE = '76000000-0000-4000-8000-000000000003';

/** Middle names (#342): staff initials survive the rename, and nothing else is rewritten. */
describeMigration('middle names migration', () => {
  jest.setTimeout(120_000);

  let admin: Client;
  let target: Client;
  let database: string;

  beforeAll(async () => {
    const sourceUrl = process.env.DATABASE_URL;
    if (!sourceUrl) throw new Error('DATABASE_URL is required');

    database = `nkwapa_middle_names_${Date.now()}`;
    admin = new Client({ connectionString: databaseUrl(sourceUrl, 'postgres') });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);

    target = new Client({ connectionString: databaseUrl(sourceUrl, database) });
    await target.connect();
    const migrationsRoot = resolve(__dirname, '../prisma/migrations');
    const migrations = (await readdir(migrationsRoot)).filter((name) => /^\d/.test(name)).sort();
    for (const migration of migrations.filter((name) => name < MIDDLE_NAME_MIGRATION)) {
      await target.query(
        await readFile(resolve(migrationsRoot, migration, 'migration.sql'), 'utf8'),
      );
    }

    await target.query(
      `INSERT INTO "User" ("id", "keycloakSub", "displayName", "firstName", "middleInitial", "lastName", "updatedAt") VALUES
        ($1, 'middle-k', 'Ama K. Mensah', 'Ama', 'K', 'Mensah', CURRENT_TIMESTAMP),
        ($2, 'middle-none', 'Kofi Boateng', 'Kofi', NULL, 'Boateng', CURRENT_TIMESTAMP)`,
      [WITH_INITIAL, WITHOUT],
    );
    const { rows } = await target.query(
      `INSERT INTO "Clinic" ("id", "name", "organizationId", "timezone", "countryCode", "locationCode", "updatedAt")
       SELECT gen_random_uuid(), 'Middle names', "id", 'Africa/Accra', 'GH', 'middle-names', CURRENT_TIMESTAMP
       FROM "Organization" LIMIT 1 RETURNING "id"`,
    );
    await target.query(
      `INSERT INTO "StaffInvite" ("id", "clinicId", "email", "role", "firstName", "middleInitial", "lastName", "createdByUserId", "expiresAt", "updatedAt")
       VALUES ($1, $2, 'invitee@clinic.org', 'VOLUNTEER', 'Esi', 'A', 'Owusu', $3, CURRENT_TIMESTAMP + interval '3 days', CURRENT_TIMESTAMP)`,
      [INVITE, rows[0].id, WITH_INITIAL],
    );

    const sql = await readFile(
      resolve(migrationsRoot, MIDDLE_NAME_MIGRATION, 'migration.sql'),
      'utf8',
    );
    await target.query(sql);
    // A retried deploy must land in the same place.
    await target.query(sql);
  });

  afterAll(async () => {
    await target?.end();
    await admin?.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin?.end();
  });

  it('keeps each staff initial as it was, under the new name', async () => {
    const { rows } = await target.query(
      `SELECT "id", "middleName", "displayName" FROM "User" WHERE "id" IN ($1, $2) ORDER BY "id"`,
      [WITH_INITIAL, WITHOUT],
    );
    expect(rows).toEqual([
      { id: WITH_INITIAL, middleName: 'K', displayName: 'Ama K. Mensah' },
      { id: WITHOUT, middleName: null, displayName: 'Kofi Boateng' },
    ]);
    const invite = await target.query(`SELECT "middleName" FROM "StaffInvite" WHERE "id" = $1`, [
      INVITE,
    ]);
    expect(invite.rows[0].middleName).toBe('A');
  });

  it('widens the columns to 120 characters and adds an empty patient middle name', async () => {
    const { rows } = await target.query(
      `SELECT table_name, character_maximum_length, is_nullable FROM information_schema.columns
       WHERE table_schema = current_schema() AND column_name = 'middleName' ORDER BY table_name`,
    );
    expect(rows).toEqual([
      { table_name: 'Patient', character_maximum_length: 120, is_nullable: 'YES' },
      { table_name: 'StaffInvite', character_maximum_length: 120, is_nullable: 'YES' },
      { table_name: 'User', character_maximum_length: 120, is_nullable: 'YES' },
    ]);
    const old = await target.query(
      `SELECT count(*)::int AS n FROM information_schema.columns
       WHERE table_schema = current_schema() AND column_name = 'middleInitial'`,
    );
    expect(old.rows[0].n).toBe(0);
  });
});
