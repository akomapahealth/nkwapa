import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, lastValueFrom } from 'rxjs';
import { TENANT_CLINICS, tenantFixtureSql, tenantUser, type TenantFixtureUser } from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaRlsInterceptor } from '../prisma/prisma-rls.interceptor';
import { PatientRepository } from './patient.repository';
import { PatientService, type PatientRegistryPage } from './patient.service';

/**
 * The completed-screening filter (#224) against PostgreSQL, through the real RLS interceptor,
 * as the unprivileged application role. One patient per edge case of the qualifying rule in
 * docs/specs/06_PATIENTS_MODULE.md, "Completed-screening filter".
 *
 * Clinic A1 runs on New York time here, so a clinic-local day is not a UTC day.
 * Gated with the organization and zone isolation suite and run in the same CI step.
 */
const describeScreened =
  process.env.RUN_ORG_ZONE_ISOLATION_TESTS === '1' ? describe : describe.skip;

function databaseUrl(source: string, database: string): string {
  const url = new URL(source);
  url.pathname = `/${database}`;
  return url.toString();
}

const { a1, b1 } = TENANT_CLINICS;
const DOCTOR_A1 = tenantUser('a1', 'DOCTOR');

const STATIONS = {
  a1Intake: '5a000000-0000-4000-8000-000000000001',
  a1Review: '5a000000-0000-4000-8000-000000000002',
  b1Review: '5a000000-0000-4000-8000-000000000003',
};

