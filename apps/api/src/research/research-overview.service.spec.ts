import { NotFoundException } from '@nestjs/common';
import { ResearchOverviewService } from './research-overview.service';

const CLINIC = 'clinic-1';
const NOW = new Date('2026-10-31T10:00:00Z');
const DAY_MS = 86_400_000;

function run(overrides: Record<string, unknown>) {
  return {
    id: 'e1',
    clinicId: CLINIC,
    runKey: 'rx-3f9a2c1d-m2026-10',
    status: 'COMPLETED',
    requestedAt: new Date('2026-10-01T03:00:00Z'),
    ...overrides,
  };
}

function build() {
  const prisma = {
    clinicResearchSettings: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ researchEnabled: true, requiresDirectorApprovalEachExport: true }),
    },
    researchExport: {
      groupBy: jest.fn().mockResolvedValue([
        { status: 'COMPLETED', _count: { _all: 3 } },
        { status: 'PENDING_APPROVAL', _count: { _all: 1 } },
      ]),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    researchExportSchedule: { findMany: jest.fn().mockResolvedValue([]) },
    auditEvent: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const repo = {
    consentedPatientIds: jest.fn().mockResolvedValue(['p1', 'p2', 'p3']),
    findById: jest.fn(),
  };
  const exports = {
    clinicTimeZone: jest.fn().mockResolvedValue('Africa/Accra'),
    toExportView: jest.fn((record) => ({ id: record.id, runKey: record.runKey })),
  };
  const storage = { available: jest.fn(() => ['R2']), defaultProvider: jest.fn(() => 'R2') };
  const service = new ResearchOverviewService(
    prisma as never,
    repo as never,
    exports as never,
    storage as never,
  );
  return { service, prisma, repo, storage };
}

describe('ResearchOverviewService', () => {
  it('reports readiness: research, cohort against the minimum, storage and counts', async () => {
    const { service } = build();
    const overview = await service.overview(CLINIC, NOW);
    expect(overview).toMatchObject({
      researchEnabled: true,
      approvalRequired: true,
      timezone: 'Africa/Accra',
      consentedSubjects: 3,
      minSubjects: 10,
      storage: { destinations: ['R2'], defaultDestination: 'R2' },
      counts: { COMPLETED: 3, PENDING_APPROVAL: 1 },
      lastCompleted: null,
      nextRun: null,
    });
  });

  it('says there is no destination rather than guessing one', async () => {
    const { service, storage } = build();
    storage.available.mockReturnValue([]);
    const overview = await service.overview(CLINIC, NOW);
    expect(overview.storage).toEqual({ destinations: [], defaultDestination: null });
    expect(storage.defaultProvider).not.toHaveBeenCalled();
  });

  it('stops asking about a skipped run once a later revision of its period exists', async () => {
    const { service, prisma } = build();
    const skipped = run({ id: 'e-skip', status: 'SKIPPED', runKey: 'rx-3f9a2c1d-m2026-10' });
    const failed = run({ id: 'e-fail', status: 'FAILED', runKey: 'rx-3f9a2c1d-w2026-43' });
    const pending = run({
      id: 'e-pend',
      status: 'PENDING_APPROVAL',
      runKey: 'rx-3f9a2c1d-a20261030-k3m2',
    });
    prisma.researchExport.findMany
      .mockResolvedValueOnce([pending, failed, skipped])
      .mockResolvedValueOnce([
        { runKey: skipped.runKey, requestedAt: skipped.requestedAt },
        { runKey: 'rx-3f9a2c1d-m2026-10-r2', requestedAt: new Date('2026-10-02T09:00:00Z') },
        { runKey: failed.runKey, requestedAt: failed.requestedAt },
      ]);

    const overview = await service.overview(CLINIC, NOW);

    expect(overview.attention.runs.map((item) => item.id)).toEqual(['e-pend', 'e-fail']);
  });

  it('flags schedules waiting for approval, past review, or reviewing within 30 days', async () => {
    const { service, prisma } = build();
    const shape = { cadence: 'MONTHLY', dayOfWeek: null, dayOfMonth: 1, localHour: 7 };
    prisma.researchExportSchedule.findMany.mockResolvedValue([
      { id: 's-pend', status: 'PENDING_APPROVAL', reviewBy: null, nextRunAt: null, ...shape },
      {
        id: 's-exp',
        status: 'EXPIRED',
        reviewBy: new Date('2026-10-01'),
        nextRunAt: null,
        ...shape,
      },
      {
        id: 's-soon',
        status: 'ACTIVE',
        reviewBy: new Date(NOW.getTime() + 10 * DAY_MS),
        nextRunAt: new Date('2026-11-01T07:00:00Z'),
        ...shape,
      },
      {
        id: 's-fine',
        status: 'ACTIVE',
        reviewBy: new Date(NOW.getTime() + 200 * DAY_MS),
        nextRunAt: new Date('2026-11-02T07:00:00Z'),
        ...shape,
      },
      { id: 's-paused', status: 'PAUSED', reviewBy: null, nextRunAt: null, ...shape },
    ]);

    const overview = await service.overview(CLINIC, NOW);

    expect(overview.attention.schedules.map(({ id, kind }) => [id, kind])).toEqual([
      ['s-pend', 'PENDING_APPROVAL'],
      ['s-exp', 'EXPIRED'],
      ['s-soon', 'REVIEW_SOON'],
    ]);
    expect(overview.nextRun).toEqual({ scheduleId: 's-soon', at: '2026-11-01T07:00:00.000Z' });
  });

  describe('events', () => {
    it("refuses another clinic's run", async () => {
      const { service, repo } = build();
      repo.findById.mockResolvedValue(run({ clinicId: 'other' }));
      await expect(service.events(CLINIC, 'e1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('gives each step with its actor and only the recorded reason, never the audit image', async () => {
      const { service, repo, prisma } = build();
      repo.findById.mockResolvedValue(run({}));
      prisma.auditEvent.findMany.mockResolvedValue([
        {
          id: 'a1',
          action: 'RESEARCH_EXPORT.RERUN',
          createdAt: new Date('2026-10-02T09:00:00Z'),
          afterJson: JSON.stringify({ rerunReason: 'Data correction', storagePath: 'x' }),
          actor: { displayName: 'Director' },
        },
        {
          id: 'a2',
          action: 'RESEARCH_EXPORT.COMPLETE',
          createdAt: new Date('2026-10-02T09:05:00Z'),
          afterJson: JSON.stringify({ rejectionReason: 'stale field from the record' }),
          actor: { displayName: 'Director' },
        },
        {
          id: 'a3',
          action: 'RESEARCH_EXPORT.SKIP',
          createdAt: new Date('2026-10-02T09:06:00Z'),
          afterJson: 'not json',
          actor: { displayName: 'System' },
        },
      ]);

      const events = await service.events(CLINIC, 'e1');

      expect(events).toEqual([
        {
          id: 'a1',
          action: 'RESEARCH_EXPORT.RERUN',
          at: '2026-10-02T09:00:00.000Z',
          actor: 'Director',
          note: 'Data correction',
        },
        expect.objectContaining({ id: 'a2', note: null }),
        expect.objectContaining({ id: 'a3', note: null }),
      ]);
      expect(prisma.auditEvent.findMany.mock.calls[0][0].where).toEqual({
        clinicId: CLINIC,
        entityType: 'ResearchExport',
        entityId: 'e1',
      });
    });
  });
});
