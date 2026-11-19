import {
  HEARTS360_DEFINITIONS,
  failureRate,
  followUpMetricsCsvRows,
  formatDuration,
  formatShare,
  recentMonths,
  type FollowUpMetricsReport,
  formatRatio,
  humanizeReason,
  metricsHeadlines,
  type MetricsSummary,
} from './metrics';

const summary: MetricsSummary = {
  clinicId: 'clinic-1',
  range: { from: '2026-08-28T00:00:00.000Z', to: '2026-09-27T00:00:00.000Z', days: 30 },
  events: [
    {
      event: 'portal.claim',
      category: 'invites',
      label: 'Record claims',
      description: 'x',
      succeeded: 3,
      failed: 1,
      other: 0,
      total: 4,
    },
    {
      event: 'security.rate_limit',
      category: 'security',
      label: 'Requests throttled',
      description: 'x',
      succeeded: 0,
      failed: 0,
      other: 5,
      total: 5,
    },
  ],
  funnels: [
    {
      id: 'appointment-requests',
      label: 'Appointment requests',
      description: 'x',
      steps: [
        { event: 'appointment.request.submit', label: 'Requested', count: 8 },
        { event: 'appointment.request.confirm', label: 'Confirmed', count: 6 },
      ],
      conversion: 0.75,
    },
  ],
  failureReasons: [],
  daily: [],
  sync: { pushes: 2, mutations: 20, applied: 17, conflicts: 2, errors: 1 },
};

describe('metrics helpers', () => {
  it('formats a ratio, and says nothing rather than 0% when there is no denominator', () => {
    expect(formatRatio(0.625)).toBe('63%');
    expect(formatRatio(null)).toBe('–');
  });

  it('computes a failure rate only when something was attempted', () => {
    expect(failureRate({ succeeded: 3, failed: 1 })).toBe(0.25);
    expect(failureRate({ succeeded: 0, failed: 0 })).toBeNull();
  });

  it('puts a reason code into words', () => {
    expect(humanizeReason('APPOINTMENT_INVALID_TRANSITION')).toBe('Appointment invalid transition');
    expect(humanizeReason('NOT_FOUND')).toBe('Not found');
  });

  it('derives the headline figures', () => {
    expect(metricsHeadlines(summary)).toEqual({
      requestConversion: 0.75,
      requests: 8,
      merges: 0,
      claimSuccess: 0.75,
      syncConflictRate: 0.15,
      throttled: 5,
    });
  });
});

describe('follow-up indicators (#339)', () => {
  const byMode = (inPerson: number, tele: number) => ({ inPerson, tele, total: inPerson + tele });
  const report: FollowUpMetricsReport = {
    month: '2026-10',
    asOf: '2026-11-01T00:00:00.000Z',
    inProgress: false,
    timeZone: 'Africa/Accra',
    settings: {
      bpTargetUnder65: { systolic: 140, diastolic: 90 },
      bpTarget: { systolic: 140, diastolic: 90 },
      bpTargetWithDisease: { systolic: 130, diastolic: 90 },
      selfReportedCountsTowardControl: false,
      missedContactGraceDays: 7,
      controlWindowMonths: 3,
      underCareWindowMonths: 12,
    },
    register: 10,
    underCare: { count: 9, of: 10 },
    lost12m: { count: 1, of: 10 },
    controlled: { count: 4, of: 10 },
    uncontrolled: { count: 3, of: 10 },
    notAssessed: { count: 0, of: 10 },
    lost3m: { count: 3, of: 10 },
    untreated: { count: 1, of: 10 },
    startedTreatment: 1,
    tiers: { URGENT: 0, HIGH: 2, MODERATE: 8, LOW_MODERATE: 0, STABLE: 0, LOW: 1, NOT_TIERED: 0 },
    contacts: {
      due: byMode(2, 2),
      completed: byMode(1, 2),
      missed: byMode(1, 0),
      attempts: byMode(0, 2),
      attemptsPerCompleted: { count: 2, of: 3 },
    },
    outcomes: {
      ATTEMPTED: 2,
      REACHED: 1,
      DECLINED: 0,
      AGREED_TO_RETURN: 0,
      RETURNED: 1,
      REFERRED: 0,
      REFERRAL_CONFIRMED: 0,
    },
    urgent: {
      flags: 2,
      acknowledged: { judged: 2, withinLimit: 1, medianMinutes: 20, limitMinutes: 15 },
      confirmationCall: { judged: 2, withinLimit: 1, medianMinutes: 1440, limitMinutes: 2880 },
    },
    trend: [],
  };

  it('shows every percentage with its numerator and denominator', () => {
    expect(formatShare({ count: 4, of: 10 })).toEqual({ percent: '40%', fraction: '4 of 10' });
    // Nothing to divide by is a dash, never a reassuring 0%.
    expect(formatShare({ count: 0, of: 0 })).toEqual({ percent: '–', fraction: '0 of 0' });
  });

  it('formats response times in the unit a reader thinks in', () => {
    expect(formatDuration(null)).toBe('–');
    expect(formatDuration(15)).toBe('15 min');
    expect(formatDuration(1440)).toBe('24 h');
    expect(formatDuration(2880)).toBe('48 h');
    expect(formatDuration(5760)).toBe('4 days');
  });

  it('keeps the HEARTS360 wording exactly as #339 fixed it', () => {
    expect(HEARTS360_DEFINITIONS.controlled).toBe(
      "BP below target at the patient's most recent reading, taken within the past 3 months",
    );
    expect(HEARTS360_DEFINITIONS.underCare).toBe(
      'A BP reading recorded in the past 12 months; deceased patients excluded',
    );
    expect(HEARTS360_DEFINITIONS.missed).toBe(
      'No completed contact by the due date plus the grace period',
    );
  });

  it('exports each share with its denominator and percent, and attempts apart from completed', () => {
    const rows = followUpMetricsCsvRows(report);
    const row = (figure: string) => rows.find((r) => r[0] === figure);
    expect(row('Controlled')).toEqual(['Controlled', 4, 10, 40, HEARTS360_DEFINITIONS.controlled]);
    expect(row('Completed follow-ups: total')?.[1]).toBe(3);
    expect(row('Attempts: total')?.[1]).toBe(2);
    expect(row('Urgent flags taken within 15 min')).toEqual([
      'Urgent flags taken within 15 min',
      1,
      2,
      50,
      'Median 20 min',
    ]);
  });

  it('offers this month and the eleven before it', () => {
    const months = recentMonths(new Date('2026-11-16T12:00:00Z'));
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ value: '2026-11', label: 'November 2026' });
    expect(months[11]!.value).toBe('2025-12');
  });
});
