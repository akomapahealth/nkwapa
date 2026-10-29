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
import { StationService } from './station.service';

/**
 * Who actually screened (#227) against PostgreSQL, through the real RLS interceptor, as the
 * unprivileged application role: the CHECK constraints, the shift-owner rules, and a real
 * completion stamping the visit.
 *
 * Gated with the organization and zone isolation suite and run in the same CI step.
 */
const describePerformer =
  process.env.RUN_ORG_ZONE_ISOLATION_TESTS === '1' ? describe : describe.skip;

function databaseUrl(source: string, database: string): string {
  const url = new URL(source);
  url.pathname = `/${database}`;
  return url.toString();
}

const { a1, b1 } = TENANT_CLINICS;
const VOLUNTEER_A1 = tenantUser('a1', 'VOLUNTEER');
const DOCTOR_A1 = tenantUser('a1', 'DOCTOR');
const VOLUNTEER_B1 = tenantUser('b1', 'VOLUNTEER');

const ID = {
  intake: '6a000000-0000-4000-8000-000000000001',
  review: '6a000000-0000-4000-8000-000000000002',
  shiftA1: '6b000000-0000-4000-8000-000000000001',
  shiftDoctor: '6b000000-0000-4000-8000-000000000002',
  shiftB1: '6b000000-0000-4000-8000-000000000003',
  patient: '6c000000-0000-4000-8000-000000000001',
  checkIn: '6d000000-0000-4000-8000-000000000001',
  visit: '6e000000-0000-4000-8000-000000000001',
};

function fixtureSql(): string {
  return `
    INSERT INTO "ClinicStation" ("id", "clinicId", "kind", "name", "sortOrder", "updatedAt") VALUES
      ('${ID.intake}', '${a1.id}', 'INTAKE', 'Intake', 901, CURRENT_TIMESTAMP),
      ('${ID.review}', '${a1.id}', 'REVIEW', 'Review', 909, CURRENT_TIMESTAMP);
    INSERT INTO "StaffShift" ("id", "clinicId", "userId", "roleAtShift", "checkedInAt", "status", "updatedAt") VALUES
      ('${ID.shiftA1}', '${a1.id}', '${VOLUNTEER_A1.id}', 'VOLUNTEER', CURRENT_TIMESTAMP, 'ACTIVE', CURRENT_TIMESTAMP),
      ('${ID.shiftDoctor}', '${a1.id}', '${DOCTOR_A1.id}', 'DOCTOR', CURRENT_TIMESTAMP, 'ACTIVE', CURRENT_TIMESTAMP),
      ('${ID.shiftB1}', '${b1.id}', '${VOLUNTEER_B1.id}', 'VOLUNTEER', CURRENT_TIMESTAMP, 'ACTIVE', CURRENT_TIMESTAMP);
    INSERT INTO "Patient" ("id", "patientCode", "primaryClinicId", "firstName", "lastName", "nationalIdType", "nationalIdCiphertext", "nationalIdHash", "nationalIdLast4", "updatedAt")
      VALUES ('${ID.patient}', 'PRF-0001', '${a1.id}', 'Screened', 'Patient', 'OTHER', 'c-prf', 'h-prf', '0000', CURRENT_TIMESTAMP);
    INSERT INTO "PatientCheckIn" ("id", "clinicId", "patientId", "checkedInAt", "status", "updatedAt")
      VALUES ('${ID.checkIn}', '${a1.id}', '${ID.patient}', CURRENT_TIMESTAMP, 'IN_PROGRESS', CURRENT_TIMESTAMP);
    INSERT INTO "PatientStationVisit" ("id", "clinicId", "patientCheckInId", "stationId", "status", "queuedAt", "queuedByUserId", "claimedByUserId", "claimedAt", "updatedAt")
      VALUES ('${ID.visit}', '${a1.id}', '${ID.checkIn}', '${ID.intake}', 'IN_PROGRESS', CURRENT_TIMESTAMP, '${VOLUNTEER_A1.id}', '${VOLUNTEER_A1.id}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  `;
}

class StationRoute {
  handle() {}
}

describePerformer('who actually screened at a station (#227)', () => {
  jest.setTimeout(180_000);
  const sourceUrl = process.env.DATABASE_URL;
  const appUrl = process.env.APP_DATABASE_URL;
  const database = `nkwapa_station_performer_${Date.now()}`;
  const originalAppUrl = process.env.APP_DATABASE_URL;
  let owner: Client;
  let prisma: PrismaService;
  let interceptor: PrismaRlsInterceptor;
  let service: StationService;

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
    service = new StationService(prisma, new AuditService(prisma));
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

  /** One request by `user`, through the real RLS interceptor. */
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

  const actor = (user: TenantFixtureUser) => ({ userId: user.id, canManage: false });
  const ama = { isAccountHolder: false, name: 'Ama Mensah' };

  it('refuses someone else named without a name, in the database itself', async () => {
    await expect(
      owner.query(
        `UPDATE "StaffShift" SET "screenerIsAccountHolder" = false, "screenerName" = '  ' WHERE "id" = $1`,
        [ID.shiftA1],
      ),
    ).rejects.toMatchObject({ constraint: 'StaffShift_screener_name_check' });
    await expect(
      owner.query(
        `UPDATE "PatientStationVisit" SET "performedByIsAccountHolder" = false, "performedByName" = NULL WHERE "id" = $1`,
        [ID.visit],
      ),
    ).rejects.toMatchObject({ constraint: 'PatientStationVisit_performer_name_check' });
  });

  it("refuses another user's shift, and another clinic's", async () => {
    await expect(
      as(VOLUNTEER_A1, () =>
        service.setShiftScreener(a1.id, ID.shiftDoctor, actor(VOLUNTEER_A1), ama),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      as(VOLUNTEER_A1, () => service.setShiftScreener(a1.id, ID.shiftB1, actor(VOLUNTEER_A1), ama)),
    ).rejects.toMatchObject({ status: 404 });
    const { rows } = await owner.query(
      `SELECT "screenerIsAccountHolder" FROM "StaffShift" WHERE "id" IN ($1, $2)`,
      [ID.shiftDoctor, ID.shiftB1],
    );
    expect(rows).toEqual([{ screenerIsAccountHolder: true }, { screenerIsAccountHolder: true }]);
  });

  it("stamps a completion with the shift's screener, keeping the account as the actor", async () => {
    await as(VOLUNTEER_A1, () =>
      service.setShiftScreener(a1.id, ID.shiftA1, actor(VOLUNTEER_A1), ama),
    );
    const result = await as(VOLUNTEER_A1, () =>
      service.complete(a1.id, ID.visit, actor(VOLUNTEER_A1), {}),
    );
    expect(result.visit).toMatchObject({
      status: 'COMPLETED',
      completedBy: { id: VOLUNTEER_A1.id },
      performedByName: 'Ama Mensah',
    });

    const { rows } = await owner.query(
      `SELECT "actorUserId", "afterJson" FROM "AuditEvent" WHERE "action" = 'STATION.COMPLETE' AND "entityId" = $1`,
      [ID.visit],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].actorUserId).toBe(VOLUNTEER_A1.id);
    expect(JSON.parse(rows[0].afterJson)).toMatchObject({
      performedByIsAccountHolder: false,
      performedByName: 'Ama Mensah',
    });
  });
});
