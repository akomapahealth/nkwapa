import {
  hasRenderableDistributionData,
  hasRenderableTrendData,
  toDistributionChartData,
} from './chart-utils';

describe('dashboard chart utilities', () => {
  it('treats empty and all-zero trends as empty states', () => {
    expect(hasRenderableTrendData([])).toBe(false);
    expect(
      hasRenderableTrendData([
        { date: '2026-05-30', count: 0 },
        { date: '2026-05-31', count: 0 },
      ]),
    ).toBe(false);
  });

  it('keeps trends renderable when any point has activity', () => {
    expect(
      hasRenderableTrendData([
        { date: '2026-05-30', count: 0 },
        { date: '2026-05-31', count: 2 },
      ]),
    ).toBe(true);
  });

  it('normalizes distribution data and detects renderable values', () => {
    const chartData = toDistributionChartData({ Flagged: 3, Normal: 0, Unknown: Number.NaN });

    expect(chartData).toEqual([
      { name: 'Flagged', value: 3 },
      { name: 'Normal', value: 0 },
      { name: 'Unknown', value: 0 },
    ]);
    expect(hasRenderableDistributionData(chartData)).toBe(true);
    expect(hasRenderableDistributionData(toDistributionChartData({ Flagged: 0 }))).toBe(false);
  });
});
