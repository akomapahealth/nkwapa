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
import { GithubResearchStorage } from './storage/github-research-storage';
import { LocalResearchStorage, R2ResearchStorage } from './storage/object-store-research-storage';
import { ResearchStorageRegistry } from './storage/research-storage.registry';
import { ResearchRunNotifier } from './research-run.notifier';
import { ReminderModule } from '../reminders/reminder.module';
import { ResearchExportProcessor } from './research-export.processor';
import { ResearchExportReconciliationSweep } from './research-export-reconciliation.sweep';
import { ResearchScheduleController } from './research-schedule.controller';
import { ResearchScheduleService } from './research-schedule.service';
import { ResearchScheduleDispatcher } from './research-schedule.dispatcher';
import { ResearchOverviewController } from './research-overview.controller';
import { ResearchOverviewService } from './research-overview.service';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    ReminderModule,
    BullModule.registerQueue({ name: RESEARCH_EXPORT_QUEUE_NAME }),
  ],
  controllers: [ResearchExportController, ResearchScheduleController, ResearchOverviewController],
  providers: [
    ResearchExportRepository,
    ResearchExportService,
    DeIdentificationService,
    ResearchTransformService,
    GithubResearchStorage,
    R2ResearchStorage,
    LocalResearchStorage,
    ResearchStorageRegistry,
    ResearchRunNotifier,
    ResearchExportProcessor,
    ResearchExportReconciliationSweep,
    ResearchScheduleService,
    ResearchScheduleDispatcher,
    ResearchOverviewService,
  ],
  exports: [ResearchExportService],
})
export class ResearchModule {}
