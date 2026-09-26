import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import {
  ForbiddenException,
  NotFoundException,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { from, lastValueFrom } from 'rxjs';
import {
  SHARED_ZONE_CODE,
  TENANT_CLINICS,
  TENANT_CROSS_CLINIC_USERS,
  TENANT_ORGANIZATIONS,
  TENANT_PATIENTS,
  TENANT_SYSTEM_ADMIN,
  tenantFixtureSql,
  tenantUser,
  type TenantFixtureUser,
} from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaRlsInterceptor } from '../prisma/prisma-rls.interceptor';
import { ClinicService } from '../clinics/clinic.service';
import { AdminService } from '../admin/admin.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { OrganizationReportService } from '../org-reports/organization-report.service';
import { IncludeStaffInviteScope } from '../staff-invites/staff-invite-scope.decorator';

/**
 * Organization and zone isolation, proven end to end against PostgreSQL. Issue #16.
 *
 * The unit suites prove how filters are composed; `packages/db/src/tenant-isolation` proves the
 * policies in raw SQL. Neither shows that a real request, from a real actor, through the real RLS
 * interceptor and the real services, returns only what that actor may see. This does.
 *
 * It runs against a fresh database built from every migration, seeded with the canonical tenant
 * fixture (two organizations, three clinics, a zone that straddles the organizations, one user per
 * role per clinic, and users whose roles span clinics), and connects the service as the
 * unprivileged application role, so row level security is enforced rather than bypassed.
 *
 * The policy these tests hold is stated in docs/specs/03_AUTH_AND_RBAC.md, "Organization and zone
 * isolation":
 *   - A clinic role sees its clinics' rows and nothing else, whatever it asks for.
 *   - Organization and zone are filters, never grants: they only ever narrow.
 *   - SYSTEM_ADMIN's global visibility comes from its global seat, and only from that.
 *   - The active-clinic header chooses among clinics the actor already has; it adds none.
 */
const describeIsolation =
  process.env.RUN_ORG_ZONE_ISOLATION_TESTS === '1' ? describe : describe.skip;

function databaseUrl(source: string, database: string): string {
  const url = new URL(source);
  url.pathname = `/${database}`;
  return url.toString();
}

const { a1, a2, b1 } = TENANT_CLINICS;
const { orgA, orgB } = TENANT_ORGANIZATIONS;
const ALL_CLINICS = [a1.id, a2.id, b1.id];
const DOCTOR_A1 = tenantUser('a1', 'DOCTOR');
const DIRECTOR_A1 = tenantUser('a1', 'DIRECTOR');
const MANAGER_A1 = tenantUser('a1', 'MANAGER');
const VOLUNTEER_A1 = tenantUser('a1', 'VOLUNTEER');
const DIRECTOR_B1 = tenantUser('b1', 'DIRECTOR');
const PATIENT_A1: TenantFixtureUser = {
  id: 'cc000000-0000-4000-8000-000000000950',
  keycloakSub: 'gate-patient-a1',
  displayName: 'Gate Patient A1',
  roles: [{ clinicId: a1.id, role: 'PATIENT' }],
};

/** Controllers the interceptor reads metadata from: an ordinary route and an invitee route. */
class OrdinaryRoute {
  handle() {}
}
class InviteeRoute {
  @IncludeStaffInviteScope()
  handle() {}
}

