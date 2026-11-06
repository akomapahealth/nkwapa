import { SetMetadata } from '@nestjs/common';

export const LAPSED_INVITE_SCOPE_KEY = 'nkwapa:lapsed-invite-scope';

/**
 * Let this handler see the clinics the caller holds a lapsed invitation to (#307, B7).
 *
 * Opt-in per handler, for the reason IncludeStaffInviteScope gives: widening every request would
 * hand a lapsed invitee tenant scope they were never granted. Only the renewal request carries
 * it, and that handler reads and writes nothing but the caller's own invitation, matched on the
 * verified email.
 */
export const IncludeLapsedInviteScope = () => SetMetadata(LAPSED_INVITE_SCOPE_KEY, true);
