import { AppointmentRequestStatus, AppointmentStatus, UserRole } from '@prisma/client';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../auth/constants/permissions';

/**
 * The appointment workflow, described once.
 *
 * Appointment V2 spans the patient portal, the staff calendar, reminders, audit, and permissions.
 * Each shipped with its own narrow tests, and the workflow between them was only ever described in
 * prose. This table is the single description that the transition suite, the authorization suite,
 * the reminder suite, and the published lifecycle matrix are all generated from, so none of them
 * can describe a workflow the service does not implement.
 *
 * Adding a lifecycle action without deciding its source states, its permission, its audit action,
 * and what it does to a queued reminder is a type error.
 */

/** The four staff actions that move an existing appointment. Mirrors the service's own union. */
export type AppointmentLifecycleAction = 'reschedule' | 'cancel' | 'complete' | 'no-show';

/** The two staff actions that resolve a patient's request. */
export type AppointmentRequestAction = 'confirm' | 'reject';

export interface AppointmentTransition {
  readonly action: AppointmentLifecycleAction;
  /** Human label used by the generated document. */
  readonly label: string;
  /** Statuses the action may be applied from. Every other status must be refused. */
  readonly fromStatuses: readonly AppointmentStatus[];
  /** Status the appointment holds afterwards. `reschedule` keeps the appointment confirmed. */
  readonly toStatus: AppointmentStatus;
  /** Whether the action is refused until `startsAt` has passed. */
  readonly requiresStarted: boolean;
  /** Whether a non-empty reason is required before anything is written. */
  readonly requiresReason: boolean;
  readonly permission: string;
  readonly auditAction: string;
  /** `failureReason` written onto queued reminders the action invalidates. */
  readonly reminderSuppressionReason: string;
  /** Whether a fresh reminder is scheduled after the suppression. */
  readonly schedulesReminder: boolean;
}

export const APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CANCELLED,
  AppointmentStatus.COMPLETED,
  AppointmentStatus.NO_SHOW,
];

/**
 * An appointment row is born `CONFIRMED` when staff confirm a request, so `CONFIRMED` is the only
 * source state any action has. The three other statuses are terminal.
 */
export const APPOINTMENT_TRANSITIONS: readonly AppointmentTransition[] = [
  {
    action: 'reschedule',
    label: 'Reschedule',
    fromStatuses: [AppointmentStatus.CONFIRMED],
    toStatus: AppointmentStatus.CONFIRMED,
    requiresStarted: false,
    requiresReason: false,
    permission: PERMISSIONS.APPOINTMENT_WRITE,
    auditAction: 'APPT.RESCHEDULE',
    reminderSuppressionReason: 'APPOINTMENT_RESCHEDULED',
    schedulesReminder: true,
  },
  {
    action: 'cancel',
    label: 'Cancel',
    fromStatuses: [AppointmentStatus.CONFIRMED],
    toStatus: AppointmentStatus.CANCELLED,
    requiresStarted: false,
    requiresReason: true,
    permission: PERMISSIONS.APPOINTMENT_WRITE,
    auditAction: 'APPT.CANCEL',
    reminderSuppressionReason: 'APPOINTMENT_CANCELLED',
    schedulesReminder: false,
  },
  {
    action: 'complete',
    label: 'Complete',
    fromStatuses: [AppointmentStatus.CONFIRMED],
    toStatus: AppointmentStatus.COMPLETED,
    requiresStarted: true,
    requiresReason: false,
    permission: PERMISSIONS.APPOINTMENT_WRITE,
    auditAction: 'APPT.COMPLETE',
    reminderSuppressionReason: 'APPOINTMENT_COMPLETED',
    schedulesReminder: false,
  },
  {
    action: 'no-show',
    label: 'Mark no-show',
    fromStatuses: [AppointmentStatus.CONFIRMED],
    toStatus: AppointmentStatus.NO_SHOW,
    requiresStarted: true,
    requiresReason: false,
    permission: PERMISSIONS.APPOINTMENT_WRITE,
    auditAction: 'APPT.NO_SHOW',
    reminderSuppressionReason: 'APPOINTMENT_NO_SHOW',
    schedulesReminder: false,
  },
];

