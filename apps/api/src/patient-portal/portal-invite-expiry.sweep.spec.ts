import {
  PORTAL_INVITE_EXPIRY_INTERVAL_MS,
  PORTAL_INVITE_EXPIRY_JOB,
  PortalInviteExpirySweep,
} from './portal-invite-expiry.sweep';
import type { PortalInviteExpiryService } from './portal-invite-expiry.service';
import type { JobTenantContextRunner } from '../prisma/job-tenant-context.runner';
import type { MaintenanceScheduler } from '../maintenance/maintenance-scheduler';
import type { StaffInviteExpiryService } from '../staff-invites/staff-invite-expiry.service';

describe('PortalInviteExpirySweep', () => {
  let scheduler: { register: jest.Mock };
  let expiryService: { expireOverdueInvites: jest.Mock };
  let staffExpiryService: { expireOverdueInvites: jest.Mock };
  let tenantContext: { runSystemJob: jest.Mock };
  let processor: PortalInviteExpirySweep;

  beforeEach(() => {
    scheduler = { register: jest.fn() };
    expiryService = { expireOverdueInvites: jest.fn().mockResolvedValue({ expired: 0 }) };
    staffExpiryService = { expireOverdueInvites: jest.fn().mockResolvedValue({ expired: 0 }) };
    tenantContext = {
      runSystemJob: jest.fn(async (_ctx: unknown, run: (client: unknown) => Promise<unknown>) =>
        run({}),
      ),
    };
    processor = new PortalInviteExpirySweep(
      scheduler as unknown as MaintenanceScheduler,
      expiryService as unknown as PortalInviteExpiryService,
      tenantContext as unknown as JobTenantContextRunner,
      staffExpiryService as unknown as StaffInviteExpiryService,
    );
  });

  // Held in Redis by the shared maintenance scheduler, so several instances produce one sweep.
  it('registers one hourly scheduler, held in Redis rather than per instance', () => {
    processor.onModuleInit();

    expect(scheduler.register).toHaveBeenCalledWith(processor);
    expect(processor.jobName).toBe(PORTAL_INVITE_EXPIRY_JOB);
    expect(processor.everyMs).toBe(PORTAL_INVITE_EXPIRY_INTERVAL_MS);
  });

  // It crosses every clinic, so it cannot run inside any one tenant's context.
  it('sweeps under a system tenant context', async () => {
    await processor.run();

    expect(tenantContext.runSystemJob).toHaveBeenCalledWith(
      expect.objectContaining({ systemReason: expect.stringContaining('expiry date') }),
      expect.any(Function),
    );
    expect(expiryService.expireOverdueInvites).toHaveBeenCalled();
  });

  // Staff invitations lapse on the same clock, so the one hourly job settles both, at one instant.
  it('settles staff invitations in the same sweep', async () => {
    await processor.run();

    expect(staffExpiryService.expireOverdueInvites).toHaveBeenCalledTimes(1);
    const [patientNow] = expiryService.expireOverdueInvites.mock.calls[0];
    const [staffNow] = staffExpiryService.expireOverdueInvites.mock.calls[0];
    expect(staffNow).toBe(patientNow);
  });
});
