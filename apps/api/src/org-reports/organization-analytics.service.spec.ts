import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { OrganizationAnalyticsService } from './organization-analytics.service';

const ORG = { id: 'org-1', name: 'Akomapa Health', slug: 'akomapa', timezone: 'Africa/Accra' };
const systemAdmin = { userId: 'admin', roles: [{ clinicId: null, role: UserRole.SYSTEM_ADMIN }] };
const CLINIC_0 = '00000000-0000-4000-8000-000000000000';

function clinics(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: index === 0 ? CLINIC_0 : `clinic-${index}`,
    name: `Clinic ${index}`,
    locationCode: `c${index}`,
    zoneCode: index % 2 === 0 ? 'north' : 'south',
    isActive: true,
  }));
}

/**
 * `$queryRaw` is called as a tagged template. Each call is answered by the shape of its SQL, so
 * the tests do not depend on the order the service happens to issue them in.
 */
function buildPrisma(clinicCount: number) {
  const queryRaw = jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = Prisma.sql(strings, ...values).sql;
    if (sql.includes('GROUPING SETS')) {
      return Promise.resolve([
        { clinicId: CLINIC_0, patients: BigInt(2) },
        { clinicId: null, patients: BigInt(2) },
      ]);
    }
    if (sql.includes('to_char')) {
      return Promise.resolve([{ day: '2026-09-25', count: BigInt(3) }]);
    }
    return Promise.resolve([
      {
        clinicId: CLINIC_0,
        total: BigInt(3),
        draft: BigInt(1),
        inReview: BigInt(0),
        finalized: BigInt(2),
        hypertension: BigInt(2),
        diabetes: BigInt(1),
        eye: BigInt(0),
        counselling: BigInt(0),
      },
    ]);
  });
  return {
    organization: { findUnique: jest.fn().mockResolvedValue(ORG) },
    clinic: { findMany: jest.fn().mockResolvedValue(clinics(clinicCount)) },
    appointment: {
      groupBy: jest
        .fn()
        .mockResolvedValue([{ clinicId: CLINIC_0, status: 'COMPLETED', _count: 4 }]),
    },
    $queryRaw: queryRaw,
  };
}

type MockPrisma = ReturnType<typeof buildPrisma>;

function totalQueries(prisma: MockPrisma): number {
  return [
    prisma.organization.findUnique,
    prisma.clinic.findMany,
    prisma.appointment.groupBy,
    prisma.$queryRaw,
  ].reduce((sum, mock) => sum + mock.mock.calls.length, 0);
}

/** Every raw statement the service ran, with its bound values. */
function rawStatements(prisma: MockPrisma): Prisma.Sql[] {
  return prisma.$queryRaw.mock.calls.map(([strings, ...values]) => Prisma.sql(strings, ...values));
}

