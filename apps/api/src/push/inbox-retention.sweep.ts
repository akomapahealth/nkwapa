import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { JobTenantContextRunner } from '../prisma/job-tenant-context.runner';
import {
  MAINTENANCE_QUEUE,
  MaintenanceScheduler,
  type MaintenanceSweep,
} from '../maintenance/maintenance-scheduler';

export const INBOX_RETENTION_JOB = 'purge-old-notifications';
export const INBOX_RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Read notifications have done their job; a month is enough to find one again. */
export const INBOX_READ_RETENTION_DAYS = 30;
/** Unread ones still point at work, but after a quarter the work has moved on. */
export const INBOX_UNREAD_RETENTION_DAYS = 90;

/**
 * Deletes old bell notifications, daily. Their wording names patients, so keeping them past their
 * use only grows the PHI at rest. Every row is a pointer: the record it opens is kept elsewhere.
 */
@Injectable()
export class InboxRetentionSweep implements MaintenanceSweep, OnModuleInit {
  readonly jobName = INBOX_RETENTION_JOB;
  readonly everyMs = INBOX_RETENTION_INTERVAL_MS;
  private readonly logger = new Logger(InboxRetentionSweep.name);

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
        resourceId: INBOX_RETENTION_JOB,
        systemReason: 'Delete notifications older than the retention window',
      },
      async (client) => {
        const { count } = await client.inboxNotification.deleteMany({
          where: {
            OR: [
              { readAt: { lt: new Date(now.getTime() - INBOX_READ_RETENTION_DAYS * DAY_MS) } },
              { updatedAt: { lt: new Date(now.getTime() - INBOX_UNREAD_RETENTION_DAYS * DAY_MS) } },
            ],
          },
        });
        this.logger.log(
          JSON.stringify({ message: 'Notification retention purge', deleted: count }),
        );
      },
    );
  }
}
