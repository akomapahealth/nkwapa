import {
  failureRate,
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
