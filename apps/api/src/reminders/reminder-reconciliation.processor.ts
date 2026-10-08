import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { JobTenantContextRunner } from '../prisma/job-tenant-context.runner';
import { redactLogValue } from '../common/redaction';
import { ReminderService } from './reminder.service';

export const REMINDER_RECONCILIATION_QUEUE = 'reminder-reconciliation';
export const REMINDER_RECONCILE_JOB = 'reconcile-stale-sends';

/**
 * Every five minutes. A send is stale after ten (REMINDER_SEND_STALE_AFTER_MS), so an operator
 * sees an unknown outcome within a quarter of an hour of the worker that lost it.
 */
export const REMINDER_RECONCILE_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Records reminders whose send outcome nobody knows (#164); see
 * `ReminderService.reconcileStaleSends`. A BullMQ job scheduler, like the invite expiry sweep, so
 * several API instances produce one sweep.
 */
@Processor(REMINDER_RECONCILIATION_QUEUE)
export class ReminderReconciliationProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ReminderReconciliationProcessor.name);

  constructor(
    @InjectQueue(REMINDER_RECONCILIATION_QUEUE) private readonly queue: Queue,
    private readonly reminderService: ReminderService,
    private readonly tenantContext: JobTenantContextRunner,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        REMINDER_RECONCILE_JOB,
        { every: REMINDER_RECONCILE_INTERVAL_MS },
        { name: REMINDER_RECONCILE_JOB },
      );
    } catch (err) {
      // Redis must not be in the blast radius of API boot. Without the sweep a lost send keeps
      // reading SENDING, which nothing resends, so the cost is a stale label, not a duplicate.
      this.logger.error(
        JSON.stringify({
          message: 'Reminder reconciliation sweep could not be scheduled',
          error: redactLogValue(err),
        }),
      );
    }
  }

  async process(): Promise<void> {
    // Crosses every clinic, so it cannot run under any one tenant's context. It touches only the
    // database, so one transaction is right here.
    await this.tenantContext.runSystemJob(
      {
        queueName: REMINDER_RECONCILIATION_QUEUE,
        resourceId: REMINDER_RECONCILE_JOB,
        systemReason: 'Record reminders whose send outcome is unknown',
      },
      () => this.reminderService.reconcileStaleSends(),
    );
  }
}
