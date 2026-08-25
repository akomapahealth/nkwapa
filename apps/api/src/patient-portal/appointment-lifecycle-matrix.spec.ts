import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppointmentRequestStatus, AppointmentStatus } from '@prisma/client';
import {
  APPOINTMENT_REQUEST_TRANSITIONS,
  APPOINTMENT_ROUTES,
  APPOINTMENT_STATUSES,
  APPOINTMENT_TRANSITIONS,
  PATIENT_REQUEST_ORIGINS,
} from '../testing/appointment-lifecycle';
import { renderAppointmentLifecycleMatrix } from '../testing/appointment-matrix-doc';

const DOC_PATH = resolve(__dirname, '../../../../docs/security/appointment-lifecycle-matrix.md');
const SERVICE_PATH = resolve(__dirname, 'patient-portal.service.ts');
const REMINDER_SERVICE_PATH = resolve(__dirname, '../reminders/reminder.service.ts');

/**
 * The lifecycle table against the code it claims to describe.
 *
 * The suites elsewhere prove the service behaves the way the table says. This one proves the table
 * is still about the service: a transition removed from the code, an audit event renamed, or a
 * status added to the schema all show up here rather than as a document that quietly stops being
 * true.
 */
describe('appointment lifecycle matrix', () => {
  const serviceSource = readFileSync(SERVICE_PATH, 'utf8');
  const reminderSource = readFileSync(REMINDER_SERVICE_PATH, 'utf8');

  it('matches the published document', () => {
    // Regenerate with: npm run docs:appointment-matrix --workspace=@nkwapa/api
    expect(readFileSync(DOC_PATH, 'utf8')).toBe(renderAppointmentLifecycleMatrix());
  });

  it('covers every appointment status the schema allows', () => {
    expect([...APPOINTMENT_STATUSES].sort()).toEqual(Object.values(AppointmentStatus).sort());
  });

  it('names a source status the schema allows for every transition', () => {
    for (const transition of [...APPOINTMENT_TRANSITIONS]) {
      expect(transition.fromStatuses.length).toBeGreaterThan(0);
      for (const status of transition.fromStatuses) {
        expect(Object.values(AppointmentStatus)).toContain(status);
      }
      expect(Object.values(AppointmentStatus)).toContain(transition.toStatus);
    }
    for (const transition of [...APPOINTMENT_REQUEST_TRANSITIONS]) {
      for (const status of transition.fromStatuses) {
        expect(Object.values(AppointmentRequestStatus)).toContain(status);
      }
      expect(Object.values(AppointmentRequestStatus)).toContain(transition.toStatus);
    }
  });

  it('names an audit event the service actually writes', () => {
    const declared = [
      ...APPOINTMENT_TRANSITIONS.map((t) => t.auditAction),
      ...APPOINTMENT_REQUEST_TRANSITIONS.flatMap((t) =>
        [t.auditAction, t.createsAppointmentAuditAction].filter(
          (entry): entry is string => entry !== undefined,
        ),
      ),
      ...PATIENT_REQUEST_ORIGINS.map((origin) => origin.auditAction),
    ];

    for (const action of declared) {
      expect(serviceSource).toContain(`'${action}'`);
    }
  });

  it('does not leave an appointment audit event out of the table', () => {
    // Anything the service logs against an appointment must be described, or the matrix is
    // reporting on a workflow narrower than the one that runs.
    const logged = [...serviceSource.matchAll(/'(APPT\.[A-Z_.]+)'/g)].map((match) => match[1]);
    const described = new Set([
      ...APPOINTMENT_TRANSITIONS.map((t) => t.auditAction),
      ...APPOINTMENT_REQUEST_TRANSITIONS.flatMap((t) =>
        [t.auditAction, t.createsAppointmentAuditAction].filter(
          (entry): entry is string => entry !== undefined,
        ),
      ),
      ...PATIENT_REQUEST_ORIGINS.map((origin) => origin.auditAction),
    ]);

    expect(logged.length).toBeGreaterThan(0);
    expect([...new Set(logged)].filter((action) => !described.has(action))).toEqual([]);
  });

  it('names a reminder suppression reason the service actually passes', () => {
    for (const transition of [...APPOINTMENT_TRANSITIONS]) {
      expect(serviceSource).toContain(`'${transition.reminderSuppressionReason}'`);
    }
  });

  it('keeps the send-time check in step with the suppression reasons', () => {
    // A queued reminder is suppressed when the appointment moves, and checked again at send time
    // in case a job escaped. Both defences must exist or a stale reminder reaches a patient.
    expect(reminderSource).toContain('suppressQueuedAppointmentReminders');
    expect(reminderSource).toContain('getAppointmentSendSuppressionReason');
  });

  it('names a handler that exists on the controller it points at', () => {
    // The authorization suite resolves guard metadata through these names. A renamed handler would
    // otherwise silently drop a route from the matrix instead of failing.
    const sources: Record<string, string> = {
      'staff-appointments': readFileSync(
        resolve(__dirname, 'clinic-appointments.controller.ts'),
        'utf8',
      ),
      'staff-appointment-requests': readFileSync(
        resolve(__dirname, 'clinic-appointment-requests.controller.ts'),
        'utf8',
      ),
      patient: readFileSync(resolve(__dirname, 'patient-api.controller.ts'), 'utf8'),
    };

    for (const route of [...APPOINTMENT_ROUTES]) {
      expect(sources[route.controller]).toContain(`async ${route.handler}(`);
    }
  });

  it('describes every appointment route the controllers expose', () => {
    const staffRoutes = readFileSync(
      resolve(__dirname, 'clinic-appointments.controller.ts'),
      'utf8',
    );
    const requestRoutes = readFileSync(
      resolve(__dirname, 'clinic-appointment-requests.controller.ts'),
      'utf8',
    );
    const handlerCount = (source: string) =>
      [...source.matchAll(/^ {2}async ([a-zA-Z]+)\(/gm)].length;

    expect(
      APPOINTMENT_ROUTES.filter((route) => route.controller === 'staff-appointments').length,
    ).toBe(handlerCount(staffRoutes));
    expect(
      APPOINTMENT_ROUTES.filter((route) => route.controller === 'staff-appointment-requests')
        .length,
    ).toBe(handlerCount(requestRoutes));
  });
});
