import { apiFetch, type GetToken } from '@/lib/api';
import { readApiError } from '@/lib/ops';
import type { BadgeTone } from '@/lib/notification-delivery';

/**
 * Presentation rules and API calls for the portal invite lifecycle.
 *
 * Out of the chart component for the reason recorded at the top of
 * `notification-delivery.ts`: web unit tests run in a node environment with no DOM, so
 * anything left inside a component is untestable. Expiry arithmetic and the wording of a
 * status are exactly the things worth a test.
 */

export type PortalInviteStatus = 'PENDING' | 'CLAIMED' | 'CANCELLED' | 'EXPIRED' | string;
export type PortalAccessStatus = 'LINKED' | 'INVITED' | 'UNLINKED' | 'MERGED' | string;

export interface PortalInviteDelivery {
  status: string;
  failureReason: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface PortalInvite {
  id: string;
  status: PortalInviteStatus;
  email: string | null;
  phoneE164: string | null;
  createdAt: string;
  expiresAt: string | null;
  claimedAt: string | null;
  cancelledAt: string | null;
  createdByName: string | null;
  emailDelivery: PortalInviteDelivery | null;
}

export interface PortalAccess {
  status: PortalAccessStatus;
  linkedUserId: string | null;
  linkedKeycloakSub: string | null;
  mergedIntoPatientId: string | null;
  currentInvite: PortalInvite | null;
  previousInvites: PortalInvite[];
  emailChannel: { available: boolean; readiness: string; reason: string | null };
  claimUrl: string | null;
}

/** The lifetimes staff may choose. Mirrors SELECTABLE_PORTAL_INVITE_TTL_DAYS on the API. */
export const PORTAL_INVITE_TTL_CHOICES = [7, 14, 30] as const;
export const DEFAULT_PORTAL_INVITE_TTL_DAYS = 14;

export interface StatusDescription {
  label: string;
  variant: BadgeTone | 'default' | 'outline' | 'review';
  detail: string;
}

/**
 * What the portal state means, in words a volunteer can act on.
 *
 * The chart printed the raw enum — LINKED, INVITED, UNLINKED — twice, as the heading and
 * again as the badge. That is system vocabulary on a clinical surface, and it says nothing
 * about what to do next, which is the only reason the block is on the page.
 */
export function describePortalAccessStatus(status: PortalAccessStatus): StatusDescription {
  switch (status) {
    case 'LINKED':
      return {
        label: 'Portal account linked',
        variant: 'finalized',
        detail: 'This patient can sign in and see their own record.',
      };
    case 'INVITED':
      return {
        label: 'Invitation waiting',
        variant: 'review',
        detail: 'An invitation is staged. The patient claims their record on first sign-in.',
      };
    case 'MERGED':
      return {
        label: 'Chart merged',
        variant: 'draft',
        detail: 'This chart was merged into another one and cannot be claimed.',
      };
    default:
      return {
        label: 'No portal access',
        variant: 'draft',
        detail: 'Nobody can sign in to this record yet. Invite the patient or link an account.',
      };
  }
}

/**
 * What an individual invite's state means.
 *
 * Expired is a warning rather than a failure: nothing went wrong, the window closed. It is
 * the one state with an obvious next action, and colouring it destructive would put it in
 * the same visual class as an out-of-range clinical value.
 */
export function describeInviteStatus(status: PortalInviteStatus): StatusDescription {
  switch (status) {
    case 'PENDING':
      return {
        label: 'Waiting to be claimed',
        variant: 'review',
        detail: 'The patient has not signed in and claimed this record yet.',
      };
    case 'CLAIMED':
      return {
        label: 'Claimed',
        variant: 'finalized',
        detail: 'The patient claimed this record and now has portal access.',
      };
    case 'CANCELLED':
      return {
        label: 'Cancelled',
        variant: 'draft',
        detail: 'Staff cancelled this invitation before it was claimed.',
      };
    case 'EXPIRED':
      return {
        label: 'Expired',
        variant: 'warning',
        detail: 'This invitation passed its expiry date and can no longer be claimed.',
      };
    default:
      return { label: status, variant: 'draft', detail: '' };
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

export interface ExpiryDescription {
  /** A whole phrase, not a fragment: it is read on its own beside a badge. */
  label: string;
  tone: 'neutral' | 'warning' | 'expired';
  /** True once the window has closed, so callers do not repeat the comparison. */
  isExpired: boolean;
}

/**
 * How long an invitation has left.
 *
 * Relative rather than absolute because the question staff are asking is "do I need to
 * reissue this", and "expires in 2 days" answers it where "expires 4 September" makes
 * them work out today's date first.
 *
 * Anything inside a day is a warning: an invite the patient is unlikely to reach in time
 * should look different from one with a week left, before it becomes a problem.
 */
export function describeInviteExpiry(
  expiresAt: string | null,
  now: Date = new Date(),
): ExpiryDescription {
  if (!expiresAt) {
    return { label: 'No expiry set', tone: 'neutral', isExpired: false };
  }

  const target = new Date(expiresAt);
  if (Number.isNaN(target.getTime())) {
    return { label: 'No expiry set', tone: 'neutral', isExpired: false };
  }

  const diff = target.getTime() - now.getTime();
  if (diff <= 0) {
    return { label: `Expired ${formatElapsed(-diff)} ago`, tone: 'expired', isExpired: true };
  }

  return {
    label: `Expires in ${formatElapsed(diff)}`,
    tone: diff < MS_PER_DAY ? 'warning' : 'neutral',
    isExpired: false,
  };
}

/**
 * The largest unit that still describes the gap, rounded rather than truncated.
 *
 * Truncating looks right and reads wrong at exactly the moment staff are watching: an
 * invite created seconds ago with a seven-day lifetime has 6 days 23:59:58 left, and
 * `Math.floor` renders that as "Expires in 6 days" directly underneath the 7 they just
 * chose. The unit is still picked by the whole-unit threshold, so a gap under a day says
 * hours rather than being rounded up into one.
 */
function formatElapsed(ms: number): string {
  const days = ms / MS_PER_DAY;
  if (days >= 1) {
    return plural(Math.round(days), 'day');
  }
  const hours = ms / MS_PER_HOUR;
  if (hours >= 1) {
    return plural(Math.round(hours), 'hour');
  }
  return plural(Math.max(1, Math.round(ms / MS_PER_MINUTE)), 'minute');
}

function plural(count: number, unit: string): string {
  return count === 1 ? `1 ${unit}` : `${count} ${unit}s`;
}

/** The exact date, for the places a countdown is not specific enough. */
export function formatInviteDate(value: string | null): string {
  if (!value) return 'Not set';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not set';
  return parsed.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Which contact method the invitation was staged against, for the card and the history rows. */
export function describeInviteContact(invite: Pick<PortalInvite, 'email' | 'phoneE164'>): string {
  if (invite.email && invite.phoneE164) return `${invite.email} · ${invite.phoneE164}`;
  return invite.email ?? invite.phoneE164 ?? 'No contact method';
}

export interface ManualInstructionsInput {
  clinicName: string;
  patientCode: string;
  claimUrl: string | null;
  expiresAt: string | null;
}

/**
 * What staff read out or paste when email cannot carry the invitation.
 *
 * Phone-only invites send nothing by design, and a deployment with no SMTP configured
 * records every invite email as failed. In both cases the invitation is still valid — the
 * patient just has to be told about it another way, and until now there was no way to do
 * that from the chart short of copying a patient code out of a heading by hand.
 *
 * Deliberately excludes the patient's name and date of birth. The code and the claim
 * address are what the patient needs; everything else is identifying detail that would end
 * up pasted into WhatsApp.
 */
export function buildManualInviteInstructions(input: ManualInstructionsInput): string {
  const lines = [
    `${input.clinicName} has invited you to set up online access to your health record.`,
    '',
    `Patient code: ${input.patientCode}`,
  ];

  if (input.claimUrl) {
    lines.push(`Sign in at: ${input.claimUrl}`);
  }
  if (input.expiresAt) {
    lines.push(`Valid until: ${formatInviteDate(input.expiresAt)}`);
  }

  lines.push(
    '',
    'Create an account using the email address or phone number the clinic has on file, then confirm your patient code and date of birth.',
  );

  return lines.join('\n');
}

/**
 * Why an invitation email is not on its way.
 *
 * Three different situations produced the same silence on the chart: a phone-only invite
 * that never intended to send, a deployment with no SMTP so the send failed, and a send
 * that was refused by the mail server. Staff need to tell them apart, because only one of
 * them is worth chasing an administrator about.
 */
export function describeInviteDeliveryGap(
  invite: PortalInvite | null,
  emailChannel: PortalAccess['emailChannel'],
): { title: string; detail: string; tone: 'warning' | 'info' } | null {
  if (!invite) return null;

  if (!invite.email) {
    return {
      tone: 'info',
      title: 'No invitation email was sent',
      detail:
        'This invitation was staged against a phone number, so nothing was emailed. Give the patient the details below.',
    };
  }

  if (!emailChannel.available) {
    return {
      tone: 'warning',
      title: 'Email is not available on this server',
      detail:
        emailChannel.reason ??
        'Invitation emails cannot be delivered until an administrator finishes the mail configuration. Give the patient the details below in the meantime.',
    };
  }

  if (invite.emailDelivery?.status === 'FAILED') {
    return {
      tone: 'warning',
      title: 'The invitation email did not go out',
      detail:
        'Check the address, resend, or give the patient the details below so they can still claim their record.',
    };
  }

  return null;
}

export interface InviteMutationContext {
  clinicId: string;
  patientId: string;
  getToken: GetToken;
}

function invitePath(clinicId: string, patientId: string, suffix = ''): string {
  return `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/portal-invite${suffix}`;
}

async function mutate(
  path: string,
  init: { method: string; body?: string },
  context: InviteMutationContext,
): Promise<void> {
  const response = await apiFetch(path, {
    ...init,
    getToken: context.getToken,
    activeClinicId: context.clinicId,
  });
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
}

export async function createPortalInvite(
  context: InviteMutationContext,
  body: { email?: string; phoneE164?: string; ttlDays?: number },
): Promise<void> {
  return mutate(
    invitePath(context.clinicId, context.patientId),
    { method: 'POST', body: JSON.stringify(body) },
    context,
  );
}

export async function resendPortalInvite(
  context: InviteMutationContext,
  inviteId: string,
): Promise<void> {
  return mutate(
    invitePath(context.clinicId, context.patientId, `/${encodeURIComponent(inviteId)}/resend`),
    { method: 'POST' },
    context,
  );
}

export async function cancelPortalInvite(
  context: InviteMutationContext,
  inviteId: string,
): Promise<void> {
  return mutate(
    invitePath(context.clinicId, context.patientId, `/${encodeURIComponent(inviteId)}`),
    { method: 'DELETE' },
    context,
  );
}
