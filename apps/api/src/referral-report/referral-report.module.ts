import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MedicalHistoryModule } from '../medical-history/medical-history.module';
import { PatientChartModule } from '../patient-chart/patient-chart.module';
import { ReferralReportController } from './referral-report.controller';
import { ReferralReportService } from './referral-report.service';

@Module({
  imports: [AuthModule, PatientChartModule, MedicalHistoryModule],
  controllers: [ReferralReportController],
  providers: [ReferralReportService],
})
export class ReferralReportModule {}
