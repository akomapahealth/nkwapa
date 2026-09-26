/**
 * Turning grouped counts into an organization report. Issue #13.
 *
 * Pure, and separate from the queries, because this is where a rollup goes wrong quietly: a rate
 * averaged across clinics instead of recomputed from summed counts, a colleague counted once per
 * clinic they work in, or an empty clinic dropped because `groupBy` omits it. Each of those reads
 * plausibly and is wrong, and each has a test.
 */

export interface ReportClinic {
  id: string;
  name: string;
  locationCode: string;
  zoneCode: string | null;
  isActive: boolean;
}

/** One `groupBy` result, reduced to clinic id and count. */
export type CountsByClinic = Map<string, number>;

export interface ReportInputs {
  clinics: ReportClinic[];
  patients: CountsByClinic;
  newPatients: CountsByClinic;
  encountersInWindow: CountsByClinic;
  openDrafts: CountsByClinic;
  awaitingReview: CountsByClinic;
  readyToFinalize: CountsByClinic;
  finalizedInWindow: CountsByClinic;
  hypertensionScreenings: CountsByClinic;
  diabetesScreenings: CountsByClinic;
  carePlans: CountsByClinic;
  carePlansWithFollowUp: CountsByClinic;
  /** One entry per (clinic, staff member). A person may appear under several clinics. */
  staffSeats: Array<{ clinicId: string; userId: string }>;
}

export interface RateBreakdown {
  numerator: number;
  denominator: number;
  /** Whole percent, or null when there is nothing to divide by: 0% would claim a measurement. */
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
  /** Where the web app sends someone to see this clinic in detail. */
  drilldown: { clinicId: string; path: string };
}

export interface OrganizationReportBody {
  totals: ReportMetrics & { clinics: number; activeClinics: number };
  clinics: ClinicReportRow[];
}

export function rate(numerator: number, denominator: number): RateBreakdown {
  return {
    numerator,
    denominator,
    percent: denominator > 0 ? Math.round((numerator / denominator) * 100) : null,
  };
}

export function buildOrganizationReport(input: ReportInputs): OrganizationReportBody {
  // A clinic with no rows is absent from a groupBy rather than present with zero.
  const of = (counts: CountsByClinic, clinicId: string) => counts.get(clinicId) ?? 0;

  const staffByClinic = new Map<string, Set<string>>();
  for (const seat of input.staffSeats) {
    const staff = staffByClinic.get(seat.clinicId) ?? new Set<string>();
    staff.add(seat.userId);
    staffByClinic.set(seat.clinicId, staff);
  }

  const clinics: ClinicReportRow[] = input.clinics.map((clinic) => {
    const encounters = of(input.encountersInWindow, clinic.id);
    return {
      clinicId: clinic.id,
      clinicName: clinic.name,
      locationCode: clinic.locationCode,
      zoneCode: clinic.zoneCode,
      isActive: clinic.isActive,
      patients: of(input.patients, clinic.id),
      newPatients: of(input.newPatients, clinic.id),
      encounters,
      finalized: of(input.finalizedInWindow, clinic.id),
      openDrafts: of(input.openDrafts, clinic.id),
      awaitingReview: of(input.awaitingReview, clinic.id),
      readyToFinalize: of(input.readyToFinalize, clinic.id),
      hypertensionScreeningRate: rate(of(input.hypertensionScreenings, clinic.id), encounters),
      diabetesScreeningRate: rate(of(input.diabetesScreenings, clinic.id), encounters),
      followUpRate: rate(
        of(input.carePlansWithFollowUp, clinic.id),
        of(input.carePlans, clinic.id),
      ),
      activeStaff: staffByClinic.get(clinic.id)?.size ?? 0,
      drilldown: { clinicId: clinic.id, path: '/dashboard' },
    };
  });

  const sum = (pick: (row: ClinicReportRow) => number) =>
    clinics.reduce((total, row) => total + pick(row), 0);
  const sumRate = (pick: (row: ClinicReportRow) => RateBreakdown) =>
    // Recomputed from summed counts. Averaging the clinics' percentages would let a clinic that
    // saw three patients weigh as much as one that saw three hundred.
    rate(
      sum((row) => pick(row).numerator),
      sum((row) => pick(row).denominator),
    );

  const reportedClinicIds = new Set(input.clinics.map((clinic) => clinic.id));
  const distinctStaff = new Set(
    input.staffSeats
      .filter((seat) => reportedClinicIds.has(seat.clinicId))
      .map((seat) => seat.userId),
  );

  return {
    totals: {
      clinics: clinics.length,
      activeClinics: clinics.filter((row) => row.isActive).length,
      // Summing is exact for patients: each has exactly one primary clinic.
      patients: sum((row) => row.patients),
      newPatients: sum((row) => row.newPatients),
      encounters: sum((row) => row.encounters),
      finalized: sum((row) => row.finalized),
      openDrafts: sum((row) => row.openDrafts),
      awaitingReview: sum((row) => row.awaitingReview),
      readyToFinalize: sum((row) => row.readyToFinalize),
      hypertensionScreeningRate: sumRate((row) => row.hypertensionScreeningRate),
      diabetesScreeningRate: sumRate((row) => row.diabetesScreeningRate),
      followUpRate: sumRate((row) => row.followUpRate),
      // Not summed: someone working at two clinics is one person on the organization's staff.
      activeStaff: distinctStaff.size,
    },
    clinics,
  };
}

/**
 * Days in the window, as calendar dates in the organization's time zone, oldest first.
 *
 * A day is where the organization is, not where the server is: an evening clinic in Accra must
 * not have its encounters counted on the next UTC day's bar.
 */
export function windowDays(now: Date, days: number, timeZone: string): string[] {
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dates = new Set<string>();
  for (let offset = days; offset >= 0; offset -= 1) {
    dates.add(format.format(new Date(now.getTime() - offset * 24 * 60 * 60 * 1000)));
  }
  return [...dates];
}

/** Fill a sparse per-day count into every day of the window, zeros included. */
export function fillTrend(
  days: string[],
  counts: Array<{ day: string; count: number }>,
): Array<{ date: string; count: number }> {
  const byDay = new Map(counts.map((row) => [row.day, row.count]));
  return days.map((date) => ({ date, count: byDay.get(date) ?? 0 }));
}
