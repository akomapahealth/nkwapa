import type { EmailTemplate } from './types';
import { renderLayout, renderText, type LayoutInput } from './layout';
import {
  DEFAULT_TIMEZONE,
  formatDate,
  formatRoleLabel,
  optionalStr,
  optionalUrl,
  str,
} from './partials';
import type { PortalInviteAccountSetup } from './portal-invite';

export interface StaffInvitePayload {
  clinicName: string;
  role: string;
  inviterName: string | null;
  acceptUrl: string | null;
  expiresAt: string | null;
  timezone: string;
  resend: boolean;
  accountSetup: PortalInviteAccountSetup;
}

const ACCOUNT_SETUP_VALUES: PortalInviteAccountSetup[] = [
  'PENDING_PASSWORD',
  'EXISTING_ACCOUNT',
  'UNKNOWN',
];

/** The companion message from Keycloak, named by subject so the pair does not read as a phish. */
const PASSWORD_EMAIL_SUBJECT = 'Choose your Nkwapa password';

/**
 * An invitation to join a clinic's staff.
 *
 * It names the clinic and the role, because those are what the reader is being asked to accept,
 * and it says nothing about a health record: the reader is a colleague, not a patient, and the
 * patient invitation's wording would tell them they have a record they do not have.
 */
export const STAFF_INVITE_V1: EmailTemplate<StaffInvitePayload> = {
  key: 'STAFF_INVITE_V1',
  parse: (raw) => ({
    clinicName: str(raw.clinicName, 'Your clinic'),
    role: str(raw.role, 'a staff role'),
    inviterName: optionalStr(raw.inviterName),
    acceptUrl: optionalUrl(raw.acceptUrl),
    expiresAt: optionalStr(raw.expiresAt),
    timezone: str(raw.timezone, DEFAULT_TIMEZONE),
    resend: raw.resend === true,
    accountSetup: ACCOUNT_SETUP_VALUES.includes(raw.accountSetup as PortalInviteAccountSetup)
      ? (raw.accountSetup as PortalInviteAccountSetup)
      : 'UNKNOWN',
  }),
  render: (payload) => {
    const role = formatRoleLabel(payload.role);
    const inviter = payload.inviterName
      ? `${payload.inviterName} at ${payload.clinicName}`
      : payload.clinicName;
    const invitation = payload.resend
      ? `This is a reminder that ${inviter} has invited you to join the clinic's team on Nkwapa in the ${role} role.`
      : `${inviter} has invited you to join the clinic's team on Nkwapa in the ${role} role.`;

    const instruction: Record<PortalInviteAccountSetup, string> = {
      PENDING_PASSWORD: `We have set up an account for you. Look for a second email, "${PASSWORD_EMAIL_SUBJECT}", and use the link in it to choose your password. You will then be asked to accept this invitation.`,
      EXISTING_ACCOUNT:
        'You already have an Nkwapa account with this email address. Sign in as usual and accept the invitation to add this role.',
      UNKNOWN: 'Sign in with this email address and accept the invitation to add this role.',
    };

    const details = [
      { label: 'Clinic', value: payload.clinicName },
      { label: 'Role', value: role },
      ...(payload.expiresAt
        ? [
            {
              label: 'Invitation valid until',
              value: formatDate(payload.expiresAt, payload.timezone),
            },
          ]
        : []),
    ];

    /*
      The same rule the patient invitation follows: someone who has not chosen a password cannot
      get through a sign-in link, so the link is offered only once they can use it.
    */
    const offerAcceptLink = payload.accountSetup !== 'PENDING_PASSWORD';

    const layout: LayoutInput = {
      preheader: `You have been invited to join ${payload.clinicName} in the ${role} role.`,
      heading: payload.resend
        ? 'A reminder about your invitation'
        : 'You have been invited to join a clinic team',
      clinicName: payload.clinicName,
      paragraphs: [
        'Hello,',
        invitation,
        instruction[payload.accountSetup],
        'You will get access to clinic records in line with this role only after you accept.',
      ],
      details,
      ...(payload.acceptUrl && offerAcceptLink
        ? { callToAction: { label: 'Review the invitation', url: payload.acceptUrl } }
        : {}),
      footnotes: [
        ...(payload.acceptUrl
          ? []
          : ['Your clinic can tell you where to sign in if you do not already have the address.']),
        'This invitation is for you alone. Do not forward it: whoever accepts it is given the role.',
        payload.accountSetup === 'PENDING_PASSWORD'
          ? 'If you were not expecting this invitation, ignore both emails. The account cannot be used until a password is chosen, and the invitation lapses on its own.'
          : 'If you were not expecting this invitation, ignore this email. Nothing changes unless it is accepted.',
      ],
    };

    return {
      subject: payload.resend
        ? `Reminder: join ${payload.clinicName} on Nkwapa`
        : `You have been invited to join ${payload.clinicName} on Nkwapa`,
      html: renderLayout(layout),
      text: renderText(layout),
    };
  },
};
