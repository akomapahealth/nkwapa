import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { ResearchExportRepository } from './research-export.repository';
import { ResearchExportService } from './research-export.service';
import { ResearchExportController } from './research-export.controller';
import { DeIdentificationService } from './de-identification.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [ResearchExportController],
  providers: [
    ResearchExportRepository,
    ResearchExportService,
    DeIdentificationService,
  ],
  exports: [ResearchExportService],
})
export class ResearchModule {}
