import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { SYSTEM_ACTOR_USER_ID } from '../common/system-actor';
import { buildInviteExpiryAudit } from './portal-invite-presentation';

/**
 * How many rows one sweep settles.
 *
 * The sweep is housekeeping, not the correctness guarantee — the claim, resend and
 * onboarding paths already refuse a lapsed invite whatever the stored status says. So
 * there is nothing to gain from a long-running transaction over a backlog: a bounded
 * batch that runs again in an hour drains at the same rate without holding a connection
 * open across thousands of audit writes.
 */
export const PORTAL_INVITE_EXPIRY_BATCH_SIZE = 500;

export interface PortalInviteExpiryResult {
  expired: number;
}

/**
 * Bring the stored status of lapsed invites in line with the rule the API enforces.
 *
 * Nothing depends on this having run. It exists so the operator view, the list of previous
 * invites on a chart, and the audit trail all say EXPIRED rather than PENDING once an
 * invite is over — a row that reads PENDING for an hour after it stopped working is the
 * sort of quiet disagreement between data and behaviour that this whole change is about.
 */
@Injectable()
export class PortalInviteExpiryService {
  private readonly logger = new Logger(PortalInviteExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Settle one batch of overdue invites.
   *
   * `client` is the tenant-scoped transaction client when the caller has one — the sweep
   * runs under a system context because it crosses every clinic. Each row is settled with
   * a guarded `updateMany` rather than a blanket one so that an invite claimed between the
   * select and the write is not overwritten, and so the audit event is only written for a
   * transition that actually happened.
   */
  async expireOverdueInvites(
    now: Date = new Date(),
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<PortalInviteExpiryResult> {
    const overdue = await client.patientPortalInvite.findMany({
      where: { status: 'PENDING', expiresAt: { not: null, lte: now } },
      select: { id: true, clinicId: true, expiresAt: true },
      orderBy: { expiresAt: 'asc' },
      take: PORTAL_INVITE_EXPIRY_BATCH_SIZE,
    });

    let expired = 0;
    for (const invite of overdue) {
      const settled = await client.patientPortalInvite.updateMany({
        where: { id: invite.id, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
      if (settled.count === 0) {
        // Claimed or cancelled between the select and the write. Its real transition is
        // already recorded; writing an expiry event here would invent a second one.
        continue;
      }
      expired += 1;
      await this.auditService.logWrite(buildInviteExpiryAudit(invite, SYSTEM_ACTOR_USER_ID));
    }

    if (expired > 0) {
      // Count only. An invite's email address is a patient contact detail and this line
      // goes to the same log stream as every other operational message.
      this.logger.log(
        JSON.stringify({ message: 'Expired overdue portal invites', count: expired }),
      );
    }

    return { expired };
  }
}
