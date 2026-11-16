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
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaRlsInterceptor } from '../prisma/prisma-rls.interceptor';
import { FollowUpController } from './follow-up.controller';
import { FollowUpRiskService } from './follow-up-risk.service';

/**
 * The live tier (#336) against PostgreSQL as the unprivileged application role: a recompute writes
 * history only when the answer changes, a save's recompute runs after its transaction commits, only
 * clinical staff at the patient's clinic can read a tier, and nobody but the system can write one.
 * Gated with the organization and zone isolation suite and run in the same CI step.
 */
const describeRisk = process.env.RUN_ORG_ZONE_ISOLATION_TESTS === '1' ? describe : describe.skip;

function databaseUrl(source: string, database: string): string {
  const url = new URL(source);
  url.pathname = `/${database}`;
  return url.toString();
}

const { a1 } = TENANT_CLINICS;
const PATIENT = TENANT_PATIENTS.a1Primary;
const DOCTOR_A1 = tenantUser('a1', 'DOCTOR');
const VOLUNTEER_A1 = tenantUser('a1', 'VOLUNTEER');
const DOCTOR_B1 = tenantUser('b1', 'DOCTOR');

class FollowUpRoute {
  handle() {}
}

describeRisk('live follow-up tier', () => {
  jest.setTimeout(180_000);

  const sourceUrl = process.env.DATABASE_URL;
  const appUrl = process.env.APP_DATABASE_URL;
  const database = `nkwapa_follow_up_risk_${Date.now()}`;
  const originalAppUrl = process.env.APP_DATABASE_URL;
  const originalFlag = process.env.FEATURE_FOLLOW_UP_STRATIFICATION_ENABLED;

  let prisma: PrismaService;
  let interceptor: PrismaRlsInterceptor;
  let risk: FollowUpRiskService;
  let encounterId: string;

  beforeAll(async () => {
    if (!sourceUrl) throw new Error('DATABASE_URL is required');
    if (!appUrl) throw new Error('APP_DATABASE_URL is required');
    process.env.FEATURE_FOLLOW_UP_STRATIFICATION_ENABLED = 'true';

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
    risk = new FollowUpRiskService(prisma, new AuditService(prisma));

    // A crisis reading with chest pain, recorded today.
    encounterId = await prisma.withSystemContext({ systemReason: 'Test fixture' }, async (tx) => {
      const encounter = await tx.encounter.create({
        data: { clinicId: a1.id, patientId: PATIENT.id, createdByUserId: DOCTOR_A1.id },
      });
      await tx.vitals.create({
        data: { clinicId: a1.id, encounterId: encounter.id, systolicBp: 186, diastolicBp: 114 },
      });
      await tx.hypertensionAssessment.create({
        data: {
          clinicId: a1.id,
          encounterId: encounter.id,
          authoredByUserId: DOCTOR_A1.id,
          currentSymptoms: ['CHEST_PAIN'],
        },
      });
      return encounter.id;
    });
  });

  afterAll(async () => {
    await prisma?.onModuleDestroy().catch(() => {});
    process.env.APP_DATABASE_URL = originalAppUrl;
    process.env.FEATURE_FOLLOW_UP_STRATIFICATION_ENABLED = originalFlag;
    if (!sourceUrl) return;
    const root = new Client({ connectionString: databaseUrl(sourceUrl, 'postgres') });
    await root.connect();
    await root.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await root.end();
  });

  /** Work as a signed-in user, through the real RLS interceptor and its one transaction. */
  function as<T>(user: TenantFixtureUser, work: () => Promise<T>): Promise<T> {
    const request = { headers: {}, user: { user: { id: user.id }, roles: user.roles } };
    const context = {
      getType: () => 'http',
      getHandler: () => FollowUpRoute.prototype.handle,
      getClass: () => FollowUpRoute,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const handler: CallHandler = { handle: () => from(work()) };
    return lastValueFrom(interceptor.intercept(context, handler) as never) as Promise<T>;
  }

  const system = <T>(
    work: (tx: Parameters<Parameters<PrismaService['withSystemContext']>[1]>[0]) => Promise<T>,
  ) => prisma.withSystemContext({ systemReason: 'Test read' }, work);

  const historyRows = () =>
    system((tx) =>
      tx.patientRiskAssessment.findMany({
        where: { patientId: PATIENT.id },
        orderBy: { computedAt: 'asc' },
      }),
    );

  it('writes the first tier, points the patient at it, and audits the change', async () => {
    expect(await risk.recompute({ patientId: PATIENT.id, trigger: 'BACKFILL' })).toBe('CREATED');

    const rows = await historyRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tier: 'URGENT',
      caughtBy: 'DANGER_SIGNS',
      reasons: expect.arrayContaining(['DANGER_BP_WITH_SYMPTOMS']),
      movement: 'NEW',
      trigger: 'BACKFILL',
    });

    const patient = await system((tx) =>
      tx.patient.findUnique({
        where: { id: PATIENT.id },
        select: { currentRiskTier: true, currentRiskAssessmentId: true },
      }),
    );
    expect(patient).toEqual({ currentRiskTier: 'URGENT', currentRiskAssessmentId: rows[0].id });

    const audit = await system((tx) =>
      tx.auditEvent.findMany({ where: { action: 'FOLLOW_UP_TIER_CHANGED', entityId: rows[0].id } }),
    );
    expect(audit).toHaveLength(1);
  });

  it('writes nothing when the answer has not changed', async () => {
    expect(await risk.recompute({ patientId: PATIENT.id, trigger: 'SWEEP' })).toBe('UNCHANGED');
    expect(await historyRows()).toHaveLength(1);
  });

  it('never returns the tier columns from a query that does not ask for them', async () => {
    const patient = await system((tx) => tx.patient.findUnique({ where: { id: PATIENT.id } }));
    expect(patient).not.toHaveProperty('currentRiskTier');
    expect(patient).not.toHaveProperty('currentRiskAssessmentId');
  });

  it('recomputes after a save commits, once however often the save asks', async () => {
    await as(DOCTOR_A1, async () => {
      await prisma.vitals.update({
        where: { encounterId },
        data: { systolicBp: 128, diastolicBp: 82 },
      });
      for (let i = 0; i < 3; i += 1) {
        await risk.recomputeEncounterAfterCommit({
          encounterId,
          trigger: 'VITALS',
          actorUserId: DOCTOR_A1.id,
        });
      }
      // Still inside the save's transaction: nothing has run yet.
      expect(await prisma.patientRiskAssessment.count({ where: { patientId: PATIENT.id } })).toBe(
        1,
      );
    });

    const rows = await historyRows();
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      previousTier: 'URGENT',
      movement: 'DOWN',
      trigger: 'VITALS',
      triggeredByUserId: DOCTOR_A1.id,
    });
    expect(rows[1].tier).not.toBe('URGENT');
  });

  it('lets clinical staff at the clinic read the tier, volunteers included', async () => {
    const controller = new FollowUpController(prisma, risk);
    const params = { clinicId: a1.id, patientId: PATIENT.id };
    for (const user of [DOCTOR_A1, VOLUNTEER_A1]) {
      const result = await as(user, () => controller.get(params));
      expect(result.history).toHaveLength(2);
      expect(result.current?.movement).toBe('DOWN');
      expect(result.current).not.toHaveProperty('inputSnapshot');
    }
  });

  it('hides the tier from staff at another clinic', async () => {
    const rows = await as(DOCTOR_B1, () =>
      prisma.patientRiskAssessment.findMany({ where: { patientId: PATIENT.id } }),
    );
    expect(rows).toEqual([]);
  });

  it('refuses a tier written by anyone but the system', async () => {
    const [current] = (await historyRows()).slice(-1);
    await expect(
      as(DOCTOR_A1, () =>
        prisma.patientRiskAssessment.create({
          data: {
            clinicId: a1.id,
            patientId: PATIENT.id,
            tier: 'LOW',
            reasons: [],
            missing: [],
            actions: [],
            controlStatus: 'NOT_ASSESSED',
            inputSnapshot: {},
            configVersion: 'forged',
            trigger: 'VITALS',
            movement: 'DOWN',
          },
        }),
      ),
    ).rejects.toThrow();
    await as(DOCTOR_A1, () =>
      prisma.patientRiskAssessment.updateMany({
        where: { id: current.id },
        data: { tier: 'LOW' },
      }),
    );
    await as(DOCTOR_A1, () =>
      prisma.patientRiskAssessment.deleteMany({ where: { id: current.id } }),
    );
    const after = await historyRows();
    expect(after).toHaveLength(2);
    expect(after[1].tier).toBe(current.tier);
  });
});
