import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ResearchExportStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  RESEARCH_DATASET_VERSION,
  RESEARCH_EXPORT_QUEUE_NAME,
  RESEARCH_FILE_FORMAT,
  RESEARCH_POLICY_VERSION,
  type GeneratedResearchPack,
  type ResearchRepoSyncResult,
} from './research-policy';
import { ResearchExportRecord, ResearchExportRepository } from './research-export.repository';
import { RequestExportDto } from './dto/request-export.dto';
import { ResearchTransformService } from './research-transform.service';
import { ResearchRepoSyncService } from './research-repo-sync.service';
import { redactLogValue } from '../common/redaction';
import { SINGLE_FINAL_ATTEMPT, hasAttemptsLeft, type JobAttempt } from '../common/job-attempt';
import { tryLockForTransaction } from '../prisma/transaction-lock';
import type { JobStep } from '../prisma/job-tenant-context.runner';

export interface ExportAuditContext {
  clinicId: string;
  actorUserId: string;
  requestId?: string;
}

export interface ResearchExportView {
  id: string;
  clinicId: string;
  status: ResearchExportStatus;
  fromDate: string;
  toDate: string;
  datasetVersion: number;
  policyVersionSnapshot: string;
  rejectionReason: string | null;
  failureReason: string | null;
  filePath: string | null;
  fileFormat: string | null;
  recordCount: number | null;
  rowCounts: Record<string, number>;
  artifactSha256: string | null;
  artifactSizeBytes: number | null;
  repoProvider: string | null;
  repoPath: string | null;
  repoCommitSha: string | null;
  repoCommitUrl: string | null;
  requestedAt: string;
  startedAt: string | null;
  approvedAt: string | null;
  syncedAt: string | null;
  completedAt: string | null;
  requestedBy?: { id: string; displayName: string };
  approvedBy?: { id: string; displayName: string } | null;
}

const RESEARCH_EXPORT_FAILED = 'RESEARCH_EXPORT_FAILED';
/** A run that stopped before it pushed anything: safe for an operator to retry. */
export const RESEARCH_EXPORT_INTERRUPTED = 'RESEARCH_EXPORT_INTERRUPTED';
/**
 * Pack generation reads a clinic's whole date range, and a big clinic can take longer than the
 * default five seconds. It is reads only, so a longer transaction holds nothing that matters, and
 * a timeout costs a retry, never a duplicate push.
 */
const RESEARCH_PACK_TRANSACTION_TIMEOUT_MS = 120_000;
/** Generation plus a push of up to 250 MB is minutes; an hour is never a live run. */
export const RESEARCH_EXPORT_STALE_AFTER_MS = 60 * 60 * 1000;
const RESEARCH_RECONCILE_BATCH = 50;

@Injectable()
export class ResearchExportService {
  private readonly logger = new Logger(ResearchExportService.name);

  constructor(
    private readonly repo: ResearchExportRepository,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly transformService: ResearchTransformService,
    private readonly repoSyncService: ResearchRepoSyncService,
    @InjectQueue(RESEARCH_EXPORT_QUEUE_NAME)
    private readonly exportQueue: Queue,
  ) {}

  async requestExport(
    clinicId: string,
    userId: string,
    dto: RequestExportDto,
    auditCtx?: ExportAuditContext,
  ): Promise<ResearchExportView> {
    const settings = await this.prisma.clinicResearchSettings.findUnique({
      where: { clinicId },
    });

    if (!settings?.researchEnabled) {
      throw new BadRequestException('Research is not enabled for this clinic');
    }

    const autoApprove = !settings.requiresDirectorApprovalEachExport;

    this.assertDateRange(dto.fromDate, dto.toDate);

    const approvedAt = autoApprove ? new Date() : undefined;
    const exportRecord = await this.repo.create({
      clinic: { connect: { id: clinicId } },
      requestedBy: { connect: { id: userId } },
      fromDate: dto.fromDate,
      toDate: dto.toDate,
      status: autoApprove ? 'APPROVED' : 'PENDING_APPROVAL',
      datasetVersion: RESEARCH_DATASET_VERSION,
      policyVersionSnapshot: RESEARCH_POLICY_VERSION,
      fileFormat: RESEARCH_FILE_FORMAT,
      approvedAt,
      approvedBy: autoApprove ? { connect: { id: userId } } : undefined,
    });

    if (auditCtx) {
      await this.auditService.logWrite({
        clinicId: auditCtx.clinicId,
        actorUserId: auditCtx.actorUserId,
        action: 'RESEARCH_EXPORT.REQUEST',
        entityType: 'ResearchExport',
        entityId: exportRecord.id,
        afterJson: JSON.stringify(exportRecord),
        requestId: auditCtx.requestId,
      });
    }

    if (autoApprove) {
      await this.auditApprove(exportRecord, userId, auditCtx);
      await this.queueExport(exportRecord, userId, auditCtx);
    }

    return this.toExportView(exportRecord);
  }

