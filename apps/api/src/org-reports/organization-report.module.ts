import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrganizationReportController } from './organization-report.controller';
import { OrganizationReportService } from './organization-report.service';

@Module({
  imports: [PrismaModule],
  controllers: [OrganizationReportController],
  providers: [OrganizationReportService],
})
export class OrganizationReportModule {}
