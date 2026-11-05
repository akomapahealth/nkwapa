import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

/** At most one request per invitation a day reaches staff. */
export const INVITE_RENEWAL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** The only reply, whatever happened, so the endpoint says nothing about any account (#307). */
export const INVITE_RENEWAL_RECEIVED = {
  status: 'RECEIVED',
  message:
    'If you have an invitation that has lapsed, the clinic that sent it will see your request. They can send you a new one.',
} as const;

type Lapsable = { status: string; expiresAt: Date | null; renewalRequestedAt: Date | null };

/** The latest invitation is lapsed, and nobody asked for it to be renewed in the last day. */
export function shouldFlagRenewal(invite: Lapsable | null, now: Date): boolean {
  if (!invite) return false;
  const lapsed =
    invite.status === 'EXPIRED' ||
    (invite.status === 'PENDING' && invite.expiresAt !== null && invite.expiresAt <= now);
  if (!lapsed) return false;
  return (
    !invite.renewalRequestedAt ||
    now.getTime() - invite.renewalRequestedAt.getTime() >= INVITE_RENEWAL_COOLDOWN_MS
  );
}

/**
 * "Ask for a new invitation" from the invitee's side (#307, B7).
 *
 * Signed in, and matched only on the email Keycloak verified, so there is nothing to enumerate
 * but the caller's own address. Nothing is sent: the request marks the caller's latest lapsed
 * invitation, patient or staff, and staff resend from the chart or the staff list as they
 * already could. A withdrawn invitation is never flagged; staff withdrew it on purpose.
 */
@Injectable()
export class InviteRenewalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async requestRenewal(userId: string, requestId?: string, now = new Date()) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, isActive: true },
    });
    const email = user?.isActive ? user.email?.trim().toLowerCase() : null;
    if (!email) return INVITE_RENEWAL_RECEIVED;

    const select = {
      id: true,
      clinicId: true,
      status: true,
      expiresAt: true,
      renewalRequestedAt: true,
    } as const;
    const [portalInvite, staffInvite] = await Promise.all([
      this.prisma.patientPortalInvite.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        orderBy: { createdAt: 'desc' },
        select,
      }),
      this.prisma.staffInvite.findFirst({
        where: { email },
        orderBy: { createdAt: 'desc' },
        select,
      }),
    ]);

    if (portalInvite && shouldFlagRenewal(portalInvite, now)) {
      await this.prisma.patientPortalInvite.update({
        where: { id: portalInvite.id },
        data: { renewalRequestedAt: now },
      });
      await this.audit(userId, portalInvite, 'PATIENT.PORTAL.INVITE.RENEWAL_REQUEST', requestId);
    }
    if (staffInvite && shouldFlagRenewal(staffInvite, now)) {
      await this.prisma.staffInvite.update({
        where: { id: staffInvite.id },
        data: { renewalRequestedAt: now },
      });
      await this.audit(userId, staffInvite, 'STAFF.INVITE.RENEWAL_REQUEST', requestId);
    }
    return INVITE_RENEWAL_RECEIVED;
  }

  private audit(
    actorUserId: string,
    invite: { id: string; clinicId: string; status: string },
    action: string,
    requestId?: string,
  ) {
    return this.auditService.logWrite({
      clinicId: invite.clinicId,
      actorUserId,
      action,
      entityType: action.startsWith('STAFF') ? 'StaffInvite' : 'PatientPortalInvite',
      entityId: invite.id,
      // Status only; the address is already on the invitation row.
      afterJson: JSON.stringify({ status: invite.status, renewalRequested: true }),
      requestId,
    });
  }
}