export interface AppointmentRequestTransition {
  readonly action: AppointmentRequestAction;
  readonly label: string;
  readonly fromStatuses: readonly AppointmentRequestStatus[];
  readonly toStatus: AppointmentRequestStatus;
  readonly requiresReason: boolean;
  readonly permission: string;
  /** Audit action recorded against the request itself. */
  readonly auditAction: string;
  /** Audit action recorded against the appointment the transition creates, if any. */
  readonly createsAppointmentAuditAction?: string;
  readonly schedulesReminder: boolean;
}

export const APPOINTMENT_REQUEST_STATUSES: readonly AppointmentRequestStatus[] = [
  AppointmentRequestStatus.REQUESTED,
  AppointmentRequestStatus.TRIAGED,
  AppointmentRequestStatus.CONFIRMED,
  AppointmentRequestStatus.REJECTED,
  AppointmentRequestStatus.CANCELLED,
];

export const APPOINTMENT_REQUEST_TRANSITIONS: readonly AppointmentRequestTransition[] = [
  {
    action: 'confirm',
    label: 'Confirm request',
    fromStatuses: [AppointmentRequestStatus.REQUESTED, AppointmentRequestStatus.TRIAGED],
    toStatus: AppointmentRequestStatus.CONFIRMED,
    requiresReason: false,
    permission: PERMISSIONS.APPOINTMENT_WRITE,
    auditAction: 'APPT.REQUEST.CONFIRM',
    createsAppointmentAuditAction: 'APPT.CREATE',
    schedulesReminder: true,
  },
  {
    action: 'reject',
    label: 'Reject request',
    fromStatuses: [AppointmentRequestStatus.REQUESTED, AppointmentRequestStatus.TRIAGED],
    toStatus: AppointmentRequestStatus.REJECTED,
    requiresReason: true,
    permission: PERMISSIONS.APPOINTMENT_WRITE,
    auditAction: 'APPT.REQUEST.REJECT',
    schedulesReminder: false,
  },
];

/** How a patient opens a request. Each writes a request row and never touches an appointment. */
export interface PatientRequestOrigin {
  readonly id: 'new-appointment' | 'cancel-appointment' | 'reschedule-appointment';
  readonly label: string;
  readonly requestType: 'NEW_APPOINTMENT' | 'CANCEL_APPOINTMENT' | 'RESCHEDULE_APPOINTMENT';
  readonly permission: string;
  readonly auditAction: string;
  /** Whether the request must name an existing appointment the patient owns. */
  readonly requiresSourceAppointment: boolean;
  readonly requiresReason: boolean;
}

export const PATIENT_REQUEST_ORIGINS: readonly PatientRequestOrigin[] = [
  {
    id: 'new-appointment',
    label: 'Request a new visit',
    requestType: 'NEW_APPOINTMENT',
    permission: PERMISSIONS.PATIENT_PORTAL_WRITE_SELF_REPORT,
    auditAction: 'APPT.REQUEST.CREATE',
    requiresSourceAppointment: false,
    requiresReason: false,
  },
  {
    id: 'cancel-appointment',
    label: 'Request a cancellation',
    requestType: 'CANCEL_APPOINTMENT',
    permission: PERMISSIONS.PATIENT_PORTAL_WRITE_SELF_REPORT,
    auditAction: 'APPT.REQUEST.CANCEL_REQUEST.CREATE',
    requiresSourceAppointment: true,
    requiresReason: true,
  },
  {
    id: 'reschedule-appointment',
    label: 'Request a reschedule',
    requestType: 'RESCHEDULE_APPOINTMENT',
    permission: PERMISSIONS.PATIENT_PORTAL_WRITE_SELF_REPORT,
    auditAction: 'APPT.REQUEST.RESCHEDULE_REQUEST.CREATE',
    requiresSourceAppointment: true,
    requiresReason: false,
  },
];

/**
 * Where a route takes its clinic from.
 *
 * Staff routes carry the clinic in the path; patient routes carry it in `X-Clinic-Id`. The two are
 * easy to confuse when adding a route, and picking the wrong one silently changes who is admitted.
 */
