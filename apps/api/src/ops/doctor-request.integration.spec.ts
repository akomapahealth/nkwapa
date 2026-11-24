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
import { PushService } from '../push/push.service';
import {
  DOCTOR_REQUEST_VIEW_SELECT,
  DoctorRequestService,
  toDoctorRequestView,
} from './doctor-request.service';
import { StationService } from './station.service';

/**
 * "Ask a doctor" (#418) against PostgreSQL, through the real RLS interceptor, as the application
 * role: one open request per check-in, the doctors on shift told, two doctors racing to take it,
 * another clinic refused, and closing the clinic day closing the request.
 *
 * Gated with the organization and zone isolation suite and run in the same CI step.
 */
const describeDb = process.env.RUN_ORG_ZONE_ISOLATION_TESTS === '1' ? describe : describe.skip;

function databaseUrl(source: string, database: string): string {
  const url = new URL(source);
  url.pathname = `/${database}`;
  return url.toString();
}

const { a1, b1 } = TENANT_CLINICS;
const VOLUNTEER_A1 = tenantUser('a1', 'VOLUNTEER');
const DOCTOR_A1 = tenantUser('a1', 'DOCTOR');
const MANAGER_A1 = tenantUser('a1', 'MANAGER');
const VOLUNTEER_B1 = tenantUser('b1', 'VOLUNTEER');

const ID = {
  bp: '7a000000-0000-4000-8000-000000000001',
  shiftVolunteer: '7b000000-0000-4000-8000-000000000001',
  shiftDoctor: '7b000000-0000-4000-8000-000000000002',
  patient: '7c000000-0000-4000-8000-000000000001',
  checkIn: '7d000000-0000-4000-8000-000000000001',
  visit: '7e000000-0000-4000-8000-000000000001',
};

function fixtureSql(): string {
  return `
    INSERT INTO "ClinicStation" ("id", "clinicId", "kind", "name", "sortOrder", "updatedAt") VALUES
      ('${ID.bp}', '${a1.id}', 'BLOOD_PRESSURE', 'Blood pressure', 902, CURRENT_TIMESTAMP);
    INSERT INTO "StaffShift" ("id", "clinicId", "userId", "roleAtShift", "checkedInAt", "status", "updatedAt") VALUES
      ('${ID.shiftVolunteer}', '${a1.id}', '${VOLUNTEER_A1.id}', 'VOLUNTEER', CURRENT_TIMESTAMP, 'ACTIVE', CURRENT_TIMESTAMP),
      ('${ID.shiftDoctor}', '${a1.id}', '${DOCTOR_A1.id}', 'DOCTOR', CURRENT_TIMESTAMP, 'ACTIVE', CURRENT_TIMESTAMP);
    INSERT INTO "Patient" ("id", "patientCode", "primaryClinicId", "firstName", "lastName", "nationalIdType", "nationalIdCiphertext", "nationalIdHash", "nationalIdLast4", "updatedAt")
      VALUES ('${ID.patient}', 'DRQ-0001', '${a1.id}', 'Kwame', 'Asante', 'OTHER', 'c-drq', 'h-drq', '0000', CURRENT_TIMESTAMP);
    INSERT INTO "PatientCheckIn" ("id", "clinicId", "patientId", "checkedInAt", "status", "dayNumber", "updatedAt")
      VALUES ('${ID.checkIn}', '${a1.id}', '${ID.patient}', CURRENT_TIMESTAMP, 'IN_PROGRESS', 14, CURRENT_TIMESTAMP);
    INSERT INTO "PatientStationVisit" ("id", "clinicId", "patientCheckInId", "stationId", "status", "queuedAt", "queuedByUserId", "claimedByUserId", "claimedAt", "updatedAt")
      VALUES ('${ID.visit}', '${a1.id}', '${ID.checkIn}', '${ID.bp}', 'IN_PROGRESS', CURRENT_TIMESTAMP, '${VOLUNTEER_A1.id}', '${VOLUNTEER_A1.id}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  `;
}

class StationRoute {
  handle() {}
}

