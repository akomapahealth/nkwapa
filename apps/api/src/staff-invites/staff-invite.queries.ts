import type { Prisma, UserRole } from '@prisma/client';
import { acceptableStaffInviteWhere } from '../common/staff-invite-lifecycle';

/** What a signed-in invitee is shown about an invitation addressed to them. */
export interface AcceptableStaffInvite {
  id: string;
  clinicId: string;
  clinicName: string;
  role: UserRole;
  invitedBy: string | null;
  createdAt: string;
  expiresAt: string;
}

type StaffInviteReader = {
  user: Pick<Prisma.TransactionClient['user'], 'findUnique'>;
  staffInvite: Pick<Prisma.TransactionClient['staffInvite'], 'findMany'>;
};

/**
 * The invitations this user can accept right now.
 *
 * A plain function over a client rather than a service method, because whoami needs it and the
 * auth module must not depend on the staff-invite module. It relies on the request's tenant
 * context already covering the invitation's clinic, which the RLS interceptor arranges from the
 * same `acceptableStaffInviteWhere` clause, so the widening and this read can never disagree
 * about which invitations are live.
 */
export async function findAcceptableStaffInvites(
  client: StaffInviteReader,
  userId: string,
  now: Date,
): Promise<AcceptableStaffInvite[]> {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { email: true, isActive: true },
  });
  // A deactivated account is not offered a way back in through an invitation.
  if (!user?.isActive) {
    return [];
  }

  const where = acceptableStaffInviteWhere(user.email, now);
  if (!where) {
    return [];
  }

  const invites = await client.staffInvite.findMany({
    where: { ...where, clinic: { isActive: true } },
    select: {
      id: true,
      clinicId: true,
      role: true,
      createdAt: true,
      expiresAt: true,
      clinic: { select: { name: true } },
      createdBy: { select: { displayName: true } },
    },
    orderBy: [{ createdAt: 'desc' }],
  });

  return invites.map((invite) => ({
    id: invite.id,
    clinicId: invite.clinicId,
    clinicName: invite.clinic.name,
    role: invite.role,
    invitedBy: invite.createdBy?.displayName ?? null,
    createdAt: invite.createdAt.toISOString(),
    expiresAt: invite.expiresAt.toISOString(),
  }));
}
