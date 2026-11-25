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
import { DoctorRequestService } from './doctor-request.service';
import { StationService } from './station.service';

/**
 * The clinic day summary (#421) against PostgreSQL, through the real RLS interceptor, as the
 * application role. One past day in a UTC+1 clinic: a check-in just after local midnight belongs
 * to it and one just before the next midnight does not; a demo patient is counted only as demo.
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
const DAY = '2026-11-20';

const id = (group: number, n: number) => `7f9${group}0000-0000-4000-8000-00000000000${n}`;
const ID = {
  bp: id(1, 1),
  returning: id(2, 1),
  fresh: id(2, 2),
  demo: id(2, 3),
  nextDay: id(2, 4),
  earlier: id(3, 0),
  checkInReturning: id(3, 1),
  checkInFresh: id(3, 2),
  checkInDemo: id(3, 3),
  checkInNextDay: id(3, 4),
  encounterReturning: id(4, 1),
  encounterFresh: id(4, 2),
  encounterDemo: id(4, 3),
};

function patientSql(patientId: string, code: string, demo = false) {
  return `('${patientId}', '${code}', '${a1.id}', 'Test', '${code}', 'OTHER', 'c-${code}', 'h-${code}', '0000', ${demo}, CURRENT_TIMESTAMP)`;
}
const flags = (...pairs: Array<[string, string]>) =>
  `'${JSON.stringify(pairs.map(([source, kind]) => ({ source, kind, stationName: 'Blood pressure', at: '2026-11-20T09:00:00Z' })))}'::jsonb`;

function fixtureSql(): string {
  return `
    UPDATE "Clinic" SET "timezone" = 'Africa/Lagos' WHERE "id" = '${a1.id}';
    INSERT INTO "ClinicStation" ("id", "clinicId", "kind", "name", "sortOrder", "updatedAt") VALUES
      ('${ID.bp}', '${a1.id}', 'BLOOD_PRESSURE', 'Blood pressure', 921, CURRENT_TIMESTAMP);
    INSERT INTO "Patient" ("id", "patientCode", "primaryClinicId", "firstName", "lastName", "nationalIdType", "nationalIdCiphertext", "nationalIdHash", "nationalIdLast4", "isDemo", "updatedAt") VALUES
      ${patientSql(ID.returning, 'CDS-0001')}, ${patientSql(ID.fresh, 'CDS-0002')},
      ${patientSql(ID.demo, 'CDS-0003', true)}, ${patientSql(ID.nextDay, 'CDS-0004')};
    INSERT INTO "Encounter" ("id", "clinicId", "patientId", "createdByUserId", "status", "updatedAt") VALUES
      ('${ID.encounterReturning}', '${a1.id}', '${ID.returning}', '${VOLUNTEER_A1.id}', 'DRAFT', CURRENT_TIMESTAMP),
      ('${ID.encounterFresh}', '${a1.id}', '${ID.fresh}', '${VOLUNTEER_A1.id}', 'IN_REVIEW', CURRENT_TIMESTAMP),
      ('${ID.encounterDemo}', '${a1.id}', '${ID.demo}', '${VOLUNTEER_A1.id}', 'DRAFT', CURRENT_TIMESTAMP);
    -- 23:30Z on the 19th is 00:30 on the 20th in Lagos; 23:30Z on the 20th is already the 21st.
    INSERT INTO "PatientCheckIn" ("id", "clinicId", "patientId", "checkedInAt", "status", "dayNumber", "encounterId", "lineFlags", "updatedAt") VALUES
      ('${ID.earlier}', '${a1.id}', '${ID.returning}', '2026-11-01T09:00:00Z', 'COMPLETED', 1, NULL, '[]', CURRENT_TIMESTAMP),
      ('${ID.checkInReturning}', '${a1.id}', '${ID.returning}', '2026-11-19T23:30:00Z', 'COMPLETED', 1, '${ID.encounterReturning}', ${flags(['BP', 'REFER_TODAY'])}, CURRENT_TIMESTAMP),
      ('${ID.checkInFresh}', '${a1.id}', '${ID.fresh}', '2026-11-20T09:00:00Z', 'COMPLETED', 2, '${ID.encounterFresh}', ${flags(['BP', 'REPEAT_AT_REVIEW'], ['GLUCOSE', 'REPEAT_AT_REVIEW'])}, CURRENT_TIMESTAMP),
      ('${ID.checkInDemo}', '${a1.id}', '${ID.demo}', '2026-11-20T10:00:00Z', 'COMPLETED', 3, '${ID.encounterDemo}', ${flags(['BP', 'REFER_TODAY'])}, CURRENT_TIMESTAMP),
      ('${ID.checkInNextDay}', '${a1.id}', '${ID.nextDay}', '2026-11-20T23:30:00Z', 'WAITING', 1, NULL, ${flags(['GLUCOSE', 'REFER_TODAY'])}, CURRENT_TIMESTAMP);
    INSERT INTO "CounsellingRecord" ("id", "clinicId", "encounterId", "authorUserId", "referralRecommended", "referralUrgency", "updatedAt") VALUES
      ('${id(5, 1)}', '${a1.id}', '${ID.encounterReturning}', '${VOLUNTEER_A1.id}', true, 'URGENT', CURRENT_TIMESTAMP),
      ('${id(5, 2)}', '${a1.id}', '${ID.encounterFresh}', '${VOLUNTEER_A1.id}', true, 'SOON', CURRENT_TIMESTAMP),
      ('${id(5, 3)}', '${a1.id}', '${ID.encounterDemo}', '${VOLUNTEER_A1.id}', true, 'URGENT', CURRENT_TIMESTAMP);
    INSERT INTO "ClinicalNote" ("id", "clinicId", "patientId", "encounterId", "authorUserId", "authorRole", "status", "assignedDoctorId", "submittedByUserId", "submittedAt", "history", "assessment", "plan", "updatedAt") VALUES
      ('${id(6, 1)}', '${a1.id}', '${ID.fresh}', '${ID.encounterFresh}', '${VOLUNTEER_A1.id}', 'VOLUNTEER', 'PENDING_COSIGN', '${DOCTOR_A1.id}', '${VOLUNTEER_A1.id}', CURRENT_TIMESTAMP, 'h', 'a', 'p', CURRENT_TIMESTAMP),
      ('${id(6, 2)}', '${a1.id}', '${ID.demo}', '${ID.encounterDemo}', '${VOLUNTEER_A1.id}', 'VOLUNTEER', 'PENDING_COSIGN', '${DOCTOR_A1.id}', '${VOLUNTEER_A1.id}', CURRENT_TIMESTAMP, 'h', 'a', 'p', CURRENT_TIMESTAMP);
    -- One stop seen for 25 minutes; one held two minutes and handed on with nothing recorded.
    INSERT INTO "PatientStationVisit" ("id", "clinicId", "patientCheckInId", "stationId", "status", "queuedAt", "queuedByUserId", "claimedByUserId", "claimedAt", "completedAt", "updatedAt") VALUES
      ('${id(7, 1)}', '${a1.id}', '${ID.checkInReturning}', '${ID.bp}', 'COMPLETED', '2026-11-20T08:50:00Z', '${VOLUNTEER_A1.id}', '${VOLUNTEER_A1.id}', '2026-11-20T09:00:00Z', '2026-11-20T09:25:00Z', CURRENT_TIMESTAMP),
      ('${id(7, 2)}', '${a1.id}', '${ID.checkInFresh}', '${ID.bp}', 'SKIPPED', '2026-11-20T09:05:00Z', '${VOLUNTEER_A1.id}', '${VOLUNTEER_A1.id}', '2026-11-20T09:10:00Z', '2026-11-20T09:12:00Z', CURRENT_TIMESTAMP);
    -- The volunteer changed station once: two shifts, one person.
    INSERT INTO "StaffShift" ("id", "clinicId", "userId", "roleAtShift", "checkedInAt", "checkedOutAt", "status", "updatedAt") VALUES
      ('${id(8, 1)}', '${a1.id}', '${VOLUNTEER_A1.id}', 'VOLUNTEER', '2026-11-20T08:00:00Z', '2026-11-20T11:00:00Z', 'CLOSED', CURRENT_TIMESTAMP),
      ('${id(8, 2)}', '${a1.id}', '${VOLUNTEER_A1.id}', 'VOLUNTEER', '2026-11-20T11:00:00Z', '2026-11-20T15:00:00Z', 'CLOSED', CURRENT_TIMESTAMP),
      ('${id(8, 3)}', '${a1.id}', '${DOCTOR_A1.id}', 'DOCTOR', '2026-11-20T08:00:00Z', '2026-11-20T15:00:00Z', 'CLOSED', CURRENT_TIMESTAMP);
  `;
}

class StationRoute {
  handle() {}
}

describeDb('clinic day summary (#421)', () => {
  jest.setTimeout(180_000);
  const sourceUrl = process.env.DATABASE_URL;
  const appUrl = process.env.APP_DATABASE_URL;
  const database = `nkwapa_day_summary_${Date.now()}`;
  const originalAppUrl = process.env.APP_DATABASE_URL;
  let owner: Client;
  let prisma: PrismaService;
  let interceptor: PrismaRlsInterceptor;
  let stations: StationService;

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
  });

  afterAll(async () => {
    await prisma?.onModuleDestroy().catch(() => {});
    await owner?.end().catch(() => {});
    process.env.APP_DATABASE_URL = originalAppUrl;
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

  it('counts one real day: patients, clinical flags, open work and staff, demo apart', async () => {
    const summary = await as(MANAGER_A1, () =>
      stations.getDaySummary(a1.id, DAY, new Date('2026-11-24T12:00:00Z')),
    );
    expect(summary.metrics.date).toBe(DAY);
    expect(summary.metrics.checkIns).toMatchObject({ total: 2, completed: 0, closedAtDayEnd: 2 });
    expect(summary.demoCheckIns).toBe(1);
    expect(summary.patients).toEqual({ new: 1, returning: 1 });
    expect(summary.clinical).toEqual({
      referrals: { urgent: 1, soon: 1, routine: 0, unspecified: 0 },
      bpReferToday: 1,
      bpRecheck: 1,
      glucoseReferToday: 0,
      glucoseRaised: 1,
    });
    expect(summary.openWork).toEqual({ drafts: 1, inReview: 1, notesToCosignAnyDay: 2 });
    expect(summary.staff).toEqual({ volunteers: 1, doctors: 1, managers: 0 });
    expect(summary.metrics.stations.find((station) => station.stationId === ID.bp)).toMatchObject({
      seen: 1,
      heldEmpty: 1,
      longestHeldMinutes: 25,
    });
  });

  it('puts the check-in after local midnight on the next day', async () => {
    const next = await as(MANAGER_A1, () =>
      stations.getDaySummary(a1.id, '2026-11-21', new Date('2026-11-24T12:00:00Z')),
    );
    expect(next.metrics.checkIns.total).toBe(1);
    expect(next.clinical.glucoseReferToday).toBe(1);
    expect(next.patients).toEqual({ new: 1, returning: 0 });
  });
});
