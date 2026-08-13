import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';

const describeMigration =
  process.env.RUN_CLINICAL_NOTES_MIGRATION_TESTS === '1' ? describe : describe.skip;

function databaseUrl(source: string, database: string): string {
  const url = new URL(source);
  url.pathname = `/${database}`;
  return url.toString();
}

describeMigration('clinical notes database safeguards', () => {
  jest.setTimeout(120_000);

  it('rejects signed-note mutation and addendum updates or deletes', async () => {
    const sourceUrl = process.env.DATABASE_URL;
    if (!sourceUrl) throw new Error('DATABASE_URL is required');

    const database = `nkwapa_clinical_notes_${Date.now()}`;
    const admin = new Client({ connectionString: databaseUrl(sourceUrl, 'postgres') });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);

    const target = new Client({ connectionString: databaseUrl(sourceUrl, database) });
    try {
      await target.connect();
      const migrationsRoot = resolve(__dirname, '../prisma/migrations');
      const targetMigration = '20260813090000_add_clinical_notes';
      const migrations = (await readdir(migrationsRoot))
        .filter((name) => /^\d/.test(name) && name !== targetMigration)
        .sort();
      for (const migration of migrations) {
        await target.query(
          await readFile(resolve(migrationsRoot, migration, 'migration.sql'), 'utf8'),
        );
      }
      await target.query(
        await readFile(resolve(migrationsRoot, targetMigration, 'migration.sql'), 'utf8'),
      );

      await target.query(`
        INSERT INTO "Clinic" ("id", "name", "organizationId", "timezone", "locationCode", "updatedAt")
        SELECT '71000000-0000-4000-8000-000000000001', 'Notes Clinic', "id", 'Africa/Accra', 'notes', CURRENT_TIMESTAMP
        FROM "Organization" LIMIT 1;
        INSERT INTO "User" ("id", "keycloakSub", "displayName", "updatedAt") VALUES
          ('71000000-0000-4000-8000-000000000002', 'notes-doctor', 'Notes Doctor', CURRENT_TIMESTAMP);
        INSERT INTO "UserClinicRole" ("id", "userId", "clinicId", "role") VALUES
          ('71000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000001', 'DOCTOR');
        INSERT INTO "Patient" ("id", "patientCode", "primaryClinicId", "firstName", "lastName", "nationalIdType", "nationalIdCiphertext", "nationalIdHash", "updatedAt") VALUES
          ('71000000-0000-4000-8000-000000000004', 'NKP-NOTE-1', '71000000-0000-4000-8000-000000000001', 'Clinical', 'Note', 'OTHER', 'encrypted', 'clinical-note-hash', CURRENT_TIMESTAMP);
        INSERT INTO "Encounter" ("id", "clinicId", "patientId", "createdByUserId", "updatedAt") VALUES
          ('71000000-0000-4000-8000-000000000005', '71000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000004', '71000000-0000-4000-8000-000000000002', CURRENT_TIMESTAMP);
        INSERT INTO "ClinicalNote" (
          "id", "clinicId", "patientId", "encounterId", "status", "history", "assessment", "plan",
          "signedHistory", "signedAssessment", "signedPlan", "signedContentHash", "authorUserId", "authorRole",
          "submittedByUserId", "submittedAt", "cosignedByUserId", "cosignedAt", "updatedAt"
        ) VALUES (
          '71000000-0000-4000-8000-000000000006', '71000000-0000-4000-8000-000000000001',
          '71000000-0000-4000-8000-000000000004', '71000000-0000-4000-8000-000000000005', 'COSIGNED',
          'History', 'Assessment', 'Plan', 'History', 'Assessment', 'Plan', repeat('a', 64),
          '71000000-0000-4000-8000-000000000002', 'DOCTOR', '71000000-0000-4000-8000-000000000002',
          CURRENT_TIMESTAMP, '71000000-0000-4000-8000-000000000002', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        );
        INSERT INTO "ClinicalNoteAddendum" ("id", "clinicId", "clinicalNoteId", "authorUserId", "reason", "content") VALUES (
          '71000000-0000-4000-8000-000000000007', '71000000-0000-4000-8000-000000000001',
          '71000000-0000-4000-8000-000000000006', '71000000-0000-4000-8000-000000000002', 'Correction', 'Clarified plan'
        );
      `);

      await expect(
        target.query(
          `UPDATE "ClinicalNote" SET "signedPlan" = 'rewritten' WHERE "id" = '71000000-0000-4000-8000-000000000006'`,
        ),
      ).rejects.toMatchObject({ code: '55000' });
      await expect(
        target.query(
          `DELETE FROM "ClinicalNote" WHERE "id" = '71000000-0000-4000-8000-000000000006'`,
        ),
      ).rejects.toMatchObject({ code: '55000' });
      await expect(
        target.query(
          `UPDATE "ClinicalNoteAddendum" SET "content" = 'rewritten' WHERE "id" = '71000000-0000-4000-8000-000000000007'`,
        ),
      ).rejects.toMatchObject({ code: '55000' });
      await expect(
        target.query(
          `DELETE FROM "ClinicalNoteAddendum" WHERE "id" = '71000000-0000-4000-8000-000000000007'`,
        ),
      ).rejects.toMatchObject({ code: '55000' });
    } finally {
      await target.end().catch(() => undefined);
      await admin.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
        [database],
      );
      await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
      await admin.end();
    }
  });
});
