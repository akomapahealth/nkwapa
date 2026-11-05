import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { JobTenantContextRunner } from '../prisma/job-tenant-context.runner';
import {
  MAINTENANCE_QUEUE,
  MaintenanceScheduler,
  type MaintenanceSweep,
} from '../maintenance/maintenance-scheduler';

export const IDEMPOTENCY_RETENTION_JOB = 'purge-expired-idempotency-records';
export const IDEMPOTENCY_RETENTION_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Deletes idempotency records past their 24-hour life, hourly (#307).
 *
 * A stored response can hold clinical data, so it should not outlive its use. Housekeeping only:
 * an expired record is already ignored and replaced by the interceptor, so a missed purge costs a
 * larger table, never a wrong replay.
 */
@Injectable()
export class IdempotencyRetentionSweep implements MaintenanceSweep, OnModuleInit {
  readonly jobName = IDEMPOTENCY_RETENTION_JOB;
  readonly everyMs = IDEMPOTENCY_RETENTION_INTERVAL_MS;
  private readonly logger = new Logger(IdempotencyRetentionSweep.name);

  constructor(
    private readonly scheduler: MaintenanceScheduler,
    private readonly tenantContext: JobTenantContextRunner,
  ) {}

  onModuleInit(): void {
    this.scheduler.register(this);
  }

  async run(now = new Date()): Promise<void> {
    await this.tenantContext.runSystemJob(
      {
        queueName: MAINTENANCE_QUEUE,
        resourceId: IDEMPOTENCY_RETENTION_JOB,
        systemReason: 'Delete expired idempotency records',
      },
      async (client) => {
        const { count } = await client.idempotencyRecord.deleteMany({
          where: { expiresAt: { lte: now } },
        });
        this.logger.log(JSON.stringify({ message: 'Idempotency retention purge', deleted: count }));
      },
    );
  }
}
