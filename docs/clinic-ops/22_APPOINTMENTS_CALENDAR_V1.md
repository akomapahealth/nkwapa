# 22. Appointments Calendar V1

## Status

Implemented end to end, and gated.

The full workflow ships: patient requests, staff triage on `/appointments`, appointment
persistence, the four lifecycle transitions, patient change requests, and reminder automation tied
to every transition. A regression and acceptance suite covers it.

See `docs/specs/12_APPOINTMENT_OPERATIONS_RELEASE_GATE.md` for the release gate and what it found,
`docs/security/appointment-lifecycle-matrix.md` for the generated transition and permission matrix,
and `docs/USER_TESTING_GUIDE.md` section 15 for the manual acceptance checks. Use
`docs/FEATURE_GAPS_AND_NEXT_ADDITIONS.md` for the remaining gap summary.

---

## Goal

Patients request a date range, clinic confirms exact time. Provide staff calendar list views.

Permissions
• Patient endpoints: patient-auth only (own data), PATIENT.PORTAL.READ_SELF to read and
PATIENT.PORTAL.WRITE_SELF_REPORT to open a request
• Clinic request and schedule reads: APPOINTMENT.READ (director, manager, doctor, volunteer)
• Clinic request triage and every lifecycle mutation: APPOINTMENT.WRITE (manager, doctor)
• Request listing used CLINIC_READ, which a doctor does not hold, so a doctor could confirm a
request they could not open. Corrected to APPOINTMENT.READ.

Prisma Models

AppointmentRequest

Fields:
• id, clinicId, patientId
• preferredStartDate (date)
• preferredEndDate (date)
• reason?, notes?
• status enum: REQUESTED | TRIAGED | CONFIRMED | REJECTED | CANCELLED
• triagedByUserId?, triagedAt?
• timestamps

Indexes:
• (clinicId, status, createdAt)
• (patientId, createdAt)

Appointment

Fields:
• id, clinicId, patientId
• startsAt, endsAt
• status enum: CONFIRMED | CANCELLED | COMPLETED | NO_SHOW
• linkedRequestId?
• assignedDoctorId?, assignedVolunteerId?
• notes?
• timestamps

Indexes:
• (clinicId, startsAt)
• (patientId, startsAt)

Endpoints

Patient
• POST /patients/me/appointment-requests
• body: { clinicId, preferredStartDate, preferredEndDate, reason?, notes? }
• GET /patients/me/appointment-requests

Clinic staff
• GET /clinics/:clinicId/appointment-requests?status=REQUESTED&from=&to=
• POST /clinics/:clinicId/appointment-requests/:id/confirm
• body: { startsAt, endsAt, assignedDoctorId?, assignedVolunteerId?, notes? }
• creates Appointment + marks request CONFIRMED
• schedules SMS reminder(s) (24h prior default; configurable later)
• POST /clinics/:clinicId/appointment-requests/:id/reject
• body: { reason } marks request REJECTED
• GET /clinics/:clinicId/appointments?from=&to=&status=&assignedDoctorId=&assignedVolunteerId=&patientSearch=
• GET /clinics/:clinicId/appointments/staff-options
• POST /clinics/:clinicId/appointments/:id/reschedule
• body: { startsAt, endsAt, assignedDoctorId?, assignedVolunteerId?, notes? }
• suppresses the queued reminder and schedules a new one
• POST /clinics/:clinicId/appointments/:id/cancel
• body: { reason } required
• POST /clinics/:clinicId/appointments/:id/complete
• body: { notes? }, refused before the appointment start time
• POST /clinics/:clinicId/appointments/:id/no-show
• body: { reason? }, refused before the appointment start time

Patient change requests
• POST /patients/me/appointments/:appointmentId/cancel-request
• body: { reason, notes? } creates a CANCEL_APPOINTMENT request
• POST /patients/me/appointments/:appointmentId/reschedule-request
• body: { preferredStartDate, preferredEndDate, reason?, notes? } creates a
RESCHEDULE_APPOINTMENT request
• neither mutates the appointment; both require it to be CONFIRMED and still in the future

Staff web route
• /appointments
• Uses the active clinic context and APPOINTMENT.READ
• Pending patient requests sit above the schedule, with confirm and reject dialogs
• Supports day/week navigation, date range, status, doctor, volunteer, and patient search filters
• Lifecycle actions on confirmed appointments, hidden entirely without APPOINTMENT.WRITE
• Uses shared loading, empty, error, and retry states, one status vocabulary with the portal, and
an aria-live region that announces the schedule changing
• Cards below 1024 pixels, table above

Audit events
• APPT.REQUEST.CREATE
• APPT.REQUEST.CANCEL_REQUEST.CREATE
• APPT.REQUEST.RESCHEDULE_REQUEST.CREATE
• APPT.REQUEST.CONFIRM
• APPT.REQUEST.REJECT
• APPT.CREATE
• APPT.RESCHEDULE
• APPT.CANCEL
• APPT.COMPLETE
• APPT.NO_SHOW
• REMINDER.CREATE, REMINDER.SUPPRESS, REMINDER.SENT, REMINDER.SEND_FAILED
A drift test fails when the service logs an APPT event the lifecycle table does not describe.

Tests
The lifecycle is described once in apps/api/src/testing/appointment-lifecycle.ts, and the suites
below are generated from it, as is the published matrix.
• apps/api/src/patient-portal/appointment-lifecycle.spec.ts
every status and action pair including the refusals, the start-time gate, the concurrency guard,
validation ordering, and one walk of the whole workflow
• apps/api/src/patient-portal/appointment-access.spec.ts
every route and role through the real ClinicScopeGuard and RbacGuard, the cross-clinic seat
holder, patient ownership, and clinic scoping in the queries themselves
• apps/api/src/patient-portal/appointment-lifecycle-matrix.spec.ts
drift between the table, the service, the controllers, and the published document
• apps/api/src/reminders/appointment-reminder-lifecycle.spec.ts
scheduling, suppression on every transition, and the send-time re-check
• apps/web/e2e/appointments.spec.js
triage, the lifecycle dialogs, role gating, the portal views, and the four supported widths

Test data
• SEED_SAMPLE_APPOINTMENTS=true npm run db:seed
• one appointment in each of the four states plus two pending requests, times relative to the run

Manual QA
The full checklist is docs/USER_TESTING_GUIDE.md section 15. In summary:
• Desktop: open /appointments as a staff user with APPOINTMENT.READ, switch active clinics, confirm
the schedule and the request queue only show the active clinic, then test day/week navigation and
filters.
• Triage: confirm a request and watch the visit appear on the schedule below; decline one and
confirm the reason reaches the patient's request history.
• Lifecycle: reschedule, cancel, complete, and mark a no-show, and confirm complete and no-show are
refused before the start time.
• Roles: repeat as a volunteer and confirm no action is offered anywhere.
• Mobile: open /appointments at 375px width, confirm the filter controls stack without horizontal
scroll, appointment cards are readable, empty states appear when filters produce no matches, and
retry is available after a simulated API failure.
• System admin: switch active clinics from the header and confirm schedule results follow the
selected clinic rather than showing all clinics.
