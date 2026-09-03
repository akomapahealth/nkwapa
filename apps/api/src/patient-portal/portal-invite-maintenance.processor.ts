import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { JobTenantContextRunner } from '../prisma/job-tenant-context.runner';
import { redactLogValue } from '../common/redaction';
import { PortalInviteExpiryService } from './portal-invite-expiry.service';

export const PORTAL_INVITE_MAINTENANCE_QUEUE = 'portal-invite-maintenance';
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
 */
@Processor(PORTAL_INVITE_MAINTENANCE_QUEUE)
export class PortalInviteMaintenanceProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(PortalInviteMaintenanceProcessor.name);

  constructor(
    @InjectQueue(PORTAL_INVITE_MAINTENANCE_QUEUE) private readonly queue: Queue,
    private readonly expiryService: PortalInviteExpiryService,
    private readonly tenantContext: JobTenantContextRunner,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        PORTAL_INVITE_EXPIRY_JOB,
        { every: PORTAL_INVITE_EXPIRY_INTERVAL_MS },
        { name: PORTAL_INVITE_EXPIRY_JOB },
      );
    } catch (err) {
      // Redis must not be in the blast radius of API boot. This sweep is housekeeping:
      // without it lapsed invites keep reading PENDING in the operator view, and every
      // path that can act on one still refuses it. The same rule the notification queue
      // already follows when it degrades a send to QUEUE_UNAVAILABLE.
      this.logger.error(
        JSON.stringify({
          message: 'Portal invite expiry sweep could not be scheduled',
          error: redactLogValue(err),
        }),
      );
    }
  }

  async process(): Promise<void> {
    // Crosses every clinic, so it cannot run under any one tenant's context.
    await this.tenantContext.runSystemJob(
      {
        queueName: PORTAL_INVITE_MAINTENANCE_QUEUE,
        resourceId: PORTAL_INVITE_EXPIRY_JOB,
        systemReason: 'Expire portal invites that have passed their expiry date',
      },
      (client) => this.expiryService.expireOverdueInvites(new Date(), client),
    );
  }
}
