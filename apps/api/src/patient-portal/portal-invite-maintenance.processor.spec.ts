import type { Queue } from 'bullmq';
import {
  PORTAL_INVITE_EXPIRY_INTERVAL_MS,
  PORTAL_INVITE_EXPIRY_JOB,
  PortalInviteMaintenanceProcessor,
} from './portal-invite-maintenance.processor';
import type { PortalInviteExpiryService } from './portal-invite-expiry.service';
import type { JobTenantContextRunner } from '../prisma/job-tenant-context.runner';

describe('PortalInviteMaintenanceProcessor', () => {
  let queue: { upsertJobScheduler: jest.Mock };
  let expiryService: { expireOverdueInvites: jest.Mock };
  let tenantContext: { runSystemJob: jest.Mock };
  let processor: PortalInviteMaintenanceProcessor;

  beforeEach(() => {
    queue = { upsertJobScheduler: jest.fn().mockResolvedValue(undefined) };
    expiryService = { expireOverdueInvites: jest.fn().mockResolvedValue({ expired: 0 }) };
    tenantContext = {
      runSystemJob: jest.fn(async (_ctx: unknown, run: (client: unknown) => Promise<unknown>) =>
        run({}),
      ),
    };
    processor = new PortalInviteMaintenanceProcessor(
      queue as unknown as Queue,
      expiryService as unknown as PortalInviteExpiryService,
      tenantContext as unknown as JobTenantContextRunner,
    );
  });

  it('registers one hourly scheduler, held in Redis rather than per instance', async () => {
    await processor.onModuleInit();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      PORTAL_INVITE_EXPIRY_JOB,
      { every: PORTAL_INVITE_EXPIRY_INTERVAL_MS },
      { name: PORTAL_INVITE_EXPIRY_JOB },
    );
  });

  // A Redis outage must degrade this sweep, not stop the API booting. Without it lapsed
  // invites keep reading PENDING in the operator view and every path that can act on one
  // still refuses it, which is a label being stale rather than a rule going unenforced.
  it('boots even when the queue is unreachable', async () => {
    queue.upsertJobScheduler.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(processor.onModuleInit()).resolves.toBeUndefined();
  });

  // It crosses every clinic, so it cannot run inside any one tenant's context.
  it('sweeps under a system tenant context', async () => {
    await processor.process();

    expect(tenantContext.runSystemJob).toHaveBeenCalledWith(
      expect.objectContaining({ systemReason: expect.stringContaining('expiry date') }),
      expect.any(Function),
    );
    expect(expiryService.expireOverdueInvites).toHaveBeenCalled();
  });
});
