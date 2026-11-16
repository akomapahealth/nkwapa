import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, lastValueFrom } from 'rxjs';
import { TENANT_CLINICS, tenantFixtureSql, tenantUser } from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaRlsInterceptor } from '../prisma/prisma-rls.interceptor';
import { MedicalHistoryService } from '../medical-history/medical-history.service';
import { PatientChartService } from './patient-chart.service';
import type { ChartGlance } from './dto/patient-chart.dto';

/**
 * The "At a glance" SQL (#341) against PostgreSQL, through the real RLS interceptor, as the
 * unprivileged application role. The glance is one raw statement, so this is what checks it.
 * Gated with the organization and zone isolation suite and run in the same CI step.
 */
const describeGlance = process.env.RUN_ORG_ZONE_ISOLATION_TESTS === '1' ? describe : describe.skip;

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
const P = { known: nextId('8b000000'), fresh: nextId('8b000000'), unknownType: nextId('8b000000') };

function fixtureSql(): string {
  const sql: string[] = [];
  const patient = (id: string, clinicId: string) =>
    sql.push(
      `INSERT INTO "Patient" ("id", "patientCode", "primaryClinicId", "firstName", "lastName", "nationalIdType", "nationalIdCiphertext", "nationalIdHash", "nationalIdLast4", "updatedAt")
       VALUES ('${id}', 'GLA-${id.slice(-4)}', '${clinicId}', 'Glance', 'Patient', 'OTHER', 'c-${id}', 'h-${id}', '0000', CURRENT_TIMESTAMP);`,
    );
  const encounter = (
    patientId: string,
    at: string,
    clinicId: string = a1.id,
    userId: string = DOCTOR_A1.id,
  ) => {
    const id = nextId('8e000000');
    sql.push(
      `INSERT INTO "Encounter" ("id", "clinicId", "patientId", "status", "createdByUserId", "createdAt", "updatedAt")
       VALUES ('${id}', '${clinicId}', '${patientId}', 'FINALIZED', '${userId}', '${at}', '${at}');`,
    );
    return id;
  };
  const vitals = (
    e: string,
    systolic: number,
    diastolic: number,
    at: string,
    clinicId: string = a1.id,
  ) =>
    sql.push(
      `INSERT INTO "Vitals" ("id", "clinicId", "encounterId", "systolicBp", "diastolicBp", "createdAt", "updatedAt")
       VALUES ('${nextId('8f000000')}', '${clinicId}', '${e}', ${systolic}, ${diastolic}, '${at}', '${at}');`,
    );
  const glucose = (
    e: string,
    mgDl: number,
    type: string,
    at: string,
    extra = '',
    clinicId: string = a1.id,
  ) =>
    sql.push(
      `INSERT INTO "DiabetesScreening" ("id", "clinicId", "encounterId", "glucoseMgDl", "glucoseType", "authoredByUserId", "collectedAt", "updatedAt"${extra ? ', "diabetesStatus", "diabetesType", "hba1cPercent"' : ''})
       VALUES ('${nextId('8d000000')}', '${clinicId}', '${e}', ${mgDl}, '${type}', '${clinicId === a1.id ? DOCTOR_A1.id : DOCTOR_B1.id}', '${at}', '${at}'${extra ? `, ${extra}` : ''});`,
    );

  patient(P.known, a1.id);
  patient(P.fresh, a1.id);
  patient(P.unknownType, a1.id);

  const e1 = encounter(P.known, '2026-09-03T09:00:00Z');
  vitals(e1, 140, 90, '2026-09-03T09:00:00Z');
  glucose(e1, 126, 'FASTING', '2026-09-03T09:00:00Z');
  const e2 = encounter(P.known, '2026-10-03T09:00:00Z');
  vitals(e2, 138, 88, '2026-10-03T09:00:00Z');
  glucose(e2, 250, 'RANDOM', '2026-10-03T09:00:00Z');
  const e3 = encounter(P.known, '2026-10-20T09:00:00Z');
  glucose(e3, 130, 'FASTING', '2026-10-20T09:00:00Z');
  const e4 = encounter(P.known, '2026-11-03T09:00:00Z');
  vitals(e4, 170, 100, '2026-11-03T09:00:00Z');
  glucose(e4, 164, 'FASTING', '2026-11-03T09:00:00Z', `'KNOWN_DIABETES', 'TYPE_2', 7.9`);
  sql.push(
    `INSERT INTO "HypertensionAssessment" ("id", "clinicId", "encounterId", "classification", "hypertensionStatus", "repeatSystolicBp", "repeatDiastolicBp", "authoredByUserId", "collectedAt", "updatedAt")
     VALUES ('${nextId('8a000000')}', '${a1.id}', '${e4}', 'STAGE2', 'KNOWN_HYPERTENSION', 152, 94, '${DOCTOR_A1.id}', '2026-11-03T09:00:00Z', CURRENT_TIMESTAMP);`,
    `INSERT INTO "TobaccoScreening" ("id", "clinicId", "encounterId", "smokingStatus", "createdAt", "updatedAt")
     VALUES ('${nextId('8c000000')}', '${a1.id}', '${e4}', 'CURRENT_DAILY', '2026-11-03T09:00:00Z', CURRENT_TIMESTAMP);`,
    `INSERT INTO "CarePlan" ("id", "clinicId", "encounterId", "followUpDate", "createdAt", "updatedAt")
     VALUES ('${nextId('89000000')}', '${a1.id}', '${e4}', '2026-12-03T00:00:00Z', '2026-11-03T09:00:00Z', CURRENT_TIMESTAMP);`,
  );
  for (const [category, details] of [
    ['CONDITION', { conditionName: 'Hypertension' }],
    ['CONDITION', { conditionName: 'Asthma' }],
    ['FAMILY_HISTORY', { relationship: 'Father', familyCondition: 'Stroke' }],
  ] as const) {
    const record = nextId('88000000');
    const revision = nextId('87000000');
    sql.push(
      `INSERT INTO "MedicalHistoryRecord" ("id", "clinicId", "patientId", "category", "updatedAt")
       VALUES ('${record}', '${a1.id}', '${P.known}', '${category}', CURRENT_TIMESTAMP);`,
      `INSERT INTO "MedicalHistoryRevision" ("id", "recordId", "revisionNumber", "status", "details", "authoredByUserId")
       VALUES ('${revision}', '${record}', 1, 'ACTIVE', '${JSON.stringify(details)}', '${DOCTOR_A1.id}');`,
      `UPDATE "MedicalHistoryRecord" SET "currentRevisionId" = '${revision}' WHERE "id" = '${record}';`,
    );
  }

  // A newer, much higher reading at another clinic must not reach A1's glance.
  const other = encounter(P.known, '2026-11-10T09:00:00Z', b1.id, DOCTOR_B1.id);
  vitals(other, 210, 120, '2026-11-10T09:00:00Z', b1.id);
  glucose(other, 400, 'FASTING', '2026-11-10T09:00:00Z', '', b1.id);

  // An unknown glucose type has nothing to compare with.
  for (const at of ['2026-09-01T09:00:00Z', '2026-10-01T09:00:00Z', '2026-11-01T09:00:00Z']) {
    glucose(encounter(P.unknownType, at), 150, 'UNKNOWN', at);
  }
  return sql.join('\n');
}

