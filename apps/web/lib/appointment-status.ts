import { instantToWallClock, wallClockToInstant } from '@nkwapa/db/clinic-day';
/**
 * One status vocabulary for appointments, shared by the staff calendar and the patient portal.
 *
 * The two surfaces used to map statuses independently, and they disagreed: a request reading
 * `CONFIRMED` rendered as one colour while an appointment reading `CONFIRMED` rendered as another,
 * on the same page. A status means the same thing to a clinician and to the patient it belongs to,
 * so it reads the same way in both places.
 */
import type {
  AppointmentCancellation,
  AppointmentRequestRecord,
  AppointmentSummary,
} from '@/lib/patient-portal';
import { formatOpsDateTime } from '@/lib/ops';

export type PortalStatusBadgeVariant =
  | 'secondary'
  | 'review'
  | 'warning'
  | 'finalized'
  | 'destructive'
  | 'outline';

export type AppointmentRequestCategory = 'pending' | 'confirmed' | 'closed';
export type AppointmentCategory = 'upcoming' | 'completed' | 'cancelled' | 'no-show';

export interface PortalStatusView<TCategory extends string> {
  label: string;
  description: string;
  badgeVariant: PortalStatusBadgeVariant;
  category: TCategory;
}

export function getAppointmentRequestStatusView(
  status: AppointmentRequestRecord['status'] | string,
): PortalStatusView<AppointmentRequestCategory> {
  switch (status) {
    case 'REQUESTED':
      return {
        label: 'Requested',
        description: 'Sent to the clinic and waiting for review.',
        badgeVariant: 'outline',
        category: 'pending',
      };
    case 'TRIAGED':
      return {
        label: 'Under review',
        description: 'Clinic staff have started reviewing this request.',
        badgeVariant: 'review',
        category: 'pending',
      };
    case 'CONFIRMED':
      return {
        label: 'Confirmed',
        description: 'The clinic approved this request and attached an appointment.',
        badgeVariant: 'secondary',
        category: 'confirmed',
      };
    case 'REJECTED':
      return {
        label: 'Not approved',
        description: 'The clinic could not approve this request.',
        badgeVariant: 'destructive',
        category: 'closed',
      };
    case 'CANCELLED':
      return {
        label: 'Cancelled',
        description: 'This request was closed before completion.',
        badgeVariant: 'destructive',
        category: 'closed',
      };
    default:
      return {
        label: formatUnknownStatus(status),
        description: 'The clinic returned a status this portal does not recognize yet.',
        badgeVariant: 'outline',
        category: 'closed',
      };
  }
}

export function getAppointmentStatusView(
  status: AppointmentSummary['status'] | string,
): PortalStatusView<AppointmentCategory> {
  switch (status) {
    case 'CONFIRMED':
      return {
        label: 'Confirmed',
        description: 'Scheduled and still active.',
        badgeVariant: 'secondary',
        category: 'upcoming',
      };
    case 'COMPLETED':
      return {
        label: 'Completed',
        description: 'The clinic marked this visit complete.',
        badgeVariant: 'finalized',
        category: 'completed',
      };
    case 'CANCELLED':
      return {
        label: 'Cancelled',
        description: 'This appointment was cancelled.',
        badgeVariant: 'destructive',
        category: 'cancelled',
      };
    case 'NO_SHOW':
      return {
        label: 'No-show',
        description: 'The clinic marked this visit as missed.',
        badgeVariant: 'warning',
        category: 'no-show',
      };
    default:
      return {
        label: formatUnknownStatus(status),
        description: 'The clinic returned a status this portal does not recognize yet.',
        badgeVariant: 'outline',
        category: 'cancelled',
      };
  }
}

export function getAppointmentRequestTypeLabel(
  requestType: AppointmentRequestRecord['requestType'] | string,
) {
  switch (requestType) {
    case 'CANCEL_APPOINTMENT':
      return 'Cancellation request';
    case 'RESCHEDULE_APPOINTMENT':
      return 'Reschedule request';
    case 'NEW_APPOINTMENT':
      return 'New appointment request';
    default:
      return formatUnknownStatus(requestType);
  }
}

export function isPatientAppointmentActionable(
  appointment: AppointmentSummary,
  now: Date = new Date(),
) {
  return (
    appointment.status === 'CONFIRMED' && new Date(appointment.startsAt).getTime() > now.getTime()
  );
}

export function getNextConfirmedAppointment(
  appointments: AppointmentSummary[],
  now: Date = new Date(),
) {
  return (
    appointments
      .filter((appointment) => isPatientAppointmentActionable(appointment, now))
      .sort(
        (left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
      )[0] ?? null
  );
}

function formatUnknownStatus(status: string) {
  return status
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

/** Filter value for the staff schedule, where `ALL` is a UI concept rather than a status. */
export type AppointmentStatusFilter = AppointmentSummary['status'] | 'ALL';

export function getAppointmentStatusFilterLabel(value: AppointmentStatusFilter | string) {
  return value === 'ALL' ? 'All statuses' : getAppointmentStatusView(value).label;
}

/** Labels for the four staff lifecycle actions, matching the API's action names. */
export type AppointmentLifecycleAction = 'reschedule' | 'cancel' | 'complete' | 'no-show';

export function getAppointmentActionLabel(action: AppointmentLifecycleAction | string) {
  switch (action) {
    case 'reschedule':
      return 'Reschedule';
    case 'cancel':
      return 'Cancel';
    case 'complete':
      return 'Complete';
    case 'no-show':
      return 'Mark no-show';
    default:
      return 'Update';
  }
}

/**
 * `datetime-local` fields read and write the device's clock, while the schedule is shown in the
 * clinic's zone. Say which zone a time is typed in whenever the two differ.
 */
/** Times typed into the schedule are read in the clinic's zone, whatever this device uses (#307). */
export function describeTimeEntryZone(clinicTimeZone: string) {
  return `Times are in the clinic's time zone, ${clinicTimeZone}.`;
}

/** An instant as the `datetime-local` value it is in clinic time. */
export function toClinicDateTimeLocal(value: string, clinicTimeZone: string) {
  return instantToWallClock(value, clinicTimeZone);
}

/** A `datetime-local` value typed in clinic time, as the instant the API stores. */
export function fromClinicDateTimeLocal(value: string, clinicTimeZone: string) {
  return value ? (wallClockToInstant(value, clinicTimeZone)?.toISOString() ?? null) : null;
}

/** The soonest confirmed visit still to start; an earlier one today is not "next" (#307, part C). */
export function nextConfirmedAppointment<T extends { status: string; startsAt: string }>(
  items: T[],
  now = Date.now(),
): T | null {
  return items
    .filter((item) => item.status === 'CONFIRMED' && Date.parse(item.startsAt) >= now)
    .reduce<T | null>(
      (soonest, item) =>
        !soonest || Date.parse(item.startsAt) < Date.parse(soonest.startsAt) ? item : soonest,
      null,
    );
}

/**
 * The line a struck-through slot carries, so a cancellation stays visible with who, when and
 * why (MASTER.md, "Corrections stay visible"; #307).
 */
export function describeCancellation(cancellation: AppointmentCancellation, timeZone: string) {
  const who =
    cancellation.by?.displayName ?? (cancellation.by ? 'a staff member' : 'an unknown user');
  const line = `Cancelled by ${who}, ${formatOpsDateTime(cancellation.at, timeZone)}.`;
  return cancellation.reason ? `${line} Reason: ${cancellation.reason}` : line;
}
