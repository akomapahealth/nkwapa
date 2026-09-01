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

@Processor('reminders')
export class ReminderProcessor extends WorkerHost {
  constructor(
    private readonly reminderService: ReminderService,
    private readonly tenantContext: JobTenantContextRunner,
  ) {
    super();
  }

  async process(job: Job<ReminderJobData>): Promise<void> {
    const { reminderId, clinicId, userId, scope } = job.data;

    if (scope === 'global') {
      await this.tenantContext.runSystemJob(
        {
          queueName: 'reminders',
          jobId: job.id,
          resourceId: reminderId,
          userId: userId ?? null,
          systemReason: 'Deliver a notification that is not scoped to a single clinic',
        },
        () => this.reminderService.processReminder(reminderId),
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
      () => this.reminderService.processReminder(reminderId),
    );
  }
}
