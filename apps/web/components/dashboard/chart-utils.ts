export interface TrendDatum {
  date: string;
  count: number;
}

export interface DistributionDatum {
  name: string;
  value: number;
}

export function hasRenderableTrendData(data: TrendDatum[]) {
  return data.some((point) => Number.isFinite(point.count) && point.count > 0);
}

export function toDistributionChartData(data: Record<string, number>): DistributionDatum[] {
  return Object.entries(data)
    .map(([name, value]) => ({
      name,
      value: Number.isFinite(value) ? value : 0,
    }))
    .filter((entry) => entry.value >= 0);
}

export function hasRenderableDistributionData(data: DistributionDatum[]) {
  return data.some((entry) => entry.value > 0);
}
