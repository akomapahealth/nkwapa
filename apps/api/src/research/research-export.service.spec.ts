import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ResearchExportStatus } from '@prisma/client';
import { ResearchExportService } from './research-export.service';
import type { ResearchExportRecord } from './research-export.repository';

function makeExportRecord(overrides: Partial<ResearchExportRecord> = {}): ResearchExportRecord {
  return {
    id: 'exp-1',
    clinicId: 'clinic-1',
    requestedByUserId: 'user-1',
    approvedByUserId: null,
    fromDate: '2026-03-01',
    toDate: '2026-03-21',
    status: 'PENDING_APPROVAL' as ResearchExportStatus,
    datasetVersion: 1,
    policyVersionSnapshot: 'research-export-v1',
    rejectionReason: null,
    failureReason: null,
    filePath: null,
    fileFormat: 'zip',
    recordCount: null,
    rowCountsJson: null,
    artifactSha256: null,
    artifactSizeBytes: null,
    repoProvider: null,
    repoPath: null,
    repoCommitSha: null,
    repoCommitUrl: null,
    syncedAt: null,
    requestedAt: new Date('2026-03-21T12:00:00.000Z'),
    startedAt: null,
    approvedAt: null,
    completedAt: null,
    requestedBy: { id: 'user-1', displayName: 'Requester' },
    approvedBy: null,
    ...overrides,
  };
}

