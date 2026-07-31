import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { JobTenantContextRunner } from '../prisma/job-tenant-context.runner';
import { ResearchExportService } from './research-export.service';
import { RESEARCH_EXPORT_QUEUE_NAME } from './research-policy';

export type ResearchExportJobData = {
  exportId: string;
  clinicId?: string;
  userId?: string | null;
};

@Processor(RESEARCH_EXPORT_QUEUE_NAME)
export class ResearchExportProcessor extends WorkerHost {
  constructor(
    private readonly researchExportService: ResearchExportService,
    private readonly tenantContext: JobTenantContextRunner,
  ) {
    super();
  }

  async process(job: Job<ResearchExportJobData>): Promise<void> {
    const { exportId, clinicId, userId } = job.data;
    await this.tenantContext.runClinicJob(
      {
        queueName: RESEARCH_EXPORT_QUEUE_NAME,
        jobId: job.id,
        resourceId: exportId,
        tenant: clinicId ? { clinicId, userId: userId ?? null } : null,
        legacy: {
          systemReason: 'Resolve tenant for a legacy research export payload',
          resolveTenant: () => this.researchExportService.findExportJobTenant(exportId),
        },
        unresolvedTenant: 'fail',
      },
      () => this.researchExportService.processQueuedExport(exportId),
    );
  }
}
