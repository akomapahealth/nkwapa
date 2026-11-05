import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { defaultUnitsForCountry } from './measurement-units';

const describeMigration =
  process.env.RUN_MEASUREMENT_UNITS_MIGRATION_TESTS === '1' ? describe : describe.skip;

const UNITS_MIGRATION = '20261105130000_clinic_measurement_units';

function databaseUrl(source: string, database: string): string {
  const url = new URL(source);
  url.pathname = `/${database}`;
  return url.toString();
}

const CLINICS: Record<string, string> = {
  GH: '75000000-0000-4000-8000-000000000001',
  US: '75000000-0000-4000-8000-000000000002',
  in: '75000000-0000-4000-8000-000000000003',
  LR: '75000000-0000-4000-8000-000000000004',
  GB: '75000000-0000-4000-8000-000000000005',
};

/** Clinic measurement units: existing clinics get their country's defaults, and nothing else moves. */
describeMigration('clinic measurement units backfill', () => {
  jest.setTimeout(120_000);

  let admin: Client;
  let target: Client;
  let database: string;

  beforeAll(async () => {
    const sourceUrl = process.env.DATABASE_URL;
    if (!sourceUrl) throw new Error('DATABASE_URL is required');

    database = `nkwapa_measurement_units_${Date.now()}`;
    admin = new Client({ connectionString: databaseUrl(sourceUrl, 'postgres') });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);

    target = new Client({ connectionString: databaseUrl(sourceUrl, database) });
    await target.connect();
    const migrationsRoot = resolve(__dirname, '../prisma/migrations');
    const migrations = (await readdir(migrationsRoot)).filter((name) => /^\d/.test(name)).sort();
    for (const migration of migrations.filter((name) => name < UNITS_MIGRATION)) {
      await target.query(
        await readFile(resolve(migrationsRoot, migration, 'migration.sql'), 'utf8'),
      );
    }

    for (const [country, id] of Object.entries(CLINICS)) {
      await target.query(
        `INSERT INTO "Clinic" ("id", "name", "organizationId", "timezone", "countryCode", "locationCode", "updatedAt")
         SELECT $1, $2, "id", 'Africa/Accra', $3, $4, CURRENT_TIMESTAMP FROM "Organization" LIMIT 1`,
        [id, `Units ${country}`, country, `units-${country.toLowerCase()}`],
      );
    }

    const sql = await readFile(resolve(migrationsRoot, UNITS_MIGRATION, 'migration.sql'), 'utf8');
    await target.query(sql);
    // A retried deploy must land in the same place.
    await target.query(sql);
  });

  afterAll(async () => {
    await target?.end();
    await admin?.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin?.end();
  });

  it.each(Object.keys(CLINICS))('gives a %s clinic its country defaults', async (country) => {
    const { rows } = await target.query(
      `SELECT "glucoseUnit", "bodyUnit", "hba1cUnit" FROM "Clinic" WHERE "id" = $1`,
      [CLINICS[country]],
    );
    expect(rows[0]).toEqual(defaultUnitsForCountry(country));
  });

  it('defaults a clinic made after the migration to Ghana units', async () => {
    const { rows } = await target.query(`
      INSERT INTO "Clinic" ("id", "name", "organizationId", "timezone", "locationCode", "updatedAt")
      SELECT gen_random_uuid(), 'Later', "id", 'Africa/Accra', 'units-later', CURRENT_TIMESTAMP
      FROM "Organization" LIMIT 1
      RETURNING "glucoseUnit", "bodyUnit", "hba1cUnit"`);
    expect(rows[0]).toEqual(defaultUnitsForCountry('GH'));
  });
});
