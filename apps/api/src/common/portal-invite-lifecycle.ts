import type { PatientPortalInviteStatus, Prisma } from '@prisma/client';

/**
 * The one definition of what a portal invite's lifetime means.
 *
 * These rules were previously spread across four files and applied in none of them.
 * `claimPatientRecord`, `listPendingInvitesForUser`, the whoami onboarding query and the
 * RLS interceptor each wrote their own "pending invites for this person" predicate, and
 * not one of them looked at `expiresAt` — so the column was recorded, surfaced in the
 * invitation email as "valid until", and then ignored by every path that could act on
 * it. Centralising them is what makes it possible to state the rule once and be sure it
 * holds everywhere.
 *
 * Deliberately free of Nest DI and of any repository import, so the interceptor, the auth
 * controller, the patient registry and the portal service can all consume it without a
 * module cycle. Same shape as `email-policy.ts` next door.
 */

/** Used when neither staff nor the environment says otherwise. */
export const DEFAULT_PORTAL_INVITE_TTL_DAYS = 14;

/**
 * What staff may pick on the chart.
 *
 * Long enough at the top end for a patient who checks email weekly, short enough at the
 * bottom that a mistyped address stops being a live claim path within the week.
 */
export const SELECTABLE_PORTAL_INVITE_TTL_DAYS = [7, 14, 30] as const;

export type PortalInviteTtlDays = (typeof SELECTABLE_PORTAL_INVITE_TTL_DAYS)[number];

const MIN_TTL_DAYS = 1;
const MAX_TTL_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** An invite as far as the lifecycle rules are concerned. Anything wider is the caller's business. */
export interface PortalInviteLifecycleView {
  status: PatientPortalInviteStatus | string;
  expiresAt: Date | null;
}

/**
 * The deployment-wide default, from `PORTAL_INVITE_TTL_DAYS`.
 *
 * Clamped rather than rejected: a nonsense value in the environment must not stop invites
 * being issued, and a silent fallback to the documented default is the failure mode that
 * keeps the clinic working.
 */
export function resolvePortalInviteTtlDays(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.PORTAL_INVITE_TTL_DAYS;
  if (!raw) {
    return DEFAULT_PORTAL_INVITE_TTL_DAYS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_PORTAL_INVITE_TTL_DAYS;
  }
  return Math.min(MAX_TTL_DAYS, Math.max(MIN_TTL_DAYS, parsed));
}

export interface PortalInviteExpiryInput {
  /** An exact instant, when the caller has one. Wins over everything else. */
  expiresAt?: Date | null;
  /** A lifetime in days, which is what the chart sends. */
  ttlDays?: number | null;
}

/**
 * Resolve when an invite stops being claimable.
 *
 * Precedence is stated here and nowhere else: an explicit instant, then a lifetime in
 * days, then the deployment default. There is no "no expiry" branch — an invite created
 * after this rule exists always has one.
 */
export function resolvePortalInviteExpiry(
  input: PortalInviteExpiryInput,
  now: Date,
  env: NodeJS.ProcessEnv = process.env,
): Date {
  if (input.expiresAt) {
    return input.expiresAt;
  }
  const days =
    input.ttlDays && Number.isFinite(input.ttlDays)
      ? Math.min(MAX_TTL_DAYS, Math.max(MIN_TTL_DAYS, Math.trunc(input.ttlDays)))
      : resolvePortalInviteTtlDays(env);
  return new Date(now.getTime() + days * MS_PER_DAY);
}

/**
 * Whether a stored row has lapsed but not yet been swept.
 *
 * A null `expiresAt` is not expired. Rows created before the expiry rule existed are
 * open-ended by construction, and the backfill migration — not this predicate — is what
 * removes them. Keeping the two separate means the rule stays true of the data it is
 * given rather than of the data it wishes it had.
 */
export function isPortalInviteExpired(invite: PortalInviteLifecycleView, now: Date): boolean {
  return invite.status === 'PENDING' && invite.expiresAt !== null && invite.expiresAt <= now;
}

/**
 * What staff should be shown, which is not always what the column says.
 *
 * The sweep runs hourly, so between an invite lapsing and the sweep reaching it the row
 * still reads PENDING. Displaying that would tell staff an invite is live when the claim
 * endpoint will already refuse it.
 */
export function effectivePortalInviteStatus(
  invite: PortalInviteLifecycleView,
  now: Date,
): PatientPortalInviteStatus {
  if (isPortalInviteExpired(invite, now)) {
    return 'EXPIRED';
  }
  return invite.status as PatientPortalInviteStatus;
}

/**
 * The invites a person may still act on.
 *
 * `gt` rather than `gte`: an invite whose expiry instant has arrived is over. The claim
 * endpoint, the onboarding state and the RLS clinic widening all share this clause, so
 * an expired invite cannot be claimed, cannot put the user into claim onboarding, and
 * cannot widen their tenant scope.
 */
export function claimableInviteWhere(now: Date): Prisma.PatientPortalInviteWhereInput {
  return {
    status: 'PENDING',
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

export interface InviteIdentityCandidate {
  email?: string | null;
  phoneE164?: string | null;
}

/**
 * Everything a person may still claim: alive, and staged to their contact details.
 *
 * Composed here rather than at the call sites because the obvious way to write it by
 * hand is wrong. Both halves want the `OR` key, so
 *
 *   { ...claimableInviteWhere(now), OR: inviteIdentityMatchConditions(user) }
 *
 * reads correctly, type-checks, and silently discards the expiry clause — which is the
 * bug this whole change exists to remove, reintroduced by the fix for it. Nesting both
 * under `AND` is the only shape where neither can clobber the other.
 *
 * Returns null when there is nothing to match on. An empty `OR` matches every row, so
 * "this person has no contact details" must not be expressible as a filter.
 */
export function claimableInviteForIdentityWhere(
  candidate: InviteIdentityCandidate,
  now: Date,
): Prisma.PatientPortalInviteWhereInput | null {
  const identity = inviteIdentityMatchConditions(candidate);
  if (identity.length === 0) {
    return null;
  }
  const { status, OR: alive } = claimableInviteWhere(now);
  return { status, AND: [{ OR: alive }, { OR: identity }] };
}

/**
 * How an invite is matched to the person holding it.
 *
 * Email is compared case-insensitively because mail addresses are; phone is compared
 * exactly because both sides are already normalised to E.164. Returns an empty array
 * when there is nothing to match on, which callers must read as "no invites" rather than
 * "no filter" — an empty `OR` matches every row.
 */
export function inviteIdentityMatchConditions(
  candidate: InviteIdentityCandidate,
): Prisma.PatientPortalInviteWhereInput[] {
  const conditions: Prisma.PatientPortalInviteWhereInput[] = [];
  if (candidate.email) {
    conditions.push({ email: { equals: candidate.email, mode: 'insensitive' } });
  }
  if (candidate.phoneE164) {
    conditions.push({ phoneE164: candidate.phoneE164 });
  }
  return conditions;
}
