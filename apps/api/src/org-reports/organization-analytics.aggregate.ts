/**
 * Turning a cohort's grouped counts into organization analytics. Issue #25.
 *
 * Pure, and separate from the queries, for the same reason as the report's aggregate: the ways
 * a rollup goes wrong quietly live here. A patient seen at two clinics counted twice, a clinic
 * with nothing in the cohort dropped because SQL omits it, a day boundary drawn in UTC instead of
 * where the clinics are. Each has a test.
 */
import type { AppointmentStatus, EncounterStatus } from '@prisma/client';
import { startOfDayInTimeZone, todayInTimeZone } from '@nkwapa/db';
import type { ReportClinic } from './organization-report.aggregate';

/** The cohort window when the caller names none, matching the fixed report's 30 days. */
export const ANALYTICS_DEFAULT_DAYS = 30;
/** Long enough for a year-on-year look, short enough that one request stays a cheap read. */
export const ANALYTICS_MAX_RANGE_DAYS = 366;

/**
 * A condition workflow is a kind of record an encounter carries. Each is a 1:1 child of
 * `Encounter`, so "encounters in the hypertension workflow" is "encounters that have a
 * hypertension assessment".
 */
export const ANALYTICS_WORKFLOWS = ['HYPERTENSION', 'DIABETES', 'EYE', 'COUNSELLING'] as const;
export type AnalyticsWorkflow = (typeof ANALYTICS_WORKFLOWS)[number];

export const ENCOUNTER_STATUSES: EncounterStatus[] = ['DRAFT', 'IN_REVIEW', 'FINALIZED'];
export const APPOINTMENT_STATUSES: AppointmentStatus[] = [
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
];

export interface WorkflowCounts {
  hypertension: number;
  diabetes: number;
  eye: number;
  counselling: number;
}

export interface CohortMetrics {
  encounters: number;
  /** Distinct patients with at least one encounter in the cohort. */
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

export interface OrganizationAnalyticsBody {
  totals: CohortMetrics & { clinics: number };
  clinics: ClinicAnalyticsRow[];
}

/** One row of the per-clinic encounter read, counts already converted from bigint. */
export interface EncounterCountsRow {
  clinicId: string;
  total: number;
  draft: number;
  inReview: number;
  finalized: number;
  hypertension: number;
  diabetes: number;
  eye: number;
  counselling: number;
}

export interface AnalyticsInputs {
  clinics: ReportClinic[];
  encounters: EncounterCountsRow[];
  /** Distinct patients per clinic. */
  patientsByClinic: Map<string, number>;
  /**
   * Distinct patients across the whole cohort, read on its own. Not the sum of the clinic
   * counts: a patient seen at two clinics is one patient to the organization.
   */
  patientsOverall: number;
  appointments: Array<{ clinicId: string; status: AppointmentStatus; count: number }>;
}

export type CohortRange =
  | { ok: true; from: string; to: string; start: Date; endExclusive: Date; days: string[] }
  | { ok: false; message: string };

const DAY_MS = 86_400_000;

/** Calendar arithmetic on `YYYY-MM-DD`, with no time zone involved. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Every calendar date from `from` to `to`, both included. */
export function calendarDays(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

/**
 * The cohort's dates, resolved against the organization's calendar.
 *
 * `from` and `to` are local dates where the organization is, both included. The query bounds are
 * the instant `from` begins there and the instant the day after `to` begins, so an evening
 * encounter in Accra is counted on its own day and a day changed by daylight saving is still one
 * whole day.
 */
export function resolveCohortRange(
  requested: { from?: string; to?: string },
  timeZone: string,
  now: Date,
): CohortRange {
  const to = requested.to ?? todayInTimeZone(timeZone, now);
  const from = requested.from ?? addDays(to, -(ANALYTICS_DEFAULT_DAYS - 1));

  for (const [name, value] of [
    ['from', from],
    ['to', to],
  ] as const) {
    // The DTO checks the shape; this catches a well-shaped impossible date like 2026-02-30.
    if (Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || addDays(value, 0) !== value) {
      return { ok: false, message: `${name} is not a real calendar date` };
    }
  }
  if (from > to) {
    return { ok: false, message: 'from must be on or before to' };
  }
  const days = calendarDays(from, to);
  if (days.length > ANALYTICS_MAX_RANGE_DAYS) {
    return {
      ok: false,
      message: `The date range can cover at most ${ANALYTICS_MAX_RANGE_DAYS} days`,
    };
  }

  return {
    ok: true,
    from,
    to,
    start: startOfDayInTimeZone(from, timeZone),
    endExclusive: startOfDayInTimeZone(addDays(to, 1), timeZone),
    days,
  };
}

function emptyMetrics(): CohortMetrics {
  return {
    encounters: 0,
    patients: 0,
    encountersByStatus: { DRAFT: 0, IN_REVIEW: 0, FINALIZED: 0 },
    workflows: { hypertension: 0, diabetes: 0, eye: 0, counselling: 0 },
    appointments: 0,
    appointmentsByStatus: { CONFIRMED: 0, COMPLETED: 0, CANCELLED: 0, NO_SHOW: 0 },
  };
}

export function buildOrganizationAnalytics(input: AnalyticsInputs): OrganizationAnalyticsBody {
  const encountersByClinic = new Map(input.encounters.map((row) => [row.clinicId, row]));
  const appointmentsByClinic = new Map<
    string,
    Array<{ status: AppointmentStatus; count: number }>
  >();
  for (const row of input.appointments) {
    const rows = appointmentsByClinic.get(row.clinicId) ?? [];
    rows.push(row);
    appointmentsByClinic.set(row.clinicId, rows);
  }

  // Every clinic in scope gets a row, at zero if the cohort has nothing there.
  const clinics: ClinicAnalyticsRow[] = input.clinics.map((clinic) => {
    const metrics = emptyMetrics();
    const encounters = encountersByClinic.get(clinic.id);
    if (encounters) {
      metrics.encounters = encounters.total;
      metrics.encountersByStatus = {
        DRAFT: encounters.draft,
        IN_REVIEW: encounters.inReview,
        FINALIZED: encounters.finalized,
      };
      metrics.workflows = {
        hypertension: encounters.hypertension,
        diabetes: encounters.diabetes,
        eye: encounters.eye,
        counselling: encounters.counselling,
      };
    }
    metrics.patients = input.patientsByClinic.get(clinic.id) ?? 0;
    for (const { status, count } of appointmentsByClinic.get(clinic.id) ?? []) {
      metrics.appointmentsByStatus[status] += count;
      metrics.appointments += count;
    }
    return {
      clinicId: clinic.id,
      clinicName: clinic.name,
      locationCode: clinic.locationCode,
      zoneCode: clinic.zoneCode,
      isActive: clinic.isActive,
      ...metrics,
      drilldown: { clinicId: clinic.id, path: '/dashboard' },
    };
  });

  const totals = emptyMetrics();
  for (const row of clinics) {
    totals.encounters += row.encounters;
    totals.appointments += row.appointments;
    for (const status of ENCOUNTER_STATUSES) {
      totals.encountersByStatus[status] += row.encountersByStatus[status];
    }
    for (const status of APPOINTMENT_STATUSES) {
      totals.appointmentsByStatus[status] += row.appointmentsByStatus[status];
    }
    for (const key of Object.keys(totals.workflows) as Array<keyof WorkflowCounts>) {
      totals.workflows[key] += row.workflows[key];
    }
  }
  // Not summed: someone seen at two clinics is one patient to the organization.
  totals.patients = input.patientsOverall;

  return { totals: { ...totals, clinics: clinics.length }, clinics };
}