  async findById(id: string): Promise<ResearchExportView | null> {
    const record = await this.repo.findById(id);
    return record ? this.toExportView(record) : null;
  }

  async findRecordById(id: string): Promise<ResearchExportRecord | null> {
    return this.repo.findById(id);
  }

  async listByClinic(clinicId: string, cursor?: string, limit?: number) {
    const records = await this.repo.listByClinic(clinicId, cursor, limit);
    return {
      items: records.items.map((item) => this.toExportView(item)),
      nextCursor: records.nextCursor,
    };
  }

  async approveExport(
    exportId: string,
    approverUserId: string,
    auditCtx?: ExportAuditContext,
  ): Promise<ResearchExportView> {
    const existing = await this.repo.findById(exportId);
    if (!existing) throw new NotFoundException('Export not found');
    if (existing.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(`Cannot approve: export status is ${existing.status}`);
    }

    const updated = await this.repo.update(exportId, {
      status: 'APPROVED',
      approvedBy: { connect: { id: approverUserId } },
      approvedAt: new Date(),
      failureReason: null,
      rejectionReason: null,
    });

    await this.auditApprove(updated, approverUserId, auditCtx, existing);
    await this.queueExport(updated, approverUserId, auditCtx);

    return this.toExportView(updated);
  }

  async rejectExport(
    exportId: string,
    _approverUserId: string,
    reason: string,
    auditCtx?: ExportAuditContext,
  ): Promise<ResearchExportView> {
    const existing = await this.repo.findById(exportId);
    if (!existing) throw new NotFoundException('Export not found');
    if (existing.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(`Cannot reject: export status is ${existing.status}`);
    }

    const updated = await this.repo.update(exportId, {
      status: 'REJECTED',
      rejectionReason: reason.trim(),
      failureReason: null,
    });

    if (auditCtx) {
      await this.auditService.logWrite({
        clinicId: auditCtx.clinicId,
        actorUserId: auditCtx.actorUserId,
        action: 'RESEARCH_EXPORT.REJECT',
        entityType: 'ResearchExport',
        entityId: exportId,
        beforeJson: JSON.stringify(existing),
        afterJson: JSON.stringify(updated),
        requestId: auditCtx.requestId,
      });
    }

    return this.toExportView(updated);
  }

  async retryExport(
    exportId: string,
    userId: string,
    auditCtx?: ExportAuditContext,
  ): Promise<ResearchExportView> {
    const existing = await this.repo.findById(exportId);
    if (!existing) throw new NotFoundException('Export not found');
    if (existing.status !== 'FAILED') {
      throw new BadRequestException(`Cannot retry: export status is ${existing.status}`);
    }

    const updated = await this.repo.update(exportId, {
      status: 'APPROVED',
      failureReason: null,
      startedAt: null,
      completedAt: null,
      syncedAt: null,
      repoProvider: null,
      repoPath: null,
      repoCommitSha: null,
      repoCommitUrl: null,
    });

    if (auditCtx) {
      await this.auditService.logWrite({
        clinicId: auditCtx.clinicId,
        actorUserId: auditCtx.actorUserId,
        action: 'RESEARCH_EXPORT.RETRY',
        entityType: 'ResearchExport',
        entityId: exportId,
        beforeJson: JSON.stringify(existing),
        afterJson: JSON.stringify(updated),
        requestId: auditCtx.requestId,
      });
    }

    // A fresh job id, because BullMQ keeps a finished job under its id and silently ignores an
    // add that reuses it. Retry used to re-add under the export's own id, so the row went back to
    // APPROVED while nothing was queued to run it.
    await this.queueExport(updated, userId, auditCtx, `${exportId}-retry-${Date.now()}`);
    return this.toExportView(updated);
  }

