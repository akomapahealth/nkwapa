import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { defer, from, lastValueFrom } from 'rxjs';
import {
  STAFF_AGREEMENT,
  TENANT_CLINICS,
  tenantFixtureSql,
  tenantUser,
  type TenantFixtureUser,
} from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaRlsInterceptor } from '../prisma/prisma-rls.interceptor';
import { AuditService } from '../audit/audit.service';
import { runWithOfflineSession } from '../common/request-context.store';
import { OfflineGrantKeysService } from './offline-grant-keys.service';
import { OfflineGrantService } from './offline-grant.service';

/**
 * Offline grants (#207) against PostgreSQL, through the real RLS interceptor, as the unprivileged
 * application role: who can see a grant, who can revoke it, one live grant per device, and the
 * audit column a write replayed from an offline session fills.
 *
 * Gated with the organization and zone isolation suite and run in the same CI step.
 */
const describeGrants = process.env.RUN_ORG_ZONE_ISOLATION_TESTS === '1' ? describe : describe.skip;

function databaseUrl(source: string, database: string): string {
  const url = new URL(source);
  url.pathname = `/${database}`;
  return url.toString();
}

const { a1 } = TENANT_CLINICS;
const DOCTOR_A1 = tenantUser('a1', 'DOCTOR');
const VOLUNTEER_A1 = tenantUser('a1', 'VOLUNTEER');
const MANAGER_A1 = tenantUser('a1', 'MANAGER');
const DEVICE = '0b1f5a3e-6a0e-4d4b-9c1d-2f5f4c0a7e11';

class Route {
  handle() {}
}

