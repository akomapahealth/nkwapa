import type { TelemetryCategory, TelemetryEventName } from '@nkwapa/db/telemetry-events';
import { CONTACT_OUTCOME_LABELS, type ContactOutcome } from './follow-up-contacts';

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

/* ------------------------------------------------------------- Follow-up indicators (#339) */

/** `GET /clinics/:clinicId/follow-up-metrics`. See apps/api/src/follow-up/follow-up-metrics.ts. */
export interface Share {
  count: number;
  of: number;
}
export interface ByMode {
  inPerson: number;
  tele: number;
  total: number;
}
export interface Timing {
  judged: number;
  withinLimit: number;
  medianMinutes: number | null;
  limitMinutes: number;
}
type BpLimit = { systolic: number; diastolic: number };
export type FollowUpMetricsTier =
  'URGENT' | 'HIGH' | 'MODERATE' | 'LOW_MODERATE' | 'STABLE' | 'LOW' | 'NOT_TIERED';

export interface FollowUpMetricsReport {
  month: string;
  asOf: string;
  inProgress: boolean;
  timeZone: string | null;
  settings: {
    bpTargetUnder65: BpLimit;
    bpTarget: BpLimit;
    bpTargetWithDisease: BpLimit;
    selfReportedCountsTowardControl: boolean;
    missedContactGraceDays: number;
    controlWindowMonths: number;
    underCareWindowMonths: number;
  };
  register: number;
  underCare: Share;
  lost12m: Share;
  controlled: Share;
  uncontrolled: Share;
  notAssessed: Share;
  lost3m: Share;
  untreated: Share;
  startedTreatment: number;
  tiers: Record<FollowUpMetricsTier, number>;
  contacts: {
    due: ByMode;
    completed: ByMode;
    missed: ByMode;
    attempts: ByMode;
    attemptsPerCompleted: Share;
  };
  outcomes: Record<ContactOutcome, number>;
  urgent: { flags: number; acknowledged: Timing; confirmationCall: Timing };
  trend: Array<{
    month: string;
    register: number;
    underCare: number;
    controlled: number;
    missed: number;
  }>;
}

/** Figures that open their patients. Matches `FOLLOW_UP_METRIC_FIGURES` in the API. */
export type FollowUpMetricFigure =
  | 'register'
  | 'underCare'
  | 'controlled'
  | 'uncontrolled'
  | 'notAssessed'
  | 'lost3m'
  | 'lost12m'
  | 'untreated'
  | 'startedTreatment'
  | `tier:${FollowUpMetricsTier}`
  | 'contacts:due'
  | 'contacts:completed'
  | 'contacts:missed'
  | 'contacts:attempts';

/**
 * HEARTS360 definitions, word for word from #339. Fixed before any data was collected so the
 * figures compare with other HEARTS programmes: do not reword or "improve" them.
 */
export const HEARTS360_DEFINITIONS = {
  controlled:
    "BP below target at the patient's most recent reading, taken within the past 3 months",
  uncontrolled: 'BP at or above target at the most recent reading within the past 3 months',
  lost3m: 'No BP reading recorded in the past 3 months',
  lost12m: 'No BP reading recorded in the past 12 months',
  underCare: 'A BP reading recorded in the past 12 months; deceased patients excluded',
  attempt: 'A contact tried but not completed',
  completed: 'A contact that reached the patient and has a recorded outcome',
  missed: 'No completed contact by the due date plus the grace period',
} as const;

/** "40%" and "4 of 10". A share of nothing is an en dash, never 0%. */
export function formatShare(share: Share): { percent: string; fraction: string } {
  return {
    percent: share.of > 0 ? formatRatio(share.count / share.of) : '–',
    fraction: `${share.count} of ${share.of}`,
  };
}

/** "20 min", "48 h", "4 days": minutes up to an hour, hours up to three days. */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return '–';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes <= 72 * 60) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes / (24 * 60))} days`;
}

/** "below 140/90". */
export const formatBpLimit = (limit: BpLimit) => `${limit.systolic}/${limit.diastolic}`;

/** "October 2026" from "2026-10". UTC, like the API's months. */
export function formatMonth(month: string, style: 'long' | 'short' = 'long'): string {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year!, m! - 1, 1)).toLocaleDateString('en-GB', {
    month: style,
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** This month and the eleven before it, newest first, for the month picker. */
export function recentMonths(now: Date, count = 12): Array<{ value: string; label: string }> {
  return Array.from({ length: count }, (_, back) => {
    const value = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
      .toISOString()
      .slice(0, 7);
    return { value, label: formatMonth(value) };
  });
}

/** The month's figures as spreadsheet rows: every share keeps its numerator and denominator. */
export function followUpMetricsCsvRows(report: FollowUpMetricsReport) {
  const d = HEARTS360_DEFINITIONS;
  const shareRow = (figure: string, share: Share, definition = '') => [
    figure,
    share.count,
    share.of,
    share.of > 0 ? Math.round((share.count / share.of) * 1000) / 10 : null,
    definition,
  ];
  const countRow = (figure: string, count: number, definition = '') => [
    figure,
    count,
    null,
    null,
    definition,
  ];
  const timingRow = (figure: string, timing: Timing) => [
    `${figure} within ${formatDuration(timing.limitMinutes)}`,
    timing.withinLimit,
    timing.judged,
    timing.judged > 0 ? Math.round((timing.withinLimit / timing.judged) * 1000) / 10 : null,
    `Median ${formatDuration(timing.medianMinutes)}`,
  ];
  const c = report.contacts;
  return [
    ['Month', report.month, null, null, `Figures as of ${report.asOf}`],
    ['Figure', 'Count', 'Denominator', 'Percent', 'Definition'],
    countRow('Hypertension register', report.register, 'Deceased patients excluded'),
    shareRow('Under care', report.underCare, d.underCare),
    shareRow('Controlled', report.controlled, d.controlled),
    shareRow('Uncontrolled', report.uncontrolled, d.uncontrolled),
    shareRow('Recent reading, target unknown', report.notAssessed),
    shareRow('3-month lost to follow-up', report.lost3m, d.lost3m),
    shareRow('12-month lost to follow-up', report.lost12m, d.lost12m),
    shareRow('Diagnosed, not on medication', report.untreated),
    countRow('Started treatment this month', report.startedTreatment),
    ...Object.entries(report.tiers).map(([tier, count]) => countRow(`Tier: ${tier}`, count)),
    ...(['due', 'completed', 'missed', 'attempts'] as const).flatMap((kind) => {
      const definition =
        kind === 'completed'
          ? d.completed
          : kind === 'missed'
            ? d.missed
            : kind === 'attempts'
              ? d.attempt
              : '';
      const label = {
        due: 'Contacts due',
        completed: 'Completed follow-ups',
        missed: 'Missed visits',
        attempts: 'Attempts',
      }[kind];
      return [
        countRow(`${label}: in person`, c[kind].inPerson, definition),
        countRow(`${label}: tele`, c[kind].tele, definition),
        countRow(`${label}: total`, c[kind].total, definition),
      ];
    }),
    shareRow('Attempts per completed follow-up', c.attemptsPerCompleted),
    ...Object.entries(report.outcomes).map(([code, count]) =>
      countRow(`Outcome: ${CONTACT_OUTCOME_LABELS[code as ContactOutcome]} (${code})`, count),
    ),
    countRow('Urgent flags raised', report.urgent.flags),
    timingRow('Urgent flags taken', report.urgent.acknowledged),
    timingRow('Urgent confirmation calls', report.urgent.confirmationCall),
  ];
}