describe('OrganizationAnalyticsService', () => {
  const now = new Date('2026-09-25T12:00:00Z');
  const run = (prisma: MockPrisma, query: object = {}) =>
    new OrganizationAnalyticsService(prisma as never).getAnalytics(systemAdmin, ORG.id, query, now);

  it.each([UserRole.DIRECTOR, UserRole.MANAGER, UserRole.DOCTOR, UserRole.VOLUNTEER])(
    'refuses a %s before reading anything',
    async (role) => {
      const prisma = buildPrisma(2);
      await expect(
        new OrganizationAnalyticsService(prisma as never).getAnalytics(
          { userId: 'u', roles: [{ clinicId: CLINIC_0, role }] },
          ORG.id,
          {},
          now,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(totalQueries(prisma)).toBe(0);
    },
  );

  it('returns 404 for an organization that does not exist', async () => {
    const prisma = buildPrisma(2);
    prisma.organization.findUnique.mockResolvedValue(null);
    await expect(run(prisma)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a clinic from another organization rather than showing an empty cohort', async () => {
    const prisma = buildPrisma(2);
    await expect(
      run(prisma, { clinicId: '11111111-1111-4111-8111-111111111111' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it.each([
    { from: '2026-09-10', to: '2026-09-01' },
    { from: '2024-01-01', to: '2026-01-01' },
  ])('refuses the range %j', async (query) => {
    const prisma = buildPrisma(2);
    await expect(run(prisma, query)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.clinic.findMany).not.toHaveBeenCalled();
  });

  it('issues the same number of queries for 3 clinics as for 40', async () => {
    const small = buildPrisma(3);
    const large = buildPrisma(40);
    await run(small);
    await run(large);
    expect(totalQueries(large)).toBe(totalQueries(small));
    expect(totalQueries(large)).toBe(6);
  });

  it('scopes every read to the organization’s clinics', async () => {
    const prisma = buildPrisma(3);
    await run(prisma);

    expect(prisma.clinic.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG.id } }),
    );
    const ids = [CLINIC_0, 'clinic-1', 'clinic-2'];
    for (const statement of rawStatements(prisma)) {
      expect(statement.values).toEqual(expect.arrayContaining(ids));
    }
    expect(prisma.appointment.groupBy.mock.calls[0][0].where.clinicId).toEqual({ in: ids });
  });

  it('narrows to the clinics in a zone', async () => {
    const prisma = buildPrisma(4);
    const result = await run(prisma, { zoneCode: 'north' });
    expect(result.clinics.map((row) => row.clinicId)).toEqual([CLINIC_0, 'clinic-2']);
    for (const statement of rawStatements(prisma)) {
      expect(statement.values).not.toContain('clinic-1');
    }
  });

  it('narrows to one clinic', async () => {
    const prisma = buildPrisma(3);
    const result = await run(prisma, { clinicId: CLINIC_0 });
    expect(result.clinics).toHaveLength(1);
    expect(result.filters.clinicId).toBe(CLINIC_0);
  });

  it('puts the workflow and encounter status filters into every encounter read', async () => {
    const prisma = buildPrisma(2);
    await run(prisma, { workflow: 'EYE', encounterStatus: 'FINALIZED' });

    for (const statement of rawStatements(prisma)) {
      // The cohort predicate, not just the per-workflow counting columns of the first read.
      expect(statement.sql).toMatch(/AND e\."status" = \?::"EncounterStatus"/);
      expect(statement.values).toContain('FINALIZED');
      expect(statement.sql).toContain('AND EXISTS (SELECT 1 FROM "EyeScreening" w');
    }
  });

  it('dates appointments by when they happen and filters their status', async () => {
    const prisma = buildPrisma(2);
    await run(prisma, { from: '2026-09-01', to: '2026-09-01', appointmentStatus: 'NO_SHOW' });

    const where = prisma.appointment.groupBy.mock.calls[0][0].where;
    expect(where.status).toBe('NO_SHOW');
    // Accra is UTC+0 all year, so local midnight is UTC midnight.
    expect(where.startsAt).toEqual({
      gte: new Date('2026-09-01T00:00:00Z'),
      lt: new Date('2026-09-02T00:00:00Z'),
    });
  });

  it('assembles totals, the trend and the filters it applied', async () => {
    const prisma = buildPrisma(2);
    const result = await run(prisma);

    expect(result.totals).toMatchObject({
      clinics: 2,
      encounters: 3,
      patients: 2,
      encountersByStatus: { DRAFT: 1, IN_REVIEW: 0, FINALIZED: 2 },
      workflows: { hypertension: 2, diabetes: 1, eye: 0, counselling: 0 },
      appointments: 4,
    });
    expect(result.filters).toMatchObject({ from: '2026-08-27', to: '2026-09-25', workflow: null });
    expect(result.encounterTrend).toHaveLength(30);
    expect(result.encounterTrend.at(-1)).toEqual({ date: '2026-09-25', count: 3 });
    expect(result.appliesTo.appointments).not.toContain('workflow');
  });

  it('reads nothing more when the filters leave no clinic', async () => {
    const prisma = buildPrisma(2);
    const result = await run(prisma, { zoneCode: 'east' });
    expect(result.clinics).toEqual([]);
    expect(result.totals.encounters).toBe(0);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.appointment.groupBy).not.toHaveBeenCalled();
  });
});
