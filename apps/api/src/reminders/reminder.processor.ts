import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ReminderService } from './reminder.service';

@Processor('reminders')
export class ReminderProcessor extends WorkerHost {
  constructor(
    private readonly reminderService: ReminderService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<{ reminderId: string; clinicId?: string }>): Promise<void> {
    const { reminderId } = job.data;
    const clinicId =
      job.data.clinicId ??
      (await this.prisma.withSystemContext({ requestId: String(job.id ?? reminderId) }, () =>
        this.reminderService.findReminderClinicId(reminderId),
      ));

    if (!clinicId) {
      await this.prisma.withSystemContext({ requestId: String(job.id ?? reminderId) }, () =>
        this.reminderService.processReminder(reminderId),
      );
      return;
    }

    await this.prisma.withClinicContext(
      clinicId,
      { requestId: String(job.id ?? reminderId), userId: null },
      () => this.reminderService.processReminder(reminderId),
    );
  }
}
