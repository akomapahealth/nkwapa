import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, type PortalInviteIdentityStatus, type StaffInvite } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ReminderService } from '../reminders/reminder.service';
import { KeycloakAdminService } from '../keycloak/keycloak-admin.service';
import { EmailDeliverabilityService } from '../common/email-policy';
import { resolveAppPublicUrl } from '../notifications/email/email-config';
import { describeInviteAccountSetup } from '../common/invite-account-setup';
import { resolveIdentityActionLifespanSeconds } from '../common/portal-invite-lifecycle';
import {
  INVITABLE_STAFF_ROLES,
  buildStaffInviteAcceptUrl,
  buildStaffInviteRedirectUri,
  effectiveStaffInviteStatus,
  invitableRolesFor,
  isSharedMailboxAddress,
  isStaffInviteExpired,
  resolveStaffInviteExpiry,
  type StaffInviteActorRole,
} from '../common/staff-invite-lifecycle';
import { findAcceptableStaffInvites } from './staff-invite.queries';
import type { CreateStaffInviteDto } from './dto/staff-invite.dto';

export interface StaffInviteActor {
  userId: string;
  roles: StaffInviteActorRole[];
}

type Delivery = {
  status: string;
  failureReason: string | null;
  sentAt: Date | null;
  createdAt: Date;
} | null;

type IdentityFields = Pick<
  StaffInvite,
  'identityStatus' | 'keycloakUserId' | 'identityProvisionedAt' | 'identityFailureReason'
>;

/** How many invitations the admin list shows. Older ones stay in the audit trail. */
const STAFF_INVITE_LIST_LIMIT = 100;

const ROLE_LABELS: Record<string, string> = {
  MANAGER: 'Manager',
  DOCTOR: 'Doctor',
  VOLUNTEER: 'Volunteer',
  DIRECTOR: 'Director',
  SYSTEM_ADMIN: 'System Admin',
  PATIENT: 'Patient',
};

/**
 * Staff invitations: issue, resend, cancel, accept.
 *
 * Built on the same identity machinery as the patient invitation (a Keycloak account created at
 * send time, a password email from Keycloak, a context email from us that names it), and held to
 * stricter rules, because what it grants is a role over other people's records rather than
 * access to one's own. Those rules live in `staff-invite-lifecycle.ts`; this service applies
 * them and records every step.
 *
 * Every write here runs inside the request's single RLS transaction. That is why refusals never
 * write on their way out: a write made before a throw is rolled back by the same exception.
 */
