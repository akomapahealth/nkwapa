import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { OrganizationReportService } from './organization-report.service';
import { PERMISSIONS, rolesWithPermission } from '../auth/constants/permissions';

const ORG = { id: 'org-1', name: 'Akomapa Health', slug: 'akomapa', timezone: 'Africa/Accra' };
const systemAdmin = { userId: 'admin', roles: [{ clinicId: null, role: UserRole.SYSTEM_ADMIN }] };

function clinics(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `clinic-${index}`,
    name: `Clinic ${index}`,
    locationCode: `c${index}`,
    zoneCode: null,
    isActive: true,
  }));
}

function buildPrisma(clinicCount: number) {
  const groupBy = () => jest.fn().mockResolvedValue([]);
  const prisma = {
    organization: { findUnique: jest.fn().mockResolvedValue(ORG) },
    clinic: { findMany: jest.fn().mockResolvedValue(clinics(clinicCount)) },
    patient: { groupBy: groupBy() },
    encounter: { groupBy: groupBy() },
    hypertensionAssessment: { groupBy: groupBy() },
    diabetesScreening: { groupBy: groupBy() },
    carePlan: { groupBy: groupBy() },
    userClinicRole: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([{ day: '2026-09-25', count: BigInt(4) }]),
  };
  return prisma;
}

function totalQueries(prisma: ReturnType<typeof buildPrisma>): number {
  return [
    prisma.organization.findUnique,
    prisma.clinic.findMany,
    prisma.patient.groupBy,
    prisma.encounter.groupBy,
    prisma.hypertensionAssessment.groupBy,
    prisma.diabetesScreening.groupBy,
    prisma.carePlan.groupBy,
    prisma.userClinicRole.findMany,
    prisma.$queryRaw,
  ].reduce((sum, mock) => sum + mock.mock.calls.length, 0);
}

describe('OrganizationReportService', () => {
  const now = new Date('2026-09-25T12:00:00Z');

  it('is reachable through a permission only the system admin wildcard holds', () => {
    expect(rolesWithPermission(PERMISSIONS.ORGANIZATION_REPORT_READ)).toEqual([
      UserRole.SYSTEM_ADMIN,
    ]);
  });

  it.each([UserRole.DIRECTOR, UserRole.MANAGER, UserRole.DOCTOR, UserRole.VOLUNTEER])(
    'refuses a %s, even one who directs a clinic in the organization',
    async (role) => {
      const prisma = buildPrisma(2);
      const service = new OrganizationReportService(prisma as never);
      await expect(
        service.getReport({ userId: 'u', roles: [{ clinicId: 'clinic-0', role }] }, ORG.id, now),
      ).rejects.toBeInstanceOf(ForbiddenException);
      // Refused before anything is read: not even the organization's existence is confirmed.
      expect(totalQueries(prisma)).toBe(0);
    },
  );

  it('returns 404 for an organization that does not exist', async () => {
    const prisma = buildPrisma(2);
    prisma.organization.findUnique.mockResolvedValue(null);
    const service = new OrganizationReportService(prisma as never);
    await expect(service.getReport(systemAdmin, 'missing', now)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  /*
    The N+1 check the issue asks for. Three clinics and forty cost the same number of queries,
    because every metric is one grouped read over all of them.
  */
  it('issues the same number of queries for 3 clinics as for 40', async () => {
    const small = buildPrisma(3);
    const large = buildPrisma(40);
    await new OrganizationReportService(small as never).getReport(systemAdmin, ORG.id, now);
    await new OrganizationReportService(large as never).getReport(systemAdmin, ORG.id, now);

    expect(totalQueries(large)).toBe(totalQueries(small));
    expect(totalQueries(large)).toBeLessThanOrEqual(16);
  });

  it('scopes every grouped read to the organization’s clinics', async () => {
    const prisma = buildPrisma(3);
    await new OrganizationReportService(prisma as never).getReport(systemAdmin, ORG.id, now);

    expect(prisma.clinic.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG.id } }),
    );
    const ids = ['clinic-0', 'clinic-1', 'clinic-2'];
    for (const call of prisma.encounter.groupBy.mock.calls) {
      expect(call[0].where.clinicId).toEqual({ in: ids });
    }
    for (const call of prisma.patient.groupBy.mock.calls) {
      expect(call[0].where).toMatchObject({
        primaryClinicId: { in: ids },
        mergedIntoPatientId: null,
      });
    }
  });

  it('turns the raw trend rows into a full window of days', async () => {
    const prisma = buildPrisma(1);
    const report = await new OrganizationReportService(prisma as never).getReport(
      systemAdmin,
      ORG.id,
      now,
    );
    expect(report.windowDays).toBe(30);
    expect(report.encounterTrend.length).toBeGreaterThanOrEqual(30);
    expect(report.encounterTrend.at(-1)).toEqual({ date: '2026-09-25', count: 4 });
    expect(report.organization).toEqual(ORG);
  });

  it('reads nothing more for an organization with no clinics', async () => {
    const prisma = buildPrisma(0);
    const report = await new OrganizationReportService(prisma as never).getReport(
      systemAdmin,
      ORG.id,
      now,
    );
    expect(report.clinics).toEqual([]);
    expect(prisma.encounter.groupBy).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
