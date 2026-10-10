import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MedicalHistoryModule } from '../medical-history/medical-history.module';
import { PatientChartController } from './patient-chart.controller';
import { PatientChartService } from './patient-chart.service';

@Module({
  imports: [AuthModule, MedicalHistoryModule],
  controllers: [PatientChartController],
  providers: [PatientChartService],
  exports: [PatientChartService],
})
export class PatientChartModule {}
