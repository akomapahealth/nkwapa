Alright — your rough draft is strong. What you’re describing is basically Clinic Ops (manager assignment + check-in roster) + Patient Portal (self-logged screenings + scheduling + reminders) + Research-safe data pipeline + Admin lifecycle controls (deactivate/delete) + Role-based analytics dashboards.

Below is a structured design + implementation flow your agents can follow. I’ll keep it detailed, instructional, and sequential, and I’ll add the missing pieces that make this scalable.

⸻

A) Big picture: what we’re building next

Feature Set 1 — Clinic Ops: “Daily Check-in + Assignment”
	•	Staff check in for a shift (Volunteer/Doctor/Preceptor “I’m on duty” mode)
	•	Patients check in for a visit (in-person)
	•	Manager assigns patients to Volunteers/Doctors for that clinic/day
	•	Track timestamps for analysis: staff shift times + patient check-in time + assignment time + encounter start/finalize time

Feature Set 2 — Patient Portal: “Self-logging + Scheduling”
	•	Patients can:
	•	log BP/glucose at home (self-screening)
	•	request follow-up
	•	schedule a visit (calendar)
	•	Staff sees:
	•	patient requests queue
	•	upcoming appointments
	•	patient’s self-logged trends (helpful context in clinic)

Feature Set 3 — Research pipeline compatibility
	•	Everything stored in a way that:
	•	is clinic-scoped
	•	is exportable into de-identified datasets
	•	respects consent + director clinic gating
	•	excludes PII (name, DOB, phone, national id, etc.)

Feature Set 4 — Admin lifecycle controls
	•	Manager/Director/SysAdmin can deactivate users (and optionally clinics)
	•	“Delete buttons” in admin tables (but we should do deactivate not hard-delete for safety/audit)

Feature Set 5 — Role dashboards + trends
	•	Patients: trend graphs and progress
	•	Clinicians: patient trend views + clinic-level summaries
	•	Managers/Directors: operational + program health metrics

⸻

B) Key design decisions (to keep it scalable)

1) Use “Events + States” for check-in and assignments

Assignments and check-ins are inherently operational (not the same as “Encounter” clinical record). Don’t overload Encounter with this.

Create separate entities:
	•	StaffShift (who is on-duty, when)
	•	PatientCheckIn (patient arrived at clinic at a time)
	•	PatientAssignment (manager assignment record: patient -> staff)

Encounters remain clinical documentation.

2) Deactivate instead of delete (with soft-delete)

If you hard-delete staff, you destroy audit trails and historical records.

Use:
	•	User.isActive=false
	•	optional UserClinicRole revocation (delete mapping) or set endedAt
	•	keep audit + historical encounters intact

3) Scheduling must be role-agnostic

A calendar is a shared primitive:
	•	Appointment entity that links patient + clinic + optional staff
	•	“Requests” can be implemented as appointment status and/or separate request table

4) Research export uses a dedicated de-identified view model

For research, don’t export from “raw tables” directly.
Define a ResearchExportView transformation step:
	•	replaces patientId with pseudonymous ID
	•	strips/aggregates PII fields
	•	includes clinical measures & timestamps
	•	obeys consent + clinic gating

⸻

C) Data model changes (Prisma additions)

Below are new core tables (minimal now; expandable later). Your agents can implement these in packages/db/prisma/schema.prisma with migrations.

1) Staff shifts (Check-in mode for staff)

StaffShift
	•	id
	•	clinicId
	•	userId
	•	roleAtShift (VOLUNTEER/DOCTOR/PRECEPTOR) — snapshot role for that shift
	•	checkedInAt
	•	checkedOutAt nullable
	•	status (ACTIVE/CLOSED)
	•	notes nullable
	•	indexes: (clinicId, checkedInAt), (userId, checkedInAt)

This enables: “who is on duty today”, utilization analytics, and manager assignment UI.

2) Patient clinic check-in (daily arrivals)

PatientCheckIn
	•	id
	•	clinicId
	•	patientId
	•	checkedInAt
	•	source enum: STAFF, PATIENT_SELF (future: kiosk)
	•	status enum: WAITING, ASSIGNED, IN_PROGRESS, COMPLETED, CANCELLED
	•	encounterId nullable (link once encounter starts)
	•	indexes: (clinicId, checkedInAt), (patientId, checkedInAt)

3) Assignments (Manager-only)

PatientAssignment
	•	id
	•	clinicId
	•	patientCheckInId (or patientId + date; but checkinId is cleaner)
	•	assignedVolunteerId nullable
	•	assignedDoctorId nullable
	•	assignedByUserId (manager)
	•	assignedAt
	•	status enum: ACTIVE, REASSIGNED, CANCELLED
	•	reason nullable
	•	indexes: (clinicId, assignedAt)

Rules:
	•	Only MANAGER (or DIRECTOR/SYSADMIN) can create/modify assignment.
	•	Assignment history is preserved (audit + assignment table).

