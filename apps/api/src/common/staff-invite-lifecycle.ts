import { UserRole, type Prisma } from '@prisma/client';
import { PORTAL_CLAIM_CONTINUE_QUERY } from './portal-invite-lifecycle';

/**
 * The rules a staff invitation lives by, stated once.
 *
 * A patient invitation grants one record, and the invitee still has to name it with a patient
 * code and a date of birth. A staff invitation grants a role over other people's clinical data,
 * and possession of the inbox is the only proof asked for. Every rule here exists because of that
 * difference: who may grant which role, how long the offer stays open, and which addresses are
 * too likely to be read by the wrong person to be trusted with it.
 *
 * Free of Nest DI and repository imports, for the same reason as `portal-invite-lifecycle.ts`: the
 * RLS interceptor, the auth controller and the invite service all read it without a module cycle.
 */

/** A staff invitation is an offer of access, so it is kept short. Patient invites default to 14 days. */
export const DEFAULT_STAFF_INVITE_TTL_HOURS = 72;

/** What an inviter may pick. A week is the longest a role offer should sit in an inbox. */
export const SELECTABLE_STAFF_INVITE_TTL_HOURS = [24, 72, 168] as const;

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * The roles an invitation can carry at all, whoever is asking.
 *
 * DIRECTOR and SYSTEM_ADMIN are left out on purpose: granting them stays a manual, deliberate
 * act. PATIENT has its own invitation, with its own second factor. The migration's
 * `StaffInvite_role_check` holds the same line in the database.
 */
export const INVITABLE_STAFF_ROLES: readonly UserRole[] = [
  UserRole.MANAGER,
  UserRole.DOCTOR,
  UserRole.VOLUNTEER,
];

export interface StaffInviteActorRole {
  clinicId: string | null;
  role: UserRole | string;
}

/**
 * The roles this actor may put in an invitation to this clinic.
 *
 * The ceiling: nobody grants a role at or above their own. A SYSTEM_ADMIN may invite any
 * invitable role into any clinic. A DIRECTOR may invite into a clinic they direct, and nowhere
 * else, which is checked here from their role rows rather than trusted from the route. A MANAGER
 * invites nobody. That keeps staff onboarding with the two seats the issue names, and a manager's
 * existing lifecycle authority (deactivating DOCTOR and VOLUNTEER seats) is unaffected.
 *
 * Returns an empty list rather than throwing, so the caller decides how to phrase the refusal.
 */
export function invitableRolesFor(
  actorRoles: readonly StaffInviteActorRole[],
  clinicId: string,
): UserRole[] {
  const isSystemAdmin = actorRoles.some(
    (entry) => entry.role === UserRole.SYSTEM_ADMIN && entry.clinicId === null,
  );
  if (isSystemAdmin) {
    return [...INVITABLE_STAFF_ROLES];
  }

  const directsClinic = actorRoles.some(
    (entry) => entry.role === UserRole.DIRECTOR && entry.clinicId === clinicId,
  );
  return directsClinic ? [...INVITABLE_STAFF_ROLES] : [];
}

/** Clamp a requested lifetime to the selectable range, falling back to the default. */
export function resolveStaffInviteExpiry(ttlHours: number | null | undefined, now: Date): Date {
  const hours =
    ttlHours && (SELECTABLE_STAFF_INVITE_TTL_HOURS as readonly number[]).includes(ttlHours)
      ? ttlHours
      : DEFAULT_STAFF_INVITE_TTL_HOURS;
  return new Date(now.getTime() + hours * MS_PER_HOUR);
}

export interface StaffInviteLifecycleView {
  status: string;
  expiresAt: Date;
}

/** Lapsed but not yet swept. The request paths refuse on this; the sweep settles the column. */
export function isStaffInviteExpired(invite: StaffInviteLifecycleView, now: Date): boolean {
  return invite.status === 'PENDING' && invite.expiresAt <= now;
}

/** What an admin should be shown, which is not always what the column says between sweeps. */
export function effectiveStaffInviteStatus(invite: StaffInviteLifecycleView, now: Date): string {
  return isStaffInviteExpired(invite, now) ? 'EXPIRED' : invite.status;
}

/**
 * The invitations addressed to this verified address that can still be accepted.
 *
 * `User.email` is only ever written from a token whose `email_verified` is true (see
 * `JwtStrategy.validate`), so matching on it is matching on a proven inbox. A user with no
 * verified email matches nothing, and that must be expressed as "no filter possible" rather
 * than an empty condition, which would match every row.
 */
export function acceptableStaffInviteWhere(
  verifiedEmail: string | null | undefined,
  now: Date,
): Prisma.StaffInviteWhereInput | null {
  const email = verifiedEmail?.trim().toLowerCase();
  if (!email) {
    return null;
  }
  return { status: 'PENDING', expiresAt: { gt: now }, email };
}

/**
 * Local parts that name a role or a team rather than a person.
 *
 * Clinics do run shared mailboxes, and a staff invitation has no second factor: whoever opens
 * the message gets the role. So these are refused outright rather than warned about. The list
 * is short on purpose. It is not trying to catch every shared inbox, only the ones common
 * enough that inviting one is almost certainly a mistake.
 */
const SHARED_MAILBOX_LOCAL_PARTS = new Set([
  'admin',
  'accounts',
  'clinic',
  'contact',
  'enquiries',
  'frontdesk',
  'front-desk',
  'hello',
  'help',
  'info',
  'inquiries',
  'mail',
  'no-reply',
  'noreply',
  'office',
  'reception',
  'staff',
  'support',
  'team',
]);

/** Whether an address looks like a shared mailbox. `info+ghana@` counts as `info@`. */
export function isSharedMailboxAddress(email: string): boolean {
  const localPart = email.trim().toLowerCase().split('@')[0] ?? '';
  const base = localPart.split('+')[0] ?? '';
  return SHARED_MAILBOX_LOCAL_PARTS.has(base);
}

/** The route an invitee accepts on. */
export const STAFF_INVITE_ACCEPT_PATH = '/accept-invite';

/** Where the invitation email points. It carries no secret: acceptance requires signing in. */
export function buildStaffInviteAcceptUrl(appPublicUrl: string): string {
  return `${appPublicUrl}${STAFF_INVITE_ACCEPT_PATH}`;
}

/**
 * Where Keycloak returns the invitee after they set a password.
 *
 * Carries the same `continue=1` marker the patient redirect does, so the web app starts
 * sign-in without making someone arriving cold from an email trust an unexplained button.
 */
export function buildStaffInviteRedirectUri(appPublicUrl: string): string {
  return `${appPublicUrl}${STAFF_INVITE_ACCEPT_PATH}?${PORTAL_CLAIM_CONTINUE_QUERY}`;
}
