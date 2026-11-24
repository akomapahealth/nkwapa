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
 * The review waiting list (#419) against PostgreSQL, through the real RLS interceptor, as the
 * application role: the nav count only for whoever is on shift at review, and the board's key
 * readings for patients waiting there.
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

const ID = {
  bp: '7f100000-0000-4000-8000-000000000001',
  review: '7f100000-0000-4000-8000-000000000002',
  shiftVolunteer: '7f200000-0000-4000-8000-000000000001',
  shiftDoctor: '7f200000-0000-4000-8000-000000000002',
  patientA: '7f300000-0000-4000-8000-000000000001',
  patientB: '7f300000-0000-4000-8000-000000000002',
  patientC: '7f300000-0000-4000-8000-000000000003',
  checkInA: '7f400000-0000-4000-8000-000000000001',
  checkInB: '7f400000-0000-4000-8000-000000000002',
  checkInC: '7f400000-0000-4000-8000-000000000003',
  encounterA: '7f500000-0000-4000-8000-000000000001',
  visitA: '7f600000-0000-4000-8000-000000000001',
  visitB: '7f600000-0000-4000-8000-000000000002',
  visitC: '7f600000-0000-4000-8000-000000000003',
};

function patientSql(id: string, code: string) {
  return `('${id}', '${code}', '${a1.id}', 'Test', '${code}', 'OTHER', 'c-${code}', 'h-${code}', '0000', CURRENT_TIMESTAMP)`;
}

/** Two patients waiting at review (one with readings), one being seen there. */
function fixtureSql(): string {
  return `
    INSERT INTO "ClinicStation" ("id", "clinicId", "kind", "name", "sortOrder", "updatedAt") VALUES
      ('${ID.bp}', '${a1.id}', 'BLOOD_PRESSURE', 'Blood pressure', 911, CURRENT_TIMESTAMP),
      ('${ID.review}', '${a1.id}', 'REVIEW', 'Review', 912, CURRENT_TIMESTAMP);
    INSERT INTO "StaffShift" ("id", "clinicId", "userId", "roleAtShift", "checkedInAt", "status", "stationId", "updatedAt") VALUES
      ('${ID.shiftVolunteer}', '${a1.id}', '${VOLUNTEER_A1.id}', 'VOLUNTEER', CURRENT_TIMESTAMP, 'ACTIVE', '${ID.bp}', CURRENT_TIMESTAMP),
      ('${ID.shiftDoctor}', '${a1.id}', '${DOCTOR_A1.id}', 'DOCTOR', CURRENT_TIMESTAMP, 'ACTIVE', '${ID.review}', CURRENT_TIMESTAMP);
    INSERT INTO "Patient" ("id", "patientCode", "primaryClinicId", "firstName", "lastName", "nationalIdType", "nationalIdCiphertext", "nationalIdHash", "nationalIdLast4", "updatedAt") VALUES
      ${patientSql(ID.patientA, 'RWL-0001')}, ${patientSql(ID.patientB, 'RWL-0002')}, ${patientSql(ID.patientC, 'RWL-0003')};
    INSERT INTO "Encounter" ("id", "clinicId", "patientId", "createdByUserId", "updatedAt")
      VALUES ('${ID.encounterA}', '${a1.id}', '${ID.patientA}', '${VOLUNTEER_A1.id}', CURRENT_TIMESTAMP);
    INSERT INTO "Vitals" ("id", "clinicId", "encounterId", "systolicBp", "diastolicBp", "bmi", "updatedAt")
      VALUES ('7f700000-0000-4000-8000-000000000001', '${a1.id}', '${ID.encounterA}', 182, 110, 27.4, CURRENT_TIMESTAMP);
    INSERT INTO "PatientCheckIn" ("id", "clinicId", "patientId", "checkedInAt", "status", "dayNumber", "encounterId", "updatedAt") VALUES
      ('${ID.checkInA}', '${a1.id}', '${ID.patientA}', CURRENT_TIMESTAMP, 'IN_PROGRESS', 21, '${ID.encounterA}', CURRENT_TIMESTAMP),
      ('${ID.checkInB}', '${a1.id}', '${ID.patientB}', CURRENT_TIMESTAMP, 'IN_PROGRESS', 22, NULL, CURRENT_TIMESTAMP),
      ('${ID.checkInC}', '${a1.id}', '${ID.patientC}', CURRENT_TIMESTAMP, 'IN_PROGRESS', 23, NULL, CURRENT_TIMESTAMP);
    INSERT INTO "PatientStationVisit" ("id", "clinicId", "patientCheckInId", "stationId", "encounterId", "status", "queuedAt", "queuedByUserId", "claimedByUserId", "claimedAt", "updatedAt") VALUES
      ('${ID.visitA}', '${a1.id}', '${ID.checkInA}', '${ID.review}', '${ID.encounterA}', 'QUEUED', CURRENT_TIMESTAMP, '${VOLUNTEER_A1.id}', NULL, NULL, CURRENT_TIMESTAMP),
      ('${ID.visitB}', '${a1.id}', '${ID.checkInB}', '${ID.review}', NULL, 'QUEUED', CURRENT_TIMESTAMP, '${VOLUNTEER_A1.id}', NULL, NULL, CURRENT_TIMESTAMP),
      ('${ID.visitC}', '${a1.id}', '${ID.checkInC}', '${ID.review}', NULL, 'IN_PROGRESS', CURRENT_TIMESTAMP, '${VOLUNTEER_A1.id}', '${DOCTOR_A1.id}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  `;
}

class StationRoute {
  handle() {}
}

describeDb('review waiting list (#419)', () => {
  jest.setTimeout(180_000);
  const sourceUrl = process.env.DATABASE_URL;
  const appUrl = process.env.APP_DATABASE_URL;
  const database = `nkwapa_review_waiting_${Date.now()}`;
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

  it('counts patients waiting, not those being seen, for the doctor at review', async () => {
    await expect(
      as(DOCTOR_A1, () => stations.getReviewWaitingCount(a1.id, DOCTOR_A1.id)),
    ).resolves.toEqual({ count: 2 });
  });

  it('answers null for someone on shift at another station', async () => {
    await expect(
      as(VOLUNTEER_A1, () => stations.getReviewWaitingCount(a1.id, VOLUNTEER_A1.id)),
    ).resolves.toEqual({ count: null });
  });

  it('carries the key readings on visits at review, empty where none were taken', async () => {
    const board = await as(DOCTOR_A1, () => stations.getBoard(a1.id));
    const review = board.stations.find((station) => station.id === ID.review);
    const byId = new Map(review?.visits.map((visit) => [visit.id, visit]));
    expect(byId.get(ID.visitA)).toMatchObject({
      keyReadings: { bp: { systolic: 182, diastolic: 110 }, glucose: null, bmi: 27.4 },
    });
    expect(byId.get(ID.visitB)).toMatchObject({
      keyReadings: { bp: null, glucose: null, bmi: null },
    });
    const bp = board.stations.find((station) => station.id === ID.bp);
    expect(bp?.visits.every((visit) => !('keyReadings' in visit))).toBe(true);
  });
});
