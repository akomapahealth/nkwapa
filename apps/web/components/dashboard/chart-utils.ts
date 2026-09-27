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

/**
 * A trend point's date as the calendar day it names.
 *
 * `new Date('2026-09-27')` is midnight UTC, which every browser west of UTC renders as the 26th,
 * so every day-bucketed chart was labelled one day early outside Africa and Europe. A date-only
 * string is read as a local calendar day; anything with a time is parsed as given.
 */
export function parseChartDate(value: string | number | Date): Date {
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  return new Date(value);
}
