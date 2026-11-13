import { Logger } from '@nestjs/common';
import type { JobTenantContextRunner } from '../prisma/job-tenant-context.runner';
import type { MaintenanceScheduler } from '../maintenance/maintenance-scheduler';
import { INBOX_RETENTION_JOB, InboxRetentionSweep } from './inbox-retention.sweep';

describe('InboxRetentionSweep', () => {
  it('registers itself and purges read rows after 30 days and any row after 90, as system work', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const scheduler = { register: jest.fn() };
    const client = { inboxNotification: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) } };
    const tenantContext = {
      runSystemJob: jest.fn(async (_ctx: unknown, run: (tx: unknown) => Promise<unknown>) =>
        run(client),
      ),
    };
    const sweep = new InboxRetentionSweep(
      scheduler as unknown as MaintenanceScheduler,
      tenantContext as unknown as JobTenantContextRunner,
    );

    sweep.onModuleInit();
    await sweep.run(new Date('2026-11-12T00:00:00.000Z'));

    expect(scheduler.register).toHaveBeenCalledWith(sweep);
    expect(sweep.jobName).toBe(INBOX_RETENTION_JOB);
    expect(tenantContext.runSystemJob).toHaveBeenCalledWith(
      expect.objectContaining({ queueName: 'maintenance' }),
      expect.any(Function),
    );
    expect(client.inboxNotification.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { readAt: { lt: new Date('2026-10-13T00:00:00.000Z') } },
          { updatedAt: { lt: new Date('2026-08-14T00:00:00.000Z') } },
        ],
      },
    });
  });
});
