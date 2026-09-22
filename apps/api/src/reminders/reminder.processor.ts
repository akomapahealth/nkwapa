import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { JobTenantContextRunner } from '../prisma/job-tenant-context.runner';
import { ReminderService } from './reminder.service';

export type ReminderJobData = {
  reminderId: string;
  clinicId?: string;
  userId?: string | null;
  /**
   * Which tenant context the job needs.
   *
   * A missing clinicId used to mean one thing only: a payload queued before tenant
   * context was carried in the job, which the runner resolves from the row and
   * discards if it cannot. Now that a notification may legitimately have no clinic —
   * a global account deactivation belongs to none — that ambiguity would send those
   * jobs down the discard path and drop the mail with a single warn line. `global`
   * says the absence is deliberate; an absent `scope` keeps the legacy behaviour for
   * jobs already queued when this deploys.
   */
  scope?: 'clinic' | 'global';
};

/*
  Concurrency and rate are set here rather than left to BullMQ's defaults.

  The default worker concurrency is 1, so every notification waited on the full SMTP round trip of
  the one in front of it. A clinic session's worth of invites delivered strictly serially, which is
  the dominant cost in the common case and the reason mail read as lost.

  Five at a time, capped at five per second. Sends are IO-bound, so the concurrency itself is cheap;
  the cap is what keeps it safe. Resend documents 10 requests per second per team, and the Keycloak
  service sends verify-email and password resets through the same account, so half the budget is
  deliberately left for it. The limiter is per worker process: running more than one API instance
  multiplies the effective rate, and these numbers would need revisiting.

  This changes the rate, never the volume. The account's daily cap is unaffected by how fast the
  queue drains.
*/
const REMINDER_CONCURRENCY = 5;
const REMINDER_RATE_LIMIT = { max: 5, duration: 1_000 };

/*
  First retry fast, later retries patient.

  BullMQ's exponential backoff from 60s made the first retry the dominant delay after a blip that
  had already resolved. A transient failure is usually over in seconds, so try again in five; if it
  is still failing after that, it is not a blip and the longer wait is the right one.
*/
const FIRST_RETRY_DELAY_MS = 5_000;
const LATER_RETRY_DELAY_MS = 60_000;

@Processor('reminders', {
  concurrency: REMINDER_CONCURRENCY,
  limiter: REMINDER_RATE_LIMIT,
  settings: {
    backoffStrategy: (attemptsMade: number) =>
      attemptsMade <= 1 ? FIRST_RETRY_DELAY_MS : LATER_RETRY_DELAY_MS,
  },
})
export class ReminderProcessor extends WorkerHost {
  constructor(
    private readonly reminderService: ReminderService,
    private readonly tenantContext: JobTenantContextRunner,
  ) {
    super();
  }

  async process(job: Job<ReminderJobData>): Promise<void> {
    const { reminderId, clinicId, userId, scope } = job.data;
    // `attempts` is absent on jobs queued before a retry budget was set; one attempt is the
    // honest reading of that, and matches how those jobs already behave. Read defensively for
    // the same reason the scope field is: this worker outlives the shape of what is already
    // queued, and a missing option should not crash the job that carries it.
    const attempt = {
      attemptsMade: job.attemptsMade ?? 0,
      maxAttempts: job.opts?.attempts ?? 1,
    };

    if (scope === 'global') {
      await this.tenantContext.runSystemJob(
        {
          queueName: 'reminders',
          jobId: job.id,
          resourceId: reminderId,
          userId: userId ?? null,
          systemReason: 'Deliver a notification that is not scoped to a single clinic',
        },
        () => this.reminderService.processReminder(reminderId, attempt),
      );
      return;
    }

    await this.tenantContext.runClinicJob(
      {
        queueName: 'reminders',
        jobId: job.id,
        resourceId: reminderId,
        tenant: clinicId ? { clinicId, userId: userId ?? null } : null,
        legacy: {
          systemReason: 'Resolve tenant for a legacy reminder payload',
          resolveTenant: async () => {
            const resolvedClinicId = await this.reminderService.findReminderClinicId(reminderId);
            return resolvedClinicId
              ? {
                  clinicId: resolvedClinicId,
                  userId: null,
                }
              : null;
          },
        },
        unresolvedTenant: 'discard',
      },
      () => this.reminderService.processReminder(reminderId, attempt),
    );
  }
}
