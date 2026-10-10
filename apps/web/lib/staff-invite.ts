import { apiFetch, readApiError, type GetToken } from './api';
import type {
  PortalInviteDelivery,
  PortalInviteIdentity,
  StatusDescription,
} from './portal-invite';

/**
 * Staff invitations, as the admin surface and the invitee see them.
 *
 * Mirrors `apps/api/src/staff-invites`. The identity and delivery shapes are the patient
 * invitation's, on purpose: an admin reads "is there an account behind this?" and "did the email
 * go out?" as two separate facts in both places.
 */

export type StaffInviteRole = 'MANAGER' | 'DOCTOR' | 'VOLUNTEER' | string;
export type StaffInviteStatus = 'PENDING' | 'ACCEPTED' | 'CANCELLED' | 'EXPIRED' | string;

export interface StaffInvite {
  id: string;
  clinicId: string;
  email: string;
  role: StaffInviteRole;
  status: StaffInviteStatus;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
  cancelledAt: string | null;
  invitedBy: string | null;
  acceptedBy: string | null;
  cancelledBy: string | null;
  identity: PortalInviteIdentity;
  emailDelivery: PortalInviteDelivery | null;
}

export interface StaffInviteList {
  invitableRoles: StaffInviteRole[];
  items: StaffInvite[];
}

/** An invitation addressed to the signed-in user. Mirrors `AcceptableStaffInvite` on the API. */
export interface PendingStaffInvite {
  id: string;
  clinicId: string;
  clinicName: string;
  role: StaffInviteRole;
  invitedBy: string | null;
  createdAt: string;
  expiresAt: string;
}

/** Mirrors SELECTABLE_STAFF_INVITE_TTL_HOURS on the API. */
export const STAFF_INVITE_TTL_CHOICES = [
  { hours: 24, label: '24 hours' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '7 days' },
] as const;
export const DEFAULT_STAFF_INVITE_TTL_HOURS = 72;

/** The refusal that asks the inviter to confirm, rather than a dead end. */
export const ADDRESS_IN_USE_CODE = 'STAFF_INVITE_ADDRESS_IN_USE';

const ROLE_LABELS: Record<string, string> = {
  SYSTEM_ADMIN: 'System Admin',
  DIRECTOR: 'Director',
  MANAGER: 'Manager',
  DOCTOR: 'Doctor',
  VOLUNTEER: 'Volunteer',
  PATIENT: 'Patient',
};

export function formatStaffRole(role: StaffInviteRole): string {
  return ROLE_LABELS[role] ?? role;
}

export function describeStaffInviteStatus(status: StaffInviteStatus): StatusDescription {
  switch (status) {
    case 'PENDING':
      return {
        label: 'Waiting to be accepted',
        variant: 'review',
        detail: 'The invitation is open. Nothing is granted until the person signs in and accepts.',
      };
    case 'ACCEPTED':
      return {
        label: 'Accepted',
        variant: 'finalized',
        detail: 'The person accepted and now holds this role.',
      };
    case 'CANCELLED':
      return {
        label: 'Cancelled',
        variant: 'outline',
        detail: 'This invitation can no longer be accepted.',
      };
    case 'EXPIRED':
      return {
        label: 'Expired',
        variant: 'warning',
        detail:
          'This invitation lapsed before it was accepted. Send a new one if it is still wanted.',
      };
    default:
      return { label: status, variant: 'outline', detail: '' };
  }
}

/**
 * Whether the invitee can act on the email: the same question the patient chart answers, in
 * words about a colleague rather than a patient.
 */
