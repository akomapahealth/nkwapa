import type { BadgeTone } from '@/lib/notification-delivery';

/**
 * Whether the sign-in identity behind a user matches their Nkwapa access. Issue #126.
 *
 * Mirrors UserIdentitySyncStatus on the API. The account state and the identity state are two
 * facts, like invitation delivery and account creation on the patient chart: the local block
 * always lands, the identity half may not, and "deactivated here, can still sign in" has to be
 * visible to be fixed.
 */
export type IdentitySyncStatus =
  | 'NOT_SYNCED'
  | 'PENDING'
  | 'IN_SYNC'
  | 'FAILED'
  | 'SKIPPED'
  | string;

export interface IdentitySync {
  status: IdentitySyncStatus;
  failureReason: string | null;
  requestedAt?: string | null;
  syncedAt?: string | null;
}

export interface IdentitySyncDescription {
  label: string;
  variant: BadgeTone | 'default' | 'outline' | 'review';
  detail: string;
  /** The state is wrong or unknown, and a sync is the fix. */
  offerSync: boolean;
}

/**
 * Null when there is nothing worth saying: an active user whose identity was never touched is
 * the normal case for every account in the system.
 */
export function describeIdentitySync(
  isActive: boolean,
  sync: IdentitySync | null | undefined,
): IdentitySyncDescription | null {
  const status = sync?.status ?? 'NOT_SYNCED';
  const reason = sync?.failureReason ?? null;

  if (status === 'PENDING') {
    return {
      label: isActive ? 'Enabling sign-in…' : 'Disabling sign-in…',
      variant: 'review',
      detail: reason
        ? `The sign-in service did not answer (${describeReason(reason)}). Retrying automatically.`
        : 'This takes a few seconds. Refresh to see the result.',
      offerSync: false,
    };
  }

  if (status === 'SKIPPED') {
    return {
      label: isActive ? 'Sign-in not managed here' : 'Sign-in not disabled',
      variant: 'warning',
      detail:
        'This server is not connected to the sign-in service, so the identity was left as it was. An administrator has to change it in Keycloak, or finish the service account setup and sync.',
      offerSync: true,
    };
  }

  if (status === 'FAILED') {
    return isActive
      ? {
          label: 'Cannot sign in',
          variant: 'destructive',
          detail: `The account is active, but the sign-in identity could not be re-enabled: ${describeReason(reason)}. Sync to try again.`,
          offerSync: true,
        }
      : {
          label: 'Can still sign in',
          variant: 'destructive',
          detail: `Access to Nkwapa is blocked, but the sign-in identity could not be disabled: ${describeReason(reason)}. Sync to try again.`,
          offerSync: true,
        };
  }

  if (isActive) {
    return null;
  }

  if (status === 'IN_SYNC') {
    return {
      label: 'Sign-in disabled',
      variant: 'finalized',
      detail: 'The sign-in identity is disabled and its sessions were ended.',
      offerSync: false,
    };
  }

  // Deactivated before identities were managed from here.
  return {
    label: 'Sign-in not yet disabled',
    variant: 'warning',
    detail:
      'This account was deactivated before sign-in was managed from Nkwapa, so its password may still work elsewhere. Sync to disable it.',
    offerSync: true,
  };
}

function describeReason(reason: string | null): string {
  switch (reason) {
    case 'KEYCLOAK_ADMIN_TIMEOUT':
    case 'KEYCLOAK_ADMIN_UNREACHABLE':
      return 'the sign-in service did not respond';
    case 'KEYCLOAK_ADMIN_AUTH_FAILED':
    case 'KEYCLOAK_ADMIN_UNCONFIGURED':
      return 'this server could not authenticate with the sign-in service';
    case 'IDENTITY_NOT_FOUND':
      return 'no sign-in identity exists for this account';
    case 'QUEUE_UNAVAILABLE':
      return 'the background job could not be queued';
    default:
      return 'the sign-in service refused the change';
  }
}