  /**
   * Build an approved export's pack and push it to the research repository (#164).
   *
   * Short steps, never one transaction around the push:
   *
   * 1. **Claim**: APPROVED -> PROCESSING, committed. A duplicate delivery, or a retry while this
   *    run is in flight, finds PROCESSING and stands down.
   * 2. **Generate** the pack in a read step of its own, which may take longer than a write
   *    should, because reading twice is harmless.
   * 3. **Plan**: record the pack and the repository path it will be pushed to.
   * 4. **Push** to GitHub, with no transaction open.
   * 5. **Record** COMPLETED.
   *
   * If the push, or recording it, fails, the planned path is what settles it: a commit touching it
   * means the push landed, and the export completes without pushing again. If GitHub cannot be
   * asked, the export stays PROCESSING and `reconcileStaleExports` asks later.
   *
   * @param attempt Where this run sits in the job's retry budget. A failure that certainly pushed
   * nothing, with attempts left, hands the export back (PROCESSING -> APPROVED) and throws for the
   * queue's retry. Only the last attempt records FAILED.
   * @param step Runs one transaction under the job's tenant context. The processor always passes
   * one; the default is for callers already inside a context, such as tests.
   */
  async processQueuedExport(
    exportId: string,
    attempt: JobAttempt = SINGLE_FINAL_ATTEMPT,
    step: JobStep = (callback) => callback(this.prisma),
  ): Promise<ResearchExportView | null> {
    const claim = await step(() => this.claimExport(exportId));
    if (!claim) return null;
    if ('done' in claim) return claim.done;
    const { processing, actorUserId } = claim;

    let generatedPack: GeneratedResearchPack | null = null;
    let planned: ResearchExportRecord = processing;
    try {
      generatedPack = await step(
        () =>
          this.transformService.generatePack(
            processing.clinicId,
            processing.fromDate,
            processing.toDate,
            exportId,
            processing.policyVersionSnapshot,
          ),
        { timeout: RESEARCH_PACK_TRANSACTION_TIMEOUT_MS },
      );
      const pack = generatedPack;
      const repoPath = this.repoSyncService.plannedRepoPath(processing, pack);
      planned = await step(() =>
        this.repo.update(exportId, {
          ...this.packFields(pack),
          repoPath,
        }),
      );
    } catch (error) {
      // Nothing has been pushed yet, so this is an ordinary failure.
      return this.failOrRetry(step, processing, actorUserId, attempt, error);
    }

    const pack = generatedPack;
    const repoPath = planned.repoPath as string;
    let synced: ResearchRepoSyncResult;
    try {
      synced = await this.repoSyncService.sync(processing, pack);
    } catch (error) {
      const landed = await this.checkPush(exportId, repoPath);
      if (landed === 'UNKNOWN') return null;
      if (!landed) return this.failOrRetry(step, planned, actorUserId, attempt, error);
      synced = landed;
    }

    try {
      const completed = await step(() => this.completeExport(planned, synced, actorUserId));
      return completed ? this.toExportView(completed) : null;
    } catch (error) {
      // GitHub has the commit. Throwing hands the job back to the queue, whose retry finds
      // PROCESSING and stands down; the sweep then finds the commit and completes the export.
      this.logger.error(
        JSON.stringify({
          message: 'Research export pushed but COMPLETED could not be recorded',
          exportId,
          clinicId: processing.clinicId,
          repoPath,
          commitSha: synced.commitSha,
          error: redactLogValue(error),
        }),
      );
      throw error;
    }
  }

