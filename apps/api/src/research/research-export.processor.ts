import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { ResearchExportService } from "./research-export.service";
import { RESEARCH_EXPORT_QUEUE_NAME } from "./research-policy";

@Processor(RESEARCH_EXPORT_QUEUE_NAME)
export class ResearchExportProcessor extends WorkerHost {
  constructor(private readonly researchExportService: ResearchExportService) {
    super();
  }

  async process(job: Job<{ exportId: string }>): Promise<void> {
    await this.researchExportService.processQueuedExport(job.data.exportId);
  }
}
