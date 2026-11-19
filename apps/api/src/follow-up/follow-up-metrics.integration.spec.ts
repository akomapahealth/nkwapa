import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, lastValueFrom } from 'rxjs';
import {
  TENANT_CLINICS,
  TENANT_PATIENTS,
  tenantFixtureSql,
  tenantUser,
  type TenantFixtureUser,
} from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaRlsInterceptor } from '../prisma/prisma-rls.interceptor';
import { FollowUpMetricsService } from './follow-up-metrics.service';

/**
 * The monthly indicators (#339) against PostgreSQL as the application role: the register is read
 * from the stored snapshots' JSON, readings from visits, deaths from #338's cancellations, and RLS
 * keeps another clinic's director from counting these patients.
 */
const describeMetrics = process.env.RUN_ORG_ZONE_ISOLATION_TESTS === '1' ? describe : describe.skip;

function databaseUrl(source: string, database: string): string {
  const url = new URL(source);
  url.pathname = `/${database}`;
  return url.toString();
}

const { a1 } = TENANT_CLINICS;
const ALIVE = TENANT_PATIENTS.a1Primary;
const DECEASED = TENANT_PATIENTS.a1Secondary;
const DOCTOR_A1 = tenantUser('a1', 'DOCTOR');
const DIRECTOR_A1 = tenantUser('a1', 'DIRECTOR');
const DIRECTOR_B1 = tenantUser('b1', 'DIRECTOR');
const NOW = new Date('2026-11-16T12:00:00Z');
const OCT = new Date('2026-10-15T09:00:00Z');

class MetricsRoute {
  handle() {}
}

describeMetrics('follow-up metrics against PostgreSQL', () => {
  jest.setTimeout(180_000);

  const sourceUrl = process.env.DATABASE_URL;
  const appUrl = process.env.APP_DATABASE_URL;
  const database = `nkwapa_follow_up_metrics_${Date.now()}`;
  const originalAppUrl = process.env.APP_DATABASE_URL;

  let prisma: PrismaService;
  let interceptor: PrismaRlsInterceptor;
  let metrics: FollowUpMetricsService;

  beforeAll(async () => {
    if (!sourceUrl) throw new Error('DATABASE_URL is required');
    if (!appUrl) throw new Error('APP_DATABASE_URL is required');

    const root = new Client({ connectionString: databaseUrl(sourceUrl, 'postgres') });
    await root.connect();
    await root.query(`CREATE DATABASE "${database}"`);
    await root.end();

    const owner = new Client({ connectionString: databaseUrl(sourceUrl, database) });
    await owner.connect();
    const migrationsRoot = resolve(__dirname, '../../../../packages/db/prisma/migrations');
    const migrations = (await readdir(migrationsRoot)).filter((name) => /^\d/.test(name)).sort();
    for (const migration of migrations) {
      await owner.query(
        await readFile(resolve(migrationsRoot, migration, 'migration.sql'), 'utf8'),
      );
    }
    await owner.query(tenantFixtureSql());
    await owner.end();

    process.env.APP_DATABASE_URL = databaseUrl(appUrl, database);
    prisma = new PrismaService();
    await prisma.onModuleInit();
    interceptor = new PrismaRlsInterceptor(prisma, new Reflector());
    metrics = new FollowUpMetricsService(prisma);

    await prisma.withSystemContext({ systemReason: 'Test fixture' }, async (tx) => {
      for (const patient of [ALIVE, DECEASED]) {
        await tx.patientRiskAssessment.create({
          data: {
            clinicId: a1.id,
            patientId: patient.id,
            tier: 'MODERATE',
            reasons: [],
            missing: [],
            actions: [],
            controlStatus: 'CONTROLLED',
            inputSnapshot: {
              hypertensionDiagnosed: true,
              onTreatment: { hypertension: true },
              conditions: [],
              timeZone: 'Africa/Accra',
              today: OCT.toISOString(),
            },
            configVersion: 'test',
            trigger: 'BACKFILL',
            movement: 'NEW',
            computedAt: OCT,
          },
        });
        const encounter = await tx.encounter.create({
          data: {
            clinicId: a1.id,
            patientId: patient.id,
            createdByUserId: DOCTOR_A1.id,
            createdAt: OCT,
          },
        });
        await tx.vitals.create({
          data: { clinicId: a1.id, encounterId: encounter.id, systolicBp: 128, diastolicBp: 78 },
        });
      }
      await tx.followUpContact.create({
        data: {
          clinicId: a1.id,
          patientId: DECEASED.id,
          mode: 'PHONE',
          purpose: 'ROUTINE',
          dueOn: new Date('2026-10-20'),
          tierAtScheduling: 'MODERATE',
          status: 'CANCELLED',
          cancelReason: 'DECEASED',
          cancelledAt: new Date('2026-10-20T10:00:00Z'),
        },
      });
    });
  });

  afterAll(async () => {
    await prisma?.onModuleDestroy().catch(() => {});
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
      getHandler: () => MetricsRoute.prototype.handle,
      getClass: () => MetricsRoute,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const handler: CallHandler = { handle: () => from(work()) };
    return lastValueFrom(interceptor.intercept(context, handler) as never) as Promise<T>;
  }

  it('counts the register from stored snapshots and leaves the deceased patient out', async () => {
    const report = await as(DIRECTOR_A1, () =>
      metrics.report({ clinicIds: [a1.id], timeZone: 'Africa/Accra' }, '2026-10', NOW),
    );
    expect(report.register).toBe(1);
    expect(report.controlled).toEqual({ count: 1, of: 1 });
    expect(report.underCare).toEqual({ count: 1, of: 1 });
    expect(report.tiers.MODERATE).toBe(1);
  });

  it('starts the register at the first stored assessment', async () => {
    // September's end: the assessments are from October, so nobody yet.
    const september = await as(DIRECTOR_A1, () =>
      metrics.report({ clinicIds: [a1.id], timeZone: 'Africa/Accra' }, '2026-09', NOW),
    );
    expect(september.register).toBe(0);
    const trend = (
      await as(DIRECTOR_A1, () =>
        metrics.report({ clinicIds: [a1.id], timeZone: 'Africa/Accra' }, '2026-10', NOW),
      )
    ).trend;
    expect(trend.at(-1)).toMatchObject({ month: '2026-10', register: 1, controlled: 1 });
  });

  it('lists the patients behind a figure', async () => {
    const list = await as(DIRECTOR_A1, () =>
      metrics.patients(
        { clinicIds: [a1.id], timeZone: 'Africa/Accra' },
        '2026-10',
        'controlled',
        NOW,
      ),
    );
    expect(list.total).toBe(1);
    expect(list.patients).toEqual([
      expect.objectContaining({ id: ALIVE.id, patientCode: ALIVE.patientCode }),
    ]);
  });

  it("shows another clinic's director nothing from this clinic", async () => {
    const report = await as(DIRECTOR_B1, () =>
      metrics.report({ clinicIds: [a1.id], timeZone: 'Africa/Accra' }, '2026-10', NOW),
    );
    expect(report.register).toBe(0);
  });
});
