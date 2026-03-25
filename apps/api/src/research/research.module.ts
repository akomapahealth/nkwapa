import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { PrismaModule } from "../prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { ResearchExportRepository } from "./research-export.repository";
import { ResearchExportService } from "./research-export.service";
import { ResearchExportController } from "./research-export.controller";
import { DeIdentificationService } from "./de-identification.service";
import { RESEARCH_EXPORT_QUEUE_NAME } from "./research-policy";
import { ResearchTransformService } from "./research-transform.service";
import { ResearchRepoSyncService } from "./research-repo-sync.service";
import { ResearchExportProcessor } from "./research-export.processor";

@Module({
  imports: [PrismaModule, AuditModule, BullModule.registerQueue({ name: RESEARCH_EXPORT_QUEUE_NAME })],
  controllers: [ResearchExportController],
  providers: [
    ResearchExportRepository,
    ResearchExportService,
    DeIdentificationService,
    ResearchTransformService,
    ResearchRepoSyncService,
    ResearchExportProcessor,
  ],
  exports: [ResearchExportService],
})
export class ResearchModule {}