4) Appointments (calendar)

Appointment
	•	id
	•	clinicId
	•	patientId
	•	startsAt, endsAt
	•	status enum: REQUESTED, CONFIRMED, CANCELLED, COMPLETED, NO_SHOW
	•	requestedBy enum: PATIENT, STAFF
	•	assignedDoctorId nullable
	•	assignedVolunteerId nullable
	•	notes nullable
	•	indexes: (clinicId, startsAt), (patientId, startsAt)

This supports patient scheduling and staff scheduling.

5) Patient self-logged screenings (home measurements)

PatientMeasurement
	•	id
	•	patientId
	•	recordedAt
	•	source enum: PATIENT, STAFF
	•	type enum: BP, GLUCOSE, WEIGHT (extend later)
	•	payloadJson (BP => systolic/diastolic/pulse; glucose => value/type)
	•	linkedEncounterId nullable
	•	indexes: (patientId, recordedAt)

This enables trend graphs and better clinical decisions.

⸻

D) Backend endpoints + permissions (how agents implement)

Feature 1: Staff “Check-in mode” (Shifts)

Endpoints
	•	POST /clinics/:clinicId/shifts/check-in
	•	body: { roleAtShift }
	•	permission: CLINIC_READ + role membership (Volunteer/Doctor/Preceptor/Manager)
	•	POST /clinics/:clinicId/shifts/:shiftId/check-out
	•	GET /clinics/:clinicId/shifts/active?date=YYYY-MM-DD
	•	permission: CLINIC_READ (Manager and above; optionally staff can view own)

Server rules
	•	one ACTIVE shift per user per clinic at a time
	•	audit: SHIFT.CHECKIN, SHIFT.CHECKOUT

Feature 1: Patient clinic check-in + manager assignment

Patient check-in endpoints
	•	POST /clinics/:clinicId/checkins
	•	permission: ENCOUNTER_CREATE or PATIENT_READ depending on flow
	•	creates PatientCheckIn WAITING
	•	GET /clinics/:clinicId/checkins?date=...&status=...
	•	permission: Manager/Director/Admin (or staff read-only view)

Assignment endpoints (Manager-only)
	•	POST /clinics/:clinicId/assignments
	•	body: { patientCheckInId, assignedVolunteerId?, assignedDoctorId? }
	•	permission: CLINIC_MANAGE (or create ASSIGNMENT.MANAGE later)
	•	PATCH /clinics/:clinicId/assignments/:assignmentId
	•	reassignment with reason
	•	GET /clinics/:clinicId/assignments?date=...

Server rules
	•	Only Manager/Director/System Admin can assign
	•	Assignment requires:
	•	check-in exists and is WAITING/ASSIGNED
	•	assigned staff has an ACTIVE shift (optional v1 rule, but recommended)
	•	audit: ASSIGNMENT.CREATE, ASSIGNMENT.UPDATE

Note: Right now you don’t have a dedicated permission key for assignment. For v1, enforce using CLINIC_MANAGE. Later add ASSIGNMENT.MANAGE.

⸻

Feature 2: Patient portal scheduling + self-screening

You said you created a patient role — great. That means you’ll need:
	•	patient auth path (Keycloak user type + membership)
	•	a “patient-facing clinic selection” (likely the patient belongs to one primary clinic)

Endpoints

Self measurements
	•	POST /patients/me/measurements
	•	GET /patients/me/measurements?type=&from=&to=

Appointment requests
	•	POST /patients/me/appointments/request
	•	body: { clinicId, preferredDateRange, notes } OR direct time slots
	•	GET /patients/me/appointments
	•	Staff:
	•	GET /clinics/:clinicId/appointments?from=&to=&status=
	•	PATCH /clinics/:clinicId/appointments/:id (confirm/cancel)

Rules
	•	Patient may only read/write their own measurements/appointments
	•	Staff may read clinic appointments if they have clinic read (or a new permission later)
	•	audit everything: APPT.REQUEST, APPT.CONFIRM, MEASUREMENT.CREATE

⸻

Feature 3: Research repository compatibility (design-time)

This is mostly structuring + tagging.

Requirements
	•	Every operational record includes:
	•	clinicId
	•	timestamps
	•	actor (where applicable)
	•	De-identification excludes:
	•	names, DOB, phone, email, national id, etc.
	•	Export dataset includes:
	•	pseudonymous patient key (derived)
	•	clinical measures over time
	•	operational timestamps (check-in wait time, assignment time, follow-up adherence)

Implementation
	•	Add a ResearchTransformService that produces row sets for export:
	•	input: clinicId + date range + policy version
	•	output: research_patient, research_encounter, research_measurements, research_ops_events
	•	Only run if:
	•	clinic research enabled
	•	consent granted
	•	director approval exists (per clinic)

⸻

Feature 4: Admin deactivate/delete buttons

