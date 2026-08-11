import { DashboardService } from './dashboard.service';

describe('DashboardService clinical measurement metrics', () => {
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
