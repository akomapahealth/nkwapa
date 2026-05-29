import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ResearchExportService } from './research-export.service';
import { RESEARCH_EXPORT_QUEUE_NAME } from './research-policy';

@Processor(RESEARCH_EXPORT_QUEUE_NAME)
export class ResearchExportProcessor extends WorkerHost {
  constructor(
    private readonly researchExportService: ResearchExportService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<{ exportId: string; clinicId?: string }>): Promise<void> {
    const { exportId } = job.data;
    const clinicId =
      job.data.clinicId ??
      (await this.prisma.withSystemContext({ requestId: String(job.id ?? exportId) }, () =>
        this.researchExportService.findExportClinicId(exportId),
      ));

    if (!clinicId) {
      await this.prisma.withSystemContext({ requestId: String(job.id ?? exportId) }, () =>
        this.researchExportService.processQueuedExport(exportId),
      );
      return;
    }

    await this.prisma.withClinicContext(
      clinicId,
      { requestId: String(job.id ?? exportId), userId: null },
      () => this.researchExportService.processQueuedExport(exportId),
    );
  }
}
