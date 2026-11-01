import type { JobStep } from '../prisma/job-tenant-context.runner';
import {
  RESEARCH_EXPORT_INTERRUPTED,
  RESEARCH_EXPORT_STALE_AFTER_MS,
} from './research-export.service';
import {
  auditActions,
  buildResearchExportService,
  makeExportRecord,
  makeRunPackage,
  mockStorageAdapter,
} from '../testing/research-run-fixtures';

/*
  #164: the research pack is published with no database transaction open, and a publish whose
  outcome was lost is settled by asking storage, never by publishing again. #166 put the
  destination behind a port; these run against a mocked adapter, so they hold for every one.

  The export row lives in memory, and `step` stands in for one short transaction, recording whether
  one is open when storage is called.
*/

type Row = Record<string, unknown>;

const PLANNED_PATH = 'research/v5/clinic=key/runs/rx-3f9a2c1d-m2026-09';
const STORED = {
  provider: 'LOCAL' as const,
  path: PLANNED_PATH,
  ref: 'abc123',
  url: `file:///${PLANNED_PATH}/`,
  syncedAt: new Date('2026-10-08T12:01:00Z'),
};

function setup(initial: Row = {}) {
  let row: Row = makeExportRecord({
    status: 'APPROVED',
    runKey: 'rx-3f9a2c1d-m2026-09',
    fromDate: '2026-09-01',
    toDate: '2026-09-30',
    requestedByUserId: 'director-1',
    requestedBy: { id: 'director-1', displayName: 'Director' },
    storageProvider: 'LOCAL',
    ...initial,
  } as never) as unknown as Row;
  let openSteps = 0;
  let failNextStep: Error | null = null;

  const adapter = mockStorageAdapter(PLANNED_PATH);
  adapter.putRun.mockImplementation(async () => {
    expect(openSteps).toBe(0);
    return STORED;
  });
  adapter.recoverRun.mockImplementation(async () => {
    expect(openSteps).toBe(0);
    return null;
  });
  const ctx = buildResearchExportService({ adapter });
  ctx.repo.findById.mockImplementation(async () => ({ ...row }));
  ctx.repo.update.mockImplementation(async (_id: string, data: Row) => {
    row = { ...row, ...data };
    return { ...row };
  });
  ctx.repo.transition.mockImplementation(async (_id: string, from: string, data: Row) => {
    if (row.status !== from) return null;
    row = { ...row, ...data };
    return { ...row };
  });
  ctx.repo.findStaleProcessing.mockImplementation(async () =>
    row.status === 'PROCESSING' ? [{ ...row }] : [],
  );
  ctx.transformService.generatePack.mockImplementation(async () => makeRunPackage().pack);

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
  return {
    ...ctx,
    step,
    row: () => row,
    failNextStepWith: (error: Error) => {
      failNextStep = error;
    },
  };
}

const actions = auditActions;