export type ClinicScopeSource = 'param' | 'header';

export interface AppointmentRoute {
  /** Stable identifier used as the document's row key. */
  readonly id: string;
  readonly label: string;
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly controller: 'staff-appointments' | 'staff-appointment-requests' | 'patient';
  /** Handler name on the controller, so the guards resolve the route's real metadata. */
  readonly handler: string;
  readonly clinicScope: ClinicScopeSource;
  readonly permission: string;
}

export const APPOINTMENT_ROUTES: readonly AppointmentRoute[] = [
  {
    id: 'staff-list-appointments',
    label: 'List the clinic schedule',
    method: 'GET',
    path: '/clinics/:clinicId/appointments',
    controller: 'staff-appointments',
    handler: 'listAppointments',
    clinicScope: 'param',
    permission: PERMISSIONS.APPOINTMENT_READ,
  },
  {
    id: 'staff-list-staff-options',
    label: 'List assignable staff',
    method: 'GET',
    path: '/clinics/:clinicId/appointments/staff-options',
    controller: 'staff-appointments',
    handler: 'listAppointmentStaffOptions',
    clinicScope: 'param',
    permission: PERMISSIONS.APPOINTMENT_READ,
  },
  {
    id: 'staff-reschedule',
    label: 'Reschedule an appointment',
    method: 'POST',
    path: '/clinics/:clinicId/appointments/:appointmentId/reschedule',
    controller: 'staff-appointments',
    handler: 'rescheduleAppointment',
    clinicScope: 'param',
    permission: PERMISSIONS.APPOINTMENT_WRITE,
  },
  {
    id: 'staff-cancel',
    label: 'Cancel an appointment',
    method: 'POST',
    path: '/clinics/:clinicId/appointments/:appointmentId/cancel',
    controller: 'staff-appointments',
    handler: 'cancelAppointment',
    clinicScope: 'param',
    permission: PERMISSIONS.APPOINTMENT_WRITE,
  },
  {
    id: 'staff-complete',
    label: 'Complete an appointment',
    method: 'POST',
    path: '/clinics/:clinicId/appointments/:appointmentId/complete',
    controller: 'staff-appointments',
    handler: 'completeAppointment',
    clinicScope: 'param',
    permission: PERMISSIONS.APPOINTMENT_WRITE,
  },
  {
    id: 'staff-no-show',
    label: 'Mark an appointment no-show',
    method: 'POST',
    path: '/clinics/:clinicId/appointments/:appointmentId/no-show',
    controller: 'staff-appointments',
    handler: 'markAppointmentNoShow',
    clinicScope: 'param',
    permission: PERMISSIONS.APPOINTMENT_WRITE,
  },
  {
    id: 'staff-list-requests',
    label: 'List patient requests',
    method: 'GET',
    path: '/clinics/:clinicId/appointment-requests',
    controller: 'staff-appointment-requests',
    handler: 'listAppointmentRequests',
    clinicScope: 'param',
    permission: PERMISSIONS.APPOINTMENT_READ,
  },
  {
    id: 'staff-confirm-request',
    label: 'Confirm a patient request',
    method: 'POST',
    path: '/clinics/:clinicId/appointment-requests/:requestId/confirm',
    controller: 'staff-appointment-requests',
    handler: 'confirmAppointmentRequest',
    clinicScope: 'param',
    permission: PERMISSIONS.APPOINTMENT_WRITE,
  },
  {
    id: 'staff-reject-request',
    label: 'Reject a patient request',
    method: 'POST',
    path: '/clinics/:clinicId/appointment-requests/:requestId/reject',
    controller: 'staff-appointment-requests',
    handler: 'rejectAppointmentRequest',
    clinicScope: 'param',
    permission: PERMISSIONS.APPOINTMENT_WRITE,
  },
  {
    id: 'patient-create-request',
    label: 'Open a new visit request',
    method: 'POST',
    path: '/patients/me/appointment-requests',
    controller: 'patient',
    handler: 'createAppointmentRequest',
    clinicScope: 'header',
    permission: PERMISSIONS.PATIENT_PORTAL_WRITE_SELF_REPORT,
  },
  {
    id: 'patient-list-requests',
    label: 'Read own requests',
    method: 'GET',
    path: '/patients/me/appointment-requests',
    controller: 'patient',
    handler: 'listAppointmentRequests',
    clinicScope: 'header',
    permission: PERMISSIONS.PATIENT_PORTAL_READ_SELF,
  },
  {
    id: 'patient-list-appointments',
    label: 'Read own appointments',
    method: 'GET',
    path: '/patients/me/appointments',
    controller: 'patient',
    handler: 'listAppointments',
    clinicScope: 'header',
    permission: PERMISSIONS.PATIENT_PORTAL_READ_SELF,
  },
  {
    id: 'patient-cancel-request',
    label: 'Request a cancellation',
    method: 'POST',
    path: '/patients/me/appointments/:appointmentId/cancel-request',
    controller: 'patient',
    handler: 'createCancelAppointmentRequest',
    clinicScope: 'header',
    permission: PERMISSIONS.PATIENT_PORTAL_WRITE_SELF_REPORT,
  },
  {
    id: 'patient-reschedule-request',
    label: 'Request a reschedule',
    method: 'POST',
    path: '/patients/me/appointments/:appointmentId/reschedule-request',
    controller: 'patient',
    handler: 'createRescheduleAppointmentRequest',
    clinicScope: 'header',
    permission: PERMISSIONS.PATIENT_PORTAL_WRITE_SELF_REPORT,
  },
];

