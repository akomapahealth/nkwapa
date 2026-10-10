import { Injectable, type OnModuleInit } from '@nestjs/common';
import { JobTenantContextRunner } from '../prisma/job-tenant-context.runner';
import { PortalInviteExpiryService } from './portal-invite-expiry.service';
import { StaffInviteExpiryService } from '../staff-invites/staff-invite-expiry.service';
import {
  MAINTENANCE_QUEUE,
  MaintenanceScheduler,
  type MaintenanceSweep,
} from '../maintenance/maintenance-scheduler';

export const PORTAL_INVITE_EXPIRY_JOB = 'expire-overdue-invites';

/**
 * Hourly.
 *
 * The window this leaves is bounded and harmless: for up to an hour a lapsed invite still
 * reads PENDING in the operator view, while every path that can act on it already refuses
 * it. Running more often would buy a fresher label and nothing else.
 */
export const PORTAL_INVITE_EXPIRY_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Keeps the stored status of lapsed invites honest.
 *
 * Registered as a BullMQ job scheduler rather than through a cron decorator because BullMQ
 * is already the only time machinery in this API, and because the scheduler is held in
 * Redis: several API instances behind a load balancer produce one sweep, not one per
 * instance.
 *
 * If it cannot be scheduled, lapsed invites keep reading PENDING in the operator view, and every
 * path that can act on one still refuses it.
 */
@Injectable()
export class PortalInviteExpirySweep implements MaintenanceSweep, OnModuleInit {
  readonly jobName = PORTAL_INVITE_EXPIRY_JOB;
  readonly everyMs = PORTAL_INVITE_EXPIRY_INTERVAL_MS;

  constructor(
    private readonly scheduler: MaintenanceScheduler,
    private readonly expiryService: PortalInviteExpiryService,
    private readonly tenantContext: JobTenantContextRunner,
    private readonly staffInviteExpiryService: StaffInviteExpiryService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register(this);
  }

  async run(): Promise<void> {
    // Crosses every clinic, so it cannot run under any one tenant's context.
    await this.tenantContext.runSystemJob(
      {
        queueName: MAINTENANCE_QUEUE,
        resourceId: PORTAL_INVITE_EXPIRY_JOB,
        systemReason: 'Expire patient and staff invites that have passed their expiry date',
      },
      async (client) => {
        const now = new Date();
        await this.expiryService.expireOverdueInvites(now, client);
        // Staff invitations lapse on the same clock, so they share the job rather than
        // scheduling a second one for the same hourly tick.
        await this.staffInviteExpiryService.expireOverdueInvites(now, client);
      },
    );
  }
}
