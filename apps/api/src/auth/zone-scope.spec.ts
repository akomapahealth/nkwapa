import { UserRole } from '@prisma/client';
import { SHARED_ZONE_CODE, TENANT_CLINICS, UNZONED_FILTER_VALUE } from '@nkwapa/db';
import { ClinicService } from '../clinics/clinic.service';
import { ClinicsAdminController } from '../clinics/clinics-admin.controller';
import { CLINIC_A1, CLINIC_A2, CLINIC_B1, actor } from '../testing/rbac-harness';

/**
 * Zone is a reporting filter, never a grant.
 *
 * `packages/db/src/rls-coverage.spec.ts` proves the database half: no policy reads the zone
 * context or a zone column. This is the API half, driven through the real `ClinicService`
 * against a Prisma double, because the guarantee lives in the *order* two clauses are composed
 * and that is not visible from either clause alone.
 *
 * The fixture is built for exactly this: `a1` (organization A) and `b1` (organization B) share
 * `SHARED_ZONE_CODE`, so a director of A filtering by it is asking a question whose honest
 * answer spans a tenant boundary. It must not.
 */

/** Records the `where` the service composed, and returns rows the caller decides. */
function buildService(rows: { id: string; zoneCode: string | null }[] = []) {
  const clinicRows = rows.map((row) => ({
    ...row,
    name: row.id,
    organizationId: 'org',
    timezone: 'Africa/Accra',
    locationCode: row.id,
    countryCode: 'GH',
    isActive: true,
    organization: null,
  }));
  const findMany = jest.fn().mockResolvedValue(clinicRows);
  const prisma = {
    clinic: { findMany, findFirst: jest.fn(), findUnique: jest.fn() },
    organization: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
  };
  return { prisma, findMany, service: new ClinicService(prisma as never) };
}

const directorOfA = actor('director-a', [
  { clinicId: CLINIC_A1, role: UserRole.DIRECTOR },
  { clinicId: CLINIC_A2, role: UserRole.DIRECTOR },
]);
const directorOfB = actor('director-b', [{ clinicId: CLINIC_B1, role: UserRole.DIRECTOR }]);

const asActor = (a: typeof directorOfA) => ({ userId: a.user.id, roles: a.roles });

describe('a shared zone grants no access', () => {
  it('is a fixture where one zone really does straddle two organizations', () => {
    // If this ever stopped being true the tests below would pass for the wrong reason.
    expect(TENANT_CLINICS.a1.zoneCode).toBe(SHARED_ZONE_CODE);
    expect(TENANT_CLINICS.b1.zoneCode).toBe(SHARED_ZONE_CODE);
    expect(TENANT_CLINICS.a1.organizationId).not.toBe(TENANT_CLINICS.b1.organizationId);
  });

  it('keeps a director of A inside A when filtering by the zone B also uses', async () => {
    const { service, findMany } = buildService();
    await service.listAllForAdmin(asActor(directorOfA), { zoneCode: SHARED_ZONE_CODE });

    const where = findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      id: { in: [CLINIC_A1, CLINIC_A2] },
      zoneCode: SHARED_ZONE_CODE,
    });
    // The decisive assertion: B's clinic is not reachable by this query under any row it returns.
    expect(where.id.in).not.toContain(CLINIC_B1);
  });

  it('keeps a director of B inside B for the same filter', async () => {
    const { service, findMany } = buildService();
    await service.listAllForAdmin(asActor(directorOfB), { zoneCode: SHARED_ZONE_CODE });

    expect(findMany.mock.calls[0][0].where).toEqual({
      id: { in: [CLINIC_B1] },
      zoneCode: SHARED_ZONE_CODE,
    });
  });

  it('composes the zone clause as an AND, never as an alternative', async () => {
    // An OR is how a filter turns into a grant. There is no branch that produces one, and this
    // is the test that fails if someone adds one.
    for (const zoneCode of [SHARED_ZONE_CODE, UNZONED_FILTER_VALUE, undefined]) {
      const { service, findMany } = buildService();
      await service.listAllForAdmin(asActor(directorOfA), { zoneCode });

      const where = findMany.mock.calls[0][0].where;
      expect(where).not.toHaveProperty('OR');
      expect(where).not.toHaveProperty('NOT');
      expect(where.id).toEqual({ in: [CLINIC_A1, CLINIC_A2] });
    }
  });

  it('answers an unzoned filter without widening either', async () => {
    const { service, findMany } = buildService();
    await service.listAllForAdmin(asActor(directorOfA), { zoneCode: UNZONED_FILTER_VALUE });

    expect(findMany.mock.calls[0][0].where).toEqual({
      id: { in: [CLINIC_A1, CLINIC_A2] },
      zoneCode: null,
    });
  });

  it('never lets a zone list name a zone from another organization', async () => {
    // The picker is a disclosure surface of its own: the set of zone names describes how a
    // tenant is structured, so it is scoped like the table rather than read from every clinic.
    const { service, findMany } = buildService();
    findMany.mockResolvedValue([{ zoneCode: SHARED_ZONE_CODE, isActive: true }]);

    await service.listZonesForActor(asActor(directorOfB));
    expect(findMany.mock.calls[0][0].where).toEqual({ id: { in: [CLINIC_B1] } });
  });
});