/** Roles the lifecycle matrix reports on, in the order the document lists them. */
export const APPOINTMENT_MATRIX_ROLES: readonly UserRole[] = [
  UserRole.SYSTEM_ADMIN,
  UserRole.DIRECTOR,
  UserRole.MANAGER,
  UserRole.DOCTOR,
  UserRole.VOLUNTEER,
  UserRole.PATIENT,
];

export function roleHoldsAppointmentPermission(role: UserRole, permission: string): boolean {
  const granted = ROLE_PERMISSIONS[role];
  return granted.includes('*') || granted.includes(permission);
}

export function transitionFor(action: AppointmentLifecycleAction): AppointmentTransition {
  const match = APPOINTMENT_TRANSITIONS.find((entry) => entry.action === action);
  if (!match) throw new Error(`No appointment transition for ${action}`);
  return match;
}

export function requestTransitionFor(
  action: AppointmentRequestAction,
): AppointmentRequestTransition {
  const match = APPOINTMENT_REQUEST_TRANSITIONS.find((entry) => entry.action === action);
  if (!match) throw new Error(`No appointment request transition for ${action}`);
  return match;
}

export function isAllowedTransition(
  status: AppointmentStatus,
  action: AppointmentLifecycleAction,
): boolean {
  return transitionFor(action).fromStatuses.includes(status);
}

export function isAllowedRequestTransition(
  status: AppointmentRequestStatus,
  action: AppointmentRequestAction,
): boolean {
  return requestTransitionFor(action).fromStatuses.includes(status);
}

/**
 * Every `status x action` pair, so a suite can assert the refusals as deliberately as the
 * approvals. A transition matrix that only lists what is allowed says nothing about what happens
 * to everything else.
 */
export function appointmentTransitionMatrix(): ReadonlyArray<{
  status: AppointmentStatus;
  action: AppointmentLifecycleAction;
  allowed: boolean;
}> {
  return APPOINTMENT_STATUSES.flatMap((status) =>
    APPOINTMENT_TRANSITIONS.map((transition) => ({
      status,
      action: transition.action,
      allowed: transition.fromStatuses.includes(status),
    })),
  );
}

export function appointmentRequestTransitionMatrix(): ReadonlyArray<{
  status: AppointmentRequestStatus;
  action: AppointmentRequestAction;
  allowed: boolean;
}> {
  return APPOINTMENT_REQUEST_STATUSES.flatMap((status) =>
    APPOINTMENT_REQUEST_TRANSITIONS.map((transition) => ({
      status,
      action: transition.action,
      allowed: transition.fromStatuses.includes(status),
    })),
  );
}
