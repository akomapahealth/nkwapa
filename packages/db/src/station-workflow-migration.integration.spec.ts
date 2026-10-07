import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { DEFAULT_CLINIC_STATIONS } from './clinic-stations';

const describeMigration =
  process.env.RUN_STATION_WORKFLOW_MIGRATION_TESTS === '1' ? describe : describe.skip;

const STATION_MIGRATION = '20261007120000_station_workflow';

function databaseUrl(source: string, database: string): string {
  const url = new URL(source);
  url.pathname = `/${database}`;
  return url.toString();
}

const CLINIC_A = '73000000-0000-4000-8000-00000000000a';
const CLINIC_B = '73000000-0000-4000-8000-00000000000b';
const VOLUNTEER_1 = '73000000-0000-4000-8000-000000000001';
const VOLUNTEER_2 = '73000000-0000-4000-8000-000000000002';
const PATIENT = '73000000-0000-4000-8000-000000000003';
const CHECK_IN = '73000000-0000-4000-8000-000000000004';

/**
 * What the database holds on its own for the station line (#167), whatever the service remembers.
 *
 * - Clinics that existed before the migration get the default station line.
 * - A patient is open at one station at a time.
 * - Two volunteers claiming the same patient at the same moment: exactly one wins.
 * - A claimed visit always names its holder.
 * - One active review station per clinic.
 * - Row-level security keeps one clinic's line invisible to another.
 */
