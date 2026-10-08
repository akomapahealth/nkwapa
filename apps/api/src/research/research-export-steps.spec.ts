import type { JobStep } from '../prisma/job-tenant-context.runner';
import {
  RESEARCH_EXPORT_INTERRUPTED,
  RESEARCH_EXPORT_STALE_AFTER_MS,
  ResearchExportService,
} from './research-export.service';

/*
  #164: the research pack is pushed to GitHub with no database transaction open, and a push whose
  outcome was lost is settled by asking GitHub, never by pushing again.

  The export row lives in memory, and `step` stands in for one short transaction, recording whether
  one is open when GitHub is called.
*/

type Row = Record<string, unknown>;

const PLANNED_PATH = 'clinics/key/exports/2026-10-08T12-00-00-000Z__exp-1';
const COMMIT = {
  provider: 'GITHUB',
  repoPath: PLANNED_PATH,
  commitSha: 'abc123',
  commitUrl: 'https://github.com/example/research/commit/abc123',
  syncedAt: new Date('2026-10-08T12:01:00Z'),
};

function exportRow(overrides: Row = {}): Row {
  return {
    id: 'exp-1',
    clinicId: 'clinic-1',
    status: 'APPROVED',
    fromDate: '2026-09-01',
    toDate: '2026-09-30',
    policyVersionSnapshot: 'research-export-v1',
    requestedByUserId: 'director-1',
    requestedBy: { id: 'director-1', displayName: 'Director' },
    approvedBy: null,
    requestedAt: new Date('2026-10-08T11:00:00Z'),
    approvedAt: null,
    startedAt: null,
    completedAt: null,
    repoPath: null,
    repoCommitSha: null,
    failureReason: null,
    ...overrides,
  };
}

function setup(initial: Row = {}) {
  let row = exportRow(initial);
  let openSteps = 0;
  let failNextStep: Error | null = null;

  const repo = {
    findById: jest.fn(async () => ({ ...row })),
    update: jest.fn(async (_id: string, data: Row) => {
      row = { ...row, ...data };
      return { ...row };
    }),
    transition: jest.fn(async (_id: string, from: string, data: Row) => {
      if (row.status !== from) return null;
      row = { ...row, ...data };
      return { ...row };
    }),
    findStaleProcessing: jest.fn(async () => (row.status === 'PROCESSING' ? [{ ...row }] : [])),
  };
  const step: JobStep = async (callback) => {
    if (failNextStep) {
      const error = failNextStep;
      failNextStep = null;
      throw error;
    }
    openSteps += 1;
    try {
      return await callback({} as never);
    } finally {
      openSteps -= 1;
    }
  };
  const transformService = {
    generatePack: jest.fn(async () => ({
      manifest: { clinicKey: 'key', generatedAt: '2026-10-08T12:00:00.000Z' },
      repoFiles: [],
      artifactPath: '/tmp/exp-1.zip',
      artifactSha256: 'sha',
      artifactSizeBytes: 10,
      recordCount: 3,
      rowCounts: { research_measurements: 3 },
    })),
  };
  const repoSyncService = {
    plannedRepoPath: jest.fn(() => PLANNED_PATH),
    sync: jest.fn(async () => {
      expect(openSteps).toBe(0);
      return COMMIT;
    }),
    findPushedCommit: jest.fn(async (): Promise<typeof COMMIT | null> => {
      expect(openSteps).toBe(0);
      return null;
    }),
  };
  const audit = { logWrite: jest.fn().mockResolvedValue(undefined) };
  const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]) };
  const service = new ResearchExportService(
    repo as never,
    prisma as never,
    audit as never,
    transformService as never,
    repoSyncService as never,
    { add: jest.fn() } as never,
  );
  return {
    service,
    step,
    repoSyncService,
    audit,
    row: () => row,
    failNextStepWith: (error: Error) => {
      failNextStep = error;
    },
  };
}

const actions = (audit: { logWrite: jest.Mock }) =>
  audit.logWrite.mock.calls.map(([event]) => (event as { action: string }).action);

