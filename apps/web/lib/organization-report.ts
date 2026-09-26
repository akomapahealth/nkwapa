/**
 * The organization report, as the web app reads it. Mirrors `OrganizationReport` on the API.
 */

export interface RateBreakdown {
  numerator: number;
  denominator: number;
  percent: number | null;
}

export interface ReportMetrics {
  patients: number;
  newPatients: number;
  encounters: number;
  finalized: number;
  openDrafts: number;
  awaitingReview: number;
  readyToFinalize: number;
  hypertensionScreeningRate: RateBreakdown;
  diabetesScreeningRate: RateBreakdown;
  followUpRate: RateBreakdown;
  activeStaff: number;
}

export interface ClinicReportRow extends ReportMetrics {
  clinicId: string;
  clinicName: string;
  locationCode: string;
  zoneCode: string | null;
  isActive: boolean;
  drilldown: { clinicId: string; path: string };
}

export interface OrganizationReport {
  organization: { id: string; name: string; slug: string; timezone: string };
  windowDays: number;
  windowStart: string;
  generatedAt: string;
  totals: ReportMetrics & { clinics: number; activeClinics: number };
  clinics: ClinicReportRow[];
  encounterTrend: Array<{ date: string; count: number }>;
}

/**
 * A rate with the counts behind it, because "50%" alone hides whether that was 1 of 2 or 150 of
 * 300, which is the difference a leader reading a rollup most needs to see.
 */
export function formatRate(rate: RateBreakdown): string {
  if (rate.percent === null) return 'No data';
  return `${rate.percent}% (${rate.numerator.toLocaleString()} of ${rate.denominator.toLocaleString()})`;
}

/** The backlog a clinic is carrying right now, whatever the window. */
export function openWork(
  metrics: Pick<ReportMetrics, 'openDrafts' | 'awaitingReview' | 'readyToFinalize'>,
): number {
  return metrics.openDrafts + metrics.awaitingReview + metrics.readyToFinalize;
}
