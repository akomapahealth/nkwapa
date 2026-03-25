import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { ResearchExportStatus } from "@prisma/client";
import { ResearchExportService } from "./research-export.service";
import type { ResearchExportRecord } from "./research-export.repository";

function makeExportRecord(
  overrides: Partial<ResearchExportRecord> = {}
): ResearchExportRecord {
  return {
    id: "exp-1",
    clinicId: "clinic-1",
    requestedByUserId: "user-1",
    approvedByUserId: null,
    fromDate: "2026-03-01",
    toDate: "2026-03-21",
    status: "PENDING_APPROVAL" as ResearchExportStatus,
    datasetVersion: 1,
    policyVersionSnapshot: "research-export-v1",
    rejectionReason: null,
    failureReason: null,
    filePath: null,
    fileFormat: "zip",
    recordCount: null,
    rowCountsJson: null,
    artifactSha256: null,
    artifactSizeBytes: null,
    repoProvider: null,
    repoPath: null,
    repoCommitSha: null,
    repoCommitUrl: null,
    syncedAt: null,
    requestedAt: new Date("2026-03-21T12:00:00.000Z"),
    startedAt: null,
    approvedAt: null,
    completedAt: null,
    requestedBy: { id: "user-1", displayName: "Requester" },
    approvedBy: null,
    ...overrides,
  };
}

