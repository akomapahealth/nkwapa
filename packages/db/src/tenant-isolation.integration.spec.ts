import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import {
  TENANT_CLINICS,
  TENANT_PATIENTS,
  TENANT_SYSTEM_ADMIN,
  tenantFixtureSql,
} from './testing/tenant-fixture';

/**
 * Proof that clinic and organization isolation is enforced by PostgreSQL, not only by application
 * code, for the tables the clinical-records initiative added.
 *
 * The suite connects as the unprivileged application role rather than the owner. That distinction
 * is the whole point: policies were declared on every table long before they applied to anything,
 * because the owner is exempt from its own policies unless the table is FORCEd, and the role the
 * API used also held SUPERUSER and BYPASSRLS.
 */
const describeIsolation = process.env.RUN_TENANT_ISOLATION_TESTS === '1' ? describe : describe.skip;

function databaseUrl(source: string, database: string): string {
  const url = new URL(source);
  url.pathname = `/${database}`;
  return url.toString();
}

/** Every table the initiative added, with the column its policy scopes on. */
const CLINICAL_TABLES = [
  'Vitals',
  'TobaccoScreening',
  'DiabetesScreening',
  'MedicalHistoryRecord',
  'PatientMedicationRecord',
  'PatientPharmacyRecord',
  'ClinicalNote',
] as const;

