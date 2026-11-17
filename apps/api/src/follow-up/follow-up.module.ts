import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FollowUpController } from './follow-up.controller';
import { FollowUpRiskSweep } from './follow-up-risk.sweep';
import { FollowUpRiskService } from './follow-up-risk.service';
import { FollowUpFlagService } from './follow-up-flags.service';
import { FollowUpContactController } from './follow-up-contact.controller';
import { FollowUpContactService } from './follow-up-contact.service';
import {
  FollowUpMetricsController,
  OrganizationFollowUpMetricsController,
} from './follow-up-metrics.controller';
import { FollowUpMetricsService } from './follow-up-metrics.service';

/** Global so every service that saves clinical data can queue a recompute without an import. */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [
    FollowUpController,
    FollowUpContactController,
    FollowUpMetricsController,
    OrganizationFollowUpMetricsController,
  ],
  providers: [
    FollowUpRiskService,
    FollowUpRiskSweep,
    FollowUpFlagService,
    FollowUpContactService,
    FollowUpMetricsService,
  ],
  exports: [FollowUpRiskService, FollowUpFlagService, FollowUpContactService],
})
export class FollowUpModule {}