@Injectable()
export class StaffInviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly reminderService: ReminderService,
    private readonly keycloakAdminService: KeycloakAdminService,
    private readonly emailDeliverabilityService: EmailDeliverabilityService,
  ) {}

  async listForClinic(actor: StaffInviteActor, clinicId: string) {
    await this.assertActiveClinic(clinicId);
    this.assertCanInviteInto(actor, clinicId);

    const invites = await this.prisma.staffInvite.findMany({
      where: { clinicId },
      include: {
        createdBy: { select: { displayName: true } },
        acceptedBy: { select: { displayName: true } },
        cancelledBy: { select: { displayName: true } },
        reminders: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { status: true, failureReason: true, sentAt: true, createdAt: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: STAFF_INVITE_LIST_LIMIT,
    });

    const now = new Date();
    return {
      invitableRoles: invitableRolesFor(actor.roles, clinicId),
      items: invites.map((invite) =>
        this.serialize(invite, invite.reminders[0] ?? null, now, {
          invitedBy: invite.createdBy?.displayName ?? null,
          acceptedBy: invite.acceptedBy?.displayName ?? null,
          cancelledBy: invite.cancelledBy?.displayName ?? null,
        }),
      ),
    };
  }

  async create(
    actor: StaffInviteActor,
    clinicId: string,
    dto: CreateStaffInviteDto,
    requestId?: string,
  ) {
    const clinic = await this.assertActiveClinic(clinicId);
    this.assertCanGrant(actor, clinicId, dto.role);

    const email = dto.email.trim().toLowerCase();
    if (isSharedMailboxAddress(email)) {
      throw new BadRequestException({
        code: 'STAFF_INVITE_SHARED_MAILBOX',
        message: `${email} looks like a shared inbox. A staff invitation has no second check, so whoever reads that inbox would get the role.`,
        recoveryAction: 'Ask the person for an address only they read, and invite that instead.',
      });
    }
    await this.emailDeliverabilityService.assertDomainAcceptsEmail(email);

    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: {
        id: true,
        isActive: true,
        clinicRoles: { select: { clinicId: true, role: true } },
      },
    });
    if (existing) {
      this.assertExistingAccountMayBeInvited(existing, clinicId, dto);
    }

    const now = new Date();
    const expiresAt = resolveStaffInviteExpiry(dto.ttlHours, now);

    // A new invitation replaces a live one to the same address in the same clinic. The partial
    // unique index enforces one live invitation; this is what keeps a re-issue from tripping it.
    const superseded = await this.prisma.staffInvite.findMany({
      where: { clinicId, email, status: 'PENDING' },
      select: { id: true, role: true, expiresAt: true },
    });
    if (superseded.length > 0) {
      await this.prisma.staffInvite.updateMany({
        where: { id: { in: superseded.map((row) => row.id) }, status: 'PENDING' },
        data: { status: 'CANCELLED', cancelledAt: now, cancelledByUserId: actor.userId },
      });
    }

    const invite = await this.prisma.staffInvite.create({
      data: {
        clinicId,
        email,
        role: dto.role,
        expiresAt,
        createdByUserId: actor.userId,
      },
    });

    for (const previous of superseded) {
      await this.auditService.logWrite({
        clinicId,
        actorUserId: actor.userId,
        action: 'STAFF.INVITE.CANCEL',
        entityType: 'StaffInvite',
        entityId: previous.id,
        beforeJson: JSON.stringify({ status: 'PENDING', role: previous.role }),
        afterJson: JSON.stringify({ status: 'CANCELLED', reason: 'superseded', by: invite.id }),
        requestId,
      });
    }
    await this.auditService.logWrite({
      clinicId,
      actorUserId: actor.userId,
      action: 'STAFF.INVITE.CREATE',
      entityType: 'StaffInvite',
      entityId: invite.id,
      afterJson: JSON.stringify({
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
        existingAccount: Boolean(existing),
      }),
      requestId,
    });

    // Before the email, so the message never arrives ahead of the account it describes.
    const identity = await this.provisionIdentity(invite, actor.userId, requestId);
    const delivery = await this.sendInviteEmail(
      { ...invite, ...identity },
      clinic,
      actor.userId,
      existing?.id ?? null,
      false,
      requestId,
    );

    return this.serialize({ ...invite, ...identity }, delivery, new Date());
  }

  /**
   * Send the invitation again.
   *
   * Idempotent by construction: provisioning reads Keycloak's own state, so a resend asks only
   * for the setup that is still outstanding and never resets a password already chosen.
   */
  async resend(actor: StaffInviteActor, clinicId: string, inviteId: string, requestId?: string) {
    const clinic = await this.assertActiveClinic(clinicId);
    const invite = await this.findClinicInvite(clinicId, inviteId);
    this.assertCanGrant(actor, clinicId, invite.role);
    this.assertStillOpen(invite, 'resend');

    await this.auditService.logWrite({
      clinicId,
      actorUserId: actor.userId,
      action: 'STAFF.INVITE.RESEND',
      entityType: 'StaffInvite',
      entityId: invite.id,
      afterJson: JSON.stringify({ email: invite.email, role: invite.role }),
      requestId,
    });

    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: invite.email, mode: 'insensitive' } },
      select: { id: true },
    });
    const identity = await this.provisionIdentity(invite, actor.userId, requestId);
    const delivery = await this.sendInviteEmail(
      { ...invite, ...identity },
      clinic,
      actor.userId,
      existing?.id ?? null,
      true,
      requestId,
    );

    return this.serialize({ ...invite, ...identity }, delivery, new Date());
  }

  async cancel(actor: StaffInviteActor, clinicId: string, inviteId: string, requestId?: string) {
    await this.assertActiveClinic(clinicId);
    const invite = await this.findClinicInvite(clinicId, inviteId);
    this.assertCanGrant(actor, clinicId, invite.role);
    this.assertStillOpen(invite, 'cancel');

    const now = new Date();
    const settled = await this.prisma.staffInvite.updateMany({
      where: { id: invite.id, status: 'PENDING' },
      data: { status: 'CANCELLED', cancelledAt: now, cancelledByUserId: actor.userId },
    });
    if (settled.count === 0) {
      throw new ConflictException({
        code: 'STAFF_INVITE_CHANGED',
        message: 'This invitation was accepted or cancelled a moment ago.',
        recoveryAction: 'Refresh the list to see where it stands.',
      });
    }

    await this.auditService.logWrite({
      clinicId,
      actorUserId: actor.userId,
      action: 'STAFF.INVITE.CANCEL',
      entityType: 'StaffInvite',
      entityId: invite.id,
      beforeJson: JSON.stringify({ status: 'PENDING', role: invite.role }),
      afterJson: JSON.stringify({ status: 'CANCELLED' }),
      requestId,
    });

    return this.serialize({ ...invite, status: 'CANCELLED', cancelledAt: now }, null, now);
  }

  /** The invitations the signed-in user can accept. */
  async listMine(userId: string) {
    return { items: await findAcceptableStaffInvites(this.prisma, userId, new Date()) };
  }

  /**
   * Accept an invitation and take up the role it offers.
   *
   * The role is granted immediately, as the issue recommends, with the acceptance and the grant
   * both audited. What makes that safe is who can reach this far: the invitation must be addressed
   * to the caller's *verified* email, still be open, and, when Keycloak recorded which identity it
   * provisioned, be accepted by that identity and no other.
   */
  async accept(userId: string, inviteId: string, requestId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, isActive: true, keycloakSub: true },
    });
    if (!user?.isActive) {
      throw new ForbiddenException(
        'This account has been deactivated and cannot accept invitations.',
      );
    }
    const verifiedEmail = user.email?.trim().toLowerCase();
    if (!verifiedEmail) {
      throw new ForbiddenException({
        code: 'STAFF_INVITE_EMAIL_UNVERIFIED',
        message:
          'Your account has no verified email address, so no invitation can be matched to it.',
        recoveryAction: 'Finish verifying your email from the setup email, then sign in again.',
      });
    }

    // Found by address as well as id, so an invitation to somebody else reads as not found
    // rather than confirming it exists.
    const invite = await this.prisma.staffInvite.findFirst({
      where: { id: inviteId, email: verifiedEmail },
      include: { clinic: { select: { id: true, name: true, isActive: true } } },
    });
    if (!invite) {
      throw new NotFoundException({
        code: 'STAFF_INVITE_NOT_FOUND',
        message:
          'There is no open invitation for this account. It may have expired or been cancelled.',
        recoveryAction:
          'Check you signed in with the address the invitation was sent to, or ask for a new one.',
      });
    }

    if (invite.status === 'ACCEPTED' && invite.acceptedByUserId === user.id) {
      // A double click, or a refresh after the first acceptance landed. Nothing left to do.
      return this.acceptanceResult(invite);
    }
    this.assertStillOpen(invite, 'accept');
    if (!invite.clinic.isActive) {
      throw new ConflictException({
        code: 'STAFF_INVITE_CLINIC_INACTIVE',
        message: `${invite.clinic.name} is no longer active on Nkwapa.`,
        recoveryAction: 'Contact the person who invited you.',
      });
    }
    if (invite.keycloakUserId && invite.keycloakUserId !== user.keycloakSub) {
      // The address matches but the identity does not: someone else holds an account on this
      // address. Keycloak keeps emails unique, so this should never happen, and if it does it
      // is exactly the case where granting a role would be wrong.
      throw new ForbiddenException({
        code: 'STAFF_INVITE_IDENTITY_MISMATCH',
        message: 'This invitation was set up for a different account.',
        recoveryAction: 'Contact the person who invited you so they can send a new one.',
      });
    }

    const now = new Date();
    const settled = await this.prisma.staffInvite.updateMany({
      where: { id: invite.id, status: 'PENDING', expiresAt: { gt: now } },
      data: { status: 'ACCEPTED', acceptedAt: now, acceptedByUserId: user.id },
    });
    if (settled.count === 0) {
      throw new ConflictException({
        code: 'STAFF_INVITE_CHANGED',
        message: 'This invitation was cancelled or expired a moment ago.',
        recoveryAction: 'Ask the person who invited you to send a new one.',
      });
    }

    await this.auditService.logWrite({
      clinicId: invite.clinicId,
      actorUserId: user.id,
      action: 'STAFF.INVITE.ACCEPT',
      entityType: 'StaffInvite',
      entityId: invite.id,
      beforeJson: JSON.stringify({ status: 'PENDING' }),
      afterJson: JSON.stringify({ status: 'ACCEPTED', role: invite.role }),
      requestId,
    });

    const held = await this.prisma.userClinicRole.findFirst({
      where: { userId: user.id, clinicId: invite.clinicId, role: invite.role },
      select: { id: true },
    });
    if (!held) {
      const granted = await this.prisma.userClinicRole.create({
        data: { userId: user.id, clinicId: invite.clinicId, role: invite.role },
      });
      await this.auditService.logWrite({
        clinicId: invite.clinicId,
        actorUserId: user.id,
        action: 'ROLE.GRANT',
        entityType: 'UserClinicRole',
        entityId: granted.id,
        afterJson: JSON.stringify({
          ...granted,
          source: 'STAFF_INVITE',
          staffInviteId: invite.id,
          invitedByUserId: invite.createdByUserId,
        }),
        requestId,
      });
    }

    return this.acceptanceResult(invite);
  }

  private acceptanceResult(invite: { clinicId: string; role: UserRole; clinic: { name: string } }) {
    return { clinicId: invite.clinicId, clinicName: invite.clinic.name, role: invite.role };
  }

  private async assertActiveClinic(clinicId: string) {
    const clinic = await this.prisma.clinic.findFirst({
      where: { id: clinicId, isActive: true },
      select: { id: true, name: true, timezone: true },
    });
    if (!clinic) {
      throw new NotFoundException('Clinic not found');
    }
    return clinic;
  }

  private assertCanInviteInto(actor: StaffInviteActor, clinicId: string) {
    if (invitableRolesFor(actor.roles, clinicId).length === 0) {
      throw new ForbiddenException(
        'Only a director of this clinic or a system admin can invite staff to it.',
      );
    }
  }

  /** The role ceiling, applied here as well as behind the permission guard. */
  private assertCanGrant(actor: StaffInviteActor, clinicId: string, role: UserRole) {
    this.assertCanInviteInto(actor, clinicId);
    if (!invitableRolesFor(actor.roles, clinicId).includes(role)) {
      const allowed = INVITABLE_STAFF_ROLES.map((entry) => ROLE_LABELS[entry]).join(', ');
      throw new ForbiddenException({
        code: 'STAFF_INVITE_ROLE_NOT_INVITABLE',
        message: `An invitation cannot grant ${ROLE_LABELS[role] ?? role} access. It can grant ${allowed}.`,
        recoveryAction:
          role === UserRole.PATIENT
            ? 'Invite a patient from their chart instead.'
            : 'Director and System Admin access is assigned by hand on the users page.',
      });
    }
  }

  private assertExistingAccountMayBeInvited(
    existing: {
      isActive: boolean;
      clinicRoles: Array<{ clinicId: string | null; role: UserRole }>;
    },
    clinicId: string,
    dto: CreateStaffInviteDto,
  ) {
    if (!existing.isActive) {
      // Re-admitting a deactivated account through an invitation would quietly undo a decision
      // someone took on purpose.
      throw new ConflictException({
        code: 'STAFF_INVITE_ACCOUNT_DEACTIVATED',
        message: 'This address belongs to an account that has been deactivated.',
        recoveryAction: 'A system admin has to reactivate it before it can be given a role.',
      });
    }
    if (
      existing.clinicRoles.some((entry) => entry.clinicId === clinicId && entry.role === dto.role)
    ) {
      throw new ConflictException({
        code: 'STAFF_INVITE_ROLE_ALREADY_HELD',
        message: `This person already has ${ROLE_LABELS[dto.role] ?? dto.role} access in this clinic.`,
        recoveryAction: 'There is nothing to invite them to.',
      });
    }

    /*
      Only a staff role triggers the warning. An address that belongs to a patient account is
      not reported: telling a director that someone is a patient somewhere is not theirs to know,
      and a patient who also volunteers is ordinary. The person still has to sign in to that
      account and accept, which is the check that matters.
    */
    const holdsStaffRole = existing.clinicRoles.some((entry) => entry.role !== UserRole.PATIENT);
    if (holdsStaffRole && dto.confirmExistingAccount !== true) {
      throw new ConflictException({
        code: 'STAFF_INVITE_ADDRESS_IN_USE',
        message:
          'This address already belongs to a staff account. Accepting would add this role to that account.',
        recoveryAction:
          'If that is the person you mean, confirm and send again. If the address is shared, ask for one only they read.',
      });
    }
  }

  private async findClinicInvite(clinicId: string, inviteId: string) {
    const invite = await this.prisma.staffInvite.findFirst({ where: { id: inviteId, clinicId } });
    if (!invite) {
      throw new NotFoundException('Staff invitation not found');
    }
    return invite;
  }

  private assertStillOpen(invite: { status: string; expiresAt: Date }, action: string) {
    if (invite.status === 'PENDING' && !isStaffInviteExpired(invite, new Date())) {
      return;
    }
    const state = effectiveStaffInviteStatus(invite, new Date()).toLowerCase();
    throw new BadRequestException({
      code: 'STAFF_INVITE_CLOSED',
      message: `This invitation is ${state}, so there is nothing to ${action}.`,
      recoveryAction:
        action === 'accept'
          ? 'Ask the person who invited you to send a new one.'
          : 'Send a new invitation instead.',
    });
  }

  /**
   * Make sure the invited address can sign in, and record what happened.
   *
   * Never throws, like the patient path: a clinic must be able to invite someone while Keycloak
   * is down. The invitation exists, the admin list says no account stands behind it, and a
   * resend finishes the job.
   */
  private async provisionIdentity(
    invite: StaffInvite,
    actorUserId: string,
    requestId?: string,
  ): Promise<IdentityFields> {
    const appPublicUrl = resolveAppPublicUrl();
    const result = appPublicUrl
      ? await this.keycloakAdminService.provisionInvitedIdentity({
          email: invite.email,
          firstName: null,
          lastName: null,
          claimRedirectUri: buildStaffInviteRedirectUri(appPublicUrl),
          lifespanSeconds: resolveIdentityActionLifespanSeconds(invite.expiresAt, new Date()),
        })
      : {
          outcome: 'SKIPPED' as const,
          keycloakUserId: null,
          actionsSent: [],
          failureReason: 'APP_PUBLIC_URL_UNSET',
        };

    const identity: IdentityFields = {
      identityStatus: result.outcome,
      keycloakUserId: result.keycloakUserId,
      identityProvisionedAt: new Date(),
      identityFailureReason: result.failureReason,
    };
    await this.prisma.staffInvite.update({ where: { id: invite.id }, data: identity });

    await this.auditService.logWrite({
      clinicId: invite.clinicId,
      actorUserId,
      action: 'STAFF.INVITE.IDENTITY',
      entityType: 'StaffInvite',
      entityId: invite.id,
      afterJson: JSON.stringify({
        outcome: result.outcome,
        actionsSent: result.actionsSent,
        failureReason: result.failureReason,
        keycloakUserId: result.keycloakUserId,
      }),
      requestId,
    });

    return identity;
  }

  private async sendInviteEmail(
    invite: StaffInvite,
    clinic: { name: string; timezone: string },
    actorUserId: string,
    recipientUserId: string | null,
    resend: boolean,
    requestId?: string,
  ) {
    const inviter = await this.prisma.user.findUnique({
      where: { id: invite.createdByUserId },
      select: { displayName: true },
    });
    const appPublicUrl = resolveAppPublicUrl();

    return this.reminderService.sendNotificationNow({
      clinicId: invite.clinicId,
      recipientType: 'USER',
      recipientUserId,
      staffInviteId: invite.id,
      toAddress: invite.email,
      templateKey: 'STAFF_INVITE_V1',
      payload: {
        clinicName: clinic.name,
        timezone: clinic.timezone,
        role: invite.role,
        inviterName: inviter?.displayName ?? null,
        acceptUrl: appPublicUrl ? buildStaffInviteAcceptUrl(appPublicUrl) : null,
        expiresAt: invite.expiresAt.toISOString(),
        resend,
        accountSetup: describeInviteAccountSetup(invite.identityStatus),
      },
      actorUserId,
      requestId,
    });
  }

  private serialize(
    invite: Pick<
      StaffInvite,
      | 'id'
      | 'clinicId'
      | 'email'
      | 'role'
      | 'status'
      | 'expiresAt'
      | 'createdAt'
      | 'acceptedAt'
      | 'cancelledAt'
    > & {
      identityStatus: PortalInviteIdentityStatus;
      identityProvisionedAt: Date | null;
      identityFailureReason: string | null;
    },
    delivery: Delivery,
    now: Date,
    people: {
      invitedBy?: string | null;
      acceptedBy?: string | null;
      cancelledBy?: string | null;
    } = {},
  ) {
    return {
      id: invite.id,
      clinicId: invite.clinicId,
      email: invite.email,
      role: invite.role,
      // What an admin can act on. Between sweeps a lapsed row still stores PENDING.
      status: effectiveStaffInviteStatus(invite, now),
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
      acceptedAt: invite.acceptedAt?.toISOString() ?? null,
      cancelledAt: invite.cancelledAt?.toISOString() ?? null,
      invitedBy: people.invitedBy ?? null,
      acceptedBy: people.acceptedBy ?? null,
      cancelledBy: people.cancelledBy ?? null,
      // Separate from delivery, as on the patient chart: an email that arrived pointing at an
      // account that was never created is the failure this exists to show.
      identity: {
        status: invite.identityStatus,
        provisionedAt: invite.identityProvisionedAt?.toISOString() ?? null,
        failureReason: invite.identityFailureReason,
      },
      emailDelivery: delivery
        ? {
            status: delivery.status,
            failureReason: delivery.failureReason,
            sentAt: delivery.sentAt?.toISOString() ?? null,
            createdAt: delivery.createdAt.toISOString(),
          }
        : null,
    };
  }
}
