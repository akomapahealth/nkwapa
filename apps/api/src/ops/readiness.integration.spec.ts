import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, lastValueFrom } from 'rxjs';
import { TENANT_CLINICS, tenantFixtureSql, tenantUser, type TenantFixtureUser } from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaRlsInterceptor } from '../prisma/prisma-rls.interceptor';
import { AuditService } from '../audit/audit.service';
import { SyncService } from '../sync/sync.service';
import { DoctorRequestService } from './doctor-request.service';
import { StationService } from './station.service';

/**
 * "Ready to open" (#411) against PostgreSQL, through the real RLS interceptor, as the application
 * role: every check failing, then passing; offline grants read through the definer function a
 * volunteer may not call; and the sync pull stamping the shift at most once a minute.
 *
 * Gated with the organization and zone isolation suite and run in the same CI step.
 */
const describeDb = process.env.RUN_ORG_ZONE_ISOLATION_TESTS === '1' ? describe : describe.skip;

function databaseUrl(source: string, database: string): string {
  const url = new URL(source);
  url.pathname = `/${database}`;
  return url.toString();
}

const { a1 } = TENANT_CLINICS;
const VOLUNTEER_A1 = tenantUser('a1', 'VOLUNTEER');
const DOCTOR_A1 = tenantUser('a1', 'DOCTOR');
const MANAGER_A1 = tenantUser('a1', 'MANAGER');

const id = (group: number, n: number) => `7fa${group}0000-0000-4000-8000-00000000000${n}`;
const ID = {
  intake: id(1, 1),
  eye: id(1, 2),
  review: id(1, 3),
  volunteerShift: id(2, 1),
  managerShift: id(2, 2),
  doctorShift: id(2, 3),
  patient: id(3, 1),
  oldCheckIn: id(4, 1),
};

/**
 * Morning, before any check-in: the eye station is closed (a closed custom station is not a gap),
 * nobody is at review, the manager's device last synced 15 minutes ago and holds no offline grant,
 * and yesterday left one patient open.
 */
function fixtureSql(): string {
  return `
    INSERT INTO "ClinicStation" ("id", "clinicId", "kind", "name", "sortOrder", "active", "updatedAt") VALUES
      ('${ID.intake}', '${a1.id}', 'INTAKE', 'Registration', 931, true, CURRENT_TIMESTAMP),
      ('${ID.eye}', '${a1.id}', 'EYE', 'Eye station', 932, false, CURRENT_TIMESTAMP),
      ('${ID.review}', '${a1.id}', 'REVIEW', 'Review', 933, true, CURRENT_TIMESTAMP),
      ('${id(1, 4)}', '${a1.id}', 'CUSTOM', 'Old pop-up', 934, false, CURRENT_TIMESTAMP);
    INSERT INTO "StaffShift" ("id", "clinicId", "userId", "roleAtShift", "checkedInAt", "status", "stationId", "lastPulledAt", "updatedAt") VALUES
      ('${ID.volunteerShift}', '${a1.id}', '${VOLUNTEER_A1.id}', 'VOLUNTEER', CURRENT_TIMESTAMP, 'ACTIVE', '${ID.intake}', CURRENT_TIMESTAMP - interval '1 minute', CURRENT_TIMESTAMP),
      ('${ID.managerShift}', '${a1.id}', '${MANAGER_A1.id}', 'MANAGER', CURRENT_TIMESTAMP, 'ACTIVE', '${ID.intake}', CURRENT_TIMESTAMP - interval '15 minutes', CURRENT_TIMESTAMP);
    INSERT INTO "OfflineGrant" ("id", "userId", "deviceId", "expiresAt") VALUES
      ('${id(5, 1)}', '${VOLUNTEER_A1.id}', '${id(6, 1)}', CURRENT_TIMESTAMP + interval '7 days'),
      ('${id(5, 2)}', '${MANAGER_A1.id}', '${id(6, 2)}', CURRENT_TIMESTAMP - interval '1 day');
    INSERT INTO "Patient" ("id", "patientCode", "primaryClinicId", "firstName", "lastName", "nationalIdType", "nationalIdCiphertext", "nationalIdHash", "nationalIdLast4", "updatedAt")
      VALUES ('${ID.patient}', 'RTO-0001', '${a1.id}', 'Test', 'RTO-0001', 'OTHER', 'c-rto', 'h-rto', '0000', CURRENT_TIMESTAMP);
    INSERT INTO "PatientCheckIn" ("id", "clinicId", "patientId", "checkedInAt", "status", "dayNumber", "updatedAt")
      VALUES ('${ID.oldCheckIn}', '${a1.id}', '${ID.patient}', CURRENT_TIMESTAMP - interval '3 days', 'WAITING', 9, CURRENT_TIMESTAMP);
  `;
}