describeIsolation('organization and zone isolation', () => {
  jest.setTimeout(180_000);

  const sourceUrl = process.env.DATABASE_URL;
  const appUrl = process.env.APP_DATABASE_URL;
  const database = `nkwapa_org_zone_${Date.now()}`;
  const originalAppUrl = process.env.APP_DATABASE_URL;

  let prisma: PrismaService;
  let interceptor: PrismaRlsInterceptor;
  let clinics: ClinicService;
  let admin: AdminService;
  let dashboard: DashboardService;
  let reports: OrganizationReportService;

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
    await owner.query(`
      INSERT INTO "User" ("id", "keycloakSub", "displayName", "updatedAt")
        VALUES ('${PATIENT_A1.id}', '${PATIENT_A1.keycloakSub}', '${PATIENT_A1.displayName}', CURRENT_TIMESTAMP);
      INSERT INTO "UserClinicRole" ("id", "userId", "clinicId", "role")
        VALUES ('ee000000-0000-4000-8000-000000000950', '${PATIENT_A1.id}', '${a1.id}', 'PATIENT');

      -- One encounter per clinic, so every count below has something to leak.
      INSERT INTO "Encounter" ("id", "clinicId", "patientId", "createdByUserId", "updatedAt") VALUES
        ('99100000-0000-4000-8000-0000000000a1', '${a1.id}', '${TENANT_PATIENTS.a1Primary.id}', '${DOCTOR_A1.id}', CURRENT_TIMESTAMP),
        ('99100000-0000-4000-8000-0000000000a2', '${a2.id}', '${TENANT_PATIENTS.a2Primary.id}', '${tenantUser('a2', 'DOCTOR').id}', CURRENT_TIMESTAMP),
        ('99100000-0000-4000-8000-0000000000b1', '${b1.id}', '${TENANT_PATIENTS.b1Primary.id}', '${tenantUser('b1', 'DOCTOR').id}', CURRENT_TIMESTAMP);

      -- The A1 doctor holds an open invitation to join B1. Only the invitee routes may see it.
      UPDATE "User" SET "email" = 'gate-a1-doctor@gate.test' WHERE "id" = '${DOCTOR_A1.id}';
      INSERT INTO "StaffInvite" ("id", "clinicId", "email", "role", "createdByUserId", "expiresAt", "updatedAt")
        VALUES ('99100000-0000-4000-8000-0000000000f1', '${b1.id}', 'gate-a1-doctor@gate.test', 'VOLUNTEER',
                '${DIRECTOR_B1.id}', CURRENT_TIMESTAMP + interval '3 days', CURRENT_TIMESTAMP);
    `);
    await owner.end();

    process.env.APP_DATABASE_URL = databaseUrl(appUrl, database);
    prisma = new PrismaService();
    await prisma.onModuleInit();

    interceptor = new PrismaRlsInterceptor(prisma, new Reflector());
    clinics = new ClinicService(prisma);
    admin = new AdminService(prisma, {} as never, {} as never, {} as never);
    dashboard = new DashboardService(prisma);
    reports = new OrganizationReportService(prisma);
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

  /** Run `work` as one request from `user`, through the real RLS interceptor. */
  function asRequest<T>(
    user: TenantFixtureUser,
    work: () => Promise<T>,
    options: { activeClinicId?: string; route?: typeof OrdinaryRoute } = {},
  ): Promise<T> {
    const route = options.route ?? OrdinaryRoute;
    const request = {
      headers: options.activeClinicId ? { 'x-clinic-id': options.activeClinicId } : {},
      user: { user: { id: user.id }, roles: user.roles },
    };
    const context = {
      getType: () => 'http',
      getHandler: () => route.prototype.handle,
      getClass: () => route,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const handler: CallHandler = { handle: () => from(work()) };
    return lastValueFrom(interceptor.intercept(context, handler) as never) as Promise<T>;
  }

  const actor = (user: TenantFixtureUser) => ({
    userId: user.id,
    roles: user.roles.map((grant) => ({ clinicId: grant.clinicId, role: grant.role as UserRole })),
  });
  const visibleClinicIds = (user: TenantFixtureUser, activeClinicId?: string) =>
    asRequest(
      user,
      async () =>
        (await prisma.patient.findMany({ select: { primaryClinicId: true } })).map(
          (row) => row.primaryClinicId,
        ),
      { activeClinicId },
    ).then((ids) => [...new Set(ids)].sort());

  it('runs as a role row level security actually applies to', async () => {
    const [probe] = await prisma.$queryRaw<Array<{ bypass: boolean; superuser: boolean }>>`
      SELECT rolbypassrls AS bypass, rolsuper AS superuser FROM pg_roles WHERE rolname = current_user`;
    expect(probe).toEqual({ bypass: false, superuser: false });
  });

  describe('clinic membership', () => {
    it.each([
      ['a doctor at A1', DOCTOR_A1, [a1.id]],
      ['a volunteer at A1', VOLUNTEER_A1, [a1.id]],
      ['a patient at A1', PATIENT_A1, [a1.id]],
      ['a director at B1', DIRECTOR_B1, [b1.id]],
      [
        'a manager at A1 who volunteers at B1',
        TENANT_CROSS_CLINIC_USERS.managerAtA1VolunteerAtB1,
        [a1.id, b1.id].sort(),
      ],
    ])('lets %s read exactly their clinics', async (_label, user, expected) => {
      expect(await visibleClinicIds(user)).toEqual(expected);
    });

    // The header picks among clinics the actor already has. Naming another one adds nothing.
    it.each([a2.id, b1.id])(
      'gives a doctor at A1 nothing more for an active-clinic header of %s',
      async (spoofed) => {
        expect(await visibleClinicIds(DOCTOR_A1, spoofed)).toEqual([a1.id]);
      },
    );

    /*
      Behind ClinicScopeGuard, which refuses this first. If a future route ever skipped the guard,
      the database still fails closed: the clinical-note status function refuses a clinic outside
      the context outright, rather than answering with anyone's numbers.
    */
    it('fails closed when a clinic-scoped user reads another clinic dashboard', async () => {
      await expect(
        asRequest(DIRECTOR_A1, () => dashboard.getDashboard(b1.id, ['DIRECTOR'], DIRECTOR_A1.id)),
      ).rejects.toThrow(/Clinical note operational status is not available/);
    });
  });

  describe('system admin visibility is global, and only through the global seat', () => {
    it('sees every clinic', async () => {
      expect(await visibleClinicIds(TENANT_SYSTEM_ADMIN)).toEqual([...ALL_CLINICS].sort());
    });

    // A clinic-scoped row that happens to say SYSTEM_ADMIN is not the global seat.
    it('grants nothing global to a clinic-scoped SYSTEM_ADMIN row', async () => {
      const impostor: TenantFixtureUser = {
        ...DOCTOR_A1,
        roles: [{ clinicId: a1.id, role: 'SYSTEM_ADMIN' }],
      };
      expect(await visibleClinicIds(impostor)).toEqual([a1.id]);
      await expect(
        asRequest(impostor, () => reports.getReport(actor(impostor), orgB.id)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('compares clinics across organizations on the system admin dashboard by shared zone', async () => {
      const result = await asRequest(TENANT_SYSTEM_ADMIN, () =>
        dashboard.getDashboard(a1.id, ['SYSTEM_ADMIN'], TENANT_SYSTEM_ADMIN.id, {
          zoneCode: SHARED_ZONE_CODE,
        }),
      );
      expect(result.systemAdmin?.clinicComparison.map((row) => row.clinicId).sort()).toEqual(
        [a1.id, b1.id].sort(),
      );
    });

    it('does not hand the cross-clinic comparison to a clinic role', async () => {
      const result = await asRequest(DIRECTOR_A1, () =>
        dashboard.getDashboard(a1.id, ['DIRECTOR'], DIRECTOR_A1.id, { zoneCode: SHARED_ZONE_CODE }),
      );
      expect(result.systemAdmin).toBeUndefined();
    });
  });

  describe('organization report (#13)', () => {
    it('rolls up one organization and nothing from the other', async () => {
      const report = await asRequest(TENANT_SYSTEM_ADMIN, () =>
        reports.getReport(actor(TENANT_SYSTEM_ADMIN), orgA.id),
      );
      expect(report.clinics.map((row) => row.clinicId).sort()).toEqual([a1.id, a2.id].sort());
      // A1 has two patients and A2 one; B1's patient must not appear anywhere in the rollup.
      expect(report.totals.patients).toBe(3);
      expect(report.totals.encounters).toBe(2);
    });

    it.each([
      ['director', DIRECTOR_A1],
      ['manager', MANAGER_A1],
      ['doctor', DOCTOR_A1],
      ['volunteer', VOLUNTEER_A1],
      ['patient', PATIENT_A1],
      ['director who also practises at A2', TENANT_CROSS_CLINIC_USERS.directorAtA1DoctorAtA2],
    ])('refuses a %s, even for their own organization', async (_label, user) => {
      await expect(
        asRequest(user, () => reports.getReport(actor(user), orgA.id)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('admin clinic list: organization and zone only narrow (#12, #14)', () => {
    const listFor = (
      user: TenantFixtureUser,
      filters: { zoneCode?: string; organizationId?: string } = {},
    ) =>
      asRequest(user, () => clinics.listAllForAdmin(actor(user), filters)).then((rows) =>
        rows.map((row) => row.id).sort(),
      );

    it('shows a director only the clinics they direct', async () => {
      expect(await listFor(DIRECTOR_A1)).toEqual([a1.id]);
    });

    /*
      The case that separates the two layers. This person may read A2 (they practise there), so
      row level security alone would hand A2 to them; only the service's own scope keeps it off a
      list of clinics they administer. A suite without a user shaped like this cannot tell whether
      that scope works at all, because the database would quietly cover for it.
    */
    it('keeps a clinic someone only practises at off the list of clinics they administer', async () => {
      const directorDoctor = TENANT_CROSS_CLINIC_USERS.directorAtA1DoctorAtA2;
      expect(await visibleClinicIds(directorDoctor)).toEqual([a1.id, a2.id].sort());
      expect(await listFor(directorDoctor)).toEqual([a1.id]);
      expect(await listFor(directorDoctor, { organizationId: orgA.id })).toEqual([a1.id]);
    });

    it("gives a director nothing for another organization's id", async () => {
      expect(await listFor(DIRECTOR_A1, { organizationId: orgB.id })).toEqual([]);
    });

    it('keeps a director inside their clinics for the zone B also uses', async () => {
      expect(await listFor(DIRECTOR_A1, { zoneCode: SHARED_ZONE_CODE })).toEqual([a1.id]);
      expect(await listFor(DIRECTOR_B1, { zoneCode: SHARED_ZONE_CODE })).toEqual([b1.id]);
    });

    it('lets a system admin narrow to either organization', async () => {
      expect(await listFor(TENANT_SYSTEM_ADMIN, { organizationId: orgA.id })).toEqual(
        [a1.id, a2.id].sort(),
      );
      expect(await listFor(TENANT_SYSTEM_ADMIN, { organizationId: orgB.id })).toEqual([b1.id]);
      expect(await listFor(TENANT_SYSTEM_ADMIN, { zoneCode: SHARED_ZONE_CODE })).toEqual(
        [a1.id, b1.id].sort(),
      );
    });

    it.each([MANAGER_A1, DOCTOR_A1, VOLUNTEER_A1, PATIENT_A1])(
      'lists nothing for a role that administers no clinic',
      async (user) => {
        expect(await listFor(user)).toEqual([]);
      },
    );

    it('offers a director only their own organization to pick from', async () => {
      const organizations = await asRequest(DIRECTOR_A1, () =>
        clinics.listOrganizations(actor(DIRECTOR_A1)),
      );
      expect(organizations.map((row) => row.id)).toEqual([orgA.id]);
    });
  });

  describe('admin user lists', () => {
    it("filters a system admin's user list to one organization's people", async () => {
      const rows = await asRequest(TENANT_SYSTEM_ADMIN, () =>
        admin.listUsers(actor(TENANT_SYSTEM_ADMIN), 'all', orgB.id),
      );
      const ids = rows.map((row) => row.id);
      expect(ids).toContain(DIRECTOR_B1.id);
      expect(ids).toContain(TENANT_CROSS_CLINIC_USERS.managerAtA1VolunteerAtB1.id);
      expect(ids).not.toContain(DIRECTOR_A1.id);
      // Nobody in the list is there without a seat in organization B.
      for (const row of rows) {
        expect(row.clinicMemberships.some((m) => m.organizationId === orgB.id)).toBe(true);
      }
    });

    it('refuses the cross-clinic user list to a director', async () => {
      await expect(
        asRequest(DIRECTOR_A1, () => admin.listUsers(actor(DIRECTOR_A1), 'all', orgA.id)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    // Stronger than a refusal: under row level security B1 does not exist for this director, so
    // the answer is "not found" and the clinic's existence is not even confirmed.
    it("does not even confirm another clinic's roster exists to a director", async () => {
      await expect(
        asRequest(DIRECTOR_A1, () => admin.listClinicUsers(actor(DIRECTOR_A1), b1.id)),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("gives a director their own clinic's roster and nobody from B", async () => {
      const roster = await asRequest(DIRECTOR_A1, () =>
        admin.listClinicUsers(actor(DIRECTOR_A1), a1.id, 'all'),
      );
      const ids = roster.items.map((row) => row.id);
      expect(ids).toContain(DOCTOR_A1.id);
      expect(ids).not.toContain(DIRECTOR_B1.id);
    });
  });

  describe('staff invitation scope (#124)', () => {
    const invitesVisible = (route?: typeof OrdinaryRoute) =>
      asRequest(DOCTOR_A1, () => prisma.staffInvite.findMany({ select: { id: true } }), {
        route,
      }).then((rows) => rows.map((row) => row.id));

    // An open invitation to B1 must not give the A1 doctor B1's scope on an ordinary route.
    it('widens nothing on an ordinary route', async () => {
      expect(await invitesVisible()).toEqual([]);
      expect(await visibleClinicIds(DOCTOR_A1)).toEqual([a1.id]);
    });

    it('lets the invitee routes see the invitation addressed to them', async () => {
      expect(await invitesVisible(InviteeRoute)).toEqual(['99100000-0000-4000-8000-0000000000f1']);
    });
  });
});
