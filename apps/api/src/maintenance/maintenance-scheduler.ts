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
  /** Omitted for a task that only runs when `delay` asks, never on a schedule. */
  readonly everyMs?: number;
  /**
   * A time of day instead of an interval: a cron pattern read in `tz`. For work people expect at
   * a set hour, which an interval counted from the last deploy drifts away from.
   */
  readonly cron?: { pattern: string; tz: string };
  /** `data` is what `delay` was given; a scheduled run has none. */
  run(data?: unknown): Promise<void>;
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
    if (sweep.cron) void this.schedule(sweep, sweep.cron);
    else if (sweep.everyMs) void this.schedule(sweep, { every: sweep.everyMs });
  }

  /**
   * Run a registered task once, `delayMs` from now, on this same queue and worker. One pending
   * job per `jobId`: asking twice keeps the first. Never throws; a task that matters must also be
   * caught by a sweep, because a job asked for while Redis is down is lost.
   */
  async delay(jobName: string, jobId: string, data: unknown, delayMs: number): Promise<void> {
    try {
      await this.queue.add(jobName, data, {
        jobId,
        delay: delayMs,
        removeOnComplete: true,
        removeOnFail: 100,
      });
    } catch (err) {
      this.logger.warn(
        JSON.stringify({ message: 'Delayed task not queued', jobName, error: redactLogValue(err) }),
      );
    }
  }

  /** Drop a pending `delay` job. Never throws: the task re-checks its own conditions anyway. */
  async cancel(jobId: string): Promise<void> {
    try {
      await this.queue.remove(jobId);
    } catch (err) {
      this.logger.warn(
        JSON.stringify({ message: 'Delayed task not cancelled', error: redactLogValue(err) }),
      );
    }
  }

  find(jobName: string): MaintenanceSweep | undefined {
    return this.sweeps.get(jobName);
  }

  private async schedule(
    sweep: MaintenanceSweep,
    repeat: { every: number } | { pattern: string; tz: string },
  ): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(sweep.jobName, repeat, { name: sweep.jobName });
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
