import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { defer, from, lastValueFrom } from 'rxjs';
import {
  TENANT_CLINICS,
  TENANT_PATIENTS,
  tenantFixtureSql,
  tenantUser,
  type TenantFixtureUser,
} from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaRlsInterceptor } from '../prisma/prisma-rls.interceptor';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { Idempotent } from './idempotent.decorator';
import { IdempotencyRetentionSweep } from './idempotency-retention.sweep';
import { JobTenantContextRunner } from '../prisma/job-tenant-context.runner';
import type { MaintenanceScheduler } from '../maintenance/maintenance-scheduler';

/**
 * Idempotency keys for online writes (#307) against PostgreSQL, through the real RLS and
 * idempotency interceptors, as the unprivileged application role. The write is a check-in, the
 * duplicate the issue names first.
 *
 * Gated with the organization and zone isolation suite and run in the same CI step.
 */
const describeIdempotency =
  process.env.RUN_ORG_ZONE_ISOLATION_TESTS === '1' ? describe : describe.skip;

function databaseUrl(source: string, database: string): string {
  const url = new URL(source);
  url.pathname = `/${database}`;
  return url.toString();
}

const { a1 } = TENANT_CLINICS;
const PATIENT = TENANT_PATIENTS.a1Primary;
const VOLUNTEER_A1 = tenantUser('a1', 'VOLUNTEER');
const DOCTOR_A1 = tenantUser('a1', 'DOCTOR');

class CheckInRoute {
  @Idempotent()
  handle() {}
}

