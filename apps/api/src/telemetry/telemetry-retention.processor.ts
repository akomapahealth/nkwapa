import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { JobTenantContextRunner } from '../prisma/job-tenant-context.runner';
import { redactLogValue } from '../common/redaction';

export const TELEMETRY_MAINTENANCE_QUEUE = 'telemetry-maintenance';
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
 */
@Processor(TELEMETRY_MAINTENANCE_QUEUE)
export class TelemetryRetentionProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(TelemetryRetentionProcessor.name);

  constructor(
    @InjectQueue(TELEMETRY_MAINTENANCE_QUEUE) private readonly queue: Queue,
    private readonly tenantContext: JobTenantContextRunner,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        TELEMETRY_RETENTION_JOB,
        { every: TELEMETRY_RETENTION_INTERVAL_MS },
        { name: TELEMETRY_RETENTION_JOB },
      );
    } catch (err) {
      // Housekeeping only; Redis must not be in the blast radius of API boot.
      this.logger.error(
        JSON.stringify({
          message: 'Telemetry retention purge could not be scheduled',
          error: redactLogValue(err),
        }),
      );
    }
  }

  async process(): Promise<void> {
    await this.tenantContext.runSystemJob(
      {
        queueName: TELEMETRY_MAINTENANCE_QUEUE,
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
