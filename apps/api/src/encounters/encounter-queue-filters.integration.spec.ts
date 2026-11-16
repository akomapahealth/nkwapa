import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, lastValueFrom } from 'rxjs';
import { TENANT_CLINICS, tenantFixtureSql, tenantUser } from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaRlsInterceptor } from '../prisma/prisma-rls.interceptor';
import { EncounterRepository } from './encounter.repository';
import { EncounterService } from './encounter.service';

/**
 * Queue search and filters (#340) against PostgreSQL, through the real RLS interceptor, as the
 * unprivileged application role. Clinic A1 runs on New York time, so a clinic-local day is not
 * a UTC day. Gated with the organization and zone isolation suite and run in the same CI step.
 */
const describeQueue = process.env.RUN_ORG_ZONE_ISOLATION_TESTS === '1' ? describe : describe.skip;

function databaseUrl(source: string, database: string): string {
  const url = new URL(source);
  url.pathname = `/${database}`;
  return url.toString();
}

const { a1, b1 } = TENANT_CLINICS;
const DOCTOR_A1 = tenantUser('a1', 'DOCTOR');
const DOCTOR_B1 = tenantUser('b1', 'DOCTOR');

let seq = 0;
const nextId = (prefix: string) => `${prefix}-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

const P = { abena: nextId('6b000000'), kofi: nextId('6b000000'), faraway: nextId('6b000000') };
const E = { abena: nextId('6e000000'), kofi: nextId('6e000000'), faraway: nextId('6e000000') };
/** Newer drafts that push Abena's visit past the first page of 50. */
const BULK = Array.from({ length: 55 }, () => nextId('6e000000'));
const FILLER = nextId('6b000000');

function fixtureSql(): string {
  const sql = [`UPDATE "Clinic" SET "timezone" = 'America/New_York' WHERE "id" = '${a1.id}';`];
  const patient = (id: string, code: string, first: string, last: string, clinicId: string) =>
    sql.push(
      `INSERT INTO "Patient" ("id", "patientCode", "primaryClinicId", "firstName", "lastName", "nationalIdType", "nationalIdCiphertext", "nationalIdHash", "nationalIdLast4", "updatedAt")
       VALUES ('${id}', '${code}', '${clinicId}', '${first}', '${last}', 'OTHER', 'c-${id}', 'h-${id}', '0000', CURRENT_TIMESTAMP);`,
    );
  const encounter = (
    id: string,
    patientId: string,
    clinicId: string,
    userId: string,
    createdAt: string,
    updatedAt: string,
  ) =>
    sql.push(
      `INSERT INTO "Encounter" ("id", "clinicId", "patientId", "status", "createdByUserId", "createdAt", "updatedAt")
       VALUES ('${id}', '${clinicId}', '${patientId}', 'DRAFT', '${userId}', '${createdAt}', '${updatedAt}');`,
    );
  const assess = (encounterId: string, classification: string, type: string, mgDl: number) =>
    sql.push(
      `INSERT INTO "HypertensionAssessment" ("id", "clinicId", "encounterId", "classification", "authoredByUserId", "updatedAt")
       VALUES ('${nextId('6a000000')}', '${a1.id}', '${encounterId}', '${classification}', '${DOCTOR_A1.id}', CURRENT_TIMESTAMP);`,
      `INSERT INTO "DiabetesScreening" ("id", "clinicId", "encounterId", "glucoseType", "glucoseMgDl", "authoredByUserId", "updatedAt")
       VALUES ('${nextId('6d000000')}', '${a1.id}', '${encounterId}', '${type}', ${mgDl}, '${DOCTOR_A1.id}', CURRENT_TIMESTAMP);`,
    );

  patient(P.abena, 'QUE-0001', 'Abena', 'Queueson', a1.id);
  sql.push(
    `INSERT INTO "PatientCodeAlias" ("id", "patientId", "code") VALUES ('${nextId('6c000000')}', '${P.abena}', 'OLD-7777');`,
  );
  patient(P.kofi, 'QUE-0002', 'Kofi', 'Mensah', a1.id);
  patient(FILLER, 'QUE-0003', 'Filler', 'Bulk', a1.id);
  patient(P.faraway, 'QUE-0004', 'Abena', 'Faraway', b1.id);
  // 03:30 UTC on 10 Oct is 23:30 on 9 Oct in New York.
  encounter(E.abena, P.abena, a1.id, DOCTOR_A1.id, '2026-10-10T03:30:00Z', '2026-10-01T00:00:00Z');
  assess(E.abena, 'STAGE2', 'FASTING', 130);
  encounter(E.kofi, P.kofi, a1.id, DOCTOR_A1.id, '2026-10-10T14:00:00Z', '2026-10-02T00:00:00Z');
  assess(E.kofi, 'NORMAL', 'RANDOM', 150);
  for (const id of BULK) {
    encounter(id, FILLER, a1.id, DOCTOR_A1.id, '2026-10-12T14:00:00Z', '2026-10-12T14:00:00Z');
  }
  encounter(
    E.faraway,
    P.faraway,
    b1.id,
    DOCTOR_B1.id,
    '2026-10-10T14:00:00Z',
    '2026-10-12T00:00:00Z',
  );
  return sql.join('\n');
}

class QueueRoute {
  handle() {}
}

describeQueue('encounter queue search and filters (#340)', () => {
  jest.setTimeout(180_000);
  const sourceUrl = process.env.DATABASE_URL;
  const appUrl = process.env.APP_DATABASE_URL;
  const database = `nkwapa_queue_filters_${Date.now()}`;
  const originalAppUrl = process.env.APP_DATABASE_URL;
  let prisma: PrismaService;
  let interceptor: PrismaRlsInterceptor;
  let service: EncounterService;

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
    service = new EncounterService(
      new EncounterRepository(prisma),
      prisma,
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

  /** One drafts-lane read by the A1 doctor, through the real RLS interceptor. */
  function drafts(
    filters: Parameters<EncounterService['listQueuePage']>[1] = {},
    created: { from?: string; to?: string } = {},
    clinicId: string = a1.id,
  ) {
    const request = { headers: {}, user: { user: { id: DOCTOR_A1.id }, roles: DOCTOR_A1.roles } };
    const context = {
      getType: () => 'http',
      getHandler: () => QueueRoute.prototype.handle,
      getClass: () => QueueRoute,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const handler: CallHandler = {
      handle: () =>
        from(service.listQueuePage(clinicId, { status: 'DRAFT', take: 50, ...filters }, created)),
    };
    return lastValueFrom(interceptor.intercept(context, handler) as never) as Promise<
      Awaited<ReturnType<EncounterService['listQueuePage']>>
    >;
  }
  const ids = (page: { rows: Array<{ id: string }> }) => page.rows.map((row) => row.id).sort();

  it('pages the unfiltered lane and counts all of it', async () => {
    const page = await drafts();
    expect(page.rows).toHaveLength(50);
    expect(page.total).toBe(57);
    expect(ids(page)).not.toContain(E.abena);
  });

  it('finds a visit beyond the first page by name, code or alias, any case', async () => {
    for (const search of ['abena', 'QUEUESON', 'que-0001', 'old-77']) {
      const page = await drafts({ search });
      expect(ids(page)).toEqual([E.abena]);
      expect(page.total).toBe(1);
    }
  });

  it('never returns another clinic’s visit, even when the search matches it', async () => {
    expect(ids(await drafts({ search: 'Faraway' }))).toEqual([]);
    // Asking for B1 as an A1 doctor reads nothing: RLS, not only the where clause.
    expect(await drafts({}, {}, b1.id)).toEqual({ rows: [], total: 0 });
  });

  it('filters by BP classification and the high-glucose rule, alone and with search', async () => {
    expect(ids(await drafts({ bpClassification: 'STAGE2' }))).toEqual([E.abena]);
    expect(ids(await drafts({ bpClassification: 'NORMAL' }))).toEqual([E.kofi]);
    const flagged = await drafts({ glucoseFlagged: true });
    expect(ids(flagged)).toEqual([E.abena]);
    expect(flagged.rows[0]).toMatchObject({ glucoseFlagged: true });
    expect((await drafts({ glucoseFlagged: false })).total).toBe(56);
    expect(ids(await drafts({ search: 'kofi', bpClassification: 'STAGE2' }))).toEqual([]);
    expect(ids(await drafts({ search: 'abena', glucoseFlagged: true }))).toEqual([E.abena]);
  });

  it('reads created dates as clinic-local days, inclusive', async () => {
    expect(ids(await drafts({}, { from: '2026-10-09', to: '2026-10-09' }))).toEqual([E.abena]);
    expect(ids(await drafts({}, { from: '2026-10-10', to: '2026-10-10' }))).toEqual([E.kofi]);
    expect((await drafts({}, { from: '2026-10-11' })).total).toBe(55);
    expect(ids(await drafts({}, { to: '2026-10-10' }))).toEqual([E.abena, E.kofi].sort());
  });
});
