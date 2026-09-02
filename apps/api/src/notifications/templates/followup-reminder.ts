import type { EmailTemplate } from './types';
import { renderLayout, renderText, type LayoutInput } from './layout';
import { DEFAULT_TIMEZONE, formatDate, str } from './partials';

export interface FollowUpReminderPayload {
  patientCode: string;
  clinicName: string;
  followUpDate: string;
  timezone: string;
}

export const FOLLOWUP_REMINDER_V1: EmailTemplate<FollowUpReminderPayload> = {
  key: 'FOLLOWUP_REMINDER_V1',
  parse: (raw) => ({
    patientCode: str(raw.patientCode, 'your record'),
    clinicName: str(raw.clinicName, 'Your clinic'),
    followUpDate: str(raw.followUpDate, ''),
    timezone: str(raw.timezone, DEFAULT_TIMEZONE),
  }),
  render: (payload) => {
    const followUpDate = formatDate(payload.followUpDate, payload.timezone);
    const layout: LayoutInput = {
      preheader: `Your follow-up visit is due on ${followUpDate}.`,
      heading: 'Your follow-up visit is due',
      clinicName: payload.clinicName,
      paragraphs: [`This is a reminder from ${payload.clinicName} about your follow-up visit.`],
      details: [
        { label: 'Patient code', value: payload.patientCode },
        { label: 'Return on', value: followUpDate },
      ],
      footnotes: [
        'Bring this code with you so the team can find your record quickly.',
        'If you cannot make this date, contact the clinic to rearrange.',
      ],
    };

    return {
      subject: `Follow-Up Reminder - ${payload.clinicName}`,
      html: renderLayout(layout),
      text: renderText(layout),
      smsBody: `Follow-up reminder for ${payload.patientCode}: please return on ${followUpDate}.`,
    };
  },
};
