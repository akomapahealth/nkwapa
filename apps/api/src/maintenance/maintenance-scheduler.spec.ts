import { Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { MaintenanceScheduler, type MaintenanceSweep } from './maintenance-scheduler';
import { MaintenanceProcessor } from './maintenance.processor';

function sweep(jobName = 'expire-things', everyMs = 60_000): MaintenanceSweep & { run: jest.Mock } {
  return { jobName, everyMs, run: jest.fn().mockResolvedValue(undefined) };
}

describe('MaintenanceScheduler', () => {
  let queue: { upsertJobScheduler: jest.Mock };
  let scheduler: MaintenanceScheduler;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    queue = { upsertJobScheduler: jest.fn().mockResolvedValue(undefined) };
    scheduler = new MaintenanceScheduler(queue as unknown as Queue);
  });

  afterEach(() => jest.restoreAllMocks());

  it('holds each sweep as one scheduler in Redis, so several instances produce one run', () => {
    scheduler.register(sweep('expire-things', 3_600_000));

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'expire-things',
      { every: 3_600_000 },
      { name: 'expire-things' },
    );
  });

  // BullMQ waits for Redis rather than failing, so a pending upsert must not hold up boot (#199).
  it('does not wait for Redis to register a scheduler', () => {
    queue.upsertJobScheduler.mockReturnValue(new Promise(() => {}));

    expect(scheduler.register(sweep())).toBeUndefined();
    expect(scheduler.find('expire-things')).toBeDefined();
  });

  it('boots even when the queue is unreachable', async () => {
    queue.upsertJobScheduler.mockRejectedValue(new Error('ECONNREFUSED'));

    expect(() => scheduler.register(sweep())).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
    expect(Logger.prototype.error).toHaveBeenCalled();
  });

  it('refuses two sweeps with one job name, which would share a scheduler', () => {
    scheduler.register(sweep());
    expect(() => scheduler.register(sweep())).toThrow(/registered twice/);
  });

  it('runs the sweep a job names, and nothing for a name it does not know', async () => {
    const one = sweep('one');
    const two = sweep('two');
    scheduler.register(one);
    scheduler.register(two);
    const processor = new MaintenanceProcessor(scheduler);

    await processor.process({ name: 'two' });
    await processor.process({ name: 'retired-sweep' });

    expect(two.run).toHaveBeenCalledTimes(1);
    expect(one.run).not.toHaveBeenCalled();
  });
});
