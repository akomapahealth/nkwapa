"use client";

import type {
  BloodPressureTrendPoint,
  GlucoseTrendPoint,
} from "@/lib/patient-portal";

export const TREND_RANGE_OPTIONS = [30, 90, 180] as const;

export type TrendRangeDays = (typeof TREND_RANGE_OPTIONS)[number];

export function formatTrendRangeFrom(days: number) {
  const from = new Date();
  from.setDate(from.getDate() - days);
  return from.toISOString();
}

export function readTrendNumber(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildBloodPressureTrendData(points: BloodPressureTrendPoint[]) {
  return points.map((point) => ({
    label: new Date(point.t).toLocaleDateString(undefined, {
      month: "numeric",
      day: "numeric",
    }),
    systolic: point.sys,
    diastolic: point.dia,
  }));
}

export function buildGlucoseTrendData(points: GlucoseTrendPoint[]) {
  return points.map((point) => ({
    label: new Date(point.t).toLocaleDateString(undefined, {
      month: "numeric",
      day: "numeric",
    }),
    glucose: point.value,
  }));
}

export function getLatestBloodPressureTrend(points: BloodPressureTrendPoint[]) {
  return points.length > 0 ? points[points.length - 1] : null;
}

export function getLatestGlucoseTrend(points: GlucoseTrendPoint[]) {
  return points.length > 0 ? points[points.length - 1] : null;
}
