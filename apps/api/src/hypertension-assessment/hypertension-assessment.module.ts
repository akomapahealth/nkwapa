import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HypertensionAssessmentController } from './hypertension-assessment.controller';
import { HypertensionAssessmentService } from './hypertension-assessment.service';

@Module({
  imports: [AuthModule],
  controllers: [HypertensionAssessmentController],
  providers: [HypertensionAssessmentService],
  exports: [HypertensionAssessmentService],
})
export class HypertensionAssessmentModule {}
