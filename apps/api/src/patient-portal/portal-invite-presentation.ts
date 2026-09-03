/**
 * How an invite's state is described back to a human, and the audit action the expiry
 * transition is recorded under.
 *
 * Separate from the lifecycle rules because these strings reach two different audiences —
 * staff on the chart and a patient on the claim form — and because a refusal that only
 * says "not found" is the dead end this work exists to remove. A patient holding a real
 * invitation email needs to be told that it lapsed and what to do next, not that it never
 * existed.
 */

/** Written by both the on-access expiry and the hourly sweep, so the trail reads as one thing. */
export const PORTAL_INVITE_EXPIRE_ACTION = 'PATIENT.PORTAL.INVITE.EXPIRE';

/**
 * Which path noticed the lapse first.
 *
 * Recorded because the two mean different things operationally: `on-access` says a person
 * was in the middle of trying to use the invite, `scheduled-sweep` says nobody was.
 */
export type PortalInviteExpiryTrigger = 'on-access' | 'scheduled-sweep';

/**
 * The audit event for an expiry transition, built once so both callers write the same row.
 *
 * They record the same transition from different places, and an audit trail where the same
 * event has two shapes depending on which code path reached it is one nobody can query.
 */
export function buildInviteExpiryAudit(
  invite: { id: string; clinicId: string; expiresAt: Date | null },
  trigger: PortalInviteExpiryTrigger,
  actorUserId: string,
  requestId?: string,
) {
  return {
    clinicId: invite.clinicId,
    actorUserId,
    action: PORTAL_INVITE_EXPIRE_ACTION,
    entityType: 'PatientPortalInvite',
    entityId: invite.id,
    beforeJson: JSON.stringify({ status: 'PENDING', expiresAt: invite.expiresAt }),
    afterJson: JSON.stringify({ status: 'EXPIRED', trigger }),
    ...(requestId ? { requestId } : {}),
  };
}

const STAFF_STATE_LABELS: Record<string, string> = {
  PENDING: 'pending',
  CLAIMED: 'already claimed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
};

/** Lower-case so it drops into a sentence; never the raw enum, which is system vocabulary. */
export function describeInviteStateForStaff(status: string): string {
  return STAFF_STATE_LABELS[status] ?? status.toLowerCase();
}

/**
 * The expiry date as it appears in a refusal message.
 *
 * Deliberately date-only and UTC-stable. This message is read by a patient who wants to
 * know whether they are days or months late, and naming an hour would invite an argument
 * about a timezone neither side can see.
 */
export function formatInviteExpiryDate(expiresAt: Date | null): string {
  if (!expiresAt) {
    return 'an earlier date';
  }
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(expiresAt);
}
