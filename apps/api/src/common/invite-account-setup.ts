import type { PortalInviteIdentityStatus } from '@prisma/client';
import type { PortalInviteAccountSetup } from '../notifications/templates/portal-invite';

/**
 * Translate the stored provisioning state into what the invitee has to do next.
 *
 * Shared by the patient and staff invitations, which send the same companion password email
 * and so have to describe it the same way.
 *
 * Anything we are not sure about reads as UNKNOWN, which renders the neutral "sign in"
 * wording. Guessing PENDING_PASSWORD would point someone at a second email that was never sent.
 */
export function describeInviteAccountSetup(
  status: PortalInviteIdentityStatus,
): PortalInviteAccountSetup {
  switch (status) {
    case 'PROVISIONED':
    case 'EXISTING_PENDING':
      return 'PENDING_PASSWORD';
    case 'ALREADY_ACTIVE':
      return 'EXISTING_ACCOUNT';
    default:
      return 'UNKNOWN';
  }
}