describe('the zone filter cannot be reached without the seat', () => {
  const buildController = () => {
    const clinicService = {
      listAllForAdmin: jest.fn().mockResolvedValue([]),
      listZonesForActor: jest.fn().mockResolvedValue([]),
    };
    return {
      clinicService,
      controller: new ClinicsAdminController(clinicService as never, {} as never),
    };
  };

  const seatless = [
    ['a manager', actor('manager', [{ clinicId: CLINIC_A1, role: UserRole.MANAGER }])],
    ['a doctor', actor('doctor', [{ clinicId: CLINIC_A1, role: UserRole.DOCTOR }])],
    ['a volunteer', actor('volunteer', [{ clinicId: CLINIC_A1, role: UserRole.VOLUNTEER }])],
  ] as const;

  it.each(seatless)('refuses %s a zone-filtered clinic list', async (_label, a) => {
    const { controller, clinicService } = buildController();
    await expect(
      controller.listAll({ user: { user: a.user, roles: a.roles } } as never, {
        zoneCode: SHARED_ZONE_CODE,
      }),
    ).rejects.toThrow();
    expect(clinicService.listAllForAdmin).not.toHaveBeenCalled();
  });

  it.each(seatless)('refuses %s the zone list', async (_label, a) => {
    const { controller, clinicService } = buildController();
    await expect(
      controller.listZones({ user: { user: a.user, roles: a.roles } } as never),
    ).rejects.toThrow();
    expect(clinicService.listZonesForActor).not.toHaveBeenCalled();
  });
});

describe('the bootstrap contract carries zone as context only', () => {
  it('never turns a zone into an effective role or permission', async () => {
    // whoami is where a client learns what it may do. A zone appearing anywhere but beside a
    // clinic's name would be the moment zone started reading like a grant.
    const { AuthController } = await import('./auth.controller');
    const clinicService = {
      findByIds: jest
        .fn()
        .mockResolvedValue([
          { id: CLINIC_A1, name: 'A1', region: null, zoneCode: SHARED_ZONE_CODE },
        ]),
      listActiveSwitchableClinics: jest
        .fn()
        .mockResolvedValue([
          { id: CLINIC_A1, name: 'A1', region: null, zoneCode: SHARED_ZONE_CODE },
        ]),
    };
    const prisma = { patientPortalInvite: { findMany: jest.fn().mockResolvedValue([]) } };
    const controller = new AuthController(clinicService as never, prisma as never);

    const response = await controller.whoami({
      user: {
        user: { id: 'u1', keycloakSub: 's1', displayName: 'U', email: null },
        roles: [{ clinicId: CLINIC_A1, role: UserRole.VOLUNTEER }],
      },
      headers: {},
    } as never);

    expect(response.memberships[0].zoneCode).toBe(SHARED_ZONE_CODE);
    expect(response.availableClinics[0].zoneCode).toBe(SHARED_ZONE_CODE);
    // B1 is in the same zone and must not appear anywhere in the response.
    expect(JSON.stringify(response)).not.toContain(CLINIC_B1);
    expect(response.effectiveRolesForActiveClinic).toEqual([UserRole.VOLUNTEER]);
    expect(response.effectivePermissionsForActiveClinic.join(' ')).not.toMatch(/zone/i);
  });
});