  /**
   * Settle exports a worker claimed and never finished (#164).
   *
   * An export still PROCESSING well after it started belongs to a worker that died, or that lost
   * track of its push. One with no planned path never pushed, and fails. One with a path is
   * settled by asking GitHub: a commit there completes it, none fails it. Nothing is pushed from
   * here, and an export GitHub cannot be asked about is left for the next sweep.
   */
  async reconcileStaleExports(
    systemStep: JobStep,
    clinicStep: (clinicId: string) => JobStep,
    now: Date = new Date(),
  ): Promise<{ completed: number; failed: number }> {
    const stale = await systemStep(() =>
      this.repo.findStaleProcessing(
        new Date(now.getTime() - RESEARCH_EXPORT_STALE_AFTER_MS),
        RESEARCH_RECONCILE_BATCH,
      ),
    );
    const outcome = { completed: 0, failed: 0 };
    for (const row of stale) {
      const landed = row.repoPath ? await this.checkPush(row.id, row.repoPath) : null;
      if (landed === 'UNKNOWN') continue;
      const step = clinicStep(row.clinicId);
      const settled = await step(async () => {
        const current = await this.repo.findById(row.id);
        if (!current || current.status !== 'PROCESSING') return null;
        const actorUserId =
          current.approvedBy?.id ?? current.requestedBy?.id ?? current.requestedByUserId;
        if (landed) {
          return this.completeExport(current, landed, actorUserId, 'RESEARCH_EXPORT.RECONCILE');
        }
        return this.recordFailure(current, actorUserId, RESEARCH_EXPORT_INTERRUPTED);
      });
      if (!settled) continue;
      if (landed) outcome.completed += 1;
      else outcome.failed += 1;
    }
    return outcome;
  }

  /** Step 1: take an approved export for this worker, or say why not. */
  private async claimExport(
    exportId: string,
  ): Promise<
    { done: ResearchExportView } | { processing: ResearchExportRecord; actorUserId: string } | null
  > {
    // Stands down cheaply when another delivery is deciding the same export. The conditional
    // transition below is what makes the claim exclusive.
    if (!(await tryLockForTransaction(this.prisma, `research-export:${exportId}`))) {
      return null;
    }

    const existing = await this.repo.findById(exportId);
    if (!existing) {
      throw new NotFoundException('Export not found');
    }
    if (existing.status === 'COMPLETED') {
      return { done: this.toExportView(existing) };
    }
    if (existing.status === 'PROCESSING') {
      // In flight elsewhere, or waiting for the sweep to settle a lost push. Never restart it.
      return null;
    }
    if (existing.status !== 'APPROVED') {
      throw new BadRequestException(`Cannot process export with status ${existing.status}`);
    }

    const actorUserId =
      existing.approvedBy?.id ?? existing.requestedBy?.id ?? existing.requestedByUserId;
    const processing = await this.repo.transition(exportId, 'APPROVED', {
      status: 'PROCESSING',
      startedAt: new Date(),
      failureReason: null,
      rejectionReason: null,
    });
    if (!processing) return null;

    await this.auditService.logWrite({
      clinicId: processing.clinicId,
      actorUserId,
      action: 'RESEARCH_EXPORT.START',
      entityType: 'ResearchExport',
      entityId: exportId,
      beforeJson: JSON.stringify(existing),
      afterJson: JSON.stringify(processing),
      requestId: exportId,
    });
    return { processing, actorUserId };
  }

