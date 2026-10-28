import type { EmailTemplate, RenderedMessage } from './types';
import { renderLayout, renderText, type DetailRow, type LayoutInput } from './layout';
import { DEFAULT_TIMEZONE, optionalStr, str } from './partials';

export interface VolunteerRosterPayload {
  firstName: string | null;
  clinicName: string;
  timezone: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  siteName: string;
  siteAddress: string | null;
  notes: string | null;
  senderName: string | null;
  cancelReason: string | null;
  resend: boolean;
}

function parse(raw: Record<string, unknown>): VolunteerRosterPayload {
  return {
    firstName: optionalStr(raw.firstName),
    clinicName: str(raw.clinicName, 'Your clinic'),
    timezone: str(raw.timezone, DEFAULT_TIMEZONE),
    title: str(raw.title, 'Screening day'),
    startsAt: optionalStr(raw.startsAt),
    endsAt: optionalStr(raw.endsAt),
    siteName: str(raw.siteName, 'the screening site'),
    siteAddress: optionalStr(raw.siteAddress),
    notes: optionalStr(raw.notes),
    senderName: optionalStr(raw.senderName),
    cancelReason: optionalStr(raw.cancelReason),
    resend: raw.resend === true,
  };
}

function inZone(value: string, timeZone: string, options: Intl.DateTimeFormatOptions) {
  const at = new Date(value);
  try {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone }).format(at);
  } catch {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: DEFAULT_TIMEZONE }).format(at);
  }
}

/** "Sat, 7 Nov 2026, 08:00–13:00 GMT (Africa/Accra)": the zone is named so nobody has to guess. */
export function formatEventWhen(payload: VolunteerRosterPayload): string {
  const { startsAt, endsAt, timezone } = payload;
  if (!startsAt || Number.isNaN(new Date(startsAt).getTime())) return 'the scheduled time';
  const day = inZone(startsAt, timezone, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const time = (value: string) =>
    inZone(value, timezone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const zoneName =
    inZone(startsAt, timezone, { timeZoneName: 'short' }).split(' ').pop() ?? timezone;
  const end = endsAt && !Number.isNaN(new Date(endsAt).getTime()) ? `–${time(endsAt)}` : '';
  return `${day}, ${time(startsAt)}${end} ${zoneName} (${timezone})`;
}

function details(payload: VolunteerRosterPayload): DetailRow[] {
  return [
    { label: 'Event', value: payload.title },
    { label: 'When', value: formatEventWhen(payload) },
    { label: 'Where', value: payload.siteName },
    ...(payload.siteAddress ? [{ label: 'Address', value: payload.siteAddress }] : []),
    ...(payload.notes ? [{ label: 'Notes', value: payload.notes }] : []),
  ];
}

/*
  Every roster email is read by someone who may have no Nkwapa account, so none of them carries a
  link, a button or an image: there is nothing to sign in to and nothing to track. They name the
  event and never a patient.
*/
function compose(
  payload: VolunteerRosterPayload,
  copy: { subject: string; heading: string; lead: string; withDetails: boolean },
): RenderedMessage {
  const sender = payload.senderName
    ? `${payload.senderName} at ${payload.clinicName}`
    : payload.clinicName;
  const layout: LayoutInput = {
    preheader: copy.lead,
    heading: copy.heading,
    clinicName: payload.clinicName,
    paragraphs: [payload.firstName ? `Hello ${payload.firstName},` : 'Hello,', copy.lead],
    details: copy.withDetails ? details(payload) : [{ label: 'Event', value: payload.title }],
    footnotes: [`Sent by ${sender}.`, `Questions, or can't make it? Contact ${sender} directly.`],
  };
  return { subject: copy.subject, html: renderLayout(layout), text: renderText(layout) };
}

export const VOLUNTEER_ROSTER_ASSIGNED_V1: EmailTemplate<VolunteerRosterPayload> = {
  key: 'VOLUNTEER_ROSTER_ASSIGNED_V1',
  parse,
  render: (payload) =>
    compose(payload, {
      subject: payload.resend
        ? `Reminder: you're scheduled for ${payload.title}`
        : `You're scheduled for ${payload.title}`,
      heading: payload.resend ? 'A reminder: you are on the roster' : 'You are on the roster',
      lead: `${payload.clinicName} has scheduled you to volunteer at ${payload.title}.`,
      withDetails: true,
    }),
};

export const VOLUNTEER_ROSTER_UPDATED_V1: EmailTemplate<VolunteerRosterPayload> = {
  key: 'VOLUNTEER_ROSTER_UPDATED_V1',
  parse,
  render: (payload) =>
    compose(payload, {
      subject: `Changed: ${payload.title}`,
      heading: 'The screening day has changed',
      lead: `The date, time or place of ${payload.title} has changed. These are the new details.`,
      withDetails: true,
    }),
};

export const VOLUNTEER_ROSTER_CANCELLED_V1: EmailTemplate<VolunteerRosterPayload> = {
  key: 'VOLUNTEER_ROSTER_CANCELLED_V1',
  parse,
  render: (payload) =>
    compose(payload, {
      subject: `Cancelled: ${payload.title}`,
      heading: 'The screening day is cancelled',
      lead: payload.cancelReason
        ? `${payload.title} on ${formatEventWhen(payload)} has been cancelled. Reason: ${payload.cancelReason}`
        : `${payload.title} on ${formatEventWhen(payload)} has been cancelled.`,
      withDetails: false,
    }),
};

export const VOLUNTEER_ROSTER_REMOVED_V1: EmailTemplate<VolunteerRosterPayload> = {
  key: 'VOLUNTEER_ROSTER_REMOVED_V1',
  parse,
  render: (payload) =>
    compose(payload, {
      subject: `No longer scheduled: ${payload.title}`,
      heading: 'You are no longer scheduled',
      lead: `You are no longer on the roster for ${payload.title} on ${formatEventWhen(payload)}. The event is still going ahead.`,
      withDetails: false,
    }),
};
