import type { EmailTemplate } from './types';
import { renderLayout, renderText, type LayoutInput } from './layout';
import { DEFAULT_TIMEZONE, formatDateTime, str } from './partials';

export interface AppointmentReminderPayload {
  patientCode: string;
  clinicName: string;
  startsAt: string;
  timezone: string;
}

export const APPOINTMENT_REMINDER_V1: EmailTemplate<AppointmentReminderPayload> = {
  key: 'APPOINTMENT_REMINDER_V1',
  parse: (raw) => ({
    patientCode: str(raw.patientCode, 'your record'),
    clinicName: str(raw.clinicName, 'Your clinic'),
    startsAt: str(raw.startsAt, ''),
    timezone: str(raw.timezone, DEFAULT_TIMEZONE),
  }),
  render: (payload) => {
    const startsAt = formatDateTime(payload.startsAt, payload.timezone);
    const layout: LayoutInput = {
      preheader: `Your appointment is scheduled for ${startsAt}.`,
      heading: 'Your appointment is coming up',
      clinicName: payload.clinicName,
      paragraphs: [
        `This is a reminder from ${payload.clinicName} about your scheduled appointment.`,
      ],
      details: [
        { label: 'Patient code', value: payload.patientCode },
        { label: 'Scheduled for', value: startsAt },
      ],
      footnotes: [
        'If your appointment has already changed, follow the latest update from the clinic.',
      ],
    };

    return {
      subject: `Appointment Reminder - ${payload.clinicName}`,
      html: renderLayout(layout),
      text: renderText(layout),
      smsBody: `Appointment reminder for ${payload.patientCode}: your appointment is scheduled for ${startsAt}.`,
    };
  },
};
