import { Logger } from '@nestjs/common';
import type { JobTenantContextRunner } from '../prisma/job-tenant-context.runner';
import type { MaintenanceScheduler } from '../maintenance/maintenance-scheduler';
import {
  DEFAULT_TELEMETRY_RETENTION_DAYS,
  TELEMETRY_RETENTION_INTERVAL_MS,
  TELEMETRY_RETENTION_JOB,
  TelemetryRetentionSweep,
  telemetryRetentionCutoff,
  telemetryRetentionDays,
} from './telemetry-retention.sweep';

describe('TelemetryRetentionSweep', () => {
  const originalDays = process.env.TELEMETRY_RETENTION_DAYS;
  let scheduler: { register: jest.Mock };
  let client: { telemetryEvent: { deleteMany: jest.Mock } };
  let tenantContext: { runSystemJob: jest.Mock };
  let processor: TelemetryRetentionSweep;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    scheduler = { register: jest.fn() };
    client = { telemetryEvent: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) } };
    tenantContext = {
      runSystemJob: jest.fn(async (_ctx: unknown, run: (tx: unknown) => Promise<unknown>) =>
        run(client),
      ),
    };
    processor = new TelemetryRetentionSweep(
      scheduler as unknown as MaintenanceScheduler,
      tenantContext as unknown as JobTenantContextRunner,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalDays === undefined) delete process.env.TELEMETRY_RETENTION_DAYS;
    else process.env.TELEMETRY_RETENTION_DAYS = originalDays;
  });

  it('registers one daily scheduler, held in Redis rather than per instance', () => {
    processor.onModuleInit();

    expect(scheduler.register).toHaveBeenCalledWith(processor);
    expect(processor.jobName).toBe(TELEMETRY_RETENTION_JOB);
    expect(processor.everyMs).toBe(TELEMETRY_RETENTION_INTERVAL_MS);
  });

  // Telemetry spans every clinic, so the purge cannot run inside any one tenant's context.
  it('purges only telemetry older than the window, as system work', async () => {
    delete process.env.TELEMETRY_RETENTION_DAYS;
    const before = Date.now();

    await processor.run();

    expect(tenantContext.runSystemJob).toHaveBeenCalledWith(
      expect.objectContaining({
        queueName: 'maintenance',
        systemReason: expect.stringContaining('retention window'),
      }),
      expect.any(Function),
    );
    const cutoff = client.telemetryEvent.deleteMany.mock.calls[0][0].where.occurredAt.lt as Date;
    const windowMs = DEFAULT_TELEMETRY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - windowMs);
    expect(cutoff.getTime()).toBeLessThanOrEqual(Date.now() - windowMs);
  });

  // Re-running the purge (a duplicate delivery, or two instances on one tick) deletes nothing new.
  it('is safe to run twice, because it only ever deletes by age', async () => {
    await processor.run();
    await processor.run();

    const [first, second] = client.telemetryEvent.deleteMany.mock.calls.map(([args]) =>
      Object.keys(args.where),
    );
    expect(first).toEqual(['occurredAt']);
    expect(second).toEqual(['occurredAt']);
  });

  it.each([
    ['unset', undefined, DEFAULT_TELEMETRY_RETENTION_DAYS],
    ['not a whole number', '30.5', DEFAULT_TELEMETRY_RETENTION_DAYS],
    ['below a week', '1', 7],
    ['above two years', '9999', 730],
    ['in range', '90', 90],
  ])('bounds a retention setting that is %s', (_label, value, expected) => {
    if (value === undefined) delete process.env.TELEMETRY_RETENTION_DAYS;
    else process.env.TELEMETRY_RETENTION_DAYS = value;

    expect(telemetryRetentionDays()).toBe(expected);
    expect(telemetryRetentionCutoff(new Date('2026-10-01T00:00:00.000Z'), 7).toISOString()).toBe(
      '2026-09-24T00:00:00.000Z',
    );
  });
});
