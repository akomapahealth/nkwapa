import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { JobTenantContextRunner } from '../prisma/job-tenant-context.runner';
import {
  MAINTENANCE_QUEUE,
  MaintenanceScheduler,
  type MaintenanceSweep,
} from '../maintenance/maintenance-scheduler';

export const STAFF_FEEDBACK_RETENTION_JOB = 'purge-expired-staff-feedback';
export const STAFF_FEEDBACK_RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_STAFF_FEEDBACK_RETENTION_DAYS = 365;

/** Days of problem reports to keep. Bounded so a typo cannot keep rows forever or purge today's. */
export function staffFeedbackRetentionDays(): number {
  const parsed = Number(process.env.STAFF_FEEDBACK_RETENTION_DAYS);
  if (!Number.isInteger(parsed)) return DEFAULT_STAFF_FEEDBACK_RETENTION_DAYS;
  return Math.min(Math.max(parsed, 30), 730);
}

/**
 * Deletes problem reports older than the retention window, daily (#422). Their free text may hold
 * patient detail, so they are kept only as long as triage needs them.
 */
@Injectable()
export class StaffFeedbackRetentionSweep implements MaintenanceSweep, OnModuleInit {
  readonly jobName = STAFF_FEEDBACK_RETENTION_JOB;
  readonly everyMs = STAFF_FEEDBACK_RETENTION_INTERVAL_MS;
  private readonly logger = new Logger(StaffFeedbackRetentionSweep.name);

  constructor(
    private readonly scheduler: MaintenanceScheduler,
    private readonly tenantContext: JobTenantContextRunner,
  ) {}

  onModuleInit(): void {
    this.scheduler.register(this);
  }

  async run(): Promise<void> {
    const cutoff = new Date(Date.now() - staffFeedbackRetentionDays() * 24 * 60 * 60 * 1000);
    await this.tenantContext.runSystemJob(
      {
        queueName: MAINTENANCE_QUEUE,
        resourceId: STAFF_FEEDBACK_RETENTION_JOB,
        systemReason: 'Delete staff problem reports older than the retention window',
      },
      async (client) => {
        const { count } = await client.staffFeedback.deleteMany({
          where: { createdAt: { lt: cutoff } },
        });
        this.logger.log(
          JSON.stringify({ message: 'Staff feedback retention purge', deleted: count }),
        );
      },
    );
  }
}