What to implement now
	•	Everywhere you list users/clinics:
	•	show “Deactivate” action (soft delete)
	•	optionally show “Remove from clinic” (remove UserClinicRole)
	•	For clinics:
	•	deactivate clinic (isActive=false)

Endpoints
	•	PATCH /users/:userId/deactivate (SYSADMIN/DIRECTOR)
	•	PATCH /clinics/:clinicId/users/:userId/deactivate (MANAGER or DIRECTOR) – deactivates within clinic context
	•	DELETE /clinics/:clinicId/users/:userId/roles/:role (optional for revoking role)

Rules
	•	Never hard delete users in v1
	•	If user is deactivated:
	•	cannot log in / cannot get whoami permissions
	•	existing audit/encounter history stays

⸻

Feature 5: Graph overview + trends

Do this in two layers:

Layer 1 (now): Patient-level trend charts
	•	Patient BP over time (from Vitals + PatientMeasurement)
	•	Glucose over time
	•	Follow-up adherence (appointments vs completed)

Layer 2 (later): Clinic dashboards
	•	HTN/DM prevalence
	•	high-risk distribution
	•	follow-up completion rate
	•	staff utilization (shifts, assignments, time-to-finalize)

Endpoints
	•	GET /patients/:patientId/trends?from=&to=
	•	GET /clinics/:clinicId/metrics/ops?from=&to= (manager/director)

⸻

E) User flows (so agents implement the UX correctly)

Flow 1: Manager assigning patients
	1.	Volunteer/Doctor/Preceptor arrives → clicks “Check-in mode” → shift ACTIVE
	2.	Patients arrive → Volunteer creates check-in (or patient self-checkin later)
	3.	Manager opens Today’s Check-ins
	•	sees staff checked in (shifts)
	•	sees patient check-ins WAITING
	4.	Manager assigns:
	•	patient → volunteer and/or doctor
	5.	Assigned volunteer sees the patient in “My Assigned” list
	6.	Encounter proceeds → finalize → complete check-in record

Flow 2: Patient self-logging + follow-up request
	1.	Patient logs in → sees “My Health”
	2.	Adds BP reading
	3.	Requests follow-up (or chooses time slot)
	4.	Clinic staff confirms appointment
	5.	Patient receives SMS reminder
	6.	Visit happens → encounter completed; patient sees it in history

⸻

F) How to split into spec files + agents (recommended)

Create these spec files (v1.1):
	1.	20_SHIFTS_AND_STAFF_CHECKIN_V1.md
	2.	21_PATIENT_CHECKIN_AND_ASSIGNMENTS_V1.md
	3.	22_APPOINTMENTS_CALENDAR_V1.md
	4.	23_PATIENT_PORTAL_MEASUREMENTS_V1.md
	5.	24_ADMIN_DEACTIVATION_AND_ACCESS_LIFECYCLE_V1.md
	6.	25_TRENDS_AND_ANALYTICS_V1.md
	7.	26_RESEARCH_EXPORT_TRANSFORMS_V1.md (design now, implement later)

Agent split
	•	Agent Ops-1: Shifts + Check-ins + Assignments (API + DB)
	•	Agent Ops-2: Manager UI for Today’s check-ins + assignment UI (basic)
	•	Agent Patient-1: Patient portal (measurements + appointments request)
	•	Agent Scheduling-1: Appointments calendar (staff side)
	•	Agent Admin-1: Deactivation actions + UI buttons in tables
	•	Agent Analytics-1: Patient trend endpoints + basic charts

⸻

G) Questions (only the ones that truly change the design)
	1.	Assignment target: When manager assigns a patient, is it:
	•	(A) assign to Volunteer only (who does intake), then later Doctor picks up, or
	•	(B) assign to Volunteer + Doctor immediately?
	•	I can support both — but v1 UX is cleaner if you pick one default.
	2.	Staff shift granularity: Is “Check-in mode” per clinic per day, or per shift (morning/afternoon)?
Default: per day with optional checkout.
	3.	Patient portal identity link: How do patients authenticate?
	•	Do they use phone number OTP, or a password/login?
Since you’re on Keycloak, simplest v1 is username/password; later add OTP.
	4.	Appointment scheduling: Are patients picking exact time slots, or requesting a date range and clinic confirms?
Default: patient requests range → clinic confirms time.

If you answer these, I’ll turn this into agent-executable specs with exact DB migrations, endpoints, DTOs, guards, and UI wireframes for basic screens (Manager “Today” board + Patient “My Health”).

If you’d rather not answer now, I’ll proceed with safe defaults:
	•	Assign to Volunteer first, Doctor optional
	•	Shifts are day-based
	•	Patient login via Keycloak username/password
	•	Appointment requests are “request window” then clinic confirms

Answers
1. assign to Volunteer + Doctor immediately
2. Per day with optional checkout
3. Let them use username/password for now. We can add OTP later
4. Requesting a date range and the clinic confirms time


