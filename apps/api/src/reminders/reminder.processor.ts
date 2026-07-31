import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { JobTenantContextRunner } from '../prisma/job-tenant-context.runner';
import { ReminderService } from './reminder.service';

export type ReminderJobData = {
  reminderId: string;
  clinicId?: string;
  userId?: string | null;
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
    const { reminderId, clinicId, userId } = job.data;
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
