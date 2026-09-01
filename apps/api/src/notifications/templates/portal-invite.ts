import type { EmailTemplate } from './types';
import { renderLayout, renderText, type LayoutInput } from './layout';
import { DEFAULT_TIMEZONE, formatDate, optionalStr, optionalUrl, str } from './partials';

export interface PortalInvitePayload {
  patientCode: string;
  clinicName: string;
  patientFirstName: string | null;
  claimUrl: string | null;
  expiresAt: string | null;
  timezone: string;
  resend: boolean;
}

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
  }),
  render: (payload) => {
    const greeting = payload.patientFirstName ? `Hello ${payload.patientFirstName},` : 'Hello,';

    const paragraphs = [
      greeting,
      payload.resend
        ? `This is a reminder that ${payload.clinicName} has invited you to set up online access to your health record.`
        : `${payload.clinicName} has invited you to set up online access to your health record.`,
      'To finish, create an account using this email address, then confirm your details. Your record is only linked once those details match, so keep the code below to hand.',
    ];

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
      'If you were not expecting this invitation, you can ignore this email and no account will be created.',
    ];

    const layout: LayoutInput = {
      preheader: `Set up online access to your ${payload.clinicName} health record.`,
      heading: payload.resend
        ? 'A reminder about your patient account'
        : 'Set up your patient account',
      clinicName: payload.clinicName,
      paragraphs,
      details,
      ...(payload.claimUrl
        ? { callToAction: { label: 'Set up my account', url: payload.claimUrl } }
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
