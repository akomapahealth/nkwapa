import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { jobAttempt } from '../common/job-attempt';
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
    // Steps, not one transaction: the GitHub push must happen with no transaction open (#164).
    await this.tenantContext.runClinicJobSteps(
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
      (step) => this.researchExportService.processQueuedExport(exportId, jobAttempt(job), step),
    );
  }
}