describe('pushing a research export outside the job transaction (#164)', () => {
  it('records the planned path before the push, and COMPLETED after it', async () => {
    const { service, step, repoSyncService, row, audit } = setup();
    repoSyncService.sync.mockImplementationOnce(async () => {
      // The path GitHub is about to receive is already on the row.
      expect(row()).toMatchObject({ status: 'PROCESSING', repoPath: PLANNED_PATH });
      return COMMIT;
    });

    await expect(service.processQueuedExport('exp-1', undefined, step)).resolves.toMatchObject({
      status: 'COMPLETED',
    });
    expect(row()).toMatchObject({ status: 'COMPLETED', repoCommitSha: 'abc123' });
    expect(actions(audit)).toEqual(['RESEARCH_EXPORT.START', 'RESEARCH_EXPORT.COMPLETE']);
  });

  it('completes from the commit GitHub already has when the push response was lost', async () => {
    const { service, step, repoSyncService, row } = setup();
    repoSyncService.sync.mockRejectedValueOnce(new Error('socket hang up'));
    repoSyncService.findPushedCommit.mockResolvedValueOnce(COMMIT);

    await service.processQueuedExport('exp-1', { attemptsMade: 0, maxAttempts: 3 }, step);
    expect(row()).toMatchObject({ status: 'COMPLETED', repoCommitSha: 'abc123' });
    expect(repoSyncService.sync).toHaveBeenCalledTimes(1);
  });

  it('retries a push that certainly did not land', async () => {
    const { service, step, repoSyncService, row } = setup();
    repoSyncService.sync.mockRejectedValueOnce(new Error('GitHub sync failed (422)'));

    await expect(
      service.processQueuedExport('exp-1', { attemptsMade: 0, maxAttempts: 3 }, step),
    ).rejects.toThrow('422');
    expect(row()).toMatchObject({ status: 'APPROVED', repoPath: null });
  });

  it('leaves the export PROCESSING when nobody can tell whether the push landed', async () => {
    const { service, step, repoSyncService, row } = setup();
    repoSyncService.sync.mockRejectedValueOnce(new Error('socket hang up'));
    repoSyncService.findPushedCommit.mockRejectedValueOnce(new Error('GitHub unreachable'));

    await expect(
      service.processQueuedExport('exp-1', { attemptsMade: 0, maxAttempts: 3 }, step),
    ).resolves.toBeNull();
    expect(row()).toMatchObject({ status: 'PROCESSING', repoPath: PLANNED_PATH });

    // The queue's retry, or a duplicate delivery, does not start it again.
    await service.processQueuedExport('exp-1', undefined, step);
    expect(repoSyncService.sync).toHaveBeenCalledTimes(1);
  });

  it('throws without pushing again when COMPLETED cannot be recorded', async () => {
    const { service, step, repoSyncService, row, failNextStepWith } = setup();
    repoSyncService.sync.mockImplementationOnce(async () => {
      failNextStepWith(new Error('connection reset'));
      return COMMIT;
    });

    await expect(service.processQueuedExport('exp-1', undefined, step)).rejects.toThrow(
      'connection reset',
    );
    expect(row().status).toBe('PROCESSING');
    await service.processQueuedExport('exp-1', undefined, step);
    expect(repoSyncService.sync).toHaveBeenCalledTimes(1);
  });

  describe('reconcileStaleExports', () => {
    const now = new Date('2026-10-08T15:00:00Z');
    const stale = new Date(now.getTime() - RESEARCH_EXPORT_STALE_AFTER_MS - 1);
    const clinicStep = (step: JobStep) => () => step;

    it('completes an export whose push landed, without pushing', async () => {
      const { service, step, repoSyncService, row, audit } = setup({
        status: 'PROCESSING',
        startedAt: stale,
        repoPath: PLANNED_PATH,
      });
      repoSyncService.findPushedCommit.mockResolvedValueOnce(COMMIT);

      await expect(service.reconcileStaleExports(step, clinicStep(step), now)).resolves.toEqual({
        completed: 1,
        failed: 0,
      });
      expect(row()).toMatchObject({ status: 'COMPLETED', repoCommitSha: 'abc123' });
      expect(actions(audit)).toEqual(['RESEARCH_EXPORT.RECONCILE']);
      expect(repoSyncService.sync).not.toHaveBeenCalled();
    });

    it('fails an export whose push never landed, so an operator can retry it', async () => {
      const { service, step, row } = setup({
        status: 'PROCESSING',
        startedAt: stale,
        repoPath: PLANNED_PATH,
      });

      await service.reconcileStaleExports(step, clinicStep(step), now);
      expect(row()).toMatchObject({
        status: 'FAILED',
        failureReason: RESEARCH_EXPORT_INTERRUPTED,
        repoPath: null,
      });
    });

    it('fails one that stopped before planning a push, without asking GitHub', async () => {
      const { service, step, repoSyncService, row } = setup({
        status: 'PROCESSING',
        startedAt: stale,
      });

      await service.reconcileStaleExports(step, clinicStep(step), now);
      expect(repoSyncService.findPushedCommit).not.toHaveBeenCalled();
      expect(row()).toMatchObject({ status: 'FAILED', failureReason: RESEARCH_EXPORT_INTERRUPTED });
    });

    it('leaves one alone while GitHub cannot be asked', async () => {
      const { service, step, repoSyncService, row } = setup({
        status: 'PROCESSING',
        startedAt: stale,
        repoPath: PLANNED_PATH,
      });
      repoSyncService.findPushedCommit.mockRejectedValueOnce(new Error('GitHub unreachable'));

      await expect(service.reconcileStaleExports(step, clinicStep(step), now)).resolves.toEqual({
        completed: 0,
        failed: 0,
      });
      expect(row().status).toBe('PROCESSING');
    });
  });
});
