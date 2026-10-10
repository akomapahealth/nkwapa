import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { SYSTEM_ACTOR_USER_ID } from '../common/system-actor';
import { PORTAL_INVITE_EXPIRY_BATCH_SIZE } from '../patient-portal/portal-invite-expiry.service';

export const STAFF_INVITE_EXPIRE_ACTION = 'STAFF.INVITE.EXPIRE';

/**
 * Settle the stored status of lapsed staff invitations.
 *
 * Housekeeping, exactly as for patient invitations: acceptance, resend and cancel already refuse
 * a lapsed invitation whatever the column says, and the RLS widening never reaches one. This is
 * what makes the admin list and the audit trail say EXPIRED rather than PENDING once it is over.
 * It runs from the same hourly job as the patient sweep.
 */
@Injectable()
export class StaffInviteExpiryService {
  private readonly logger = new Logger(StaffInviteExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async expireOverdueInvites(
    now: Date = new Date(),
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<{ expired: number }> {
    const overdue = await client.staffInvite.findMany({
      where: { status: 'PENDING', expiresAt: { lte: now } },
      select: { id: true, clinicId: true, expiresAt: true },
      orderBy: { expiresAt: 'asc' },
      take: PORTAL_INVITE_EXPIRY_BATCH_SIZE,
    });

    let expired = 0;
    for (const invite of overdue) {
      // Guarded per row, so an invitation accepted between the read and the write keeps its
      // real transition and gains no invented one.
      const settled = await client.staffInvite.updateMany({
        where: { id: invite.id, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
      if (settled.count === 0) {
        continue;
      }
      expired += 1;
      await this.auditService.logWrite({
        clinicId: invite.clinicId,
        actorUserId: SYSTEM_ACTOR_USER_ID,
        action: STAFF_INVITE_EXPIRE_ACTION,
        entityType: 'StaffInvite',
        entityId: invite.id,
        beforeJson: JSON.stringify({ status: 'PENDING', expiresAt: invite.expiresAt }),
        afterJson: JSON.stringify({ status: 'EXPIRED', trigger: 'scheduled-sweep' }),
      });
    }

    if (expired > 0) {
      this.logger.log(JSON.stringify({ message: 'Expired overdue staff invites', count: expired }));
    }
    return { expired };
  }
}
