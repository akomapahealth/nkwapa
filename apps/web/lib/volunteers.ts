/** The volunteer directory and screening-day roster (#226). */

import { instantToWallClock, wallClockToInstant } from '@nkwapa/db/clinic-day';

export interface VolunteerContact {
  id: string;
  displayName: string;
  email: string;
  phoneE164: string | null;
  notes: string | null;
  isActive: boolean;
  linkedUserId: string | null;
  linkedUser?: { id: string; displayName: string } | null;
  /** A clinic account with the same email, offered for an explicit link. */
  linkCandidate?: { id: string; displayName: string } | null;
}

export type ScreeningEventStatus = 'SCHEDULED' | 'CANCELLED' | 'COMPLETED';

export interface ScreeningEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  siteName: string;
  siteAddress: string | null;
  notes: string | null;
  status: ScreeningEventStatus;
  cancelReason: string | null;
  rosteredCount?: number;
}

export interface RosterRow {
  id: string;
  status: 'ASSIGNED' | 'REMOVED';
  lastNotifiedAt: string | null;
  notifiedForCurrentDetails: boolean;
  volunteerContact: { id: string; displayName: string; email: string; isActive: boolean };
  delivery: {
    status: 'QUEUED' | 'SENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'CANCELLED';
    failureReason: string | null;
    sentAt: string | null;
  } | null;
}

export interface ScreeningEventDetail {
  event: ScreeningEvent;
  timezone: string;
  emailConfigured: boolean;
  roster: RosterRow[];
}

export const volunteersPath = (clinicId: string) => `/clinics/${clinicId}/volunteers`;
export const eventsPath = (clinicId: string) => `/clinics/${clinicId}/screening-events`;

/** Delivery states that will still change on their own, so the roster keeps refetching. */
export const PENDING_DELIVERY = new Set(['QUEUED', 'SENDING']);

/** A `datetime-local` value typed in clinic time, as an instant. */
export function clinicLocalToIso(local: string, timeZone: string): string | null {
  return local ? (wallClockToInstant(local, timeZone)?.toISOString() ?? null) : null;
}

/** An instant as the `datetime-local` value a manager would type in clinic time. */
export function isoToClinicLocal(iso: string, timeZone: string): string {
  return instantToWallClock(iso, timeZone);
}

/** "Sat, 7 Nov 2026, 08:00–13:00 GMT", in clinic time. */
export function formatEventWhen(
  event: Pick<ScreeningEvent, 'startsAt' | 'endsAt'>,
  timeZone: string,
) {
  const day = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(event.startsAt));
  const time = (iso: string) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(iso));
  const zone =
    new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'short' })
      .format(new Date(event.startsAt))
      .split(' ')
      .pop() ?? timeZone;
  return `${day}, ${time(event.startsAt)}–${time(event.endsAt)} ${zone}`;
}
