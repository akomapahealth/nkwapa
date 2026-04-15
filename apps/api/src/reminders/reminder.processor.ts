import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ReminderService } from './reminder.service';

@Processor('reminders')
export class ReminderProcessor extends WorkerHost {
  constructor(private readonly reminderService: ReminderService) {
    super();
  }

  async process(job: Job<{ reminderId: string }>): Promise<void> {
    const { reminderId } = job.data;
    await this.reminderService.processReminder(reminderId);
  }
}
