# 22. Appointments Calendar V1

## Status

Implemented for read-only staff schedule browsing.

The current codebase supports appointment requests, confirmation/rejection, appointment
persistence, reminders, and a staff-facing day/week appointment schedule. Rescheduling,
cancellation, no-show marking, and deeper lifecycle handling remain follow-on work.

Use `docs/FEATURE_GAPS_AND_NEXT_ADDITIONS.md` for the current gap summary.

---

## Goal

Patients request a date range, clinic confirms exact time. Provide staff calendar list views.

Permissions
• Patient endpoints: patient-auth only (own data)
• Clinic request triage endpoints: CLINIC_READ for triage + confirm
• Clinic appointment schedule endpoints: APPOINTMENT.READ for read-only staff schedule access

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

Staff web route
• /appointments
• Uses the active clinic context and APPOINTMENT.READ
• Supports day/week navigation, date range, status, doctor, volunteer, and patient search filters
• Uses shared loading, empty, error, and retry states

Audit events
• APPT.REQUEST.CREATE
• APPT.REQUEST.CONFIRM
• APPT.REQUEST.REJECT
• APPT.CREATE

Tests
• patient creates request
• clinic confirms
• appointment created and linked
• reminder scheduled
• appointment schedule date/status/staff/patient filters
• appointment schedule clinic isolation

Manual QA
• Desktop: open /appointments as a staff user with APPOINTMENT.READ, switch active clinics, confirm
the schedule only shows the active clinic, then test day/week navigation and filters.
• Mobile: open /appointments at 375px width, confirm the filter controls stack without horizontal
scroll, appointment cards are readable, empty states appear when filters produce no matches, and
retry is available after a simulated API failure.
• System admin: switch active clinics from the header and confirm schedule results follow the
selected clinic rather than showing all clinics.