describeMigration('station workflow database safeguards', () => {
  jest.setTimeout(120_000);

  let admin: Client;
  let target: Client;
  let racer: Client;
  let database: string;
  let stations: Record<string, string>;

  beforeAll(async () => {
    const sourceUrl = process.env.DATABASE_URL;
    if (!sourceUrl) throw new Error('DATABASE_URL is required');

    database = `nkwapa_station_workflow_${Date.now()}`;
    admin = new Client({ connectionString: databaseUrl(sourceUrl, 'postgres') });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);

    target = new Client({ connectionString: databaseUrl(sourceUrl, database) });
    await target.connect();
    const migrationsRoot = resolve(__dirname, '../prisma/migrations');
    const migrations = (await readdir(migrationsRoot)).filter((name) => /^\d/.test(name)).sort();
    const apply = async (name: string) =>
      target.query(await readFile(resolve(migrationsRoot, name, 'migration.sql'), 'utf8'));

    // Everything before the station migration, then a clinic, then the rest: the clinic must be
    // backfilled with the default line.
    for (const migration of migrations.filter((name) => name < STATION_MIGRATION)) {
      await apply(migration);
    }
    await target.query(`
      INSERT INTO "Clinic" ("id", "name", "organizationId", "timezone", "locationCode", "updatedAt")
      SELECT '${CLINIC_A}', 'Station Clinic A', "id", 'Africa/Accra', 'station-a', CURRENT_TIMESTAMP
      FROM "Organization" LIMIT 1;
    `);
    for (const migration of migrations.filter((name) => name >= STATION_MIGRATION)) {
      await apply(migration);
    }

    await target.query(`
      INSERT INTO "Clinic" ("id", "name", "organizationId", "timezone", "locationCode", "updatedAt")
      SELECT '${CLINIC_B}', 'Station Clinic B', "id", 'Africa/Accra', 'station-b', CURRENT_TIMESTAMP
      FROM "Organization" LIMIT 1;
      INSERT INTO "User" ("id", "keycloakSub", "displayName", "updatedAt") VALUES
        ('${VOLUNTEER_1}', 'station-vol-1', 'Volunteer One', CURRENT_TIMESTAMP),
        ('${VOLUNTEER_2}', 'station-vol-2', 'Volunteer Two', CURRENT_TIMESTAMP);
      INSERT INTO "Patient" ("id", "patientCode", "primaryClinicId", "firstName", "lastName", "nationalIdType", "nationalIdCiphertext", "nationalIdHash", "updatedAt") VALUES
        ('${PATIENT}', 'NKP-STATION-1', '${CLINIC_A}', 'Station', 'Patient', 'OTHER', 'encrypted', 'station-hash', CURRENT_TIMESTAMP);
      INSERT INTO "PatientCheckIn" ("id", "clinicId", "patientId", "checkedInAt", "updatedAt") VALUES
        ('${CHECK_IN}', '${CLINIC_A}', '${PATIENT}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    `);

    const rows = await target.query<{ id: string; kind: string }>(
      `SELECT "id", "kind" FROM "ClinicStation" WHERE "clinicId" = $1`,
      [CLINIC_A],
    );
    stations = Object.fromEntries(rows.rows.map((row) => [row.kind, row.id]));

    racer = new Client({ connectionString: databaseUrl(sourceUrl, database) });
    await racer.connect();
  });

  afterAll(async () => {
    await racer?.end();
    await target?.end();
    await admin?.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin?.end();
  });

  afterEach(async () => {
    await target.query(`DELETE FROM "PatientStationVisit"`);
  });

  let sequence = 0;
  async function queue(stationKind = 'BLOOD_PRESSURE', status = 'QUEUED') {
    sequence += 1;
    const id = `73000000-0000-4000-8000-${String(100 + sequence).padStart(12, '0')}`;
    await target.query(
      `INSERT INTO "PatientStationVisit"
        ("id", "clinicId", "patientCheckInId", "stationId", "status", "queuedAt", "queuedByUserId", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, CURRENT_TIMESTAMP)`,
      [id, CLINIC_A, CHECK_IN, stations[stationKind], status, VOLUNTEER_1],
    );
    return id;
  }

  it('gives a clinic that existed before the migration the default station line', async () => {
    const rows = await target.query<{ kind: string; sortOrder: number }>(
      `SELECT "kind", "sortOrder" FROM "ClinicStation" WHERE "clinicId" = $1 ORDER BY "sortOrder"`,
      [CLINIC_A],
    );
    expect(rows.rows).toEqual(
      DEFAULT_CLINIC_STATIONS.map(({ kind, sortOrder }) => ({ kind, sortOrder })),
    );
  });

  it('keeps a patient open at one station at a time', async () => {
    await queue('BLOOD_PRESSURE');
    await expect(queue('GLUCOSE')).rejects.toMatchObject({ code: '23505' });
    // A finished stop does not block the next one.
    await target.query(`UPDATE "PatientStationVisit" SET "status" = 'COMPLETED'`);
    await expect(queue('GLUCOSE')).resolves.toEqual(expect.any(String));
  });

  it('lets exactly one of two simultaneous claims through', async () => {
    const visitId = await queue();
    const claim = (client: Client, userId: string) =>
      client.query(
        `UPDATE "PatientStationVisit"
         SET "status" = 'IN_PROGRESS', "claimedByUserId" = $2, "claimedAt" = CURRENT_TIMESTAMP
         WHERE "id" = $1 AND "status" = 'QUEUED'`,
        [visitId, userId],
      );

    await target.query('BEGIN');
    const first = await claim(target, VOLUNTEER_1);
    // The second claim blocks on the row lock until the first commits, then re-checks the status.
    const secondPending = claim(racer, VOLUNTEER_2);
    await target.query('COMMIT');
    const second = await secondPending;

    expect([first.rowCount, second.rowCount].sort()).toEqual([0, 1]);
    const holder = await target.query(
      `SELECT "claimedByUserId" FROM "PatientStationVisit" WHERE "id" = $1`,
      [visitId],
    );
    expect(holder.rows[0].claimedByUserId).toBe(VOLUNTEER_1);
  });

  it('refuses a claimed visit that names no holder', async () => {
    await expect(queue('BLOOD_PRESSURE', 'IN_PROGRESS')).rejects.toMatchObject({ code: '23514' });
  });

  it('allows one active review station per clinic', async () => {
    await expect(
      target.query(
        `INSERT INTO "ClinicStation" ("id", "clinicId", "kind", "name", "sortOrder", "updatedAt")
         VALUES (gen_random_uuid(), $1, 'REVIEW', 'Second review', 99, CURRENT_TIMESTAMP)`,
        [CLINIC_A],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it("hides one clinic's station line from another", async () => {
    await queue();
    const visible = async (clinicId: string) => {
      await target.query('BEGIN');
      try {
        await target.query('SET LOCAL ROLE nkwapa_app');
        await target.query(`SELECT set_config('app.current_clinic_ids', $1, true)`, [
          `{${clinicId}}`,
        ]);
        await target.query(`SELECT set_config('app.is_system_admin', 'false', true)`);
        const visits = await target.query(`SELECT "id" FROM "PatientStationVisit"`);
        const stationRows = await target.query(`SELECT "id" FROM "ClinicStation"`);
        return { visits: visits.rowCount, stations: stationRows.rowCount };
      } finally {
        await target.query('ROLLBACK');
      }
    };

    await expect(visible(CLINIC_A)).resolves.toEqual({ visits: 1, stations: 5 });
    await expect(visible(CLINIC_B)).resolves.toEqual({ visits: 0, stations: 0 });
  });
});