describe("ResearchExportService", () => {
  const clinicId = "clinic-1";
  const userId = "user-1";

  let repo: {
    create: jest.Mock;
    findById: jest.Mock;
    update: jest.Mock;
    listByClinic: jest.Mock;
  };
  let prisma: {
    clinicResearchSettings: { findUnique: jest.Mock };
  };
  let auditService: { logWrite: jest.Mock };
  let transformService: { generatePack: jest.Mock };
  let repoSyncService: { sync: jest.Mock };
  let exportQueue: { add: jest.Mock };
  let service: ResearchExportService;

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      listByClinic: jest.fn(),
    };
    prisma = {
      clinicResearchSettings: { findUnique: jest.fn() },
    };
    auditService = { logWrite: jest.fn() };
    transformService = { generatePack: jest.fn() };
    repoSyncService = { sync: jest.fn() };
    exportQueue = { add: jest.fn() };

    service = new ResearchExportService(
      repo as never,
      prisma as never,
      auditService as never,
      transformService as never,
      repoSyncService as never,
      exportQueue as never
    );
  });

  it("queues an auto-approved export request when director approval is disabled", async () => {
    prisma.clinicResearchSettings.findUnique.mockResolvedValue({
      clinicId,
      researchEnabled: true,
      requiresDirectorApprovalEachExport: false,
    });
    repo.create.mockResolvedValue(
      makeExportRecord({
        status: "APPROVED" as ResearchExportStatus,
        approvedByUserId: userId,
        approvedAt: new Date("2026-03-21T12:01:00.000Z"),
        approvedBy: { id: userId, displayName: "Requester" },
      })
    );
    exportQueue.add.mockResolvedValue(undefined);

    const result = await service.requestExport(
      clinicId,
      userId,
      { fromDate: "2026-03-01", toDate: "2026-03-21" },
      { clinicId, actorUserId: userId, requestId: "req-1" }
    );

    expect(result.status).toBe("APPROVED");
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        fromDate: "2026-03-01",
        toDate: "2026-03-21",
        fileFormat: "zip",
      })
    );
    expect(exportQueue.add).toHaveBeenCalledWith(
      "process",
      { exportId: "exp-1" },
      expect.objectContaining({ jobId: "exp-1" })
    );
  });

  it("approves and queues a pending export", async () => {
    const pending = makeExportRecord();
    const approved = makeExportRecord({
      status: "APPROVED" as ResearchExportStatus,
      approvedByUserId: "director-1",
      approvedAt: new Date("2026-03-21T12:05:00.000Z"),
      approvedBy: { id: "director-1", displayName: "Director" },
    });

    repo.findById.mockResolvedValue(pending);
    repo.update.mockResolvedValue(approved);
    exportQueue.add.mockResolvedValue(undefined);

    const result = await service.approveExport("exp-1", "director-1", {
      clinicId,
      actorUserId: "director-1",
      requestId: "req-2",
    });

    expect(result.status).toBe("APPROVED");
    expect(repo.update).toHaveBeenCalledWith(
      "exp-1",
      expect.objectContaining({
        status: "APPROVED",
      })
    );
    expect(exportQueue.add).toHaveBeenCalled();
  });

  it("retries a failed export by re-queueing it", async () => {
    const failed = makeExportRecord({
      status: "FAILED" as ResearchExportStatus,
      failureReason: "GitHub sync failed",
      startedAt: new Date("2026-03-21T12:10:00.000Z"),
    });
    const retried = makeExportRecord({
      status: "APPROVED" as ResearchExportStatus,
      failureReason: null,
      startedAt: null,
    });

    repo.findById.mockResolvedValue(failed);
    repo.update.mockResolvedValue(retried);
    exportQueue.add.mockResolvedValue(undefined);

    const result = await service.retryExport("exp-1", userId, {
      clinicId,
      actorUserId: userId,
      requestId: "req-3",
    });

    expect(result.status).toBe("APPROVED");
    expect(exportQueue.add).toHaveBeenCalled();
  });

  it("marks a queued export completed after transform and sync succeed", async () => {
    const approved = makeExportRecord({
      status: "APPROVED" as ResearchExportStatus,
      approvedByUserId: "director-1",
      approvedBy: { id: "director-1", displayName: "Director" },
    });
    const processing = makeExportRecord({
      status: "PROCESSING" as ResearchExportStatus,
      approvedByUserId: "director-1",
      approvedBy: { id: "director-1", displayName: "Director" },
      startedAt: new Date("2026-03-21T12:15:00.000Z"),
    });
    const completed = makeExportRecord({
      status: "COMPLETED" as ResearchExportStatus,
      approvedByUserId: "director-1",
      approvedBy: { id: "director-1", displayName: "Director" },
      startedAt: new Date("2026-03-21T12:15:00.000Z"),
      completedAt: new Date("2026-03-21T12:16:00.000Z"),
      filePath: "/tmp/research-export-exp-1.zip",
      fileFormat: "zip",
      recordCount: 42,
      rowCountsJson: JSON.stringify({ research_measurements: 12 }),
      artifactSha256: "artifact-sha",
      artifactSizeBytes: 4096,
      repoProvider: "GITHUB",
      repoPath: "clinics/abc/exports/snapshot",
      repoCommitSha: "commit-sha",
      repoCommitUrl: "https://github.com/example/research/commit/commit-sha",
      syncedAt: new Date("2026-03-21T12:16:00.000Z"),
    });

    repo.findById.mockResolvedValueOnce(approved);
    repo.update
      .mockResolvedValueOnce(processing)
      .mockResolvedValueOnce(completed);
    transformService.generatePack.mockResolvedValue({
      manifest: {
        exportId: "exp-1",
        clinicKey: "clinic-key",
        datasetVersion: 1,
        policyVersion: "research-export-v1",
        fromDate: "2026-03-01",
        toDate: "2026-03-21",
        generatedAt: "2026-03-21T12:15:30.000Z",
        timestampRoundingMinutes: 15,
        rowCounts: { research_measurements: 12 },
        files: [],
      },
      repoFiles: [],
      artifactPath: "/tmp/research-export-exp-1.zip",
      artifactSha256: "artifact-sha",
      artifactSizeBytes: 4096,
      recordCount: 42,
      rowCounts: { research_measurements: 12 },
    });
    repoSyncService.sync.mockResolvedValue({
      provider: "GITHUB",
      repoPath: "clinics/abc/exports/snapshot",
      commitSha: "commit-sha",
      commitUrl: "https://github.com/example/research/commit/commit-sha",
      syncedAt: new Date("2026-03-21T12:16:00.000Z"),
    });

    const result = await service.processQueuedExport("exp-1");

    expect(result.status).toBe("COMPLETED");
    expect(transformService.generatePack).toHaveBeenCalledWith(
      clinicId,
      "2026-03-01",
      "2026-03-21",
      "exp-1",
      "research-export-v1"
    );
    expect(repoSyncService.sync).toHaveBeenCalled();
  });

  it("marks a queued export failed when transform or sync throws", async () => {
    const approved = makeExportRecord({
      status: "APPROVED" as ResearchExportStatus,
    });
    const processing = makeExportRecord({
      status: "PROCESSING" as ResearchExportStatus,
      startedAt: new Date("2026-03-21T12:20:00.000Z"),
    });
    const failed = makeExportRecord({
      status: "FAILED" as ResearchExportStatus,
      failureReason: "missing RESEARCH_GITHUB_TOKEN",
      startedAt: new Date("2026-03-21T12:20:00.000Z"),
    });

    repo.findById.mockResolvedValueOnce(approved);
    repo.update
      .mockResolvedValueOnce(processing)
      .mockResolvedValueOnce(failed);
    transformService.generatePack.mockRejectedValue(
      new BadRequestException("missing RESEARCH_GITHUB_TOKEN")
    );

    await expect(service.processQueuedExport("exp-1")).rejects.toThrow(
      BadRequestException
    );
    expect(repo.update).toHaveBeenLastCalledWith(
      "exp-1",
      expect.objectContaining({
        status: "FAILED",
        failureReason: expect.stringContaining("missing RESEARCH_GITHUB_TOKEN"),
      })
    );
  });

  it("throws when a queued export cannot be found", async () => {
    repo.findById.mockResolvedValue(null);

    await expect(service.processQueuedExport("missing")).rejects.toThrow(
      NotFoundException
    );
  });
});
