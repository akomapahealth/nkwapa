import { MetricsService } from './metrics.service';

function setup(overrides: Partial<Record<string, jest.Mock>> = {}) {
  const groupBy = jest
    .fn()
    .mockResolvedValueOnce([
      { event: 'appointment.request.submit', outcome: 'SUCCEEDED', _count: { _all: 10 } },
      { event: 'appointment.request.confirm', outcome: 'SUCCEEDED', _count: { _all: 6 } },
      { event: 'appointment.request.confirm', outcome: 'FAILED', _count: { _all: 2 } },
      { event: 'security.rate_limit', outcome: null, _count: { _all: 3 } },
    ])
    .mockResolvedValueOnce([
      {
        event: 'appointment.request.confirm',
        reason: 'APPOINTMENT_INVALID_TRANSITION',
        _count: { _all: 2 },
      },
    ]);
  const queryRaw = jest
    .fn()
    .mockResolvedValueOnce([
      { day: new Date('2026-09-20T00:00:00.000Z'), succeeded: 5n, failed: 1n },
    ])
    .mockResolvedValueOnce([
      { pushes: 4n, mutations: 12n, applied: 10n, conflicts: 1n, errors: 1n },
    ]);
  const prisma = { telemetryEvent: { groupBy }, $queryRaw: queryRaw, ...overrides };
  return { service: new MetricsService(prisma as never), groupBy, queryRaw };
}

describe('MetricsService', () => {
  const now = new Date('2026-09-27T00:00:00.000Z');

  it('scopes every query to the clinic and the window', async () => {
    const { service, groupBy } = setup();
    await service.summary('clinic-1', 7, now);
    for (const [arg] of groupBy.mock.calls) {
      expect(arg.where).toMatchObject({
        clinicId: 'clinic-1',
        occurredAt: { gte: new Date('2026-09-20T00:00:00.000Z'), lte: now },
      });
    }
  });

  it('computes funnels from successful steps only', async () => {
    const { service } = setup();
    const summary = await service.summary('clinic-1', 30, now);
    const requests = summary.funnels.find((funnel) => funnel.id === 'appointment-requests');
    expect(requests?.steps.map((step) => step.count)).toEqual([10, 6]);
    expect(requests?.conversion).toBeCloseTo(0.6);
    // Nothing entered the merge funnel, so there is no ratio to report.
    expect(summary.funnels.find((funnel) => funnel.id === 'patient-merges')?.conversion).toBeNull();
  });

  it('lists every server event, zero-filled, and none of the browser ones', async () => {
    const { service } = setup();
    const summary = await service.summary('clinic-1', 30, now);
    const names = summary.events.map((row) => row.event);
    expect(names).toContain('patient.merge.execute');
    expect(names).not.toContain('sync.center.open');
    expect(summary.events.find((row) => row.event === 'appointment.request.confirm')).toMatchObject(
      {
        succeeded: 6,
        failed: 2,
        total: 8,
      },
    );
    expect(summary.events.find((row) => row.event === 'security.rate_limit')?.other).toBe(3);
  });

  it('reports failure reasons, daily totals and sync volumes as plain numbers', async () => {
    const { service } = setup();
    const summary = await service.summary('clinic-1', 30, now);
    expect(summary.failureReasons).toEqual([
      { event: 'appointment.request.confirm', reason: 'APPOINTMENT_INVALID_TRANSITION', count: 2 },
    ]);
    expect(summary.daily).toEqual([{ date: '2026-09-20', succeeded: 5, failed: 1 }]);
    expect(summary.sync).toEqual({
      pushes: 4,
      mutations: 12,
      applied: 10,
      conflicts: 1,
      errors: 1,
    });
  });
});
