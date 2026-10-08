import {
  ANALYTICS_MAX_RANGE_DAYS,
  addDays,
  buildOrganizationAnalytics,
  calendarDays,
  resolveCohortRange,
  type EncounterCountsRow,
} from './organization-analytics.aggregate';

const clinic = (id: string) => ({
  id,
  name: `Clinic ${id}`,
  locationCode: id,
  zoneCode: null,
  isActive: true,
});

const encounters = (clinicId: string, total: number): EncounterCountsRow => ({
  clinicId,
  total,
  draft: total,
  inReview: 0,
  finalized: 0,
  hypertension: 1,
  diabetes: 0,
  eye: 0,
  counselling: 0,
});

describe('buildOrganizationAnalytics', () => {
  it('keeps a clinic the cohort has nothing for, at zero', () => {
    const result = buildOrganizationAnalytics({
      clinics: [clinic('a'), clinic('b')],
      encounters: [encounters('a', 3)],
      patientsByClinic: new Map([['a', 2]]),
      patientsOverall: 2,
      appointments: [],
    });
    expect(result.clinics.map((row) => row.clinicId)).toEqual(['a', 'b']);
    expect(result.clinics[1]).toMatchObject({ encounters: 0, patients: 0, appointments: 0 });
    expect(result.clinics[1].drilldown).toEqual({ clinicId: 'b', path: '/dashboard' });
  });

  it('takes distinct patients from the organization-wide count, not the clinic sum', () => {
    // One patient seen at both clinics: one per clinic, one to the organization.
    const result = buildOrganizationAnalytics({
      clinics: [clinic('a'), clinic('b')],
      encounters: [encounters('a', 1), encounters('b', 1)],
      patientsByClinic: new Map([
        ['a', 1],
        ['b', 1],
      ]),
      patientsOverall: 1,
      appointments: [],
    });
    expect(result.totals.patients).toBe(1);
    expect(result.totals.encounters).toBe(2);
    expect(result.totals.workflows.hypertension).toBe(2);
    expect(result.totals.clinics).toBe(2);
  });

  it('sums appointments by status across clinics', () => {
    const result = buildOrganizationAnalytics({
      clinics: [clinic('a'), clinic('b')],
      encounters: [],
      patientsByClinic: new Map(),
      patientsOverall: 0,
      appointments: [
        { clinicId: 'a', status: 'COMPLETED', count: 2 },
        { clinicId: 'a', status: 'NO_SHOW', count: 1 },
        { clinicId: 'b', status: 'COMPLETED', count: 4 },
        // A clinic outside the scope never reaches the totals.
        { clinicId: 'elsewhere', status: 'COMPLETED', count: 100 },
      ],
    });
    expect(result.clinics[0].appointments).toBe(3);
    expect(result.totals.appointments).toBe(7);
    expect(result.totals.appointmentsByStatus).toEqual({
      CONFIRMED: 0,
      COMPLETED: 6,
      CANCELLED: 0,
      NO_SHOW: 1,
    });
  });
});

describe('resolveCohortRange', () => {
  const now = new Date('2026-09-25T12:00:00Z');

  it('defaults to the last 30 days, ending today where the organization is', () => {
    const range = resolveCohortRange({}, 'Africa/Accra', now);
    expect(range).toMatchObject({ ok: true, from: '2026-08-27', to: '2026-09-25' });
    if (range.ok) expect(range.days).toHaveLength(30);
  });

  it('ends today in the organization’s zone, not the server’s', () => {
    // 23:30 UTC on the 25th is already the 26th in Nairobi (UTC+3).
    const late = new Date('2026-09-25T23:30:00Z');
    const range = resolveCohortRange({}, 'Africa/Nairobi', late);
    expect(range).toMatchObject({ ok: true, to: '2026-09-26' });
  });

  it('bounds the query at local midnight on either side', () => {
    const range = resolveCohortRange(
      { from: '2026-09-01', to: '2026-09-01' },
      'Africa/Nairobi',
      now,
    );
    expect(range.ok).toBe(true);
    if (!range.ok) return;
    expect(range.start.toISOString()).toBe('2026-08-31T21:00:00.000Z');
    expect(range.endExclusive.toISOString()).toBe('2026-09-01T21:00:00.000Z');
    expect(range.days).toEqual(['2026-09-01']);
  });

  it.each([
    [{ from: '2026-09-10', to: '2026-09-01' }, 'on or before'],
    [{ from: '2026-02-30', to: '2026-03-01' }, 'real calendar date'],
    [{ from: '2024-01-01', to: '2026-01-01' }, `${ANALYTICS_MAX_RANGE_DAYS} days`],
  ])('refuses %j', (requested, message) => {
    const range = resolveCohortRange(requested, 'Africa/Accra', now);
    expect(range.ok).toBe(false);
    if (!range.ok) expect(range.message).toContain(message);
  });

  it('accepts exactly the maximum range', () => {
    const from = '2026-01-01';
    const to = addDays(from, ANALYTICS_MAX_RANGE_DAYS - 1);
    expect(resolveCohortRange({ from, to }, 'Africa/Accra', now).ok).toBe(true);
  });
});

describe('calendarDays', () => {
  it('crosses a month end and includes both ends', () => {
    expect(calendarDays('2026-02-27', '2026-03-02')).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
  });
});
