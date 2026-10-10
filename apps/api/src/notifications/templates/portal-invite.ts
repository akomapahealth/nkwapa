import type { EmailTemplate } from './types';
import { renderLayout, renderText, type LayoutInput } from './layout';
import { DEFAULT_TIMEZONE, formatDate, optionalStr, optionalUrl, str } from './partials';

/**
 * What the patient has to do before this invitation can be claimed.
 *
 * The invite used to say "create an account using this email address" to everyone, which
 * was untrue -- self-registration is disabled, and always has been. The account is now
 * created when the invite is sent, so the message can say what actually happened.
 */
export type PortalInviteAccountSetup = 'PENDING_PASSWORD' | 'EXISTING_ACCOUNT' | 'UNKNOWN';

const ACCOUNT_SETUP_VALUES: PortalInviteAccountSetup[] = [
  'PENDING_PASSWORD',
  'EXISTING_ACCOUNT',
  'UNKNOWN',
];

export interface PortalInvitePayload {
  patientCode: string;
  clinicName: string;
  patientFirstName: string | null;
  claimUrl: string | null;
  expiresAt: string | null;
  timezone: string;
  resend: boolean;
  accountSetup: PortalInviteAccountSetup;
}

/** The companion message from Keycloak. Named so the pair does not read as a phish. */
const PASSWORD_EMAIL_SUBJECT = 'Choose your Nkwapa password';

export const PORTAL_INVITE_V1: EmailTemplate<PortalInvitePayload> = {
  key: 'PORTAL_INVITE_V1',
  parse: (raw) => ({
    patientCode: str(raw.patientCode, 'the code your clinic gave you'),
    clinicName: str(raw.clinicName, 'Your clinic'),
    patientFirstName: optionalStr(raw.patientFirstName),
    claimUrl: optionalUrl(raw.claimUrl),
    expiresAt: optionalStr(raw.expiresAt),
    timezone: str(raw.timezone, DEFAULT_TIMEZONE),
    resend: raw.resend === true,
    // Defaults to UNKNOWN so an invite queued by an older deploy, replayed out of
    // Reminder.payloadJson, still renders wording that is true of it.
    accountSetup: ACCOUNT_SETUP_VALUES.includes(raw.accountSetup as PortalInviteAccountSetup)
      ? (raw.accountSetup as PortalInviteAccountSetup)
      : 'UNKNOWN',
  }),
  render: (payload) => {
    const greeting = payload.patientFirstName ? `Hello ${payload.patientFirstName},` : 'Hello,';

    const invitation = payload.resend
      ? `This is a reminder that ${payload.clinicName} has invited you to set up online access to your health record.`
      : `${payload.clinicName} has invited you to set up online access to your health record.`;

    /*
      Three different truths, so three different instructions.

      Sending everyone the same sentence is what made the original message wrong: a patient
      with no account was told to create one, and a patient who already had an account was
      told the same thing.
    */
    const instruction: Record<PortalInviteAccountSetup, string> = {
      PENDING_PASSWORD: `We have set up an account for you. Look for a second email, "${PASSWORD_EMAIL_SUBJECT}", and use the link in it to choose your password. You will then be asked to confirm the details below, so keep them to hand.`,
      EXISTING_ACCOUNT:
        'You already have an account with this email address. Sign in as usual, then confirm the details below to link your record.',
      UNKNOWN:
        'To finish, sign in with this email address and confirm the details below. Your record is only linked once those details match, so keep them to hand.',
    };

    const paragraphs = [greeting, invitation, instruction[payload.accountSetup]];

    const details = [
      { label: 'Patient code', value: payload.patientCode },
      ...(payload.expiresAt
        ? [
            {
              label: 'Invitation valid until',
              value: formatDate(payload.expiresAt, payload.timezone),
            },
          ]
        : []),
    ];

    const footnotes = [
      // Without a configured public origin there is no honest link to give, and
      // "undefined/claim-record" is worse than a sentence telling them where to go.
      ...(payload.claimUrl
        ? []
        : ['Your clinic can tell you where to sign in if you do not already have the address.']),
      'You will also be asked for your date of birth, so that only you can claim this record.',
      // "no account will be created" stopped being true the moment we started creating one.
      // An unused account is harmless, but saying otherwise would be a plain untruth in a
      // message whose whole job is to be trustworthy enough to act on.
      payload.accountSetup === 'PENDING_PASSWORD'
        ? 'If you were not expecting this invitation, you can ignore both emails. The account cannot be used until a password is chosen, and your clinic can remove it.'
        : 'If you were not expecting this invitation, you can ignore this email and nothing will be linked to your record.',
    ];

    /*
      A patient who has not chosen a password yet cannot get through a sign-in link, so
      offering one here would be a second dead end beside the one this work removed. The
      secure link lives in the companion email; this message carries the context.
    */
    const offerSignInLink = payload.accountSetup !== 'PENDING_PASSWORD';

    const layout: LayoutInput = {
      preheader: `Set up online access to your ${payload.clinicName} health record.`,
      heading: payload.resend
        ? 'A reminder about your patient account'
        : 'Set up your patient account',
      clinicName: payload.clinicName,
      paragraphs,
      details,
      ...(payload.claimUrl && offerSignInLink
        ? { callToAction: { label: 'Sign in to your record', url: payload.claimUrl } }
        : {}),
      footnotes,
    };

    return {
      subject: payload.resend
        ? `Reminder: set up your ${payload.clinicName} patient account`
        : `Set up your ${payload.clinicName} patient account`,
      html: renderLayout(layout),
      text: renderText(layout),
    };
  },
};
