import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { workerOptions } from '../common/redis';
import { MAINTENANCE_QUEUE, MaintenanceScheduler } from './maintenance-scheduler';

/** The one worker for every maintenance sweep; see `MaintenanceScheduler`. */
@Processor(MAINTENANCE_QUEUE, workerOptions())
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(private readonly scheduler: MaintenanceScheduler) {
    super();
  }

  async process(job: Pick<Job, 'name'>): Promise<void> {
    const sweep = this.scheduler.find(job.name);
    if (!sweep) {
      // A scheduler left in Redis by a version that had a sweep this one does not.
      this.logger.warn(JSON.stringify({ message: 'No maintenance sweep for job', job: job.name }));
      return;
    }
    await sweep.run();
  }
}
