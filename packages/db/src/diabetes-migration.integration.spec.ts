import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';

const TARGET_MIGRATION = '20260812000000_promote_diabetes_screening';
const describeMigration =
  process.env.RUN_DIABETES_MIGRATION_TESTS === '1' ? describe : describe.skip;

function databaseUrl(source: string, database: string): string {
  const url = new URL(source);
  url.pathname = `/${database}`;
  return url.toString();
}

describeMigration('diabetes screening legacy database migration', () => {
  jest.setTimeout(120_000);

  it('preserves legacy symptoms, backfills provenance, and enforces measurement bounds', async () => {
    const sourceUrl = process.env.DATABASE_URL;
    if (!sourceUrl) throw new Error('DATABASE_URL is required for migration integration tests');

    const database = `nkwapa_diabetes_${process.pid}_${Date.now()}`;
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
            '10000000-0000-4000-8000-000000000001', 'Diabetes Migration Clinic', "id",
            'Africa/Accra', 'diabetes-migration', CURRENT_TIMESTAMP
          FROM "Organization" WHERE "slug" = 'default';

          INSERT INTO "User" (
            "id", "keycloakSub", "displayName", "firstName", "lastName", "updatedAt"
          ) VALUES (
            '10000000-0000-4000-8000-000000000002', 'diabetes-migration-user',
            'Migration Author', 'Migration', 'Author', CURRENT_TIMESTAMP
          );

          INSERT INTO "Patient" (
            "id", "patientCode", "primaryClinicId", "firstName", "lastName",
            "nationalIdType", "nationalIdCiphertext", "nationalIdHash", "updatedAt"
          ) VALUES (
            '10000000-0000-4000-8000-000000000003', 'NKP-DIABETES-1',
            '10000000-0000-4000-8000-000000000001', 'Legacy', 'Diabetes',
            'OTHER', 'encrypted', 'diabetes-migration-hash', CURRENT_TIMESTAMP
          );

          INSERT INTO "Encounter" (
            "id", "clinicId", "patientId", "createdByUserId", "createdAt", "updatedAt"
          ) VALUES
            ('10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '2026-08-01T10:00:00Z', CURRENT_TIMESTAMP),
            ('10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '2026-08-02T10:00:00Z', CURRENT_TIMESTAMP),
            ('10000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '2026-08-03T10:00:00Z', CURRENT_TIMESTAMP);

          INSERT INTO "DiabetesScreening" (
            "id", "clinicId", "encounterId", "symptomsJson", "createdAt", "updatedAt"
          ) VALUES
            ('10000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000010', '["Polyuria","Fatigue"]', '2026-08-01T10:05:00Z', CURRENT_TIMESTAMP),
            ('10000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000011', '{broken', '2026-08-02T10:05:00Z', CURRENT_TIMESTAMP),
            ('10000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000012', '["Polydipsia","Other"]', '2026-08-03T10:05:00Z', CURRENT_TIMESTAMP);
        `);

        const migrationSql = await readFile(
          resolve(migrationsRoot, TARGET_MIGRATION, 'migration.sql'),
          'utf8',
        );
        await target.query(migrationSql);

        const rows = await target.query<{
          id: string;
          symptoms: string;
          legacySymptomsUnmapped: boolean;
          collectedAt: Date;
          createdAt: Date;
          authoredByUserId: string;
          symptomsJson: string;
        }>(`
          SELECT "id", "symptoms"::TEXT AS symptoms, "legacySymptomsUnmapped", "collectedAt", "createdAt",
                 "authoredByUserId", "symptomsJson"
          FROM "DiabetesScreening" ORDER BY "id"
        `);

        expect(rows.rows[0]).toMatchObject({
          symptoms: '{POLYURIA,FATIGUE}',
          legacySymptomsUnmapped: false,
          authoredByUserId: '10000000-0000-4000-8000-000000000002',
          symptomsJson: '["Polyuria","Fatigue"]',
        });
        expect(rows.rows[0]?.collectedAt.toISOString()).toBe(rows.rows[0]?.createdAt.toISOString());
        expect(rows.rows[1]).toMatchObject({ symptoms: '{}', legacySymptomsUnmapped: true });
        expect(rows.rows[2]).toMatchObject({
          symptoms: '{POLYDIPSIA}',
          legacySymptomsUnmapped: true,
        });

        await expect(
          target.query('UPDATE "DiabetesScreening" SET "glucoseMgDl" = 601 WHERE "id" = $1', [
            '10000000-0000-4000-8000-000000000020',
          ]),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
          target.query('UPDATE "DiabetesScreening" SET "hba1cPercent" = 101 WHERE "id" = $1', [
            '10000000-0000-4000-8000-000000000020',
          ]),
        ).rejects.toMatchObject({ code: '23514' });
      } finally {
        await target.end().catch(() => undefined);
      }
    } finally {
      await admin.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
        [database],
      );
      await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
      await admin.end();
    }
  });
});
