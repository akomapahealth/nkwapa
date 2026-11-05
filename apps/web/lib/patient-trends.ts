'use client';

import type {
  BloodPressureTrendPoint,
  ExpandedVitalsTrendPoint,
  GlucoseTrendPoint,
} from '@/lib/patient-portal';
import {
  glucoseFromMgDl,
  weightFromKg,
  type ClinicUnits,
  type GlucoseUnit,
} from '@nkwapa/db/measurement-units';

export const TREND_RANGE_OPTIONS = [30, 90, 180] as const;

export type TrendRangeDays = (typeof TREND_RANGE_OPTIONS)[number];

export function formatTrendRangeFrom(days: number) {
  const from = new Date();
  from.setDate(from.getDate() - days);
  return from.toISOString();
}

export function readTrendNumber(value: unknown) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildBloodPressureTrendData(points: BloodPressureTrendPoint[]) {
  return points.map((point) => ({
    label: new Date(point.t).toLocaleDateString(undefined, {
      month: 'numeric',
      day: 'numeric',
    }),
    systolic: point.sys,
    diastolic: point.dia,
  }));
}

/** Stored mg/dL points, plotted in the clinic's unit. */
export function buildGlucoseTrendData(points: GlucoseTrendPoint[], unit: GlucoseUnit = 'MG_DL') {
  return points.map((point) => ({
    label: new Date(point.t).toLocaleDateString(undefined, {
      month: 'numeric',
      day: 'numeric',
    }),
    glucose: glucoseFromMgDl(point.value, unit),
  }));
}

export type ExpandedMeasurementKey = Exclude<keyof ExpandedVitalsTrendPoint, 't' | 'source'>;

/** A stored vital in the clinic's units; only weight has another unit today. */
export function expandedVitalInUnits(
  key: ExpandedMeasurementKey,
  value: number | null,
  units: Pick<ClinicUnits, 'bodyUnit'>,
): number | null {
  return value != null && key === 'weightKg' ? weightFromKg(value, units.bodyUnit) : value;
}

export function buildExpandedVitalsTrendData(
  points: ExpandedVitalsTrendPoint[],
  key: ExpandedMeasurementKey,
  units: Pick<ClinicUnits, 'bodyUnit'> = { bodyUnit: 'METRIC' },
) {
  return points
    .filter((point) => point[key] != null)
    .map((point) => ({
      label: new Date(point.t).toLocaleDateString(undefined, {
        month: 'numeric',
        day: 'numeric',
      }),
      value: expandedVitalInUnits(key, point[key] as number | null, units),
    }));
}

export function getLatestExpandedVital(
  points: ExpandedVitalsTrendPoint[],
  key: ExpandedMeasurementKey,
) {
  return [...points].reverse().find((point) => point[key] != null)?.[key] ?? null;
}

export function getLatestBloodPressureTrend(points: BloodPressureTrendPoint[]) {
  return points.length > 0 ? points[points.length - 1] : null;
}

export function getLatestGlucoseTrend(points: GlucoseTrendPoint[]) {
  return points.length > 0 ? points[points.length - 1] : null;
}