export function describeStaffInviteIdentity(
  identity: PortalInviteIdentity | null | undefined,
): { label: string; variant: StatusDescription['variant']; detail: string } | null {
  switch (identity?.status) {
    case 'PROVISIONED':
      return {
        label: 'Account created',
        variant: 'finalized',
        detail: 'They have been emailed a secure link to choose a password, then they accept.',
      };
    case 'EXISTING_PENDING':
      return {
        label: 'Account setup unfinished',
        variant: 'review',
        detail:
          'This address already had an unfinished account. Only the outstanding steps were sent; any password already chosen is untouched.',
      };
    case 'ALREADY_ACTIVE':
      return {
        label: 'Already has an account',
        variant: 'finalized',
        detail: 'No password email was needed. They sign in as usual and accept.',
      };
    case 'SKIPPED':
      return {
        label: 'Account not created',
        variant: 'warning',
        detail:
          'This server is not set up to create accounts, so they cannot sign in yet. Resend once an administrator has finished the setup.',
      };
    case 'FAILED':
      return {
        label: 'Account could not be created',
        variant: 'destructive',
        detail: describeIdentityFailure(identity.failureReason),
      };
    default:
      return null;
  }
}

function describeIdentityFailure(reason: string | null): string {
  switch (reason) {
    case 'IDENTITY_DISABLED':
      return 'An account with this address exists but has been disabled. A system admin has to re-enable it, or use a different address.';
    case 'KEYCLOAK_ADMIN_TIMEOUT':
    case 'KEYCLOAK_ADMIN_UNREACHABLE':
      return 'The sign-in service did not respond. The invitation still stands, so resend it in a few minutes.';
    case 'KEYCLOAK_ADMIN_AUTH_FAILED':
    case 'KEYCLOAK_ADMIN_UNCONFIGURED':
      return 'This server could not authenticate with the sign-in service. An administrator needs to check its credentials, then you can resend.';
    case 'APP_PUBLIC_URL_UNSET':
      return 'This server does not know its own public address, so it could not say where to return after setup. An administrator needs to set it, then you can resend.';
    default:
      return 'The account could not be created. The invitation still stands, so resend it, and ask an administrator to check if it keeps failing.';
  }
}

function clinicInvitesPath(clinicId: string, suffix = ''): string {
  return `/clinics/${encodeURIComponent(clinicId)}/staff-invites${suffix}`;
}

async function send<T>(
  path: string,
  init: { method: string; body?: string },
  getToken: GetToken,
  clinicId?: string,
): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    getToken,
    ...(clinicId ? { activeClinicId: clinicId } : {}),
  });
  if (!response.ok) {
    throw await readApiError(response);
  }
  return (await response.json()) as T;
}

export function listStaffInvites(clinicId: string, getToken: GetToken): Promise<StaffInviteList> {
  return send(clinicInvitesPath(clinicId), { method: 'GET' }, getToken, clinicId);
}

export function createStaffInvite(
  clinicId: string,
  getToken: GetToken,
  body: {
    email: string;
    role: StaffInviteRole;
    ttlHours?: number;
    confirmExistingAccount?: boolean;
  },
): Promise<StaffInvite> {
  return send(
    clinicInvitesPath(clinicId),
    { method: 'POST', body: JSON.stringify(body) },
    getToken,
    clinicId,
  );
}

export function resendStaffInvite(
  clinicId: string,
  inviteId: string,
  getToken: GetToken,
): Promise<StaffInvite> {
  return send(
    clinicInvitesPath(clinicId, `/${encodeURIComponent(inviteId)}/resend`),
    { method: 'POST' },
    getToken,
    clinicId,
  );
}

export function cancelStaffInvite(
  clinicId: string,
  inviteId: string,
  getToken: GetToken,
): Promise<StaffInvite> {
  return send(
    clinicInvitesPath(clinicId, `/${encodeURIComponent(inviteId)}`),
    { method: 'DELETE' },
    getToken,
    clinicId,
  );
}

/**
 * Accept, with the invitation's clinic as the active one. The invitee may hold no clinic yet, or
 * a different one, and the request's tenant context has to land on the clinic being joined.
 */
export function acceptStaffInvite(
  invite: Pick<PendingStaffInvite, 'id' | 'clinicId'>,
  getToken: GetToken,
): Promise<{ clinicId: string; clinicName: string; role: StaffInviteRole }> {
  return send(
    `/staff-invites/${encodeURIComponent(invite.id)}/accept`,
    { method: 'POST' },
    getToken,
    invite.clinicId,
  );
}
