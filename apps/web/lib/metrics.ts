import type { TelemetryCategory, TelemetryEventName } from '@nkwapa/db/telemetry-events';

/** `GET /clinics/:clinicId/metrics`. Counts only; see apps/api/src/telemetry/metrics.service.ts. */
export interface MetricsEventTotal {
  event: TelemetryEventName;
  category: TelemetryCategory;
  label: string;
  description: string;
  succeeded: number;
  failed: number;
  other: number;
  total: number;
}

export interface MetricsFunnel {
  id: string;
  label: string;
  description: string;
  steps: Array<{ event: TelemetryEventName; label: string; count: number }>;
  conversion: number | null;
}

export interface MetricsSummary {
  clinicId: string;
  range: { from: string; to: string; days: number };
  events: MetricsEventTotal[];
  funnels: MetricsFunnel[];
  failureReasons: Array<{ event: TelemetryEventName; reason: string; count: number }>;
  daily: Array<{ date: string; succeeded: number; failed: number }>;
  sync: { pushes: number; mutations: number; applied: number; conflicts: number; errors: number };
}

export const METRICS_WINDOWS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
] as const;
export type MetricsWindow = (typeof METRICS_WINDOWS)[number]['value'];

/** The workflow groups the dashboard shows, in reading order. */
export const METRICS_SECTIONS: ReadonlyArray<{
  category: TelemetryCategory;
  title: string;
  description: string;
}> = [
  {
    category: 'appointments',
    title: 'Appointments',
    description: 'Patient requests and what staff did with them.',
  },
  {
    category: 'identity',
    // Not "Chart merges": the conversion card above already carries that name.
    title: 'Patient identity',
    description: 'Duplicate charts reviewed and combined.',
  },
  {
    category: 'invites',
    title: 'Invitations',
    description: 'Portal and staff invitations, and whether they were taken up.',
  },
  { category: 'sync', title: 'Offline sync', description: 'Changes devices sent while offline.' },
  {
    category: 'security',
    title: 'Security',
    description: 'Requests refused for arriving too fast.',
  },
];

/** "62%", or an en dash when there is nothing to divide by. */
export function formatRatio(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return '–';
  return `${Math.round(ratio * 100)}%`;
}

/** Failed over attempted, or null when nothing was attempted. */
export function failureRate(row: Pick<MetricsEventTotal, 'succeeded' | 'failed'>): number | null {
  const attempted = row.succeeded + row.failed;
  return attempted > 0 ? row.failed / attempted : null;
}

/**
 * A reason code in words: `APPOINTMENT_INVALID_TRANSITION` reads "Appointment invalid transition".
 * The code itself stays beside it for support, who search for it in logs.
 */
export function humanizeReason(code: string): string {
  const words = code.toLowerCase().split('_').filter(Boolean).join(' ');
  return words ? words[0].toUpperCase() + words.slice(1) : code;
}

/** The headline figures, derived from a summary so the page and its tests agree. */
export function metricsHeadlines(summary: MetricsSummary) {
  const byEvent = new Map(summary.events.map((row) => [row.event, row]));
  const funnel = (id: string) => summary.funnels.find((entry) => entry.id === id);
  const claims = byEvent.get('portal.claim');
  return {
    requestConversion: funnel('appointment-requests')?.conversion ?? null,
    requests: funnel('appointment-requests')?.steps[0]?.count ?? 0,
    merges: byEvent.get('patient.merge.execute')?.succeeded ?? 0,
    claimSuccess: claims
      ? (() => {
          const rate = failureRate(claims);
          return rate === null ? null : 1 - rate;
        })()
      : null,
    syncConflictRate:
      summary.sync.mutations > 0
        ? (summary.sync.conflicts + summary.sync.errors) / summary.sync.mutations
        : null,
    throttled: byEvent.get('security.rate_limit')?.total ?? 0,
  };
}
