import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { PRE_CLINICAL_RECORDS_WATERMARK } from './migration-watermarks';

/**
 * Migration rehearsal for the clinical-records initiative.
 *
 * The schema is rebuilt by replaying the repository's own migrations up to the point the
 * initiative starts, a synthetic pre-initiative dataset is loaded, and the remaining migrations
 * are then applied. That ordering is what makes this a rehearsal rather than a schema test: it
 * exercises the migrations against data that already existed, which is the only case that can
 * lose or corrupt anything.
 *
 * The dataset is fabricated. See prisma/testdata/legacy-pre-clinical-records.sql.
 */
const describeRehearsal = process.env.RUN_LEGACY_SNAPSHOT_TESTS === '1' ? describe : describe.skip;

function databaseUrl(source: string, database: string): string {
  const url = new URL(source);
  url.pathname = `/${database}`;
  return url.toString();
}

describeRehearsal('clinical records migration rehearsal', () => {
  jest.setTimeout(180_000);

  const sourceUrl = process.env.DATABASE_URL;
  const database = `nkwapa_legacy_${Date.now()}`;
  let client: Client;

  beforeAll(async () => {
    if (!sourceUrl) throw new Error('DATABASE_URL is required');

    const admin = new Client({ connectionString: databaseUrl(sourceUrl, 'postgres') });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);
    await admin.end();

    client = new Client({ connectionString: databaseUrl(sourceUrl, database) });
    await client.connect();

    const migrationsRoot = resolve(__dirname, '../prisma/migrations');
    const migrations = (await readdir(migrationsRoot)).filter((n) => /^\d/.test(n)).sort();
    const watermarkIndex = migrations.indexOf(PRE_CLINICAL_RECORDS_WATERMARK);
    if (watermarkIndex < 0) {
      throw new Error(`Watermark migration ${PRE_CLINICAL_RECORDS_WATERMARK} is missing`);
    }

    const read = (name: string) => readFile(resolve(migrationsRoot, name, 'migration.sql'), 'utf8');

    for (const migration of migrations.slice(0, watermarkIndex + 1)) {
      await client.query(await read(migration));
    }

    // The legacy world, as it stood before the initiative.
    await client.query(
      await readFile(
        resolve(__dirname, '../prisma/testdata/legacy-pre-clinical-records.sql'),
        'utf8',
      ),
    );

    // The rehearsal itself.
    for (const migration of migrations.slice(watermarkIndex + 1)) {
      await client.query(await read(migration));
    }
  });

  afterAll(async () => {
    await client?.end().catch(() => {});
    if (!sourceUrl) return;
    const admin = new Client({ connectionString: databaseUrl(sourceUrl, 'postgres') });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
  });

  const count = async (table: string, where = 'TRUE') =>
    Number(
      (await client.query(`SELECT count(*)::int AS n FROM "${table}" WHERE ${where}`)).rows[0].n,
    );

  it('preserves every legacy row', async () => {
    // Scoped to the snapshot's own organization: an early migration seeds a default one.
    expect(await count('Organization', `"slug" = 'legacy-org'`)).toBe(1);
    expect(await count('Clinic')).toBe(2);
    // The four legacy people, counted without the system actor the portal invite expiry
    // migration adds. Kept as an exclusion rather than a bumped total so this still fails
    // if a migration invents or drops a real user.
    expect(await count('User', `"keycloakSub" <> 'system:nkwapa'`)).toBe(4);
    expect(await count('Patient')).toBe(4);
    expect(await count('Encounter')).toBe(4);
    expect(await count('Vitals')).toBe(3);
    expect(await count('DiabetesScreening')).toBe(4);
    expect(await count('HypertensionAssessment')).toBe(1);
    expect(await count('CarePlan')).toBe(1);
    expect(await count('PatientConsent')).toBe(2);
    expect(await count('AuditEvent')).toBe(1);
    expect(await count('SyncMutation')).toBe(1);
  });

  /**
   * The one row the migration set is allowed to invent.
   *
   * Background jobs write audit events, and `AuditEvent.actorUserId` is a UUID with a
   * foreign key to `User`, so there has to be a real row to point at. It must never become
   * something a person can sign in as or be assigned work through, and a deployment that
   * rehearses these migrations is exactly where that would go unnoticed.
   */
  it('adds exactly one system actor, and it can do nothing', async () => {
    expect(await count('User', `"keycloakSub" = 'system:nkwapa'`)).toBe(1);
    expect(await count('User', `"keycloakSub" = 'system:nkwapa' AND "isActive" = false`)).toBe(1);
    expect(
      await count(
        'UserClinicRole',
        `"userId" IN (SELECT "id" FROM "User" WHERE "keycloakSub" = 'system:nkwapa')`,
      ),
    ).toBe(0);
  });

  it('carries a legacy heart rate over to pulseBpm', async () => {
    const { rows } = await client.query(
      'SELECT "id", "pulseBpm", "systolicBp", "diastolicBp", "notes" FROM "Vitals" ORDER BY "id"',
    );
    expect(rows[0].pulseBpm).toBe(74);
    expect(rows[0].systolicBp).toBe(128);
    expect(rows[0].notes).toBe('Legacy note alpha');
    // A row that never had a heart rate stays empty rather than acquiring a default.
    expect(rows[1].pulseBpm).toBeNull();
  });

  it('leaves the expanded vitals columns empty for legacy rows', async () => {
    const { rows } = await client.query(
      `SELECT "bpSite", "patientPosition", "cuffSize", "temperatureCelsius",
              "temperatureSource", "respiratoryRate", "spo2Percent"
       FROM "Vitals" ORDER BY "id" LIMIT 1`,
    );
    for (const value of Object.values(rows[0])) {
      expect(value).toBeNull();
    }
  });

  it('maps legacy diabetes symptom text and flags what it could not map', async () => {
    const { rows } = await client.query(
      'SELECT "id", "symptoms"::text[] AS symptoms, "legacySymptomsUnmapped", "symptomsJson" FROM "DiabetesScreening" ORDER BY "id"',
    );
    const [mappable, partial, unparseable, none] = rows;

    expect(mappable.symptoms).toEqual(['POLYURIA', 'POLYDIPSIA']);
    expect(mappable.legacySymptomsUnmapped).toBe(false);

    // Partly mappable: what was understood is kept, and the loss is recorded rather than hidden.
    expect(partial.symptoms).toEqual(['POLYURIA']);
    expect(partial.legacySymptomsUnmapped).toBe(true);

    expect(unparseable.symptoms).toEqual([]);
    expect(unparseable.legacySymptomsUnmapped).toBe(true);

    expect(none.symptoms).toEqual([]);
    expect(none.legacySymptomsUnmapped).toBe(false);

    // The original text is retained so a mapping error stays recoverable.
    expect(partial.symptomsJson).toBe('["POLYURIA","tingling feet"]');
  });

  it('defaults residential location to not recorded rather than guessing', async () => {
    expect(await count('Patient', `"residentialLocationStatus" = 'NOT_RECORDED'`)).toBe(4);
    expect(await count('Patient', '"residentialRegion" IS NOT NULL')).toBe(0);
  });

  it('keeps finalized encounters finalized and consent decisions intact', async () => {
    expect(await count('Encounter', `"status" = 'FINALIZED'`)).toBe(2);
    expect(await count('Encounter', `"status" = 'DRAFT'`)).toBe(1);
    expect(await count('Encounter', `"status" = 'IN_REVIEW'`)).toBe(1);
    expect(await count('PatientConsent', `"status" = 'GRANTED'`)).toBe(1);
    expect(await count('PatientConsent', `"status" = 'REVOKED'`)).toBe(1);
  });

  it('preserves optional identifiers exactly as they were, including absent ones', async () => {
    const { rows } = await client.query(
      'SELECT "patientCode", "nationalIdLast4", "phoneE164", "dob", "mergedIntoPatientId" FROM "Patient" ORDER BY "patientCode"',
    );
    expect(rows[0].nationalIdLast4).toBe('0001');
    expect(rows[1].nationalIdLast4).toBeNull();
    expect(rows[1].phoneE164).toBeNull();
    expect(rows[2].dob).toBeNull();
    expect(rows[3].mergedIntoPatientId).toBe('10000000-0000-4000-8000-000000000041');
  });

  it('adds the new clinical tables empty', async () => {
    for (const table of [
      'TobaccoScreening',
      'MedicalHistoryRecord',
      'MedicalHistoryRevision',
      'PatientMedicationRecord',
      'PatientPharmacyRecord',
      'ClinicalNote',
      'ClinicalNoteAddendum',
    ]) {
      expect(await count(table)).toBe(0);
    }
  });

  it('still answers the queries a pre-initiative reader would make', async () => {
    // Backward compatibility: no column a legacy reader depended on was renamed away without a
    // carry-over, other than heartRate, which this rehearsal pins above.
    await expect(
      client.query(
        `SELECT "id", "patientCode", "firstName", "lastName", "dob", "sex", "phoneE164",
                "nationalIdHash", "primaryClinicId"
         FROM "Patient"`,
      ),
    ).resolves.toBeDefined();
    await expect(
      client.query(
        `SELECT "id", "clinicId", "encounterId", "systolicBp", "diastolicBp" FROM "Vitals"`,
      ),
    ).resolves.toBeDefined();
    await expect(
      client.query(
        `SELECT "id", "glucoseMgDl", "glucoseType", "hba1cPercent", "symptomsJson" FROM "DiabetesScreening"`,
      ),
    ).resolves.toBeDefined();
  });
});