describeGrants('offline grants (#207)', () => {
  jest.setTimeout(180_000);
  const sourceUrl = process.env.DATABASE_URL;
  const appUrl = process.env.APP_DATABASE_URL;
  const database = `nkwapa_offline_grants_${Date.now()}`;
  const originalAppUrl = process.env.APP_DATABASE_URL;
  const originalFlag = process.env.FEATURE_OFFLINE_SESSION_ENABLED;
  let owner: Client;
  let prisma: PrismaService;
  let rls: PrismaRlsInterceptor;
  let grants: OfflineGrantService;
  let audit: AuditService;

  beforeAll(async () => {
    if (!sourceUrl) throw new Error('DATABASE_URL is required');
    if (!appUrl) throw new Error('APP_DATABASE_URL is required');
    process.env.FEATURE_OFFLINE_SESSION_ENABLED = 'true';
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
    // Grants go only to staff who finished onboarding.
    await owner.query(
      `UPDATE "User" SET "firstName" = 'Test', "lastName" = 'Staff', "staffAgreementVersion" = $1`,
      [STAFF_AGREEMENT.version],
    );

    process.env.APP_DATABASE_URL = databaseUrl(appUrl, database);
    prisma = new PrismaService();
    await prisma.onModuleInit();
    rls = new PrismaRlsInterceptor(prisma, new Reflector());
    audit = new AuditService(prisma);
    const clinics = {
      findByIds: () =>
        prisma.clinic.findMany({
          where: { id: a1.id },
          select: {
            id: true,
            name: true,
            region: true,
            zoneCode: true,
            timezone: true,
            glucoseUnit: true,
            bodyUnit: true,
            hba1cUnit: true,
          },
        }),
    };
    grants = new OfflineGrantService(
      prisma,
      clinics as never,
      new OfflineGrantKeysService(),
      audit,
    );
  });

  afterAll(async () => {
    await prisma?.onModuleDestroy().catch(() => {});
    await owner?.end().catch(() => {});
    process.env.APP_DATABASE_URL = originalAppUrl;
    if (originalFlag === undefined) delete process.env.FEATURE_OFFLINE_SESSION_ENABLED;
    else process.env.FEATURE_OFFLINE_SESSION_ENABLED = originalFlag;
    if (!sourceUrl) return;
    const root = new Client({ connectionString: databaseUrl(sourceUrl, 'postgres') });
    await root.connect();
    await root.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await root.end();
  });

  beforeEach(async () => {
    await owner.query(`DELETE FROM "OfflineGrant"`);
  });

  /** Run `work` as one request by `user`, through the RLS interceptor. */
  function as<T>(user: TenantFixtureUser, work: () => Promise<T>): Promise<T> {
    const request = {
      method: 'POST',
      url: '/auth/offline-grant',
      originalUrl: '/auth/offline-grant',
      params: {},
      headers: { 'x-clinic-id': a1.id },
      clinicId: a1.id,
      user: { user: { id: user.id, displayName: 'Test Staff' }, roles: user.roles },
    };
    const context = {
      getType: () => 'http',
      getHandler: () => Route.prototype.handle,
      getClass: () => Route,
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
    } as unknown as ExecutionContext;
    const handler: CallHandler = { handle: () => defer(() => from(work())) };
    return lastValueFrom(rls.intercept(context, handler) as never) as Promise<T>;
  }

  const reqUser = (user: TenantFixtureUser) => ({
    user: { id: user.id, keycloakSub: user.id, displayName: 'Test Staff', email: null },
    roles: user.roles,
  });

  const issue = (user: TenantFixtureUser) =>
    as(user, () => grants.issue(reqUser(user), DEVICE, 'Playwright'));

  it('issues a grant its owner can see and nobody else can', async () => {
    const issued = await issue(DOCTOR_A1);
    expect(await as(DOCTOR_A1, () => grants.listLive(DOCTOR_A1.id))).toHaveLength(1);
    expect(await as(VOLUNTEER_A1, () => prisma.offlineGrant.findMany())).toEqual([]);
    expect(
      await as(VOLUNTEER_A1, () =>
        grants.refusalFor(VOLUNTEER_A1.id, issued.claims, new Date().toISOString()),
      ),
    ).toBe('OFFLINE_GRANT_REVOKED');
  });

  it('keeps one live grant per person and device, even when two refreshes race', async () => {
    await Promise.all([issue(DOCTOR_A1), issue(DOCTOR_A1), issue(DOCTOR_A1)]);
    const { rows } = await owner.query(
      `SELECT count(*)::int AS n FROM "OfflineGrant" WHERE "revokedAt" IS NULL`,
    );
    expect(rows[0].n).toBe(1);
  });

  it("lets a manager's offboarding revoke a colleague's grant, which then refuses pushes", async () => {
    const issued = await issue(DOCTOR_A1);
    const revoked = await as(MANAGER_A1, () =>
      grants.revokeAllForUser(DOCTOR_A1.id, 'DEACTIVATED'),
    );
    expect(revoked).toBe(1);
    expect(
      await as(DOCTOR_A1, () =>
        grants.refusalFor(DOCTOR_A1.id, issued.claims, new Date().toISOString()),
      ),
    ).toBe('OFFLINE_GRANT_REVOKED');
    // Revoked, never deleted: the record of what was issued survives.
    await expect(as(DOCTOR_A1, () => prisma.offlineGrant.deleteMany())).resolves.toEqual({
      count: 0,
    });
  });

  it("stores a replayed write's offline session with its audit event", async () => {
    const issued = await issue(DOCTOR_A1);
    const stamp = {
      grantId: issued.claims.grantId,
      deviceId: DEVICE,
      unlockMethod: 'pin' as const,
    };
    await as(DOCTOR_A1, () =>
      runWithOfflineSession(stamp, () =>
        audit.logWrite({
          clinicId: a1.id,
          actorUserId: DOCTOR_A1.id,
          action: 'VITALS.CREATE',
          entityType: 'Vitals',
          entityId: 'vitals-offline-1',
        }),
      ),
    );
    const { rows } = await owner.query(
      `SELECT "offlineSession" FROM "AuditEvent" WHERE "entityId" = 'vitals-offline-1'`,
    );
    expect(rows[0].offlineSession).toEqual(stamp);
  });
});
