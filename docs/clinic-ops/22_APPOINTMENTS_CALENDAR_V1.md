
/docs/specs/22_APPOINTMENTS_CALENDAR_V1.md

Goal

Patients request a date range, clinic confirms exact time. Provide staff calendar list views.

Permissions
	•	Patient endpoints: patient-auth only (own data)
	•	Clinic endpoints: CLINIC_READ (or Manager/Director) for triage + confirm

Prisma Models

AppointmentRequest

Fields:
	•	id, clinicId, patientId
	•	preferredStartDate (date)
	•	preferredEndDate (date)
	•	reason?, notes?
	•	status enum: REQUESTED | TRIAGED | CONFIRMED | REJECTED | CANCELLED
	•	triagedByUserId?, triagedAt?
	•	timestamps

Indexes:
	•	(clinicId, status, createdAt)
	•	(patientId, createdAt)

Appointment

Fields:
	•	id, clinicId, patientId
	•	startsAt, endsAt
	•	status enum: CONFIRMED | CANCELLED | COMPLETED | NO_SHOW
	•	linkedRequestId?
	•	assignedDoctorId?, assignedVolunteerId?
	•	notes?
	•	timestamps

Indexes:
	•	(clinicId, startsAt)
	•	(patientId, startsAt)

Endpoints

Patient
	•	POST /patients/me/appointment-requests
	•	body: { clinicId, preferredStartDate, preferredEndDate, reason?, notes? }
	•	GET /patients/me/appointment-requests

Clinic staff
	•	GET /clinics/:clinicId/appointment-requests?status=REQUESTED&from=&to=
	•	POST /clinics/:clinicId/appointment-requests/:id/confirm
	•	body: { startsAt, endsAt, assignedDoctorId?, assignedVolunteerId?, notes? }
	•	creates Appointment + marks request CONFIRMED
	•	schedules SMS reminder(s) (24h prior default; configurable later)
	•	POST /clinics/:clinicId/appointment-requests/:id/reject
	•	body: { reason } marks request REJECTED

Audit events
	•	APPT.REQUEST.CREATE
	•	APPT.REQUEST.CONFIRM
	•	APPT.REQUEST.REJECT
	•	APPT.CREATE

Tests
	•	patient creates request
	•	clinic confirms
	•	appointment created and linked
	•	reminder scheduled
