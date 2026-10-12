import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { JobTenantContextRunner } from '../prisma/job-tenant-context.runner';
import {
  MAINTENANCE_QUEUE,
  MaintenanceScheduler,
  type MaintenanceSweep,
} from '../maintenance/maintenance-scheduler';

export const TELEMETRY_RETENTION_JOB = 'purge-expired-telemetry';
export const TELEMETRY_RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_TELEMETRY_RETENTION_DAYS = 180;

/** Days of telemetry to keep. Bounded so a typo cannot keep rows forever or purge today's. */
export function telemetryRetentionDays(): number {
  const parsed = Number(process.env.TELEMETRY_RETENTION_DAYS);
  if (!Number.isInteger(parsed)) return DEFAULT_TELEMETRY_RETENTION_DAYS;
  return Math.min(Math.max(parsed, 7), 730);
}

export function telemetryRetentionCutoff(now: Date, days = telemetryRetentionDays()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * Deletes telemetry older than the retention window, daily.
 *
 * Telemetry exists to show trends, not to keep a history of the clinic; holding it indefinitely
 * would only grow the table and the amount of operational detail at rest. A BullMQ scheduler for
 * the same reason the portal invite sweep uses one: several API instances produce one purge.
 * Housekeeping only, so a purge that cannot be scheduled costs nothing but a larger table.
 */
@Injectable()
export class TelemetryRetentionSweep implements MaintenanceSweep, OnModuleInit {
  readonly jobName = TELEMETRY_RETENTION_JOB;
  readonly everyMs = TELEMETRY_RETENTION_INTERVAL_MS;
  private readonly logger = new Logger(TelemetryRetentionSweep.name);

  constructor(
    private readonly scheduler: MaintenanceScheduler,
    private readonly tenantContext: JobTenantContextRunner,
  ) {}

  onModuleInit(): void {
    this.scheduler.register(this);
  }

  async run(): Promise<void> {
    await this.tenantContext.runSystemJob(
      {
        queueName: MAINTENANCE_QUEUE,
        resourceId: TELEMETRY_RETENTION_JOB,
        systemReason: 'Delete telemetry older than the retention window',
      },
      async (client) => {
        const { count } = await client.telemetryEvent.deleteMany({
          where: { occurredAt: { lt: telemetryRetentionCutoff(new Date()) } },
        });
        this.logger.log(JSON.stringify({ message: 'Telemetry retention purge', deleted: count }));
      },
    );
  }
}
