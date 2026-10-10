import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { redactLogValue } from '../common/redaction';

export const MAINTENANCE_QUEUE = 'maintenance';

/**
 * One piece of periodic housekeeping: a stale-record sweep, an expiry, a purge. Each runs across
 * every clinic, so `run` sets up its own system tenant context.
 */
export interface MaintenanceSweep {
  /** The BullMQ job and scheduler name. Unique across sweeps. */
  readonly jobName: string;
  readonly everyMs: number;
  run(): Promise<void>;
}

/*
  Every periodic sweep shares one queue and one worker (#199).

  They used to have a queue each, and an idle BullMQ worker is not free: a queue with a scheduler
  always holds a delayed job, so its worker polls Redis every few seconds whether or not anything
  is due. Four sweeps that run between every five minutes and once a day cost four of those
  workers, most of an idle API's Redis commands. Sharing a queue costs one.

  The schedulers are still held in Redis, so several API instances produce one run of each sweep,
  not one per instance. A sweep registers itself from its own module, which keeps the work next to
  the service it maintains and keeps this module free of imports from all of them.
*/
@Injectable()
export class MaintenanceScheduler {
  private readonly logger = new Logger(MaintenanceScheduler.name);
  private readonly sweeps = new Map<string, MaintenanceSweep>();

  constructor(@InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue) {}

  /**
   * Record a sweep and schedule it. Scheduling is not awaited: BullMQ waits for its connection
   * instead of failing, so awaiting it while Redis is down held up boot until Redis came back.
   * Left running, it registers the scheduler as soon as Redis is reachable, with no restart.
   */
  register(sweep: MaintenanceSweep): void {
    if (this.sweeps.has(sweep.jobName)) {
      throw new Error(`Maintenance sweep "${sweep.jobName}" is registered twice`);
    }
    this.sweeps.set(sweep.jobName, sweep);
    void this.schedule(sweep);
  }

  find(jobName: string): MaintenanceSweep | undefined {
    return this.sweeps.get(jobName);
  }

  private async schedule(sweep: MaintenanceSweep): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        sweep.jobName,
        { every: sweep.everyMs },
        { name: sweep.jobName },
      );
    } catch (err) {
      // Redis must not be in the blast radius of API boot. Every sweep is housekeeping whose
      // absence leaves a label stale, never a rule unenforced; each says what in its own comment.
      this.logger.error(
        JSON.stringify({
          message: 'Maintenance sweep could not be scheduled',
          jobName: sweep.jobName,
          error: redactLogValue(err),
        }),
      );
    }
  }
}
