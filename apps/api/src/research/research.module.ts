import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { ResearchExportRepository } from './research-export.repository';
import { ResearchExportService } from './research-export.service';
import { ResearchExportController } from './research-export.controller';
import { DeIdentificationService } from './de-identification.service';
import { RESEARCH_EXPORT_QUEUE_NAME } from './research-policy';
import { ResearchTransformService } from './research-transform.service';
import { ResearchRepoSyncService } from './research-repo-sync.service';
import { ResearchExportProcessor } from './research-export.processor';
import {
  RESEARCH_EXPORT_RECONCILIATION_QUEUE,
  ResearchExportReconciliationProcessor,
} from './research-export-reconciliation.processor';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    BullModule.registerQueue(
      { name: RESEARCH_EXPORT_QUEUE_NAME },
      { name: RESEARCH_EXPORT_RECONCILIATION_QUEUE },
    ),
  ],
  controllers: [ResearchExportController],
  providers: [
    ResearchExportRepository,
    ResearchExportService,
    DeIdentificationService,
    ResearchTransformService,
    ResearchRepoSyncService,
    ResearchExportProcessor,
    ResearchExportReconciliationProcessor,
  ],
  exports: [ResearchExportService],
})
export class ResearchModule {}