  /**
   * Whether the push for this planned path reached GitHub: its commit, null for "certainly not",
   * or UNKNOWN when GitHub could not be asked.
   */
  private async checkPush(
    exportId: string,
    repoPath: string,
  ): Promise<ResearchRepoSyncResult | null | 'UNKNOWN'> {
    try {
      return await this.repoSyncService.findPushedCommit(repoPath);
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          message: 'Research export push outcome unknown; left for reconciliation',
          exportId,
          repoPath,
          error: redactLogValue(error),
        }),
      );
      return 'UNKNOWN';
    }
  }

  /** Step 5, and the sweep's success path: PROCESSING -> COMPLETED with the commit. */
  private async completeExport(
    processing: ResearchExportRecord,
    synced: ResearchRepoSyncResult,
    actorUserId: string,
    action: 'RESEARCH_EXPORT.COMPLETE' | 'RESEARCH_EXPORT.RECONCILE' = 'RESEARCH_EXPORT.COMPLETE',
  ): Promise<ResearchExportRecord | null> {
    const completed = await this.repo.transition(processing.id, 'PROCESSING', {
      status: 'COMPLETED',
      completedAt: new Date(),
      repoProvider: synced.provider,
      repoPath: synced.repoPath,
      repoCommitSha: synced.commitSha,
      repoCommitUrl: synced.commitUrl,
      syncedAt: synced.syncedAt,
    });
    if (!completed) return null;
    await this.auditService.logWrite({
      clinicId: completed.clinicId,
      actorUserId,
      action,
      entityType: 'ResearchExport',
      entityId: completed.id,
      beforeJson: JSON.stringify(processing),
      afterJson: JSON.stringify(completed),
      requestId: completed.id,
    });
    return completed;
  }

  /**
   * A failure that certainly pushed nothing. With attempts left, hand the export back to the
   * queue; on the last attempt, record FAILED and return it rather than throwing, so the operator
   * sees it and can retry.
   */
  private async failOrRetry(
    step: JobStep,
    processing: ResearchExportRecord,
    actorUserId: string,
    attempt: JobAttempt,
    error: unknown,
  ): Promise<ResearchExportView | null> {
    const willRetry = hasAttemptsLeft(attempt);
    this.logger.warn(
      JSON.stringify({
        message: willRetry
          ? 'Research export processing failed and will be retried'
          : 'Research export processing failed',
        exportId: processing.id,
        clinicId: processing.clinicId,
        attemptsMade: attempt.attemptsMade,
        error: redactLogValue(error),
      }),
    );
    if (willRetry) {
      await step(() =>
        this.repo.transition(processing.id, 'PROCESSING', { status: 'APPROVED', repoPath: null }),
      );
      throw error;
    }
    const failed = await step(() =>
      this.recordFailure(processing, actorUserId, RESEARCH_EXPORT_FAILED),
    );
    return failed ? this.toExportView(failed) : null;
  }

  private async recordFailure(
    processing: ResearchExportRecord,
    actorUserId: string,
    failureReason: string,
  ): Promise<ResearchExportRecord | null> {
    const failed = await this.repo.transition(processing.id, 'PROCESSING', {
      status: 'FAILED',
      failureReason,
      // A path nothing was pushed to would send a reader looking for a commit that is not there.
      repoProvider: null,
      repoPath: null,
      repoCommitSha: null,
      repoCommitUrl: null,
      syncedAt: null,
      completedAt: null,
    });
    if (!failed) return null;
    await this.auditService.logWrite({
      clinicId: failed.clinicId,
      actorUserId,
      action: 'RESEARCH_EXPORT.FAIL',
      entityType: 'ResearchExport',
      entityId: failed.id,
      beforeJson: JSON.stringify(processing),
      afterJson: JSON.stringify(failed),
      requestId: failed.id,
    });
    return failed;
  }

  private packFields(pack: GeneratedResearchPack) {
    return {
      filePath: pack.artifactPath,
      fileFormat: RESEARCH_FILE_FORMAT,
      recordCount: pack.recordCount,
      rowCountsJson: JSON.stringify(pack.rowCounts),
      artifactSha256: pack.artifactSha256,
      artifactSizeBytes: pack.artifactSizeBytes,
    };
  }

  async findExportJobTenant(
    exportId: string,
  ): Promise<{ clinicId: string; userId: string | null } | null> {
    const exportRecord = await this.repo.findById(exportId);
    if (!exportRecord) {
      return null;
    }
    return {
      clinicId: exportRecord.clinicId,
      userId: exportRecord.approvedByUserId ?? exportRecord.requestedByUserId,
    };
  }

  async recordDownload(exportId: string, auditCtx?: ExportAuditContext) {
    if (!auditCtx) {
      return;
    }
    await this.auditService.logWrite({
      clinicId: auditCtx.clinicId,
      actorUserId: auditCtx.actorUserId,
      action: 'RESEARCH_EXPORT.DOWNLOAD',
      entityType: 'ResearchExport',
      entityId: exportId,
      requestId: auditCtx.requestId,
    });
  }

  private async queueExport(
    exportRecord: ResearchExportRecord,
    actorUserId: string,
    auditCtx?: ExportAuditContext,
    jobId: string = exportRecord.id,
  ) {
    try {
      await this.exportQueue.add(
        'process',
        {
          exportId: exportRecord.id,
          clinicId: exportRecord.clinicId,
          userId: actorUserId,
        },
        {
          jobId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 60_000 },
          removeOnComplete: 50,
          removeOnFail: 100,
        },
      );
    } catch (error) {
      const failureReason = 'RESEARCH_EXPORT_QUEUE_FAILED';
      this.logger.warn(
        JSON.stringify({
          message: 'Research export queueing failed',
          exportId: exportRecord.id,
          clinicId: exportRecord.clinicId,
          error: redactLogValue(error),
        }),
      );
      const failed = await this.repo.update(exportRecord.id, {
        status: 'FAILED',
        failureReason,
      });
      await this.auditService.logWrite({
        clinicId: exportRecord.clinicId,
        actorUserId,
        action: 'RESEARCH_EXPORT.FAIL',
        entityType: 'ResearchExport',
        entityId: exportRecord.id,
        beforeJson: JSON.stringify(exportRecord),
        afterJson: JSON.stringify(failed),
        requestId: auditCtx?.requestId,
      });
      throw new BadRequestException(failureReason);
    }
  }

  private async auditApprove(
    updated: ResearchExportRecord,
    actorUserId: string,
    auditCtx?: ExportAuditContext,
    before?: ResearchExportRecord,
  ) {
    if (!auditCtx) {
      return;
    }

    await this.auditService.logWrite({
      clinicId: auditCtx.clinicId,
      actorUserId,
      action: 'RESEARCH_EXPORT.APPROVE',
      entityType: 'ResearchExport',
      entityId: updated.id,
      beforeJson: before ? JSON.stringify(before) : undefined,
      afterJson: JSON.stringify(updated),
      requestId: auditCtx.requestId,
    });
  }

  private toExportView(record: ResearchExportRecord): ResearchExportView {
    return {
      id: record.id,
      clinicId: record.clinicId,
      status: record.status,
      fromDate: record.fromDate,
      toDate: record.toDate,
      datasetVersion: record.datasetVersion,
      policyVersionSnapshot: record.policyVersionSnapshot,
      rejectionReason: record.rejectionReason ?? null,
      failureReason: record.failureReason ?? null,
      filePath: record.filePath ?? null,
      fileFormat: record.fileFormat ?? null,
      recordCount: record.recordCount ?? null,
      rowCounts: this.parseRowCounts(record.rowCountsJson),
      artifactSha256: record.artifactSha256 ?? null,
      artifactSizeBytes: record.artifactSizeBytes ?? null,
      repoProvider: record.repoProvider ?? null,
      repoPath: record.repoPath ?? null,
      repoCommitSha: record.repoCommitSha ?? null,
      repoCommitUrl: record.repoCommitUrl ?? null,
      requestedAt: record.requestedAt.toISOString(),
      startedAt: record.startedAt?.toISOString() ?? null,
      approvedAt: record.approvedAt?.toISOString() ?? null,
      syncedAt: record.syncedAt?.toISOString() ?? null,
      completedAt: record.completedAt?.toISOString() ?? null,
      requestedBy: record.requestedBy,
      approvedBy: record.approvedBy,
    };
  }

  private parseRowCounts(rowCountsJson: string | null): Record<string, number> {
    if (!rowCountsJson) {
      return {};
    }

    try {
      const parsed = JSON.parse(rowCountsJson) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [key, Number(value) || 0]),
      );
    } catch {
      return {};
    }
  }

  private assertDateRange(fromDate: string, toDate: string) {
    const from = new Date(`${fromDate}T00:00:00.000Z`);
    const to = new Date(`${toDate}T00:00:00.000Z`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('fromDate and toDate must be valid dates');
    }
    if (to < from) {
      throw new BadRequestException('toDate must be on or after fromDate');
    }
  }
}