describeIdempotency('idempotency keys for online writes (#307)', () => {
  jest.setTimeout(180_000);
  const sourceUrl = process.env.DATABASE_URL;
  const appUrl = process.env.APP_DATABASE_URL;
  const database = `nkwapa_idempotency_${Date.now()}`;
  const originalAppUrl = process.env.APP_DATABASE_URL;
  let owner: Client;
  let prisma: PrismaService;
  let rls: PrismaRlsInterceptor;
  let idempotency: IdempotencyInterceptor;
  let writes = 0;

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

    process.env.APP_DATABASE_URL = databaseUrl(appUrl, database);
    prisma = new PrismaService();
    await prisma.onModuleInit();
    rls = new PrismaRlsInterceptor(prisma, new Reflector());
    idempotency = new IdempotencyInterceptor(prisma, new Reflector());
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

  beforeEach(async () => {
    writes = 0;
    await owner.query(`DELETE FROM "IdempotencyRecord"`);
    await owner.query(`DELETE FROM "PatientCheckIn"`);
  });

  /** The check-in write, as a handler would make it inside the request's transaction. */
  async function checkIn(notes: string) {
    writes += 1;
    const row = await prisma.patientCheckIn.create({
      data: { clinicId: a1.id, patientId: PATIENT.id, checkedInAt: new Date(), notes },
      select: { id: true, notes: true },
    });
    return row;
  }

  /** One POST by `user`, through both interceptors in the order PrismaModule registers them. */
  function post<T>(
    user: TenantFixtureUser,
    key: string | null,
    body: { notes: string },
    work: () => Promise<T> = () => checkIn(body.notes) as Promise<T>,
  ): Promise<T> {
    const headers: Record<string, string> = key ? { 'idempotency-key': key } : {};
    const request = {
      method: 'POST',
      url: `/clinics/${a1.id}/ops/checkins`,
      originalUrl: `/clinics/${a1.id}/ops/checkins`,
      body,
      params: { clinicId: a1.id },
      clinicId: a1.id,
      headers: { ...headers, 'x-clinic-id': a1.id },
      user: { user: { id: user.id }, roles: user.roles },
    };
    const response = { statusCode: 201, setHeader: jest.fn() };
    const context = {
      getType: () => 'http',
      getHandler: () => CheckInRoute.prototype.handle,
      getClass: () => CheckInRoute,
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    } as unknown as ExecutionContext;
    const handler: CallHandler = { handle: () => defer(() => from(work())) };
    const inner: CallHandler = { handle: () => idempotency.intercept(context, handler) };
    return lastValueFrom(rls.intercept(context, inner) as never) as Promise<T>;
  }

  async function count(table: string) {
    const { rows } = await owner.query(`SELECT count(*)::int AS n FROM "${table}"`);
    return rows[0].n as number;
  }

  it('the same key twice yields one row and the same response', async () => {
    const first = await post(VOLUNTEER_A1, 'key-checkin-0001', { notes: 'first' });
    const second = await post(VOLUNTEER_A1, 'key-checkin-0001', { notes: 'first' });
    expect(second).toEqual(first);
    expect(writes).toBe(1);
    expect(await count('PatientCheckIn')).toBe(1);
    expect(await count('IdempotencyRecord')).toBe(1);
  });

  it('the same key with a different body gets 422 and writes nothing', async () => {
    await post(VOLUNTEER_A1, 'key-checkin-0002', { notes: 'first' });
    await expect(
      post(VOLUNTEER_A1, 'key-checkin-0002', { notes: 'changed' }),
    ).rejects.toMatchObject({ status: 422, response: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    expect(await count('PatientCheckIn')).toBe(1);
  });

  it('two at once with one key still make one row', async () => {
    const results = await Promise.allSettled([
      post(VOLUNTEER_A1, 'key-checkin-0003', { notes: 'race' }),
      post(VOLUNTEER_A1, 'key-checkin-0003', { notes: 'race' }),
    ]);
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(await count('PatientCheckIn')).toBe(1);
  });

  it('a failed write keeps no key, so the retry goes through once', async () => {
    await expect(
      post(VOLUNTEER_A1, 'key-checkin-0004', { notes: 'x' }, async () => {
        await checkIn('x');
        throw new Error('network dropped mid-save');
      }),
    ).rejects.toThrow('network dropped');
    expect(await count('PatientCheckIn')).toBe(0);
    expect(await count('IdempotencyRecord')).toBe(0);

    await post(VOLUNTEER_A1, 'key-checkin-0004', { notes: 'x' });
    expect(await count('PatientCheckIn')).toBe(1);
  });

  it("keys are per user: another user's key neither replays nor reveals the first", async () => {
    await post(VOLUNTEER_A1, 'key-checkin-0005', { notes: 'mine' });
    await post(DOCTOR_A1, 'key-checkin-0005', { notes: 'mine' });
    expect(await count('PatientCheckIn')).toBe(2);
    expect(await count('IdempotencyRecord')).toBe(2);

    const seen = await post(DOCTOR_A1, null, { notes: '' }, () =>
      prisma.idempotencyRecord.findMany({ select: { userId: true } }),
    );
    expect(seen).toEqual([{ userId: DOCTOR_A1.id }]);
  });

  it('without a key the write is untouched', async () => {
    await post(VOLUNTEER_A1, null, { notes: 'a' });
    await post(VOLUNTEER_A1, null, { notes: 'a' });
    expect(await count('PatientCheckIn')).toBe(2);
    expect(await count('IdempotencyRecord')).toBe(0);
  });

  it('the retention sweep deletes expired records only', async () => {
    await post(VOLUNTEER_A1, 'key-checkin-0006', { notes: 'old' });
    await post(VOLUNTEER_A1, 'key-checkin-0007', { notes: 'new' });
    await owner.query(
      `UPDATE "IdempotencyRecord" SET "expiresAt" = now() - interval '1 minute' WHERE "key" = 'key-checkin-0006'`,
    );
    const sweep = new IdempotencyRetentionSweep(
      { register: jest.fn() } as unknown as MaintenanceScheduler,
      new JobTenantContextRunner(prisma),
    );
    await sweep.run();
    const { rows } = await owner.query(`SELECT "key" FROM "IdempotencyRecord"`);
    expect(rows).toEqual([{ key: 'key-checkin-0007' }]);
  });
});
