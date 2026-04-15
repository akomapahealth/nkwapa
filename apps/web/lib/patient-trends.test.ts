import {
  buildBloodPressureTrendData,
  buildGlucoseTrendData,
  formatTrendRangeFrom,
  getLatestBloodPressureTrend,
  getLatestGlucoseTrend,
} from '@/lib/patient-trends';

describe('patient trend helpers', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-21T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('builds a rolling range start from the selected day window', () => {
    expect(formatTrendRangeFrom(30).startsWith('2026-02-19T')).toBe(true);
    expect(formatTrendRangeFrom(90).startsWith('2025-12-21T')).toBe(true);
  });

  it('maps blood pressure trend points for the shared charts and returns the latest point', () => {
    const points = [
      {
        t: '2026-03-19T08:00:00.000Z',
        sys: 130,
        dia: 84,
        source: 'ENCOUNTER' as const,
      },
      {
        t: '2026-03-20T08:00:00.000Z',
        sys: 124,
        dia: 80,
        source: 'PATIENT' as const,
      },
    ];

    expect(buildBloodPressureTrendData(points)).toEqual([
      expect.objectContaining({ systolic: 130, diastolic: 84 }),
      expect.objectContaining({ systolic: 124, diastolic: 80 }),
    ]);
    expect(getLatestBloodPressureTrend(points)).toEqual(points[1]);
  });

  it('maps glucose trend points for the shared charts and returns the latest point', () => {
    const points = [
      {
        t: '2026-03-18T08:00:00.000Z',
        value: 202,
        type: 'RANDOM' as const,
        source: 'ENCOUNTER' as const,
      },
      {
        t: '2026-03-21T08:00:00.000Z',
        value: 145,
        type: 'FASTING' as const,
        source: 'PATIENT' as const,
      },
    ];

    expect(buildGlucoseTrendData(points)).toEqual([
      expect.objectContaining({ glucose: 202 }),
      expect.objectContaining({ glucose: 145 }),
    ]);
    expect(getLatestGlucoseTrend(points)).toEqual(points[1]);
  });
});