describe('ResearchExportService', () => {
  const clinicId = 'clinic-1';
  const userId = 'user-1';

  let repo: {
    create: jest.Mock;
    findById: jest.Mock;
    update: jest.Mock;
    transition: jest.Mock;
    findStaleProcessing: jest.Mock;
    listByClinic: jest.Mock;
  };
  let prisma: {
    $queryRaw: jest.Mock;
    clinicResearchSettings: { findUnique: jest.Mock };
  };
  let auditService: { logWrite: jest.Mock };
  let transformService: { generatePack: jest.Mock };
  let repoSyncService: { sync: jest.Mock; plannedRepoPath: jest.Mock; findPushedCommit: jest.Mock };
  let exportQueue: { add: jest.Mock };
  let service: ResearchExportService;

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      transition: jest.fn(),
      findStaleProcessing: jest.fn().mockResolvedValue([]),
      listByClinic: jest.fn(),
    };
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
      clinicResearchSettings: { findUnique: jest.fn() },
    };
    auditService = { logWrite: jest.fn() };
    transformService = { generatePack: jest.fn() };
    repoSyncService = {
      sync: jest.fn(),
      plannedRepoPath: jest.fn().mockReturnValue('clinics/abc/exports/snapshot'),
      findPushedCommit: jest.fn().mockResolvedValue(null),
    };
    exportQueue = { add: jest.fn() };

    service = new ResearchExportService(
      repo as never,
      prisma as never,
      auditService as never,
      transformService as never,
      repoSyncService as never,
      exportQueue as never,
    );
  });

  it('queues an auto-approved export request when director approval is disabled', async () => {
    prisma.clinicResearchSettings.findUnique.mockResolvedValue({
      clinicId,
      researchEnabled: true,
      requiresDirectorApprovalEachExport: false,
    });
    repo.create.mockResolvedValue(
      makeExportRecord({
        status: 'APPROVED' as ResearchExportStatus,
        approvedByUserId: userId,
        approvedAt: new Date('2026-03-21T12:01:00.000Z'),
        approvedBy: { id: userId, displayName: 'Requester' },
      }),
    );
    exportQueue.add.mockResolvedValue(undefined);

    const result = await service.requestExport(
      clinicId,
      userId,
      { fromDate: '2026-03-01', toDate: '2026-03-21' },
      { clinicId, actorUserId: userId, requestId: 'req-1' },
    );

    expect(result.status).toBe('APPROVED');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        fromDate: '2026-03-01',
        toDate: '2026-03-21',
        fileFormat: 'zip',
      }),
    );
    expect(exportQueue.add).toHaveBeenCalledWith(
      'process',
      { exportId: 'exp-1', clinicId, userId },
      expect.objectContaining({ jobId: 'exp-1' }),
    );
  });

  it('approves and queues a pending export', async () => {
    const pending = makeExportRecord();
    const approved = makeExportRecord({
      status: 'APPROVED' as ResearchExportStatus,
      approvedByUserId: 'director-1',
      approvedAt: new Date('2026-03-21T12:05:00.000Z'),
      approvedBy: { id: 'director-1', displayName: 'Director' },
    });

    repo.findById.mockResolvedValue(pending);
    repo.update.mockResolvedValue(approved);
    exportQueue.add.mockResolvedValue(undefined);

    const result = await service.approveExport('exp-1', 'director-1', {
      clinicId,
      actorUserId: 'director-1',
      requestId: 'req-2',
    });

    expect(result.status).toBe('APPROVED');
    expect(repo.update).toHaveBeenCalledWith(
      'exp-1',
      expect.objectContaining({
        status: 'APPROVED',
      }),
    );
    expect(exportQueue.add).toHaveBeenCalledWith(
      'process',
      {
        exportId: 'exp-1',
        clinicId,
        userId: 'director-1',
      },
      expect.objectContaining({ jobId: 'exp-1' }),
    );
  });

  it('retries a failed export under a job id the queue has not already used', async () => {
    const failed = makeExportRecord({
      status: 'FAILED' as ResearchExportStatus,
      failureReason: 'GitHub sync failed',
      startedAt: new Date('2026-03-21T12:10:00.000Z'),
    });
    const retried = makeExportRecord({
      status: 'APPROVED' as ResearchExportStatus,
      failureReason: null,
      startedAt: null,
    });

    repo.findById.mockResolvedValue(failed);
    repo.update.mockResolvedValue(retried);
    exportQueue.add.mockResolvedValue(undefined);

    const result = await service.retryExport('exp-1', userId, {
      clinicId,
      actorUserId: userId,
      requestId: 'req-3',
    });

    expect(result.status).toBe('APPROVED');
    expect(exportQueue.add).toHaveBeenCalledWith(
      'process',
      {
        exportId: 'exp-1',
        clinicId,
        userId,
      },
      expect.objectContaining({ jobId: expect.stringMatching(/^exp-1-retry-\d+$/) }),
    );
    // BullMQ keeps the first run's job under 'exp-1' and silently ignores an add that reuses it,
    // which is how Retry once queued nothing at all.
    expect(exportQueue.add.mock.calls[0][2].jobId).not.toBe('exp-1');
  });

  it('marks a queued export completed after transform and sync succeed', async () => {
    const approved = makeExportRecord({
      status: 'APPROVED' as ResearchExportStatus,
      approvedByUserId: 'director-1',
      approvedBy: { id: 'director-1', displayName: 'Director' },
    });
    const processing = makeExportRecord({
      status: 'PROCESSING' as ResearchExportStatus,
      approvedByUserId: 'director-1',
      approvedBy: { id: 'director-1', displayName: 'Director' },
      startedAt: new Date('2026-03-21T12:15:00.000Z'),
    });
    const completed = makeExportRecord({
      status: 'COMPLETED' as ResearchExportStatus,
      approvedByUserId: 'director-1',
      approvedBy: { id: 'director-1', displayName: 'Director' },
      startedAt: new Date('2026-03-21T12:15:00.000Z'),
      completedAt: new Date('2026-03-21T12:16:00.000Z'),
      filePath: '/tmp/research-export-exp-1.zip',
      fileFormat: 'zip',
      recordCount: 42,
      rowCountsJson: JSON.stringify({ research_measurements: 12 }),
      artifactSha256: 'artifact-sha',
      artifactSizeBytes: 4096,
      repoProvider: 'GITHUB',
      repoPath: 'clinics/abc/exports/snapshot',
      repoCommitSha: 'commit-sha',
      repoCommitUrl: 'https://github.com/example/research/commit/commit-sha',
      syncedAt: new Date('2026-03-21T12:16:00.000Z'),
    });

    repo.findById.mockResolvedValueOnce(approved);
    repo.transition.mockResolvedValueOnce(processing).mockResolvedValueOnce(completed);
    repo.update.mockResolvedValueOnce({ ...processing, repoPath: 'clinics/abc/exports/snapshot' });
    transformService.generatePack.mockResolvedValue({
      manifest: {
        exportId: 'exp-1',
        clinicKey: 'clinic-key',
        datasetVersion: 1,
        policyVersion: 'research-export-v1',
        fromDate: '2026-03-01',
        toDate: '2026-03-21',
        generatedAt: '2026-03-21T12:15:30.000Z',
        timestampRoundingMinutes: 15,
        rowCounts: { research_measurements: 12 },
        files: [],
      },
      repoFiles: [],
      artifactPath: '/tmp/research-export-exp-1.zip',
      artifactSha256: 'artifact-sha',
      artifactSizeBytes: 4096,
      recordCount: 42,
      rowCounts: { research_measurements: 12 },
    });
    repoSyncService.sync.mockResolvedValue({
      provider: 'GITHUB',
      repoPath: 'clinics/abc/exports/snapshot',
      commitSha: 'commit-sha',
      commitUrl: 'https://github.com/example/research/commit/commit-sha',
      syncedAt: new Date('2026-03-21T12:16:00.000Z'),
    });

    const result = await service.processQueuedExport('exp-1');

    expect(result?.status).toBe('COMPLETED');
    expect(transformService.generatePack).toHaveBeenCalledWith(
      clinicId,
      '2026-03-01',
      '2026-03-21',
      'exp-1',
      'research-export-v1',
    );
    expect(repoSyncService.sync).toHaveBeenCalled();
  });

  describe('a run that fails', () => {
    const approved = makeExportRecord({ status: 'APPROVED' as ResearchExportStatus });
    const processing = makeExportRecord({
      status: 'PROCESSING' as ResearchExportStatus,
      startedAt: new Date('2026-03-21T12:20:00.000Z'),
    });
    const failed = makeExportRecord({
      status: 'FAILED' as ResearchExportStatus,
      failureReason: 'RESEARCH_EXPORT_FAILED',
      startedAt: new Date('2026-03-21T12:20:00.000Z'),
    });

    beforeEach(() => {
      repo.findById.mockResolvedValueOnce(approved);
      repo.transition.mockResolvedValueOnce(processing).mockResolvedValueOnce(failed);
      transformService.generatePack.mockRejectedValue(
        new BadRequestException('missing RESEARCH_GITHUB_TOKEN'),
      );
    });

    it('records a failed export on its last attempt instead of throwing the record away', async () => {
      // A throw here rolled the job transaction back, so FAILED and its audit entry were never
      // committed and the export read APPROVED forever.
      const result = await service.processQueuedExport('exp-1', {
        attemptsMade: 2,
        maxAttempts: 3,
      });

      expect(result?.status).toBe('FAILED');
      expect(repo.transition).toHaveBeenLastCalledWith(
        'exp-1',
        'PROCESSING',
        expect.objectContaining({
          status: 'FAILED',
          failureReason: 'RESEARCH_EXPORT_FAILED',
        }),
      );
      expect(auditService.logWrite).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: 'RESEARCH_EXPORT.FAIL', entityId: 'exp-1' }),
      );
    });

    it('hands a failure with attempts left back to the queue without recording it', async () => {
      await expect(
        service.processQueuedExport('exp-1', { attemptsMade: 0, maxAttempts: 3 }),
      ).rejects.toThrow(BadRequestException);

      // Handed back for the retry: PROCESSING -> APPROVED, never FAILED.
      expect(repo.transition).toHaveBeenLastCalledWith('exp-1', 'PROCESSING', {
        status: 'APPROVED',
        repoPath: null,
      });
      expect(repo.transition).not.toHaveBeenCalledWith(
        'exp-1',
        expect.anything(),
        expect.objectContaining({ status: 'FAILED' }),
      );
      expect(auditService.logWrite).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RESEARCH_EXPORT.FAIL' }),
      );
    });
  });

  describe('a duplicate delivery', () => {
    it('stands down while another delivery of the same export is running', async () => {
      prisma.$queryRaw.mockResolvedValue([{ locked: false }]);

      await expect(service.processQueuedExport('exp-1')).resolves.toBeNull();

      expect(repo.findById).not.toHaveBeenCalled();
      expect(transformService.generatePack).not.toHaveBeenCalled();
      expect(repoSyncService.sync).not.toHaveBeenCalled();
    });

    it('claims the export before it reads it', async () => {
      repo.findById.mockResolvedValue(
        makeExportRecord({ status: 'COMPLETED' as ResearchExportStatus }),
      );

      await service.processQueuedExport('exp-1');

      const [sql, key] = prisma.$queryRaw.mock.calls[0] as [TemplateStringsArray, string];
      expect(sql.join('?')).toContain('pg_try_advisory_xact_lock');
      expect(key).toBe('research-export:exp-1');
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        repo.findById.mock.invocationCallOrder[0],
      );
    });

    it('does nothing for a delivery that arrives after the export completed', async () => {
      repo.findById.mockResolvedValue(
        makeExportRecord({ status: 'COMPLETED' as ResearchExportStatus }),
      );

      const result = await service.processQueuedExport('exp-1');

      expect(result?.status).toBe('COMPLETED');
      expect(repo.update).not.toHaveBeenCalled();
      expect(transformService.generatePack).not.toHaveBeenCalled();
      expect(repoSyncService.sync).not.toHaveBeenCalled();
    });
  });

  it('throws when a queued export cannot be found', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(service.processQueuedExport('missing')).rejects.toThrow(NotFoundException);
  });

  it('resolves legacy job tenant metadata from the export record', async () => {
    repo.findById.mockResolvedValue(
      makeExportRecord({
        approvedByUserId: 'director-1',
      }),
    );

    await expect(service.findExportJobTenant('exp-1')).resolves.toEqual({
      clinicId,
      userId: 'director-1',
    });

    repo.findById.mockResolvedValue(null);
    await expect(service.findExportJobTenant('missing')).resolves.toBeNull();
  });
});
