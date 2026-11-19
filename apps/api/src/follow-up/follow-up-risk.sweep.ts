import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { MaintenanceScheduler, type MaintenanceSweep } from '../maintenance/maintenance-scheduler';
import { FollowUpRiskService } from './follow-up-risk.service';

export const FOLLOW_UP_RISK_SWEEP_JOB = 'recompute-follow-up-tiers';

/**
 * Nightly recompute of every patient's tier (#336). Saves keep tiers current; this catches what
 * time alone changes (a reading leaving its window, a birthday crossing a chart band) and any
 * recompute that failed after a save. Rows are only written when an answer changed.
 */
@Injectable()
export class FollowUpRiskSweep implements MaintenanceSweep, OnModuleInit {
  readonly jobName = FOLLOW_UP_RISK_SWEEP_JOB;
  readonly everyMs = 24 * 60 * 60 * 1000;
  private readonly logger = new Logger(FollowUpRiskSweep.name);

  constructor(
    private readonly scheduler: MaintenanceScheduler,
    private readonly risk: FollowUpRiskService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register(this);
  }

  async run(): Promise<void> {
    const counts = await this.risk.recomputeAll('SWEEP');
    this.logger.log(`Follow-up tier sweep: ${JSON.stringify(counts)}`);
  }
}
