import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';

const describeMigration =
  process.env.RUN_APPOINTMENT_CANCELLATION_MIGRATION_TESTS === '1' ? describe : describe.skip;

const CANCELLATION_MIGRATION = '20261105120100_appointment_cancellation';

function databaseUrl(source: string, database: string): string {
  const url = new URL(source);
  url.pathname = `/${database}`;
  return url.toString();
}

const CLINIC = '74000000-0000-4000-8000-00000000000a';
const STAFF_1 = '74000000-0000-4000-8000-000000000001';
const STAFF_2 = '74000000-0000-4000-8000-000000000002';
const PATIENT = '74000000-0000-4000-8000-000000000003';
const ID = {
  cancelled: '74000000-0000-4000-8000-000000000101',
  cancelledTwice: '74000000-0000-4000-8000-000000000102',
  cancelledNoAudit: '74000000-0000-4000-8000-000000000103',
  confirmed: '74000000-0000-4000-8000-000000000104',
  blankReason: '74000000-0000-4000-8000-000000000105',
};

/**
 * Who cancelled an appointment, when and why (#307, B1): the migration backfills the three new
 * columns from each cancelled visit's latest APPT.CANCEL audit event, and leaves alone what it
 * cannot answer.
 */
describeMigration('appointment cancellation backfill', () => {
  jest.setTimeout(120_000);

  let admin: Client;
  let target: Client;
  let database: string;
  let migrationsRoot: string;

  beforeAll(async () => {
    const sourceUrl = process.env.DATABASE_URL;
    if (!sourceUrl) throw new Error('DATABASE_URL is required');

    database = `nkwapa_appointment_cancellation_${Date.now()}`;
    admin = new Client({ connectionString: databaseUrl(sourceUrl, 'postgres') });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);

    target = new Client({ connectionString: databaseUrl(sourceUrl, database) });
    await target.connect();
    migrationsRoot = resolve(__dirname, '../prisma/migrations');
    const migrations = (await readdir(migrationsRoot)).filter((name) => /^\d/.test(name)).sort();
    for (const migration of migrations.filter((name) => name < CANCELLATION_MIGRATION)) {
      await target.query(
        await readFile(resolve(migrationsRoot, migration, 'migration.sql'), 'utf8'),
      );
    }

    const appointment = (id: string, status: string) =>
      `('${id}', '${CLINIC}', '${PATIENT}', '2026-10-01T09:00:00Z', '2026-10-01T09:30:00Z', '${status}', CURRENT_TIMESTAMP)`;
    const cancel = (entityId: string, actor: string, at: string, reason: string) =>
      `(gen_random_uuid(), '${CLINIC}', '${actor}', 'APPT.CANCEL', 'Appointment', '${entityId}', '{}', '${JSON.stringify(
        { appointmentId: entityId, reason, newStatus: 'CANCELLED' },
      ).replace(/'/g, "''")}', 'req-${entityId.slice(-3)}-${at.slice(11, 13)}', '${at}')`;

    await target.query(`
      INSERT INTO "Clinic" ("id", "name", "organizationId", "timezone", "locationCode", "updatedAt")
      SELECT '${CLINIC}', 'Cancellation Clinic', "id", 'Africa/Accra', 'cancel-a', CURRENT_TIMESTAMP
      FROM "Organization" LIMIT 1;
      INSERT INTO "User" ("id", "keycloakSub", "displayName", "updatedAt") VALUES
        ('${STAFF_1}', 'cancel-staff-1', 'Esi Front Desk', CURRENT_TIMESTAMP),
        ('${STAFF_2}', 'cancel-staff-2', 'Yaw Manager', CURRENT_TIMESTAMP);
      INSERT INTO "Patient" ("id", "patientCode", "primaryClinicId", "firstName", "lastName", "nationalIdType", "nationalIdCiphertext", "nationalIdHash", "updatedAt") VALUES
        ('${PATIENT}', 'NKP-CANCEL-1', '${CLINIC}', 'Cancel', 'Patient', 'OTHER', 'encrypted', 'cancel-hash', CURRENT_TIMESTAMP);
      INSERT INTO "Appointment" ("id", "clinicId", "patientId", "startsAt", "endsAt", "status", "updatedAt") VALUES
        ${appointment(ID.cancelled, 'CANCELLED')},
        ${appointment(ID.cancelledTwice, 'CANCELLED')},
        ${appointment(ID.cancelledNoAudit, 'CANCELLED')},
        ${appointment(ID.confirmed, 'CONFIRMED')},
        ${appointment(ID.blankReason, 'CANCELLED')};
      INSERT INTO "AuditEvent" ("id", "clinicId", "actorUserId", "action", "entityType", "entityId", "beforeJson", "afterJson", "requestId", "createdAt") VALUES
        ${cancel(ID.cancelled, STAFF_1, '2026-09-30T10:00:00Z', "Patient's daughter called: travelling")},
        ${cancel(ID.cancelledTwice, STAFF_1, '2026-09-29T08:00:00Z', 'first')},
        ${cancel(ID.cancelledTwice, STAFF_2, '2026-09-30T12:00:00Z', 'second')},
        ${cancel(ID.confirmed, STAFF_1, '2026-09-30T10:00:00Z', 'reinstated later')},
        ${cancel(ID.blankReason, STAFF_2, '2026-09-30T11:00:00Z', '  ')};
    `);

    await target.query(
      await readFile(resolve(migrationsRoot, CANCELLATION_MIGRATION, 'migration.sql'), 'utf8'),
    );
  });

  afterAll(async () => {
    await target?.end();
    await admin?.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin?.end();
  });

  async function row(id: string) {
    const { rows } = await target.query(
      // As text: the column has no zone, and pg would read it in this machine's zone.
      `SELECT "cancelledAt"::text AS "cancelledAt", "cancelledByUserId", "cancelReason" FROM "Appointment" WHERE "id" = $1`,
      [id],
    );
    return rows[0];
  }

  it('fills who, when and why from the audit event', async () => {
    expect(await row(ID.cancelled)).toEqual({
      cancelledAt: '2026-09-30 10:00:00',
      cancelledByUserId: STAFF_1,
      cancelReason: "Patient's daughter called: travelling",
    });
  });

  it('takes the latest event when there is more than one', async () => {
    expect(await row(ID.cancelledTwice)).toMatchObject({
      cancelledByUserId: STAFF_2,
      cancelReason: 'second',
    });
  });

  it('leaves a cancelled visit with no audit event empty rather than guessing', async () => {
    expect(await row(ID.cancelledNoAudit)).toEqual({
      cancelledAt: null,
      cancelledByUserId: null,
      cancelReason: null,
    });
  });

  it('does not touch a visit that is not cancelled now', async () => {
    expect(await row(ID.confirmed)).toMatchObject({ cancelledAt: null, cancelledByUserId: null });
  });

  it('stores a blank reason as no reason', async () => {
    expect(await row(ID.blankReason)).toMatchObject({
      cancelledByUserId: STAFF_2,
      cancelReason: null,
    });
  });

  it('is safe to run twice', async () => {
    await target.query(`UPDATE "Appointment" SET "cancelReason" = 'edited' WHERE "id" = $1`, [
      ID.cancelled,
    ]);
    await target.query(
      await readFile(resolve(migrationsRoot, CANCELLATION_MIGRATION, 'migration.sql'), 'utf8'),
    );
    expect(await row(ID.cancelled)).toMatchObject({ cancelReason: 'edited' });
  });
});
