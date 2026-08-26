import {
  getAppointmentRequestStatusView,
  getAppointmentRequestTypeLabel,
  getAppointmentStatusView,
  getNextConfirmedAppointment,
  isPatientAppointmentActionable,
  getAppointmentActionLabel,
  getAppointmentStatusFilterLabel,
} from '@/lib/appointment-status';
import type { AppointmentSummary } from '@/lib/patient-portal';

function appointment(overrides: Partial<AppointmentSummary>): AppointmentSummary {
  return {
    id: 'appointment-1',
    clinicId: 'clinic-1',
    patientId: 'patient-1',
    startsAt: '2099-03-26T14:00:00.000Z',
    endsAt: '2099-03-26T14:30:00.000Z',
    status: 'CONFIRMED',
    linkedRequestId: null,
    assignedDoctor: null,
    assignedVolunteer: null,
    notes: null,
    createdAt: '2026-03-21T09:00:00.000Z',
    updatedAt: '2026-03-21T09:00:00.000Z',
    ...overrides,
  };
}

describe('appointment status helpers', () => {
  it('maps appointment request statuses to accessible status views', () => {
    expect(getAppointmentRequestStatusView('REQUESTED')).toMatchObject({
      label: 'Requested',
      badgeVariant: 'outline',
      category: 'pending',
    });
    expect(getAppointmentRequestStatusView('TRIAGED')).toMatchObject({
      label: 'Under review',
      badgeVariant: 'review',
      category: 'pending',
    });
    expect(getAppointmentRequestStatusView('CONFIRMED')).toMatchObject({
      label: 'Confirmed',
      badgeVariant: 'secondary',
      category: 'confirmed',
    });
    expect(getAppointmentRequestStatusView('REJECTED')).toMatchObject({
      label: 'Not approved',
      badgeVariant: 'destructive',
      category: 'closed',
    });
    expect(getAppointmentRequestStatusView('CANCELLED')).toMatchObject({
      label: 'Cancelled',
      badgeVariant: 'destructive',
      category: 'closed',
    });
    expect(getAppointmentRequestStatusView('STAFF_ESCALATED')).toMatchObject({
      label: 'Staff Escalated',
      badgeVariant: 'outline',
    });
  });

  it('maps confirmed appointment outcomes to accessible status views', () => {
    expect(getAppointmentStatusView('CONFIRMED')).toMatchObject({
      label: 'Confirmed',
      badgeVariant: 'secondary',
      category: 'upcoming',
    });
    expect(getAppointmentStatusView('COMPLETED')).toMatchObject({
      label: 'Completed',
      badgeVariant: 'finalized',
      category: 'completed',
    });
    expect(getAppointmentStatusView('CANCELLED')).toMatchObject({
      label: 'Cancelled',
      badgeVariant: 'destructive',
      category: 'cancelled',
    });
    expect(getAppointmentStatusView('NO_SHOW')).toMatchObject({
      label: 'No-show',
      badgeVariant: 'warning',
      category: 'no-show',
    });
    expect(getAppointmentStatusView('DELAYED')).toMatchObject({
      label: 'Delayed',
      badgeVariant: 'outline',
    });
  });

  it('labels appointment request types for staff-triageable patient actions', () => {
    expect(getAppointmentRequestTypeLabel('NEW_APPOINTMENT')).toBe('New appointment request');
    expect(getAppointmentRequestTypeLabel('CANCEL_APPOINTMENT')).toBe('Cancellation request');
    expect(getAppointmentRequestTypeLabel('RESCHEDULE_APPOINTMENT')).toBe('Reschedule request');
  });

  it('selects the next future confirmed appointment only', () => {
    const now = new Date('2026-03-21T12:00:00.000Z');
    const completed = appointment({
      id: 'completed-1',
      status: 'COMPLETED',
      startsAt: '2026-03-22T12:00:00.000Z',
    });
    const past = appointment({
      id: 'past-1',
      startsAt: '2026-03-20T12:00:00.000Z',
    });
    const later = appointment({
      id: 'later-1',
      startsAt: '2026-04-01T12:00:00.000Z',
    });
    const next = appointment({
      id: 'next-1',
      startsAt: '2026-03-25T12:00:00.000Z',
    });

    expect(isPatientAppointmentActionable(next, now)).toBe(true);
    expect(isPatientAppointmentActionable(past, now)).toBe(false);
    expect(isPatientAppointmentActionable(completed, now)).toBe(false);
    expect(getNextConfirmedAppointment([completed, past, later, next], now)?.id).toBe('next-1');
  });
});

describe('one vocabulary across staff and portal', () => {
  it('renders a status the same way wherever it appears', () => {
    // A request and the appointment it produced both read `CONFIRMED`, and used to render in two
    // different colours on the same page.
    for (const status of ['CONFIRMED', 'CANCELLED']) {
      expect(getAppointmentRequestStatusView(status).badgeVariant).toBe(
        getAppointmentStatusView(status).badgeVariant,
      );
      expect(getAppointmentRequestStatusView(status).label).toBe(
        getAppointmentStatusView(status).label,
      );
    }
  });

  it('gives every status a description, not only a colour', () => {
    for (const status of ['CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']) {
      expect(getAppointmentStatusView(status).description).not.toHaveLength(0);
    }
    for (const status of ['REQUESTED', 'TRIAGED', 'CONFIRMED', 'REJECTED', 'CANCELLED']) {
      expect(getAppointmentRequestStatusView(status).description).not.toHaveLength(0);
    }
  });

  it('names the staff filter and lifecycle actions the API uses', () => {
    expect(getAppointmentStatusFilterLabel('ALL')).toBe('All statuses');
    expect(getAppointmentStatusFilterLabel('NO_SHOW')).toBe('No-show');
    expect(getAppointmentActionLabel('reschedule')).toBe('Reschedule');
    expect(getAppointmentActionLabel('no-show')).toBe('Mark no-show');
    expect(getAppointmentActionLabel('complete')).toBe('Complete');
    expect(getAppointmentActionLabel('cancel')).toBe('Cancel');
  });

  it('falls back readably for a status this build does not know', () => {
    expect(getAppointmentStatusView('SOME_NEW_STATE').label).toBe('Some New State');
    expect(getAppointmentRequestStatusView('SOME_NEW_STATE').badgeVariant).toBe('outline');
  });
});
