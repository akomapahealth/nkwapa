import { Injectable, type OnModuleInit } from '@nestjs/common';
import { JobTenantContextRunner } from '../prisma/job-tenant-context.runner';
import { ReminderService } from './reminder.service';
import {
  MAINTENANCE_QUEUE,
  MaintenanceScheduler,
  type MaintenanceSweep,
} from '../maintenance/maintenance-scheduler';

export const REMINDER_RECONCILE_JOB = 'reconcile-stale-sends';

/**
 * Every five minutes. A send is stale after ten (REMINDER_SEND_STALE_AFTER_MS), so an operator
 * sees an unknown outcome within a quarter of an hour of the worker that lost it.
 */
export const REMINDER_RECONCILE_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Records reminders whose send outcome nobody knows (#164), and re-queues reminders that are past
 * their time with no job behind them (#165); see `ReminderService.reconcileStaleSends` and
 * `ReminderService.requeueOverdue`. A BullMQ job scheduler, like the invite expiry sweep, so
 * several API instances produce one sweep.
 *
 * If it cannot be scheduled, a lost send keeps reading SENDING, which nothing resends, so the
 * cost is a stale label, not a duplicate.
 */
@Injectable()
export class ReminderReconciliationSweep implements MaintenanceSweep, OnModuleInit {
  readonly jobName = REMINDER_RECONCILE_JOB;
  readonly everyMs = REMINDER_RECONCILE_INTERVAL_MS;

  constructor(
    private readonly scheduler: MaintenanceScheduler,
    private readonly reminderService: ReminderService,
    private readonly tenantContext: JobTenantContextRunner,
  ) {}

  onModuleInit(): void {
    this.scheduler.register(this);
  }

  async run(): Promise<void> {
    // Crosses every clinic, so it cannot run under any one tenant's context. Steps rather than one
    // transaction, because re-queuing asks Redis about each overdue reminder.
    await this.tenantContext.runSystemJobSteps(
      {
        queueName: MAINTENANCE_QUEUE,
        resourceId: REMINDER_RECONCILE_JOB,
        systemReason: 'Record reminders whose send outcome is unknown, and re-queue overdue ones',
      },
      async (step) => {
        await step(() => this.reminderService.reconcileStaleSends());
        await this.reminderService.requeueOverdue(step);
      },
    );
  }
}
