import {
  buildOrganizationReport,
  fillTrend,
  rate,
  windowDays,
  type ReportInputs,
} from './organization-report.aggregate';

const counts = (entries: Record<string, number>) => new Map(Object.entries(entries));

function inputs(overrides: Partial<ReportInputs> = {}): ReportInputs {
  return {
    clinics: [
      { id: 'big', name: 'Big Clinic', locationCode: 'big', zoneCode: 'north', isActive: true },
      { id: 'small', name: 'Small Clinic', locationCode: 'small', zoneCode: null, isActive: true },
      { id: 'closed', name: 'Closed Clinic', locationCode: 'old', zoneCode: null, isActive: false },
    ],
    patients: counts({ big: 900, small: 30 }),
    newPatients: counts({ big: 40, small: 2 }),
    encountersInWindow: counts({ big: 300, small: 3 }),
    finalizedInWindow: counts({ big: 250, small: 1 }),
    openDrafts: counts({ big: 5, small: 1 }),
    awaitingReview: counts({ big: 4 }),
    readyToFinalize: counts({ small: 2 }),
    hypertensionScreenings: counts({ big: 150, small: 3 }),
    diabetesScreenings: counts({ big: 30 }),
    carePlans: counts({ big: 100, small: 10 }),
    carePlansWithFollowUp: counts({ big: 50, small: 10 }),
    staffSeats: [
      { clinicId: 'big', userId: 'ama' },
      { clinicId: 'big', userId: 'kofi' },
      { clinicId: 'small', userId: 'kofi' },
      { clinicId: 'small', userId: 'esi' },
    ],
    ...overrides,
  };
}

describe('buildOrganizationReport', () => {
  it('sums the counts that sum', () => {
    const { totals } = buildOrganizationReport(inputs());
    expect(totals).toMatchObject({
      clinics: 3,
      activeClinics: 2,
      patients: 930,
      newPatients: 42,
      encounters: 303,
      finalized: 251,
      openDrafts: 6,
      awaitingReview: 4,
      readyToFinalize: 2,
    });
  });

  /*
    The mistake this exists to prevent. The small clinic screened 3 of 3 (100%) and the big one
    150 of 300 (50%). Averaging the percentages says 75%; the organization screened 153 of 303.
  */
  it('recomputes rates from summed counts, never by averaging percentages', () => {
    const { totals, clinics } = buildOrganizationReport(inputs());
    expect(clinics.find((c) => c.clinicId === 'small')?.hypertensionScreeningRate.percent).toBe(
      100,
    );
    expect(clinics.find((c) => c.clinicId === 'big')?.hypertensionScreeningRate.percent).toBe(50);
    expect(totals.hypertensionScreeningRate).toEqual({
      numerator: 153,
      denominator: 303,
      percent: 50,
    });
    expect(totals.followUpRate).toEqual({ numerator: 60, denominator: 110, percent: 55 });
  });

  // Kofi works at both clinics: two seats, one person.
  it('counts a colleague at two clinics once for the organization', () => {
    const { totals, clinics } = buildOrganizationReport(inputs());
    expect(clinics.find((c) => c.clinicId === 'big')?.activeStaff).toBe(2);
    expect(clinics.find((c) => c.clinicId === 'small')?.activeStaff).toBe(2);
    expect(totals.activeStaff).toBe(3);
  });

  // A groupBy omits a clinic with no rows. The clinic must still be in the table.
  it('keeps a clinic with no activity, at zero', () => {
    const closed = buildOrganizationReport(inputs()).clinics.find((c) => c.clinicId === 'closed');
    expect(closed).toMatchObject({ patients: 0, encounters: 0, activeStaff: 0, isActive: false });
  });

  // 0% would claim a measurement was taken and came out at nothing.
  it('reports no rate, rather than zero, where there was nothing to divide by', () => {
    const closed = buildOrganizationReport(inputs()).clinics.find((c) => c.clinicId === 'closed');
    expect(closed?.hypertensionScreeningRate).toEqual({
      numerator: 0,
      denominator: 0,
      percent: null,
    });
    expect(rate(0, 0).percent).toBeNull();
  });

  it('gives every clinic a drilldown back to its own dashboard', () => {
    for (const row of buildOrganizationReport(inputs()).clinics) {
      expect(row.drilldown).toEqual({ clinicId: row.clinicId, path: '/dashboard' });
    }
  });

  it('ignores staff seats from clinics outside the report', () => {
    const { totals } = buildOrganizationReport(
      inputs({ staffSeats: [{ clinicId: 'elsewhere', userId: 'yaw' }] }),
    );
    expect(totals.activeStaff).toBe(0);
  });

  it('handles an organization with no clinics', () => {
    const report = buildOrganizationReport(inputs({ clinics: [] }));
    expect(report.clinics).toEqual([]);
    expect(report.totals).toMatchObject({ clinics: 0, patients: 0, activeStaff: 0 });
  });
});

describe('the encounter trend', () => {
  // 23:30 UTC on the 25th is already the 26th in a UTC+1 zone, and must count there.
  it('lays days out on the organization calendar, not the server one', () => {
    const now = new Date('2026-09-25T23:30:00Z');
    expect(windowDays(now, 1, 'Africa/Accra')).toEqual(['2026-09-24', '2026-09-25']);
    expect(windowDays(now, 1, 'Africa/Lagos')).toEqual(['2026-09-25', '2026-09-26']);
  });

  it('fills the days with no encounters with zero', () => {
    expect(fillTrend(['2026-09-24', '2026-09-25'], [{ day: '2026-09-25', count: 7 }])).toEqual([
      { date: '2026-09-24', count: 0 },
      { date: '2026-09-25', count: 7 },
    ]);
  });
});
