import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FollowUpController } from './follow-up.controller';
import { FollowUpRiskSweep } from './follow-up-risk.sweep';
import { FollowUpRiskService } from './follow-up-risk.service';
import { FollowUpFlagService } from './follow-up-flags.service';

/** Global so every service that saves clinical data can queue a recompute without an import. */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [FollowUpController],
  providers: [FollowUpRiskService, FollowUpRiskSweep, FollowUpFlagService],
  exports: [FollowUpRiskService, FollowUpFlagService],
})
export class FollowUpModule {}