describe('pushing a research export outside the job transaction (#164)', () => {
  it('records the planned path before the push, and COMPLETED after it', async () => {
    const { service, step, adapter, row, audit } = setup();
    adapter.putRun.mockImplementationOnce(async () => {
      // The path GitHub is about to receive is already on the row.
      expect(row()).toMatchObject({ status: 'PROCESSING', storagePath: PLANNED_PATH });
      return STORED;
    });

    await expect(service.processQueuedExport('exp-1', undefined, step)).resolves.toMatchObject({
      status: 'COMPLETED',
    });
    expect(row()).toMatchObject({ status: 'COMPLETED', storageRef: 'abc123' });
    expect(actions(audit)).toEqual(['RESEARCH_EXPORT.START', 'RESEARCH_EXPORT.COMPLETE']);
  });

  it('completes from the commit GitHub already has when the push response was lost', async () => {
    const { service, step, adapter, row } = setup();
    adapter.putRun.mockRejectedValueOnce(new Error('socket hang up'));
    adapter.recoverRun.mockResolvedValueOnce(STORED);

    await service.processQueuedExport('exp-1', { attemptsMade: 0, maxAttempts: 3 }, step);
    expect(row()).toMatchObject({ status: 'COMPLETED', storageRef: 'abc123' });
    expect(adapter.putRun).toHaveBeenCalledTimes(1);
  });

  it('retries a push that certainly did not land', async () => {
    const { service, step, adapter, row } = setup();
    adapter.putRun.mockRejectedValueOnce(new Error('GitHub sync failed (422)'));

    await expect(
      service.processQueuedExport('exp-1', { attemptsMade: 0, maxAttempts: 3 }, step),
    ).rejects.toThrow('422');
    expect(row()).toMatchObject({ status: 'APPROVED', storagePath: null });
  });

  it('leaves the export PROCESSING when nobody can tell whether the push landed', async () => {
    const { service, step, adapter, row } = setup();
    adapter.putRun.mockRejectedValueOnce(new Error('socket hang up'));
    adapter.recoverRun.mockRejectedValueOnce(new Error('GitHub unreachable'));

    await expect(
      service.processQueuedExport('exp-1', { attemptsMade: 0, maxAttempts: 3 }, step),
    ).resolves.toBeNull();
    expect(row()).toMatchObject({ status: 'PROCESSING', storagePath: PLANNED_PATH });

    // The queue's retry, or a duplicate delivery, does not start it again.
    await service.processQueuedExport('exp-1', undefined, step);
    expect(adapter.putRun).toHaveBeenCalledTimes(1);
  });

  it('throws without pushing again when COMPLETED cannot be recorded', async () => {
    const { service, step, adapter, row, failNextStepWith } = setup();
    adapter.putRun.mockImplementationOnce(async () => {
      failNextStepWith(new Error('connection reset'));
      return STORED;
    });

    await expect(service.processQueuedExport('exp-1', undefined, step)).rejects.toThrow(
      'connection reset',
    );
    expect(row().status).toBe('PROCESSING');
    await service.processQueuedExport('exp-1', undefined, step);
    expect(adapter.putRun).toHaveBeenCalledTimes(1);
  });

  it('mirrors the manifest to GitHub after COMPLETED, outside any transaction', async () => {
    const { service, step, storage, row, audit } = setup();
    storage.mirrorsManifests.mockReturnValue(true);
    storage.github.mirrorManifest.mockResolvedValue({ ...STORED, provider: 'GITHUB' });

    await service.processQueuedExport('exp-1', undefined, step);

    expect(row().status).toBe('COMPLETED');
    expect(storage.github.mirrorManifest).toHaveBeenCalledTimes(1);
    expect(actions(audit)).toEqual([
      'RESEARCH_EXPORT.START',
      'RESEARCH_EXPORT.COMPLETE',
      'RESEARCH_EXPORT.MIRROR',
    ]);
  });

  it('keeps a published run COMPLETED when the GitHub mirror fails, and audits the failure', async () => {
    const { service, step, storage, row, audit } = setup();
    storage.mirrorsManifests.mockReturnValue(true);
    storage.github.mirrorManifest.mockRejectedValue(new Error('GitHub sync failed (502)'));

    await expect(service.processQueuedExport('exp-1', undefined, step)).resolves.toMatchObject({
      status: 'COMPLETED',
    });
    expect(row().status).toBe('COMPLETED');
    expect(actions(audit)).toContain('RESEARCH_EXPORT.MIRROR_FAIL');
  });

  describe('reconcileStaleExports', () => {
    const now = new Date('2026-10-08T15:00:00Z');
    const stale = new Date(now.getTime() - RESEARCH_EXPORT_STALE_AFTER_MS - 1);
    const clinicStep = (step: JobStep) => () => step;

    it('completes an export whose push landed, without pushing', async () => {
      const { service, step, adapter, row, audit } = setup({
        status: 'PROCESSING',
        startedAt: stale,
        storagePath: PLANNED_PATH,
      });
      adapter.recoverRun.mockResolvedValueOnce(STORED);

      await expect(service.reconcileStaleExports(step, clinicStep(step), now)).resolves.toEqual({
        completed: 1,
        failed: 0,
      });
      expect(row()).toMatchObject({ status: 'COMPLETED', storageRef: 'abc123' });
      expect(actions(audit)).toEqual(['RESEARCH_EXPORT.RECONCILE']);
      expect(adapter.putRun).not.toHaveBeenCalled();
    });

    it('fails an export whose push never landed, so an operator can retry it', async () => {
      const { service, step, row } = setup({
        status: 'PROCESSING',
        startedAt: stale,
        storagePath: PLANNED_PATH,
      });

      await service.reconcileStaleExports(step, clinicStep(step), now);
      expect(row()).toMatchObject({
        status: 'FAILED',
        failureReason: RESEARCH_EXPORT_INTERRUPTED,
        storagePath: null,
      });
    });

    it('fails one that stopped before planning a push, without asking GitHub', async () => {
      const { service, step, adapter, row } = setup({
        status: 'PROCESSING',
        startedAt: stale,
      });

      await service.reconcileStaleExports(step, clinicStep(step), now);
      expect(adapter.recoverRun).not.toHaveBeenCalled();
      expect(row()).toMatchObject({ status: 'FAILED', failureReason: RESEARCH_EXPORT_INTERRUPTED });
    });

    it('leaves one alone while GitHub cannot be asked', async () => {
      const { service, step, adapter, row } = setup({
        status: 'PROCESSING',
        startedAt: stale,
        storagePath: PLANNED_PATH,
      });
      adapter.recoverRun.mockRejectedValueOnce(new Error('GitHub unreachable'));

      await expect(service.reconcileStaleExports(step, clinicStep(step), now)).resolves.toEqual({
        completed: 0,
        failed: 0,
      });
      expect(row().status).toBe('PROCESSING');
    });
  });
});
