import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ResearchExportStatus } from '@prisma/client';
import { RUN_KEY_PATTERN } from './research-run-key';
import {
  auditActions,
  buildResearchExportService,
  makeExportRecord,
  makeRunPackage,
} from '../testing/research-run-fixtures';

const clinicId = 'clinic-1';
const userId = 'user-1';
const status = (value: ResearchExportStatus) => value;

describe('ResearchExportService', () => {
  let ctx: ReturnType<typeof buildResearchExportService>;

  beforeEach(() => {
    ctx = buildResearchExportService();
  });

  describe('requesting an export', () => {
    it('queues an auto-approved request under its ad-hoc run key', async () => {
      ctx.prisma.clinicResearchSettings.findUnique.mockResolvedValue({
        clinicId,
        researchEnabled: true,
        requiresDirectorApprovalEachExport: false,
      });
      ctx.repo.create.mockImplementation(async (data) =>
        makeExportRecord({
          runKey: data.runKey,
          status: status('APPROVED'),
          approvedByUserId: userId,
          approvedBy: { id: userId, displayName: 'Requester' },
        }),
      );

      const result = await ctx.service.requestExport(
        clinicId,
        userId,
        { fromDate: '2026-03-01', toDate: '2026-03-21' },
        { clinicId, actorUserId: userId, requestId: 'req-1' },
      );

      expect(result.status).toBe('APPROVED');
      expect(result.runKey).toMatch(/^rx-3f9a2c1d-a\d{8}-[0-9a-z]{4}$/);
      expect(result.runKey).toMatch(RUN_KEY_PATTERN);
      expect(ctx.repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          fromDate: '2026-03-01',
          toDate: '2026-03-21',
          trigger: 'MANUAL',
          storageProvider: 'LOCAL',
          fileFormat: 'zip',
        }),
      );
      expect(ctx.queue.add).toHaveBeenCalledWith(
        'process',
        { exportId: 'exp-1', clinicId, userId },
        expect.objectContaining({ jobId: result.runKey }),
      );
      expect(auditActions(ctx.audit)).toEqual([
        'RESEARCH_EXPORT.REQUEST',
        'RESEARCH_EXPORT.APPROVE',
      ]);
    });

    it('refuses while research is turned off', async () => {
      ctx.prisma.clinicResearchSettings.findUnique.mockResolvedValue({ researchEnabled: false });
      await expect(
        ctx.service.requestExport(clinicId, userId, {
          fromDate: '2026-03-01',
          toDate: '2026-03-21',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(ctx.repo.create).not.toHaveBeenCalled();
    });

    it('refuses a destination this environment cannot publish to, before creating anything', async () => {
      ctx.prisma.clinicResearchSettings.findUnique.mockResolvedValue({
        researchEnabled: true,
        requiresDirectorApprovalEachExport: true,
      });
      ctx.storage.assertAvailable.mockImplementation(() => {
        throw new BadRequestException('Research storage R2 is not configured here');
      });
      await expect(
        ctx.service.requestExport(clinicId, userId, {
          fromDate: '2026-03-01',
          toDate: '2026-03-21',
        }),
      ).rejects.toThrow('not configured');
      expect(ctx.repo.create).not.toHaveBeenCalled();
    });
  });

  it('approves and queues a pending export under its run key', async () => {
    const pending = makeExportRecord();
    ctx.repo.findById.mockResolvedValue(pending);
    ctx.repo.update.mockResolvedValue(
      makeExportRecord({
        status: status('APPROVED'),
        approvedByUserId: 'director-1',
        approvedBy: { id: 'director-1', displayName: 'Director' },
      }),
    );

    const result = await ctx.service.approveExport('exp-1', 'director-1', {
      clinicId,
      actorUserId: 'director-1',
      requestId: 'req-2',
    });

    expect(result.status).toBe('APPROVED');
    expect(ctx.queue.add).toHaveBeenCalledWith(
      'process',
      { exportId: 'exp-1', clinicId, userId: 'director-1' },
      expect.objectContaining({ jobId: pending.runKey }),
    );
  });

  it('retries a failed export under a job id the queue has not already used', async () => {
    const failed = makeExportRecord({ status: status('FAILED'), failureReason: 'GitHub failed' });
    ctx.repo.findById.mockResolvedValue(failed);
    ctx.repo.update.mockResolvedValue(makeExportRecord({ status: status('APPROVED') }));

    const result = await ctx.service.retryExport('exp-1', userId, {
      clinicId,
      actorUserId: userId,
      requestId: 'req-3',
    });

    expect(result.status).toBe('APPROVED');
    const jobId = ctx.queue.add.mock.calls[0][2].jobId as string;
    // BullMQ keeps the first run's job under its id and silently ignores an add that reuses it,
    // which is how Retry once queued nothing at all.
    expect(jobId).toMatch(new RegExp(`^${failed.runKey}-retry-\\d+$`));
  });

  it('marks a queued export completed after the pack is built and published', async () => {
    const approved = makeExportRecord({
      status: status('APPROVED'),
      approvedByUserId: 'director-1',
      approvedBy: { id: 'director-1', displayName: 'Director' },
    });
    const processing = makeExportRecord({ ...approved, status: status('PROCESSING') });
    const run = makeRunPackage();
    ctx.repo.findById.mockResolvedValueOnce(approved);
    ctx.repo.transition
      .mockResolvedValueOnce(processing)
      .mockResolvedValueOnce(makeExportRecord({ ...processing, status: status('COMPLETED') }));
    ctx.repo.update.mockResolvedValueOnce({ ...processing, storagePath: 'research/v5/path' });
    ctx.transformService.generatePack.mockResolvedValue(run.pack);

    const result = await ctx.service.processQueuedExport('exp-1');

    expect(result?.status).toBe('COMPLETED');
    expect(ctx.transformService.generatePack).toHaveBeenCalledWith(
      clinicId,
      '2026-03-01',
      '2026-03-21',
      'exp-1',
      { runKey: approved.runKey, trigger: 'MANUAL', scheduleId: null },
      'research-export-v1',
    );
    expect(ctx.repo.update).toHaveBeenCalledWith(
      'exp-1',
      expect.objectContaining({
        consentedSubjectCount: run.pack.manifest.consentedSubjects,
        contentSha256: run.pack.manifest.contentSha256,
        changesJson: JSON.stringify(run.pack.changes),
      }),
    );
    expect(ctx.adapter.putRun).toHaveBeenCalledWith(
      expect.objectContaining({ exportId: 'exp-1', runKey: approved.runKey }),
    );
  });

  describe('a run that fails', () => {
    const approved = makeExportRecord({ status: status('APPROVED') });
    const processing = makeExportRecord({ status: status('PROCESSING') });
    const failed = makeExportRecord({
      status: status('FAILED'),
      failureReason: 'RESEARCH_EXPORT_FAILED',
    });

    beforeEach(() => {
      ctx.repo.findById.mockResolvedValueOnce(approved);
      ctx.repo.transition.mockResolvedValueOnce(processing).mockResolvedValueOnce(failed);
      ctx.transformService.generatePack.mockRejectedValue(
        new BadRequestException('missing RESEARCH_HMAC_KEY'),
      );
    });

    it('records a failed export on its last attempt instead of throwing the record away', async () => {
      // A throw here rolled the job transaction back, so FAILED and its audit entry were never
      // committed and the export read APPROVED forever.
      const result = await ctx.service.processQueuedExport('exp-1', {
        attemptsMade: 2,
        maxAttempts: 3,
      });

      expect(result?.status).toBe('FAILED');
      expect(ctx.repo.transition).toHaveBeenLastCalledWith(
        'exp-1',
        'PROCESSING',
        expect.objectContaining({ status: 'FAILED', failureReason: 'RESEARCH_EXPORT_FAILED' }),
      );
      expect(ctx.audit.logWrite).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: 'RESEARCH_EXPORT.FAIL', entityId: 'exp-1' }),
      );
      // A manual run's requester is watching the page; only scheduled runs email directors.
      expect(ctx.notifier.notifyDirectors).not.toHaveBeenCalled();
    });

    it('hands a failure with attempts left back to the queue without recording it', async () => {
      await expect(
        ctx.service.processQueuedExport('exp-1', { attemptsMade: 0, maxAttempts: 3 }),
      ).rejects.toThrow(BadRequestException);

      expect(ctx.repo.transition).toHaveBeenLastCalledWith('exp-1', 'PROCESSING', {
        status: 'APPROVED',
        storagePath: null,
      });
      expect(auditActions(ctx.audit)).not.toContain('RESEARCH_EXPORT.FAIL');
    });
  });

  it('emails the directors when a scheduled run fails on its last attempt', async () => {
    const scheduled = { trigger: 'SCHEDULED' as const, scheduleId: 'sched-1' };
    ctx.prisma.researchExportSchedule.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      reviewBy: new Date('2099-01-01T00:00:00Z'),
      approvedBy: { isActive: true, clinicRoles: [{ clinicId, role: 'DIRECTOR' }] },
    });
    ctx.repo.findById.mockResolvedValueOnce(
      makeExportRecord({ ...scheduled, status: status('APPROVED') }),
    );
    ctx.repo.transition
      .mockResolvedValueOnce(makeExportRecord({ ...scheduled, status: status('PROCESSING') }))
      .mockResolvedValueOnce(
        makeExportRecord({
          ...scheduled,
          status: status('FAILED'),
          failureReason: 'RESEARCH_EXPORT_FAILED',
        }),
      );
    ctx.transformService.generatePack.mockRejectedValue(new Error('boom'));

    await ctx.service.processQueuedExport('exp-1', { attemptsMade: 2, maxAttempts: 3 });

    expect(ctx.notifier.notifyDirectors).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED', reason: 'RESEARCH_EXPORT_FAILED' }),
      'user-1',
    );
  });

  describe('run-time governance (#166)', () => {
    const approvedScheduled = makeExportRecord({
      status: status('APPROVED'),
      trigger: 'SCHEDULED',
      scheduleId: 'sched-1',
    });

    const arrangeSkip = (skipReason: string) => {
      ctx.repo.findById.mockResolvedValueOnce(approvedScheduled);
      ctx.repo.transition.mockImplementation(async (_id, _from, data) =>
        makeExportRecord({ ...approvedScheduled, ...data, skipReason }),
      );
    };

    it('skips, audits and notifies when research was turned off after approval', async () => {
      ctx.prisma.clinicResearchSettings.findUnique.mockResolvedValue({ researchEnabled: false });
      arrangeSkip('RESEARCH_DISABLED');

      const result = await ctx.service.processQueuedExport('exp-1');

      expect(result).toMatchObject({ status: 'SKIPPED', skipReason: 'RESEARCH_DISABLED' });
      expect(ctx.repo.transition).toHaveBeenCalledWith(
        'exp-1',
        'APPROVED',
        expect.objectContaining({ status: 'SKIPPED', skipReason: 'RESEARCH_DISABLED' }),
      );
      expect(auditActions(ctx.audit)).toEqual(['RESEARCH_EXPORT.SKIP']);
      expect(ctx.transformService.generatePack).not.toHaveBeenCalled();
      expect(ctx.adapter.putRun).not.toHaveBeenCalled();
      expect(ctx.notifier.notifyDirectors).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'SKIPPED', reason: 'RESEARCH_DISABLED' }),
        'user-1',
      );
    });

    it('skips a run whose schedule was paused, revoked or deleted', async () => {
      ctx.prisma.researchExportSchedule.findUnique.mockResolvedValue(null);
      arrangeSkip('SCHEDULE_INACTIVE');
      await expect(ctx.service.processQueuedExport('exp-1')).resolves.toMatchObject({
        status: 'SKIPPED',
        skipReason: 'SCHEDULE_INACTIVE',
      });
    });

    it('skips a manual run below the minimum cohort without emailing anyone', async () => {
      ctx.repo.consentedPatientIds.mockResolvedValue(['p1']);
      const manual = makeExportRecord({ status: status('APPROVED') });
      ctx.repo.findById.mockResolvedValueOnce(manual);
      ctx.repo.transition.mockImplementation(async (_id, _from, data) =>
        makeExportRecord({ ...manual, ...data }),
      );

      const result = await ctx.service.processQueuedExport('exp-1');

      expect(result).toMatchObject({ status: 'SKIPPED', skipReason: 'BELOW_MINIMUM_COHORT' });
      expect(ctx.repo.transition).toHaveBeenCalledWith(
        'exp-1',
        'APPROVED',
        expect.objectContaining({ consentedSubjectCount: 1 }),
      );
      expect(ctx.notifier.notifyDirectors).not.toHaveBeenCalled();
    });

    it('never fails a skipped run because the notice could not be sent', async () => {
      ctx.prisma.clinicResearchSettings.findUnique.mockResolvedValue({ researchEnabled: false });
      ctx.notifier.notifyDirectors.mockRejectedValue(new Error('smtp down'));
      arrangeSkip('RESEARCH_DISABLED');
      await expect(ctx.service.processQueuedExport('exp-1')).resolves.toMatchObject({
        status: 'SKIPPED',
      });
    });
  });

  describe('rerunning a period', () => {
    const auditCtx = { clinicId, actorUserId: 'director-1' };

    beforeEach(() => {
      ctx.repo.create.mockImplementation(async (data) =>
        makeExportRecord({ runKey: data.runKey, status: status('APPROVED') }),
      );
    });

    it('creates the next revision of the run key, approved and queued, with the reason audited', async () => {
      ctx.repo.findById.mockResolvedValue(
        makeExportRecord({
          runKey: 'rx-3f9a2c1d-m2026-10',
          status: status('COMPLETED'),
          trigger: 'SCHEDULED',
          scheduleId: 'sched-1',
        }),
      );
      ctx.repo.listRunKeysWithPrefix.mockResolvedValue(['rx-3f9a2c1d-m2026-10']);

      const result = await ctx.service.rerunExport(
        'exp-1',
        'director-1',
        'Fixed a mapping',
        auditCtx,
      );

      expect(result.runKey).toBe('rx-3f9a2c1d-m2026-10-r2');
      expect(ctx.repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ trigger: 'SCHEDULED', status: 'APPROVED' }),
      );
      expect(ctx.prisma.$executeRaw).toHaveBeenCalled();
      const rerun = ctx.audit.logWrite.mock.calls.find(
        ([event]) => event.action === 'RESEARCH_EXPORT.RERUN',
      );
      expect(JSON.parse(rerun![0].afterJson).rerunReason).toBe('Fixed a mapping');
    });

    it('numbers past the highest revision that already exists', async () => {
      ctx.repo.findById.mockResolvedValue(
        makeExportRecord({ runKey: 'rx-3f9a2c1d-m2026-10-r2', status: status('FAILED') }),
      );
      ctx.repo.listRunKeysWithPrefix.mockResolvedValue([
        'rx-3f9a2c1d-m2026-10',
        'rx-3f9a2c1d-m2026-10-r2',
      ]);
      await expect(
        ctx.service.rerunExport('exp-1', 'director-1', 'Again', auditCtx),
      ).resolves.toMatchObject({ runKey: 'rx-3f9a2c1d-m2026-10-r3' });
    });

    it('refuses a run that has not finished', async () => {
      ctx.repo.findById.mockResolvedValue(makeExportRecord({ status: status('PROCESSING') }));
      await expect(
        ctx.service.rerunExport('exp-1', 'director-1', 'Too soon', auditCtx),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('a duplicate delivery', () => {
    it('stands down while another delivery of the same export is running', async () => {
      ctx.prisma.$queryRaw.mockResolvedValue([{ locked: false }]);

      await expect(ctx.service.processQueuedExport('exp-1')).resolves.toBeNull();

      expect(ctx.repo.findById).not.toHaveBeenCalled();
      expect(ctx.transformService.generatePack).not.toHaveBeenCalled();
      expect(ctx.adapter.putRun).not.toHaveBeenCalled();
    });

    it('claims the export before it reads it', async () => {
      ctx.repo.findById.mockResolvedValue(makeExportRecord({ status: status('COMPLETED') }));

      await ctx.service.processQueuedExport('exp-1');

      const [sql, key] = ctx.prisma.$queryRaw.mock.calls[0] as [TemplateStringsArray, string];
      expect(sql.join('?')).toContain('pg_try_advisory_xact_lock');
      expect(key).toBe('research-export:exp-1');
      expect(ctx.prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        ctx.repo.findById.mock.invocationCallOrder[0],
      );
    });

    async function expectFinishedDeliveryIgnored(finished: ResearchExportStatus) {
      ctx.repo.findById.mockResolvedValue(makeExportRecord({ status: status(finished) }));

      const result = await ctx.service.processQueuedExport('exp-1');

      expect(result?.status).toBe(finished);
      expect(ctx.repo.update).not.toHaveBeenCalled();
      expect(ctx.transformService.generatePack).not.toHaveBeenCalled();
      expect(ctx.adapter.putRun).not.toHaveBeenCalled();
    }

    // Named in the offline job matrix (JOB-07), so the title stays literal.
    it('does nothing for a delivery that arrives after the export completed', () =>
      expectFinishedDeliveryIgnored('COMPLETED'));

    it('does nothing for a delivery that arrives after the run was skipped', () =>
      expectFinishedDeliveryIgnored('SKIPPED'));
  });

  it('throws when a queued export cannot be found', async () => {
    ctx.repo.findById.mockResolvedValue(null);
    await expect(ctx.service.processQueuedExport('missing')).rejects.toThrow(NotFoundException);
  });

  it('resolves legacy job tenant metadata from the export record', async () => {
    ctx.repo.findById.mockResolvedValue(makeExportRecord({ approvedByUserId: 'director-1' }));
    await expect(ctx.service.findExportJobTenant('exp-1')).resolves.toEqual({
      clinicId,
      userId: 'director-1',
    });

    ctx.repo.findById.mockResolvedValue(null);
    await expect(ctx.service.findExportJobTenant('missing')).resolves.toBeNull();
  });

  it('reads stored change summaries and row counts back defensively', () => {
    const view = ctx.service.toExportView(
      makeExportRecord({ rowCountsJson: '{"research_subjects":"4"}', changesJson: 'not json' }),
    );
    expect(view.rowCounts).toEqual({ research_subjects: 4 });
    expect(view.changes).toBeNull();
  });
});
