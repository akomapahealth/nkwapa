'use client';

import Link from 'next/link';
import { useBootstrap } from '@/lib/bootstrap-context';
import { STAFF_INVITE_ACCEPT_PATH } from '@/lib/auth-routing';
import { formatStaffRole } from '@/lib/staff-invite';
import { InlineNotice } from '@/components/ops/OpsShared';

/**
 * Tell someone who already works here that another clinic has invited them.
 *
 * An account with no role is sent straight to the acceptance page. An account that already holds
 * one keeps working, so the invitation is offered here instead of being imposed, and would
 * otherwise sit unseen until it lapsed.
 */
export function PendingStaffInviteNotice() {
  const invites = useBootstrap()?.bootstrap?.pendingStaffInvites ?? [];
  if (invites.length === 0) return null;

  const [first] = invites;
  const summary =
    invites.length === 1
      ? `${first.clinicName} has invited you to join as ${formatStaffRole(first.role)}.`
      : `You have ${invites.length} clinic invitations waiting.`;

  return (
    <InlineNotice tone="info" live={false}>
      {summary}{' '}
      <Link
        href={STAFF_INVITE_ACCEPT_PATH}
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        Review {invites.length === 1 ? 'invitation' : 'invitations'}
      </Link>
    </InlineNotice>
  );
}