let seq = 0;
const nextId = (prefix: string) => `${prefix}-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

/** Patients by edge case. Every one is registered at A1. */
const P = {
  late: nextId('5b000000'),
  twoDays: nextId('5b000000'),
  legacy: nextId('5b000000'),
  waiting: nextId('5b000000'),
  cancelled: nextId('5b000000'),
  inProgress: nextId('5b000000'),
  finalizedNoReview: nextId('5b000000'),
  otherClinic: nextId('5b000000'),
  merged: nextId('5b000000'),
};
const BULK = Array.from({ length: 7 }, () => nextId('5b000000'));
const SAME_DAY_MATCHES = [P.late, P.twoDays, P.legacy, ...BULK];

function fixtureSql(): string {
  const sql: string[] = [
    `UPDATE "Clinic" SET "timezone" = 'America/New_York' WHERE "id" = '${a1.id}';`,
    `INSERT INTO "ClinicStation" ("id", "clinicId", "kind", "name", "sortOrder", "updatedAt") VALUES
      ('${STATIONS.a1Intake}', '${a1.id}', 'INTAKE', 'Intake', 901, CURRENT_TIMESTAMP),
      ('${STATIONS.a1Review}', '${a1.id}', 'REVIEW', 'Review', 909, CURRENT_TIMESTAMP),
      ('${STATIONS.b1Review}', '${b1.id}', 'REVIEW', 'Review', 909, CURRENT_TIMESTAMP);`,
  ];
  const patient = (id: string, lastName: string, mergedInto?: string) =>
    sql.push(
      `INSERT INTO "Patient" ("id", "patientCode", "primaryClinicId", "firstName", "lastName", "nationalIdType", "nationalIdCiphertext", "nationalIdHash", "nationalIdLast4", "mergedIntoPatientId", "updatedAt")
       VALUES ('${id}', 'SCR-${id.slice(-4)}', '${a1.id}', 'Screened', '${lastName}', 'OTHER', 'c-${id}', 'h-${id}', '0000', ${mergedInto ? `'${mergedInto}'` : 'NULL'}, CURRENT_TIMESTAMP);`,
    );
  const checkIn = (patientId: string, status: string, at: string, clinicId: string = a1.id) => {
    const id = nextId('5c000000');
    sql.push(
      `INSERT INTO "PatientCheckIn" ("id", "clinicId", "patientId", "checkedInAt", "status", "updatedAt")
       VALUES ('${id}', '${clinicId}', '${patientId}', '${at}', '${status}', CURRENT_TIMESTAMP);`,
    );
    return id;
  };
  const visit = (
    checkInId: string,
    stationId: string,
    status: string,
    completedAt: string | null,
    clinicId: string = a1.id,
  ) =>
    sql.push(
      `INSERT INTO "PatientStationVisit" ("id", "clinicId", "patientCheckInId", "stationId", "status", "queuedAt", "queuedByUserId", "completedAt", "updatedAt")
       VALUES ('${nextId('5d000000')}', '${clinicId}', '${checkInId}', '${stationId}', '${status}', '2026-10-10T12:00:00Z', '${DOCTOR_A1.id}', ${completedAt ? `'${completedAt}'` : 'NULL'}, CURRENT_TIMESTAMP);`,
    );

  // 23:30 New York on 10 Oct is 03:30 UTC on 11 Oct.
  patient(P.late, 'Late');
  visit(
    checkIn(P.late, 'COMPLETED', '2026-10-10T22:00:00Z'),
    STATIONS.a1Review,
    'COMPLETED',
    '2026-10-11T03:30:00Z',
  );

  patient(P.twoDays, 'TwoDays');
  for (const day of ['2026-10-03', '2026-10-10']) {
    visit(
      checkIn(P.twoDays, 'COMPLETED', `${day}T14:00:00Z`),
      STATIONS.a1Review,
      'COMPLETED',
      `${day}T16:00:00Z`,
    );
  }

  // The screening-sheet import: COMPLETED, no station visits.
  patient(P.legacy, 'Legacy');
  checkIn(P.legacy, 'COMPLETED', '2026-10-10T14:00:00Z');

  patient(P.waiting, 'Waiting');
  checkIn(P.waiting, 'WAITING', '2026-10-10T14:00:00Z');

  patient(P.cancelled, 'Cancelled');
  checkIn(P.cancelled, 'CANCELLED', '2026-10-10T14:00:00Z');

  patient(P.inProgress, 'InProgress');
  visit(
    checkIn(P.inProgress, 'IN_PROGRESS', '2026-10-10T14:00:00Z'),
    STATIONS.a1Intake,
    'COMPLETED',
    '2026-10-10T15:00:00Z',
  );

  // Marked COMPLETED by an encounter finalize while the Review visit was still queued.
  patient(P.finalizedNoReview, 'FinalizedNoReview');
  const finalized = checkIn(P.finalizedNoReview, 'COMPLETED', '2026-10-10T14:00:00Z');
  visit(finalized, STATIONS.a1Intake, 'COMPLETED', '2026-10-10T15:00:00Z');
  visit(finalized, STATIONS.a1Review, 'QUEUED', null);

  // Registered at A1, screened at B1.
  patient(P.otherClinic, 'OtherClinic');
  visit(
    checkIn(P.otherClinic, 'COMPLETED', '2026-10-10T14:00:00Z', b1.id),
    STATIONS.b1Review,
    'COMPLETED',
    '2026-10-10T16:00:00Z',
    b1.id,
  );

  // A merge tombstone keeps nothing visible in the registry.
  patient(P.merged, 'Merged', P.twoDays);
  checkIn(P.merged, 'COMPLETED', '2026-10-10T14:00:00Z');

  for (const id of BULK) {
    patient(id, 'Bulk');
    visit(
      checkIn(id, 'COMPLETED', '2026-10-10T13:00:00Z'),
      STATIONS.a1Review,
      'COMPLETED',
      '2026-10-10T15:00:00Z',
    );
  }
  return sql.join('\n');
}

class RegistryRoute {
  handle() {}
}

describeScreened('patient registry completed-screening filter', () => {
  jest.setTimeout(180_000);

  const sourceUrl = process.env.DATABASE_URL;
  const appUrl = process.env.APP_DATABASE_URL;
  const database = `nkwapa_registry_screened_${Date.now()}`;
  const originalAppUrl = process.env.APP_DATABASE_URL;

  let prisma: PrismaService;
  let interceptor: PrismaRlsInterceptor;
  let service: PatientService;

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
    await owner.query(fixtureSql());
    await owner.end();

    process.env.APP_DATABASE_URL = databaseUrl(appUrl, database);
    prisma = new PrismaService();
    await prisma.onModuleInit();
    interceptor = new PrismaRlsInterceptor(prisma, new Reflector());
    service = new PatientService(
      new PatientRepository(prisma),
      prisma,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );
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

  /** One registry read by an A1 doctor, through the real RLS interceptor. */
  function asDoctor<T>(work: () => Promise<T>, user: TenantFixtureUser = DOCTOR_A1): Promise<T> {
    const request = { headers: {}, user: { user: { id: user.id }, roles: user.roles } };
    const context = {
      getType: () => 'http',
      getHandler: () => RegistryRoute.prototype.handle,
      getClass: () => RegistryRoute,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const handler: CallHandler = { handle: () => from(work()) };
    return lastValueFrom(interceptor.intercept(context, handler) as never) as Promise<T>;
  }

  const list = (
    screened: { from?: string; to?: string } | undefined,
    extra: {
      q?: string;
      page?: number;
      pageSize?: number;
      sortBy?: 'name' | 'lastScreenedAt';
    } = {},
  ): Promise<PatientRegistryPage> =>
    asDoctor(() =>
      service.listRegistry(a1.id, extra.q ?? '', extra.page ?? 1, extra.pageSize ?? 50, {
        screened,
        sort: extra.sortBy ? { field: extra.sortBy, direction: 'desc' } : undefined,
      }),
    );
  const ids = (page: PatientRegistryPage) => page.items.map((item) => item.id).sort();

  it('matches each completed screening on its clinic-local day, and nothing else', async () => {
    const page = await list({ from: '2026-10-10' });

    expect(ids(page)).toEqual([...SAME_DAY_MATCHES].sort());
    expect(page.total).toBe(SAME_DAY_MATCHES.length);
    expect(page.timezone).toBe('America/New_York');
  });

  it('does not move a 23:30 local completion onto the next UTC day', async () => {
    const page = await list({ from: '2026-10-11' });
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });

  it('is inclusive on both ends and lists a patient once with every matching date', async () => {
    expect(ids(await list({ from: '2026-10-03', to: '2026-10-03' }))).toEqual([P.twoDays]);

    const page = await list({ from: '2026-10-01', to: '2026-10-15' });
    expect(page.total).toBe(SAME_DAY_MATCHES.length);
    const twoDays = page.items.filter((item) => item.id === P.twoDays);
    expect(twoDays).toHaveLength(1);
    expect(twoDays[0].matchingScreenings?.map((s) => s.date)).toEqual(['2026-10-10', '2026-10-03']);
  });

  it('labels the imported cohort as legacy with no completion time', async () => {
    const page = await list({ from: '2026-10-10' });
    const legacy = page.items.find((item) => item.id === P.legacy);
    expect(legacy?.matchingScreenings).toEqual([
      expect.objectContaining({ date: '2026-10-10', completedAt: null, source: 'LEGACY_CHECKIN' }),
    ]);
    const late = page.items.find((item) => item.id === P.late);
    expect(late?.matchingScreenings?.[0]).toMatchObject({
      source: 'REVIEW_STATION',
      completedAt: '2026-10-11T03:30:00.000Z',
    });
  });

  it('intersects with the text search', async () => {
    const page = await list({ from: '2026-10-10' }, { q: 'Bulk' });
    expect(ids(page)).toEqual([...BULK].sort());
    expect(page.total).toBe(BULK.length);
  });

  it.each(['name', 'lastScreenedAt'] as const)(
    'pages by %s with no duplicates or gaps',
    async (sortBy) => {
      const seen: string[] = [];
      for (const pageNumber of [1, 2, 3]) {
        const page = await list({ from: '2026-10-10' }, { page: pageNumber, pageSize: 4, sortBy });
        expect(page.total).toBe(SAME_DAY_MATCHES.length);
        seen.push(...page.items.map((item) => item.id));
      }
      expect(seen).toHaveLength(SAME_DAY_MATCHES.length);
      expect([...seen].sort()).toEqual([...SAME_DAY_MATCHES].sort());
    },
  );

  it('leaves the registry response unchanged without the date params', async () => {
    const page = await list(undefined);
    expect(page).not.toHaveProperty('timezone');
    expect(page.items.length).toBeGreaterThan(SAME_DAY_MATCHES.length);
    expect(page.items.some((item) => 'matchingScreenings' in item)).toBe(false);
  });
});
