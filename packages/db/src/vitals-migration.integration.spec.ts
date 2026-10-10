import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';

const TARGET_MIGRATION = '20260811000000_expand_vitals_and_tobacco_screening';
const describeMigration = process.env.RUN_MIGRATION_TESTS === '1' ? describe : describe.skip;

function databaseUrl(source: string, database: string): string {
  const url = new URL(source);
  url.pathname = `/${database}`;
  return url.toString();
}

describeMigration('expanded vitals legacy database migration', () => {
  jest.setTimeout(120_000);

  it('preserves populated legacy vitals and enforces checks for new rows', async () => {
    const sourceUrl = process.env.DATABASE_URL;
    if (!sourceUrl) throw new Error('DATABASE_URL is required for migration integration tests');

    const database = `nkwapa_vitals_${process.pid}_${Date.now()}`;
    const admin = new Client({ connectionString: databaseUrl(sourceUrl, 'postgres') });
    const target = new Client({ connectionString: databaseUrl(sourceUrl, database) });

    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE "${database}"`);
      await target.connect();
      try {
        const migrationsRoot = resolve(__dirname, '../prisma/migrations');
        const migrationNames = (await readdir(migrationsRoot))
          .filter((name) => /^\d/.test(name))
          .sort();
        const targetIndex = migrationNames.indexOf(TARGET_MIGRATION);
        expect(targetIndex).toBeGreaterThan(0);

        for (const migrationName of migrationNames.slice(0, targetIndex)) {
          const sql = await readFile(
            resolve(migrationsRoot, migrationName, 'migration.sql'),
            'utf8',
          );
          await target.query(sql);
        }

        await target.query(`
          INSERT INTO "Clinic" (
            "id", "name", "organizationId", "timezone", "locationCode", "updatedAt"
          ) SELECT
            '00000000-0000-4000-8000-000000000001',
            'Migration Clinic',
            "id",
            'Africa/Accra',
            'migration-clinic',
            CURRENT_TIMESTAMP
          FROM "Organization"
          WHERE "slug" = 'default';

          INSERT INTO "User" (
            "id", "keycloakSub", "displayName", "firstName", "lastName", "updatedAt"
          ) VALUES (
            '00000000-0000-4000-8000-000000000002',
            'migration-user',
            'Migration User',
            'Migration',
            'User',
            CURRENT_TIMESTAMP
          );

          INSERT INTO "Patient" (
            "id", "patientCode", "primaryClinicId", "firstName", "lastName",
            "nationalIdType", "nationalIdCiphertext", "nationalIdHash", "updatedAt"
          ) VALUES (
            '00000000-0000-4000-8000-000000000003',
            'NKP-MIGRATION-1',
            '00000000-0000-4000-8000-000000000001',
            'Legacy',
            'Patient',
            'OTHER',
            'encrypted',
            'migration-hash',
            CURRENT_TIMESTAMP
          );

          INSERT INTO "Encounter" (
            "id", "clinicId", "patientId", "createdByUserId", "updatedAt"
          ) VALUES (
            '00000000-0000-4000-8000-000000000004',
            '00000000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-000000000003',
            '00000000-0000-4000-8000-000000000002',
            CURRENT_TIMESTAMP
          );

          INSERT INTO "Vitals" (
            "id", "clinicId", "encounterId", "systolicBp", "heartRate", "bmi", "updatedAt"
          ) VALUES (
            '00000000-0000-4000-8000-000000000005',
            '00000000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-000000000004',
            120,
            72,
            -1,
            CURRENT_TIMESTAMP
          );
        `);

        const migrationSql = await readFile(
          resolve(migrationsRoot, TARGET_MIGRATION, 'migration.sql'),
          'utf8',
        );
        await target.query(migrationSql);

        const preserved = await target.query<{ pulseBpm: number }>(
          `SELECT "pulseBpm" FROM "Vitals" WHERE "id" = $1`,
          ['00000000-0000-4000-8000-000000000005'],
        );
        expect(preserved.rows).toEqual([{ pulseBpm: 72 }]);

        await target.query(`
          INSERT INTO "Encounter" (
            "id", "clinicId", "patientId", "createdByUserId", "updatedAt"
          ) VALUES (
            '00000000-0000-4000-8000-000000000006',
            '00000000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-000000000003',
            '00000000-0000-4000-8000-000000000002',
            CURRENT_TIMESTAMP
          );
        `);
        await expect(
          target.query(`
            INSERT INTO "Vitals" (
              "id", "clinicId", "encounterId", "pulseBpm", "updatedAt"
            ) VALUES (
              '00000000-0000-4000-8000-000000000007',
              '00000000-0000-4000-8000-000000000001',
              '00000000-0000-4000-8000-000000000006',
              10,
              CURRENT_TIMESTAMP
            );
          `),
        ).rejects.toMatchObject({ code: '23514' });
      } finally {
        await target.end().catch(() => undefined);
      }
    } finally {
      await admin.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`,
        [database],
      );
      await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
      await admin.end();
    }
  });
});
