/**
 * Organization cohort analytics, as the web app reads it (#25). Mirrors `OrganizationAnalytics`
 * on the API.
 */
import type { ZoneFilter } from './clinic-zones';

export const ANALYTICS_WORKFLOWS = ['HYPERTENSION', 'DIABETES', 'EYE', 'COUNSELLING'] as const;
export type AnalyticsWorkflow = (typeof ANALYTICS_WORKFLOWS)[number];

export const ENCOUNTER_STATUSES = ['DRAFT', 'IN_REVIEW', 'FINALIZED'] as const;
export type EncounterStatus = (typeof ENCOUNTER_STATUSES)[number];

export const APPOINTMENT_STATUSES = ['CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const WORKFLOW_LABELS: Record<AnalyticsWorkflow, string> = {
  HYPERTENSION: 'Hypertension',
  DIABETES: 'Diabetes',
  EYE: 'Eye screening',
  COUNSELLING: 'Counselling',
};

export const ENCOUNTER_STATUS_LABELS: Record<EncounterStatus, string> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In review',
  FINALIZED: 'Finalized',
};

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  CONFIRMED: 'Confirmed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No-show',
};

export interface WorkflowCounts {
  hypertension: number;
  diabetes: number;
  eye: number;
  counselling: number;
}

export interface CohortMetrics {
  encounters: number;
  /** Distinct patients with an encounter in the cohort. */
  patients: number;
  encountersByStatus: Record<EncounterStatus, number>;
  workflows: WorkflowCounts;
  appointments: number;
  appointmentsByStatus: Record<AppointmentStatus, number>;
}

export interface ClinicAnalyticsRow extends CohortMetrics {
  clinicId: string;
  clinicName: string;
  locationCode: string;
  zoneCode: string | null;
  isActive: boolean;
  drilldown: { clinicId: string; path: string };
}

export interface OrganizationAnalytics {
  organization: { id: string; name: string; slug: string; timezone: string };
  filters: {
    from: string;
    to: string;
    clinicId: string | null;
    zoneCode: string | null;
    workflow: AnalyticsWorkflow | null;
    encounterStatus: EncounterStatus | null;
    appointmentStatus: AppointmentStatus | null;
  };
  appliesTo: { encounters: string[]; appointments: string[] };
  generatedAt: string;
  totals: CohortMetrics & { clinics: number };
  clinics: ClinicAnalyticsRow[];
  encounterTrend: Array<{ date: string; count: number }>;
}

/** What the filter bar holds. A blank date means "the API's default window". */
export interface CohortFilters {
  from: string;
  to: string;
  clinicId: string | null;
  zone: ZoneFilter;
  workflow: AnalyticsWorkflow | null;
  encounterStatus: EncounterStatus | null;
  appointmentStatus: AppointmentStatus | null;
}

export const EMPTY_COHORT_FILTERS: CohortFilters = {
  from: '',
  to: '',
  clinicId: null,
  zone: null,
  workflow: null,
  encounterStatus: null,
  appointmentStatus: null,
};

/** Kept in step with the API's `ANALYTICS_MAX_RANGE_DAYS`. */
export const ANALYTICS_MAX_RANGE_DAYS = 366;

/**
 * Why these filters cannot be sent, or `null` when they can. Caught here so an obviously wrong
 * range reads as a hint beside the date fields rather than a failed request.
 */
export function cohortFilterProblem(filters: CohortFilters): string | null {
  if (filters.from && filters.to) {
    if (filters.from > filters.to) return 'The start date is after the end date.';
    const days =
      (Date.parse(`${filters.to}T00:00:00Z`) - Date.parse(`${filters.from}T00:00:00Z`)) /
        86_400_000 +
      1;
    if (days > ANALYTICS_MAX_RANGE_DAYS) {
      return `Choose a range of at most ${ANALYTICS_MAX_RANGE_DAYS} days.`;
    }
  }
  return null;
}

export function hasActiveCohortFilters(filters: CohortFilters): boolean {
  return Object.entries(filters).some(([, value]) => value !== null && value !== '');
}

/**
 * The URL for `GET /organizations/:id/analytics`, and the cache key that must change with it.
 * One function for both, so the URL fetched and the key it is cached under cannot disagree.
 */
export function organizationAnalyticsQuery(organizationId: string, filters: CohortFilters) {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.clinicId) params.set('clinicId', filters.clinicId);
  if (filters.zone !== null) params.set('zoneCode', filters.zone);
  if (filters.workflow) params.set('workflow', filters.workflow);
  if (filters.encounterStatus) params.set('encounterStatus', filters.encounterStatus);
  if (filters.appointmentStatus) params.set('appointmentStatus', filters.appointmentStatus);
  const query = params.toString();
  return {
    path: `/organizations/${encodeURIComponent(organizationId)}/analytics${query ? `?${query}` : ''}`,
    resourceKey: `organization-analytics:${organizationId}:${query}`,
  };
}

/** True when the cohort has nothing at all to show: no encounters and no appointments. */
export function isEmptyCohort(data: OrganizationAnalytics): boolean {
  return data.totals.encounters === 0 && data.totals.appointments === 0;
}

/** Re-key a status count map by its human label, in a fixed order, for a distribution chart. */
export function labelled<K extends string>(
  counts: Record<K, number>,
  labels: Record<K, string>,
): Record<string, number> {
  return Object.fromEntries(
    (Object.keys(labels) as K[]).map((key) => [labels[key], counts[key] ?? 0]),
  );
}

export function workflowCounts(workflows: WorkflowCounts): Record<AnalyticsWorkflow, number> {
  return {
    HYPERTENSION: workflows.hypertension,
    DIABETES: workflows.diabetes,
    EYE: workflows.eye,
    COUNSELLING: workflows.counselling,
  };
}