describeIsolation('tenant isolation', () => {
  jest.setTimeout(180_000);

  const sourceUrl = process.env.DATABASE_URL;
  const appUrl = process.env.APP_DATABASE_URL;
  const database = `nkwapa_isolation_${Date.now()}`;

  let owner: Client;
  let app: Client;

  beforeAll(async () => {
    if (!sourceUrl) throw new Error('DATABASE_URL is required');
    if (!appUrl) throw new Error('APP_DATABASE_URL is required');

    const admin = new Client({ connectionString: databaseUrl(sourceUrl, 'postgres') });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);
    await admin.end();

    owner = new Client({ connectionString: databaseUrl(sourceUrl, database) });
    await owner.connect();

    const migrationsRoot = resolve(__dirname, '../prisma/migrations');
    const migrations = (await readdir(migrationsRoot)).filter((name) => /^\d/.test(name)).sort();
    for (const migration of migrations) {
      await owner.query(
        await readFile(resolve(migrationsRoot, migration, 'migration.sql'), 'utf8'),
      );
    }

    await owner.query(tenantFixtureSql());
    await owner.query(`
      INSERT INTO "Encounter" ("id", "clinicId", "patientId", "createdByUserId", "updatedAt")
      VALUES
        ('99000000-0000-4000-8000-0000000000a1', '${TENANT_CLINICS.a1.id}', '${TENANT_PATIENTS.a1Primary.id}', 'cc000000-0000-4000-8000-000000000003', CURRENT_TIMESTAMP),
        ('99000000-0000-4000-8000-0000000000b1', '${TENANT_CLINICS.b1.id}', '${TENANT_PATIENTS.b1Primary.id}', 'cc000000-0000-4000-8000-000000000023', CURRENT_TIMESTAMP);
      INSERT INTO "Vitals" ("id", "clinicId", "encounterId", "updatedAt")
      VALUES
        ('99000000-0000-4000-8000-0000000000a2', '${TENANT_CLINICS.a1.id}', '99000000-0000-4000-8000-0000000000a1', CURRENT_TIMESTAMP),
        ('99000000-0000-4000-8000-0000000000b2', '${TENANT_CLINICS.b1.id}', '99000000-0000-4000-8000-0000000000b1', CURRENT_TIMESTAMP);
      INSERT INTO "PatientDuplicateReview"
        ("id", "clinicId", "pairKey", "patientAId", "patientBId", "status", "reviewedByUserId", "updatedAt")
      VALUES
        ('99000000-0000-4000-8000-0000000000d1', '${TENANT_CLINICS.a1.id}', 'a1-local-pair',
         '${TENANT_PATIENTS.a1Primary.id}', '${TENANT_PATIENTS.a1Secondary.id}', 'DISMISSED',
         '${TENANT_SYSTEM_ADMIN.id}', CURRENT_TIMESTAMP),
        ('99000000-0000-4000-8000-0000000000d2', NULL, 'cross-clinic-pair',
         '${TENANT_PATIENTS.a1Primary.id}', '${TENANT_PATIENTS.b1Primary.id}', 'OPEN',
         '${TENANT_SYSTEM_ADMIN.id}', CURRENT_TIMESTAMP);
    `);

    app = new Client({ connectionString: databaseUrl(appUrl, database) });
    await app.connect();
  });

  afterAll(async () => {
    await app?.end().catch(() => {});
    await owner?.end().catch(() => {});
    if (!sourceUrl) return;
    const admin = new Client({ connectionString: databaseUrl(sourceUrl, 'postgres') });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
  });

  async function asClinic<T>(clinicIds: string[], run: () => Promise<T>): Promise<T> {
    await app.query('BEGIN');
    await app.query(`SELECT set_config('app.current_clinic_ids', $1, true)`, [clinicIds.join(',')]);
    await app.query(`SELECT set_config('app.is_system_admin', 'false', true)`);
    try {
      return await run();
    } finally {
      await app.query('ROLLBACK');
    }
  }

  async function asSystemAdmin<T>(run: () => Promise<T>): Promise<T> {
    await app.query('BEGIN');
    await app.query(`SELECT set_config('app.current_clinic_ids', '', true)`);
    await app.query(`SELECT set_config('app.is_system_admin', 'true', true)`);
    try {
      return await run();
    } finally {
      await app.query('ROLLBACK');
    }
  }

  const countIn = async (table: string) =>
    Number((await app.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n);

  it('connects as a role that cannot bypass the policies', async () => {
    const { rows } = await app.query(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
    );
    expect(rows[0].rolsuper).toBe(false);
    expect(rows[0].rolbypassrls).toBe(false);
  });

  it('returns nothing at all without a clinic context', async () => {
    await asClinic([], async () => {
      for (const table of ['Patient', ...CLINICAL_TABLES]) {
        expect(await countIn(table)).toBe(0);
      }
    });
  });

  it('hides another organization entirely', async () => {
    await asClinic([TENANT_CLINICS.a1.id], async () => {
      const { rows } = await app.query('SELECT id, "primaryClinicId" FROM "Patient"');

      // The fixture seats two patients at A1 and one each at A2 and B1.
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.primaryClinicId === TENANT_CLINICS.a1.id)).toBe(true);
      expect(rows.map((row) => row.id)).not.toContain(TENANT_PATIENTS.b1Primary.id);
      expect(await countIn('Vitals')).toBe(1);
    });
  });

  it('hides another clinic inside the same organization', async () => {
    await asClinic([TENANT_CLINICS.a1.id], async () => {
      const { rows } = await app.query('SELECT id FROM "Patient" WHERE id = $1', [
        TENANT_PATIENTS.a2Primary.id,
      ]);
      expect(rows).toHaveLength(0);
    });
  });

  it('refuses to write a row into a clinic outside the context', async () => {
    await expect(
      asClinic([TENANT_CLINICS.a1.id], async () =>
        app.query(
          `INSERT INTO "Encounter" ("id", "clinicId", "patientId", "createdByUserId", "updatedAt")
           VALUES ('99000000-0000-4000-8000-0000000000c1', $1, $2, $3, CURRENT_TIMESTAMP)`,
          [
            TENANT_CLINICS.b1.id,
            TENANT_PATIENTS.b1Primary.id,
            'cc000000-0000-4000-8000-000000000003',
          ],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('keeps clinical note content out of reach without an active clinical role', async () => {
    // The note policy asks for a doctor or volunteer seat at the clinic, not merely clinic access.
    await asClinic([TENANT_CLINICS.a1.id], async () => {
      expect(await countIn('ClinicalNote')).toBe(0);
    });
  });

  it('grants exactly the clinics named in the context and no more', async () => {
    await asClinic([TENANT_CLINICS.a1.id, TENANT_CLINICS.a2.id], async () => {
      expect(await countIn('Patient')).toBe(3);
    });
  });

  /*
    Duplicate review decisions carry a nullable clinic, which is a boundary the other tables in
    this suite do not exercise. A pair whose two charts sit in different clinics belongs to
    neither, so its decision is stored unowned and must be readable only by a system admin --
    the same people who can see both charts in the first place.
  */
  describe('duplicate review decisions', () => {
    it('shows a clinic only its own decisions, never an unowned one', async () => {
      await asClinic([TENANT_CLINICS.a1.id], async () => {
        const { rows } = await app.query('SELECT "pairKey" FROM "PatientDuplicateReview"');
        expect(rows.map((row) => row.pairKey)).toEqual(['a1-local-pair']);
      });
    });

    it("hides another clinic's decisions entirely", async () => {
      await asClinic([TENANT_CLINICS.a2.id], async () => {
        expect(await countIn('PatientDuplicateReview')).toBe(0);
      });
    });

    it('returns nothing without a clinic context', async () => {
      await asClinic([], async () => {
        expect(await countIn('PatientDuplicateReview')).toBe(0);
      });
    });

    it('lets a system admin see the cross-clinic decision', async () => {
      await asSystemAdmin(async () => {
        const { rows } = await app.query(
          'SELECT "pairKey" FROM "PatientDuplicateReview" ORDER BY "pairKey"',
        );
        expect(rows.map((row) => row.pairKey)).toEqual(['a1-local-pair', 'cross-clinic-pair']);
      });
    });

    it('refuses to record a decision for a clinic outside the context', async () => {
      await expect(
        asClinic([TENANT_CLINICS.a1.id], async () =>
          app.query(
            `INSERT INTO "PatientDuplicateReview"
               ("id", "clinicId", "pairKey", "patientAId", "patientBId", "reviewedByUserId", "updatedAt")
             VALUES ('99000000-0000-4000-8000-0000000000d3', $1, 'b1-pair', $2, $2, $3, CURRENT_TIMESTAMP)`,
            [TENANT_CLINICS.b1.id, TENANT_PATIENTS.b1Primary.id, TENANT_SYSTEM_ADMIN.id],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('refuses to record an unowned decision without system admin', async () => {
      await expect(
        asClinic([TENANT_CLINICS.a1.id], async () =>
          app.query(
            `INSERT INTO "PatientDuplicateReview"
               ("id", "clinicId", "pairKey", "patientAId", "patientBId", "reviewedByUserId", "updatedAt")
             VALUES ('99000000-0000-4000-8000-0000000000d4', NULL, 'sneaky-pair', $1, $1, $2, CURRENT_TIMESTAMP)`,
            [TENANT_PATIENTS.a1Primary.id, TENANT_SYSTEM_ADMIN.id],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });
});