class ChartRoute {
  handle() {}
}

describeGlance('patient chart at a glance (#341)', () => {
  jest.setTimeout(180_000);
  const sourceUrl = process.env.DATABASE_URL;
  const appUrl = process.env.APP_DATABASE_URL;
  const database = `nkwapa_chart_glance_${Date.now()}`;
  const originalAppUrl = process.env.APP_DATABASE_URL;
  const originalFlags = {
    history: process.env.FEATURE_MEDICAL_HISTORY_ENABLED,
    medications: process.env.FEATURE_MEDICATION_RECONCILIATION_ENABLED,
  };
  let prisma: PrismaService;
  let interceptor: PrismaRlsInterceptor;
  let service: PatientChartService;

  beforeAll(async () => {
    if (!sourceUrl) throw new Error('DATABASE_URL is required');
    if (!appUrl) throw new Error('APP_DATABASE_URL is required');
    process.env.FEATURE_MEDICAL_HISTORY_ENABLED = 'true';
    process.env.FEATURE_MEDICATION_RECONCILIATION_ENABLED = 'true';
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
    service = new PatientChartService(
      prisma,
      new MedicalHistoryService(prisma, undefined as never),
    );
  });

  afterAll(async () => {
    await prisma?.onModuleDestroy().catch(() => {});
    process.env.APP_DATABASE_URL = originalAppUrl;
    process.env.FEATURE_MEDICAL_HISTORY_ENABLED = originalFlags.history;
    process.env.FEATURE_MEDICATION_RECONCILIATION_ENABLED = originalFlags.medications;
    if (!sourceUrl) return;
    const root = new Client({ connectionString: databaseUrl(sourceUrl, 'postgres') });
    await root.connect();
    await root.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await root.end();
  });

  /** One summary read by the A1 doctor, through the real RLS interceptor. */
  function glance(patientId: string): Promise<ChartGlance> {
    const request = { headers: {}, user: { user: { id: DOCTOR_A1.id }, roles: DOCTOR_A1.roles } };
    const context = {
      getType: () => 'http',
      getHandler: () => ChartRoute.prototype.handle,
      getClass: () => ChartRoute,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const handler: CallHandler = {
      handle: () =>
        from(
          service
            .getSummary(a1.id, patientId, { userId: DOCTOR_A1.id, roles: DOCTOR_A1.roles as never })
            .then((summary) => summary.glance),
        ),
    };
    return lastValueFrom(interceptor.intercept(context, handler) as never) as Promise<ChartGlance>;
  }

  it('summarises a patient with history from this clinic’s records only', async () => {
    const result = await glance(P.known);
    expect(result.conditions).toEqual({
      history: ['Asthma'],
      screening: {
        hypertension: 'KNOWN_HYPERTENSION',
        diabetes: 'KNOWN_DIABETES',
        diabetesType: 'TYPE_2',
      },
    });
    // 152 (the repeat) against the mean of 138 and 140.
    expect(result.bloodPressure).toMatchObject({
      latest: { systolic: 152, diastolic: 94, repeat: true },
      previous: [{ systolic: 138 }, { systolic: 140 }],
      direction: 'RISING',
    });
    expect(result.bloodPressure?.latest?.recordedAt).toEqual(new Date('2026-11-03T09:00:00Z'));
    // The random 250 sits between the fasting readings and is skipped.
    expect(result.glucose).toMatchObject({
      latest: { mgDl: 164, type: 'FASTING' },
      previous: [{ mgDl: 130 }, { mgDl: 126 }],
      direction: 'RISING',
      hba1c: { percent: 7.9 },
    });
    expect(result.risks).toMatchObject({
      familyHistory: [{ relationship: 'Father', condition: 'Stroke' }],
      screening: { tobacco: { smoking: 'CURRENT_DAILY' }, pregnantRecordedAt: null },
    });
    expect(result.screenings).toEqual(
      expect.arrayContaining([
        { kind: 'TOBACCO', lastAt: new Date('2026-11-03T09:00:00Z') },
        { kind: 'EYE', lastAt: null },
      ]),
    );
    expect(result.care).toMatchObject({
      visits: 4,
      followUp: { dueOn: '2026-12-03' },
    });
  });

  it('gives a new patient a block of empty parts', async () => {
    expect(await glance(P.fresh)).toMatchObject({
      conditions: { history: [], screening: { hypertension: null, diabetes: null } },
      bloodPressure: { latest: null, direction: 'NOT_ENOUGH_DATA' },
      glucose: { latest: null, previous: [], hba1c: null },
      medications: { currentCount: 0, adherence: null },
      care: { visits: 0, lastVisitAt: null, followUp: null },
    });
  });

  it('never trends glucose of an unknown type', async () => {
    const result = await glance(P.unknownType);
    expect(result.glucose).toMatchObject({
      latest: { mgDl: 150, type: 'UNKNOWN' },
      previous: [],
      direction: 'NOT_ENOUGH_DATA',
    });
  });
});
