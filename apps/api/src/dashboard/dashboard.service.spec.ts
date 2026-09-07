import { DashboardService, FLAGGED_DIABETES_WHERE } from './dashboard.service';
import type { SystemAdminMetrics } from './dto/dashboard-response.dto';

describe('DashboardService clinical measurement metrics', () => {
  it('keeps approved fasting and random flag thresholds and excludes unknown context', () => {
    expect(FLAGGED_DIABETES_WHERE).toEqual({
      OR: [
        { glucoseType: 'FASTING', glucoseMgDl: { gte: 126 } },
        { glucoseType: 'RANDOM', glucoseMgDl: { gte: 200 } },
      ],
    });
    expect(JSON.stringify(FLAGGED_DIABETES_WHERE)).not.toContain('UNKNOWN');
  });

  it('computes clinic-scoped 30-day coverage and descriptive averages', async () => {
    const prisma = {
      encounter: { count: jest.fn().mockResolvedValue(10) },
      vitals: {
        findMany: jest.fn().mockResolvedValue([
          { temperatureCelsius: 37, respiratoryRate: 16, spo2Percent: 98, bmi: 24 },
          { temperatureCelsius: 38, respiratoryRate: 18, spo2Percent: null, bmi: 26 },
        ]),
      },
      tobaccoScreening: {
        findMany: jest.fn().mockResolvedValue([
          {
            smokingStatus: 'CURRENT',
            smokelessTobaccoStatus: 'NEVER',
            passiveExposure: 'NO',
            counselingGiven: 'YES',
            reviewedAt: new Date(),
          },
          {
            smokingStatus: 'NEVER',
            smokelessTobaccoStatus: 'NEVER',
            passiveExposure: 'NOT_ASSESSED',
            counselingGiven: 'NOT_ASSESSED',
            reviewedAt: null,
          },
          {
            smokingStatus: 'NOT_ASSESSED',
            smokelessTobaccoStatus: 'NOT_ASSESSED',
            passiveExposure: 'NOT_ASSESSED',
            counselingGiven: 'NOT_ASSESSED',
            reviewedAt: null,
          },
        ]),
        groupBy: jest.fn().mockResolvedValue([
          { smokingStatus: 'CURRENT', _count: 1 },
          { smokingStatus: 'NEVER', _count: 1 },
          { smokingStatus: 'NOT_ASSESSED', _count: 1 },
        ]),
      },
    };
    const service = new DashboardService(prisma as never);
    const metrics = await (
      service as unknown as {
        getClinicalMeasurementMetrics: (clinicId: string) => Promise<Record<string, unknown>>;
      }
    ).getClinicalMeasurementMetrics('clinic-1');

    expect(prisma.encounter.count).toHaveBeenCalledWith({
      where: { clinicId: 'clinic-1', createdAt: { gte: expect.any(Date) } },
    });
    expect(metrics).toMatchObject({
      windowDays: 30,
      sampleSize: 10,
      vitalsCaptureRate: 20,
      tobaccoAssessmentRate: 20,
      counselingDocumentationRate: 100,
      pendingTobaccoReviews: 2,
      measurements: {
        temperatureCelsius: { count: 2, average: 37.5 },
        spo2Percent: { count: 1, average: 98 },
      },
    });
  });
});

