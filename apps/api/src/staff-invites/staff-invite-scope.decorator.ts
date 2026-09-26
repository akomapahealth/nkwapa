import { SetMetadata } from '@nestjs/common';

export const STAFF_INVITE_SCOPE_KEY = 'nkwapa:staff-invite-scope';

/**
 * Let this handler see the clinics the caller has an open staff invitation to.
 *
 * Opt-in, per handler, and on purpose. The patient invitation widens every request, which is
 * tolerable because a patient invitee holds no role anywhere. A staff invitee very often does:
 * a doctor at one clinic invited to volunteer at another. Widening every one of their requests
 * would give them tenant scope over the second clinic, on every route that leans on row level
 * security, before they had accepted anything. So only the handlers that exist to show or accept
 * an invitation, and that filter by the caller's verified email themselves, carry this.
 */
export const IncludeStaffInviteScope = () => SetMetadata(STAFF_INVITE_SCOPE_KEY, true);