class StationRoute {
  handle() {}
}

describeDb('ready to open (#411)', () => {
  jest.setTimeout(180_000);
  const sourceUrl = process.env.DATABASE_URL;
  const appUrl = process.env.APP_DATABASE_URL;
  const database = `nkwapa_readiness_${Date.now()}`;
  const originalAppUrl = process.env.APP_DATABASE_URL;
  let owner: Client;
  let prisma: PrismaService;
  let interceptor: PrismaRlsInterceptor;
  let stations: StationService;
  let sync: SyncService;
  const originalOffline = process.env.FEATURE_OFFLINE_SESSION_ENABLED;

  beforeAll(async () => {
    if (!sourceUrl) throw new Error('DATABASE_URL is required');
    if (!appUrl) throw new Error('APP_DATABASE_URL is required');
    const root = new Client({ connectionString: databaseUrl(sourceUrl, 'postgres') });
    await root.connect();
    await root.query(`CREATE DATABASE "${database}"`);
    await root.end();

    owner = new Client({ connectionString: databaseUrl(sourceUrl, database) });
    await owner.connect();
    const migrationsRoot = resolve(__dirname, '../../../../packages/db/prisma/migrations');
    const migrations = (await readdir(migrationsRoot)).filter((name) => /^\d/.test(name)).sort();
    for (const migration of migrations) {
      await owner.query(
        await readFile(resolve(migrationsRoot, migration, 'migration.sql'), 'utf8'),
      );
    }
    await owner.query(tenantFixtureSql());
    await owner.query(fixtureSql());

    process.env.APP_DATABASE_URL = databaseUrl(appUrl, database);
    prisma = new PrismaService();
    await prisma.onModuleInit();
    interceptor = new PrismaRlsInterceptor(prisma, new Reflector());
    const audit = new AuditService(prisma);
    stations = new StationService(
      prisma,
      audit,
      undefined,
      new DoctorRequestService(prisma, audit),
    );
    // recordPull needs only Prisma; the rest of the sync graph is not built here.
    sync = Reflect.construct(SyncService, [prisma]) as SyncService;
    process.env.FEATURE_OFFLINE_SESSION_ENABLED = 'true';
  });

  afterAll(async () => {
    await prisma?.onModuleDestroy().catch(() => {});
    await owner?.end().catch(() => {});
    process.env.APP_DATABASE_URL = originalAppUrl;
    process.env.FEATURE_OFFLINE_SESSION_ENABLED = originalOffline;
    if (!sourceUrl) return;
    const root = new Client({ connectionString: databaseUrl(sourceUrl, 'postgres') });
    await root.connect();
    await root.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await root.end();
  });

  function as<T>(user: TenantFixtureUser, work: () => Promise<T>): Promise<T> {
    const request = { headers: {}, user: { user: { id: user.id }, roles: user.roles } };
    const context = {
      getType: () => 'http',
      getHandler: () => StationRoute.prototype.handle,
      getClass: () => StationRoute,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const handler: CallHandler = { handle: () => from(work()) };
    return lastValueFrom(interceptor.intercept(context, handler) as never) as Promise<T>;
  }

  it('names what is missing on a morning that is not ready', async () => {
    const readiness = await as(MANAGER_A1, () => stations.getReadiness(a1.id));
    expect(readiness.checkInsToday).toBe(0);
    expect(readiness.checks).toEqual({
      stations: { state: 'WARN', activeCount: 2, reviewCount: 1, kindsClosed: ['EYE'] },
      staffed: { state: 'WARN', stations: [{ id: ID.review, name: 'Review' }] },
      doctorAtReview: { state: 'WARN' },
      synced: { state: 'WARN', people: [MANAGER_A1.displayName] },
      offline: { state: 'WARN', people: [MANAGER_A1.displayName] },
      yesterdayClosed: { state: 'WARN', openCheckIns: 1 },
    });
  });

  it('refuses the offline readiness function to a volunteer', async () => {
    await expect(
      as(
        VOLUNTEER_A1,
        () => prisma.$queryRaw`SELECT * FROM app.offline_ready_shift_users(${a1.id}::uuid)`,
      ),
    ).rejects.toThrow(/Offline readiness is not available/);
  });

  it('stamps a sync pull on the active shift at most once a minute', async () => {
    // Epoch milliseconds: pg reads a zone-less TIMESTAMP as local time, which is off by the offset.
    const stampOf = async () =>
      Number(
        (
          await owner.query(
            `SELECT round(extract(epoch FROM "lastPulledAt") * 1000) AS ms FROM "StaffShift" WHERE "id" = '${ID.managerShift}'`,
          )
        ).rows[0].ms,
      );
    const now = new Date();
    await as(MANAGER_A1, () => sync.recordPull(a1.id, MANAGER_A1.id, now));
    expect(await stampOf()).toBe(now.getTime());
    await as(MANAGER_A1, () =>
      sync.recordPull(a1.id, MANAGER_A1.id, new Date(now.getTime() + 30_000)),
    );
    expect(await stampOf()).toBe(now.getTime());
    const later = new Date(now.getTime() + 61_000);
    await as(MANAGER_A1, () => sync.recordPull(a1.id, MANAGER_A1.id, later));
    expect(await stampOf()).toBe(later.getTime());
  });

  it('passes every check once the gaps are fixed', async () => {
    await owner.query(`
      DELETE FROM "ClinicStation" WHERE "id" = '${ID.eye}';
      UPDATE "PatientCheckIn" SET "status" = 'COMPLETED' WHERE "id" = '${ID.oldCheckIn}';
      UPDATE "StaffShift" SET "lastPulledAt" = CURRENT_TIMESTAMP WHERE "id" = '${ID.managerShift}';
      UPDATE "OfflineGrant" SET "expiresAt" = CURRENT_TIMESTAMP + interval '7 days' WHERE "userId" = '${MANAGER_A1.id}';
      INSERT INTO "StaffShift" ("id", "clinicId", "userId", "roleAtShift", "checkedInAt", "status", "stationId", "lastPulledAt", "updatedAt") VALUES
        ('${ID.doctorShift}', '${a1.id}', '${DOCTOR_A1.id}', 'DOCTOR', CURRENT_TIMESTAMP, 'ACTIVE', '${ID.review}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      INSERT INTO "OfflineGrant" ("id", "userId", "deviceId", "expiresAt") VALUES
        ('${id(5, 3)}', '${DOCTOR_A1.id}', '${id(6, 3)}', CURRENT_TIMESTAMP + interval '7 days');
    `);
    const readiness = await as(MANAGER_A1, () => stations.getReadiness(a1.id));
    expect(Object.values(readiness.checks).map((check) => check.state)).toEqual([
      'PASS',
      'PASS',
      'PASS',
      'PASS',
      'PASS',
      'PASS',
    ]);
  });

  it('leaves the offline check out when offline sessions are off', async () => {
    process.env.FEATURE_OFFLINE_SESSION_ENABLED = 'false';
    try {
      const readiness = await as(MANAGER_A1, () => stations.getReadiness(a1.id));
      expect(readiness.checks.offline).toEqual({ state: 'NA', people: [] });
    } finally {
      process.env.FEATURE_OFFLINE_SESSION_ENABLED = 'true';
    }
  });
});
