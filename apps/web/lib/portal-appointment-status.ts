import type { AppointmentRequestRecord, AppointmentSummary } from '@/lib/patient-portal';

export type PortalStatusBadgeVariant =
  | 'secondary'
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
        badgeVariant: 'secondary',
        category: 'pending',
      };
    case 'TRIAGED':
      return {
        label: 'Under review',
        description: 'Clinic staff have started reviewing this request.',
        badgeVariant: 'warning',
        category: 'pending',
      };
    case 'CONFIRMED':
      return {
        label: 'Confirmed',
        description: 'The clinic approved this request and attached an appointment.',
        badgeVariant: 'finalized',
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
        badgeVariant: 'outline',
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
