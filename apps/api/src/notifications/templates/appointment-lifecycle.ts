import type { EmailTemplate } from './types';
import { renderLayout, renderText, type DetailRow, type LayoutInput } from './layout';
import { DEFAULT_TIMEZONE, formatDateTime, optionalStr, str } from './partials';

export interface AppointmentLifecyclePayload {
  patientCode: string;
  clinicName: string;
  patientFirstName: string | null;
  startsAt: string;
  previousStartsAt: string | null;
  reason: string | null;
  timezone: string;
}

type LifecycleKind = 'confirmed' | 'rescheduled' | 'cancelled';

const COPY: Record<
  LifecycleKind,
  {
    key: string;
    subject: (clinicName: string) => string;
    heading: string;
    lead: (clinicName: string) => string;
    closing: string[];
  }
> = {
  confirmed: {
    key: 'APPOINTMENT_CONFIRMED_V1',
    subject: (clinicName) => `Your appointment at ${clinicName} is confirmed`,
    heading: 'Your appointment is confirmed',
    lead: (clinicName) => `${clinicName} has confirmed your appointment.`,
    closing: [
      'Please arrive a little early and bring your patient code with you.',
      'Contact the clinic if you need to change this appointment.',
    ],
  },
  rescheduled: {
    key: 'APPOINTMENT_RESCHEDULED_V1',
    subject: (clinicName) => `Your appointment at ${clinicName} has moved`,
    heading: 'Your appointment has moved',
    lead: (clinicName) => `${clinicName} has rescheduled your appointment.`,
    closing: [
      'The new time replaces the previous one; you do not need to do anything to accept it.',
      'Contact the clinic if the new time does not work for you.',
    ],
  },
  cancelled: {
    key: 'APPOINTMENT_CANCELLED_V1',
    subject: (clinicName) => `Your appointment at ${clinicName} was cancelled`,
    heading: 'Your appointment was cancelled',
    lead: (clinicName) => `${clinicName} has cancelled your appointment.`,
    closing: [
      'No new appointment has been booked yet. Contact the clinic to arrange another time.',
    ],
  },
};

/**
 * The three lifecycle notices differ only in wording and which times they show, so they
 * are built from one shape. A patient who learns of a change only by opening the portal
 * effectively does not learn of it, which is what these close.
 */
function createLifecycleTemplate(kind: LifecycleKind): EmailTemplate<AppointmentLifecyclePayload> {
  const copy = COPY[kind];

  return {
    key: copy.key,
    parse: (raw) => ({
      patientCode: str(raw.patientCode, 'your record'),
      clinicName: str(raw.clinicName, 'Your clinic'),
      patientFirstName: optionalStr(raw.patientFirstName),
      startsAt: str(raw.startsAt, ''),
      previousStartsAt: optionalStr(raw.previousStartsAt),
      reason: optionalStr(raw.reason),
      timezone: str(raw.timezone, DEFAULT_TIMEZONE),
    }),
    render: (payload) => {
      const details: DetailRow[] = [{ label: 'Patient code', value: payload.patientCode }];

      if (kind === 'rescheduled' && payload.previousStartsAt) {
        details.push({
          label: 'Previous time',
          value: formatDateTime(payload.previousStartsAt, payload.timezone),
        });
      }
      if (kind !== 'cancelled') {
        details.push({
          label: kind === 'rescheduled' ? 'New time' : 'Appointment time',
          value: formatDateTime(payload.startsAt, payload.timezone),
        });
      } else {
        details.push({
          label: 'Cancelled appointment',
          value: formatDateTime(payload.startsAt, payload.timezone),
        });
      }
      // The staff-entered cancellation reason is shown because a patient who is not told
      // why assumes the worst; it is escaped like every other supplied value.
      if (kind === 'cancelled' && payload.reason) {
        details.push({ label: 'Reason', value: payload.reason });
      }

      const layout: LayoutInput = {
        preheader: copy.lead(payload.clinicName),
        heading: copy.heading,
        clinicName: payload.clinicName,
        paragraphs: [
          payload.patientFirstName ? `Hello ${payload.patientFirstName},` : 'Hello,',
          copy.lead(payload.clinicName),
        ],
        details,
        footnotes: copy.closing,
      };

      return {
        subject: copy.subject(payload.clinicName),
        html: renderLayout(layout),
        text: renderText(layout),
      };
    },
  };
}

export const APPOINTMENT_CONFIRMED_V1 = createLifecycleTemplate('confirmed');
export const APPOINTMENT_RESCHEDULED_V1 = createLifecycleTemplate('rescheduled');
export const APPOINTMENT_CANCELLED_V1 = createLifecycleTemplate('cancelled');