describe('DashboardService network overview', () => {
  const CLINICS = [
    { id: 'clinic-north-1', name: 'North One', zoneCode: 'north', isActive: true },
    { id: 'clinic-north-2', name: 'North Two', zoneCode: 'north', isActive: true },
    { id: 'clinic-south', name: 'South', zoneCode: 'south', isActive: true },
    { id: 'clinic-none', name: 'Unzoned', zoneCode: null, isActive: true },
  ];

  function buildPrisma() {
    return {
      clinic: {
        count: jest.fn().mockResolvedValue(CLINICS.length),
        findMany: jest.fn().mockResolvedValue(CLINICS),
      },
      user: { count: jest.fn().mockResolvedValue(9) },
      patient: {
        count: jest.fn().mockResolvedValue(40),
        groupBy: jest.fn().mockResolvedValue([
          { primaryClinicId: 'clinic-north-1', _count: 7 },
          { primaryClinicId: 'clinic-south', _count: 3 },
        ]),
      },
      encounter: {
        count: jest.fn().mockResolvedValue(80),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
  }

  const run = async (prisma: ReturnType<typeof buildPrisma>, zoneFilter: string | null) =>
    (
      new DashboardService(prisma as never) as unknown as {
        getSystemAdminMetrics: (zone: string | null) => Promise<SystemAdminMetrics>;
      }
    ).getSystemAdminMetrics(zoneFilter);

  it('compares every clinic when no zone is applied', async () => {
    const metrics = await run(buildPrisma(), null);
    expect(metrics.clinicComparison).toHaveLength(4);
    expect(metrics.appliedZoneCode).toBeNull();
  });

  it('carries each clinic zone into the comparison rows', async () => {
    const metrics = await run(buildPrisma(), null);
    expect(metrics.clinicComparison[0]).toMatchObject({
      clinicId: 'clinic-north-1',
      zoneCode: 'north',
    });
    expect(metrics.clinicComparison[3]).toMatchObject({ clinicId: 'clinic-none', zoneCode: null });
  });

  it('narrows the comparison to one zone', async () => {
    const metrics = await run(buildPrisma(), 'north');
    expect(metrics.clinicComparison.map((row) => row.clinicId)).toEqual([
      'clinic-north-1',
      'clinic-north-2',
    ]);
    expect(metrics.appliedZoneCode).toBe('north');
  });

  it('selects the clinics with no zone under the sentinel', async () => {
    const metrics = await run(buildPrisma(), '__unzoned__');
    expect(metrics.clinicComparison.map((row) => row.clinicId)).toEqual(['clinic-none']);
  });

  it('rolls up every zone even while one is filtered', async () => {
    // A filter that removed its own options would leave the reader no way back to the others.
    const metrics = await run(buildPrisma(), 'north');
    expect(metrics.zones).toEqual([
      { zoneCode: 'north', clinicCount: 2, activeClinicCount: 2 },
      { zoneCode: 'south', clinicCount: 1, activeClinicCount: 1 },
      { zoneCode: null, clinicCount: 1, activeClinicCount: 1 },
    ]);
  });

  it('counts each clinic with grouped reads rather than a query per clinic', async () => {
    // The loop this replaced issued three counts per clinic. With four clinics that was twelve
    // round trips for one table; it is now three regardless of how many clinics exist.
    const prisma = buildPrisma();
    await run(prisma, null);
    expect(prisma.patient.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.encounter.groupBy).toHaveBeenCalledTimes(3);
  });

  it('asks the grouped reads only for the clinics it is comparing', async () => {
    const prisma = buildPrisma();
    await run(prisma, 'north');
    expect(prisma.patient.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { primaryClinicId: { in: ['clinic-north-1', 'clinic-north-2'] } },
      }),
    );
  });

  it('keeps a clinic with no rows in the table, at zero', async () => {
    // A groupBy omits an empty group rather than returning zero for it, so a clinic that has
    // seen no patients would drop out of the comparison entirely without the fallback.
    const metrics = await run(buildPrisma(), null);
    const rows = metrics.clinicComparison;
    expect(rows.find((row) => row.clinicId === 'clinic-north-1')?.totalPatients).toBe(7);
    expect(rows.find((row) => row.clinicId === 'clinic-north-2')?.totalPatients).toBe(0);
  });

  it('returns an empty comparison for a zone no clinic is in', async () => {
    // Empty rather than unfiltered: this method receives a filter that has already been parsed,
    // so a value reaching it is a zone someone genuinely asked for.
    const metrics = await run(buildPrisma(), 'east');
    expect(metrics.clinicComparison).toEqual([]);
    // The rollup still names the zones that do exist, so the reader can get back.
    expect(metrics.zones.map((zone) => zone.zoneCode)).toEqual(['north', 'south', null]);
  });

  it('parses the query value before filtering with it', async () => {
    // The parse lives in getDashboard, so an unusable query parameter has to become "no filter"
    // before it reaches the comparison rather than emptying the report.
    const prisma = buildPrisma();
    const service = new DashboardService(prisma as never);
    const seen: (string | null)[] = [];
    (service as unknown as { getSystemAdminMetrics: unknown }).getSystemAdminMetrics = (
      zone: string | null,
    ) => {
      seen.push(zone);
      return Promise.resolve({});
    };
    jest
      .spyOn(service as unknown as { getSummary: () => Promise<unknown> }, 'getSummary')
      .mockResolvedValue({});

    await service.getDashboard('clinic-1', ['SYSTEM_ADMIN'], 'user-1', { zoneCode: 'not a zone' });
    await service.getDashboard('clinic-1', ['SYSTEM_ADMIN'], 'user-1', { zoneCode: '  NORTH ' });
    await service.getDashboard('clinic-1', ['SYSTEM_ADMIN'], 'user-1', {});

    expect(seen).toEqual([null, 'north', null]);
  });
});
