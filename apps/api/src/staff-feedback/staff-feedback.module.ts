import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StaffFeedbackController } from './staff-feedback.controller';
import { StaffFeedbackService } from './staff-feedback.service';
import { StaffFeedbackRetentionSweep } from './staff-feedback-retention.sweep';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [StaffFeedbackController],
  providers: [StaffFeedbackService, StaffFeedbackRetentionSweep],
  exports: [StaffFeedbackService],
})
export class StaffFeedbackModule {}
