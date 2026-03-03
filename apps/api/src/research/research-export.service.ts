import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ResearchExport } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ResearchExportRepository } from './research-export.repository';
import { DeIdentificationService } from './de-identification.service';

export interface ExportAuditContext {
  clinicId: string;
  actorUserId: string;
  requestId?: string;
}

@Injectable()
export class ResearchExportService {
  constructor(
    private readonly repo: ResearchExportRepository,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly deIdService: DeIdentificationService,
  ) {}

  async requestExport(
    clinicId: string,
    userId: string,
    fileFormat: 'csv' | 'json' = 'csv',
    auditCtx?: ExportAuditContext,
  ): Promise<ResearchExport> {
    const settings = await this.prisma.clinicResearchSettings.findUnique({
      where: { clinicId },
    });

    if (!settings?.researchEnabled) {
      throw new BadRequestException('Research is not enabled for this clinic');
    }

    const autoApprove = !settings.requiresDirectorApprovalEachExport;

    const exportRecord = await this.repo.create({
      clinic: { connect: { id: clinicId } },
      requestedBy: { connect: { id: userId } },
      status: autoApprove ? 'APPROVED' : 'PENDING',
      policyVersionSnapshot: 'v1',
      fileFormat,
      approvedAt: autoApprove ? new Date() : undefined,
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

    return exportRecord;
  }

  async findById(id: string): Promise<ResearchExport | null> {
    return this.repo.findById(id);
  }

  async listByClinic(clinicId: string, cursor?: string, limit?: number) {
    return this.repo.listByClinic(clinicId, cursor, limit);
  }

  async approveExport(
    exportId: string,
    approverUserId: string,
    auditCtx?: ExportAuditContext,
  ): Promise<ResearchExport> {
    const existing = await this.repo.findById(exportId);
    if (!existing) throw new NotFoundException('Export not found');
    if (existing.status !== 'PENDING') {
      throw new BadRequestException(`Cannot approve: export status is ${existing.status}`);
    }

    const updated = await this.repo.update(exportId, {
      status: 'APPROVED',
      approvedBy: { connect: { id: approverUserId } },
      approvedAt: new Date(),
    });

    if (auditCtx) {
      await this.auditService.logWrite({
        clinicId: auditCtx.clinicId,
        actorUserId: auditCtx.actorUserId,
        action: 'RESEARCH_EXPORT.APPROVE',
        entityType: 'ResearchExport',
        entityId: exportId,
        beforeJson: JSON.stringify(existing),
        afterJson: JSON.stringify(updated),
        requestId: auditCtx.requestId,
      });
    }

    return updated;
  }

  async rejectExport(
    exportId: string,
    approverUserId: string,
    reason: string,
    auditCtx?: ExportAuditContext,
  ): Promise<ResearchExport> {
    const existing = await this.repo.findById(exportId);
    if (!existing) throw new NotFoundException('Export not found');
    if (existing.status !== 'PENDING') {
      throw new BadRequestException(`Cannot reject: export status is ${existing.status}`);
    }

    const updated = await this.repo.update(exportId, {
      status: 'REJECTED',
      rejectionReason: reason,
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

    return updated;
  }

  async executeExport(
    exportId: string,
    userId: string,
    auditCtx?: ExportAuditContext,
  ): Promise<ResearchExport> {
    const existing = await this.repo.findById(exportId);
    if (!existing) throw new NotFoundException('Export not found');
    if (existing.status !== 'APPROVED') {
      throw new BadRequestException(`Cannot execute: export status is ${existing.status}`);
    }

    const format = (existing.fileFormat as 'csv' | 'json') || 'csv';
    const { filePath, recordCount } = await this.deIdService.generateDataset(
      existing.clinicId,
      exportId,
      format,
    );

    const updated = await this.repo.update(exportId, {
      status: 'COMPLETED',
      completedAt: new Date(),
      filePath,
      recordCount,
    });

    if (auditCtx) {
      await this.auditService.logWrite({
        clinicId: auditCtx.clinicId,
        actorUserId: auditCtx.actorUserId,
        action: 'RESEARCH_EXPORT.EXECUTE',
        entityType: 'ResearchExport',
        entityId: exportId,
        beforeJson: JSON.stringify(existing),
        afterJson: JSON.stringify(updated),
        requestId: auditCtx.requestId,
      });
    }

    return updated;
  }
}
