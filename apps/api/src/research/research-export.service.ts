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

    await this.queueExport(updated, userId, auditCtx);
    return this.toExportView(updated);
  }

  async processQueuedExport(exportId: string): Promise<ResearchExportView> {
    const existing = await this.repo.findById(exportId);
    if (!existing) {
      throw new NotFoundException('Export not found');
    }

    if (existing.status === 'COMPLETED') {
      return this.toExportView(existing);
    }

    if (existing.status !== 'APPROVED') {
      throw new BadRequestException(`Cannot process export with status ${existing.status}`);
    }

    const actorUserId =
      existing.approvedBy?.id ?? existing.requestedBy?.id ?? existing.requestedByUserId;
    const processing = await this.repo.update(exportId, {
      status: 'PROCESSING',
      startedAt: new Date(),
      failureReason: null,
      rejectionReason: null,
    });

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

    let generatedPack: GeneratedResearchPack | null = null;
    let synced: ResearchRepoSyncResult | null = null;

    try {
      generatedPack = await this.transformService.generatePack(
        processing.clinicId,
        processing.fromDate,
        processing.toDate,
        exportId,
        processing.policyVersionSnapshot,
      );
      synced = await this.repoSyncService.sync(processing, generatedPack);

      const completed = await this.repo.update(exportId, {
        status: 'COMPLETED',
        completedAt: new Date(),
        filePath: generatedPack.artifactPath,
        fileFormat: RESEARCH_FILE_FORMAT,
        recordCount: generatedPack.recordCount,
        rowCountsJson: JSON.stringify(generatedPack.rowCounts),
        artifactSha256: generatedPack.artifactSha256,
        artifactSizeBytes: generatedPack.artifactSizeBytes,
        repoProvider: synced.provider,
        repoPath: synced.repoPath,
        repoCommitSha: synced.commitSha,
        repoCommitUrl: synced.commitUrl,
        syncedAt: synced.syncedAt,
      });

      await this.auditService.logWrite({
        clinicId: completed.clinicId,
        actorUserId,
        action: 'RESEARCH_EXPORT.COMPLETE',
        entityType: 'ResearchExport',
        entityId: exportId,
        beforeJson: JSON.stringify(processing),
        afterJson: JSON.stringify(completed),
        requestId: exportId,
      });

      return this.toExportView(completed);
    } catch (error) {
      const failureReason = 'RESEARCH_EXPORT_FAILED';
      this.logger.warn(
        JSON.stringify({
          message: 'Research export processing failed',
          exportId,
          clinicId: processing.clinicId,
          error: redactLogValue(error),
        }),
      );
      const failed = await this.repo.update(exportId, {
        status: 'FAILED',
        failureReason,
        filePath: generatedPack?.artifactPath ?? processing.filePath,
        fileFormat: RESEARCH_FILE_FORMAT,
        recordCount: generatedPack?.recordCount ?? processing.recordCount,
        rowCountsJson: generatedPack
          ? JSON.stringify(generatedPack.rowCounts)
          : processing.rowCountsJson,
        artifactSha256: generatedPack?.artifactSha256 ?? processing.artifactSha256,
        artifactSizeBytes: generatedPack?.artifactSizeBytes ?? processing.artifactSizeBytes,
        repoProvider: synced?.provider ?? null,
        repoPath: synced?.repoPath ?? null,
        repoCommitSha: synced?.commitSha ?? null,
        repoCommitUrl: synced?.commitUrl ?? null,
        syncedAt: synced?.syncedAt ?? null,
        completedAt: null,
      });

      await this.auditService.logWrite({
        clinicId: failed.clinicId,
        actorUserId,
        action: 'RESEARCH_EXPORT.FAIL',
        entityType: 'ResearchExport',
        entityId: exportId,
        beforeJson: JSON.stringify(processing),
        afterJson: JSON.stringify(failed),
        requestId: exportId,
      });

      throw error;
    }
  }

  async findExportClinicId(exportId: string): Promise<string | null> {
    const exportRecord = await this.repo.findById(exportId);
    return exportRecord?.clinicId ?? null;
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
  ) {
    try {
      await this.exportQueue.add(
        'process',
        { exportId: exportRecord.id, clinicId: exportRecord.clinicId },
        {
          jobId: exportRecord.id,
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