describeDb('ask a doctor (#418)', () => {
  jest.setTimeout(180_000);
  const sourceUrl = process.env.DATABASE_URL;
  const appUrl = process.env.APP_DATABASE_URL;
  const database = `nkwapa_doctor_request_${Date.now()}`;
  const originalAppUrl = process.env.APP_DATABASE_URL;
  let owner: Client;
  let prisma: PrismaService;
  let interceptor: PrismaRlsInterceptor;
  let service: DoctorRequestService;
  let stations: StationService;
  let notify: jest.Mock;

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
    const push = new PushService(prisma);
    notify = jest.fn();
    push.notify = notify;
    const audit = new AuditService(prisma);
    service = new DoctorRequestService(prisma, audit, push);
    stations = new StationService(prisma, audit, push, service);
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

  let requestId: string;

  it('tells only the doctor on shift, by day number and station, never by name', async () => {
    const view = await as(VOLUNTEER_A1, () =>
      service.request(a1.id, ID.visit, VOLUNTEER_A1.id, {
        urgency: 'BEFORE_LEAVING',
        reason: 'HIGH_BP',
      }),
    );
    requestId = view.id;
    expect(view).toMatchObject({ urgency: 'BEFORE_LEAVING', open: true, claimedBy: null });
    expect(notify).toHaveBeenCalledTimes(1);
    const [recipients, message] = notify.mock.calls[0];
    expect(recipients).toEqual([DOCTOR_A1.id]);
    expect(message).toMatchObject({
      title: 'Doctor needed before they leave',
      body: 'At Blood pressure (No. 14, high BP)',
      tag: `doctor-request:${view.id}`,
      kind: 'DOCTOR_REQUEST',
      doctorRequestId: view.id,
    });
    expect(JSON.stringify(message)).not.toMatch(/Kwame|Asante|DRQ-0001/);
  });

  it('keeps one request per check-in: asking again raises it to Now and tells doctors again', async () => {
    notify.mockClear();
    await as(VOLUNTEER_A1, () =>
      service.request(a1.id, ID.visit, VOLUNTEER_A1.id, { urgency: 'BEFORE_LEAVING' }),
    );
    expect(notify).not.toHaveBeenCalled();
    const raised = await as(VOLUNTEER_A1, () =>
      service.request(a1.id, ID.visit, VOLUNTEER_A1.id, { urgency: 'NOW' }),
    );
    expect(raised).toMatchObject({ id: requestId, urgency: 'NOW', reason: 'HIGH_BP' });
    expect(notify).toHaveBeenCalledTimes(1);
    const { rows } = await owner.query(`SELECT count(*)::int AS n FROM "DoctorRequest"`);
    expect(rows[0].n).toBe(1);
  });

  it('refuses another clinic, and its staff cannot see the request', async () => {
    await expect(
      as(VOLUNTEER_B1, () => service.request(b1.id, ID.visit, VOLUNTEER_B1.id, { urgency: 'NOW' })),
    ).rejects.toMatchObject({ status: 404 });
    const seen = await as(VOLUNTEER_B1, () => prisma.doctorRequest.findMany());
    expect(seen).toEqual([]);
  });

  it('lets one of two racing doctors take it, and names them to the other', async () => {
    const results = await Promise.allSettled([
      as(DOCTOR_A1, () => service.claim(a1.id, requestId, DOCTOR_A1.id)),
      as(MANAGER_A1, () => service.claim(a1.id, requestId, MANAGER_A1.id)),
    ]);
    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0].reason).toMatchObject({
      status: 409,
      response: { code: 'DOCTOR_REQUEST_TAKEN' },
    });
    const { rows } = await owner.query(
      `SELECT "claimedByUserId" FROM "DoctorRequest" WHERE "id" = $1`,
      [requestId],
    );
    expect([DOCTOR_A1.id, MANAGER_A1.id]).toContain(rows[0].claimedByUserId);
  });

  it('closes the request when the clinic day is closed', async () => {
    await as(MANAGER_A1, () =>
      stations.closeClinicDay(a1.id, { userId: MANAGER_A1.id, canManage: true }),
    );
    const row = await as(DOCTOR_A1, () =>
      prisma.doctorRequest.findUniqueOrThrow({
        where: { id: requestId },
        select: DOCTOR_REQUEST_VIEW_SELECT,
      }),
    );
    expect(toDoctorRequestView(row).open).toBe(false);
    await expect(
      as(VOLUNTEER_A1, () => service.request(a1.id, ID.visit, VOLUNTEER_A1.id, { urgency: 'NOW' })),
    ).rejects.toMatchObject({ response: { code: 'CHECK_IN_CLOSED' } });
  });
});
