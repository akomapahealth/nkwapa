Locked — this makes the design clean and very implementable:
	1.	Manager assigns Volunteer + Doctor immediately
	2.	Staff shifts are per day, optional checkout
	3.	Patients use username/password in Keycloak (OTP later)
	4.	Patients request a date range, clinic confirms an exact time

Below is the polished, structured design + implementation flow (agent-executable style). I’m going to turn this into a sequence your agents can follow with minimal ambiguity.

⸻

0) Implementation philosophy (so agents don’t drift)

Golden rules
	•	Operational workflow ≠ Clinical record
Check-ins, shifts, assignments, appointments are operational. Encounters are clinical.
	•	Manager is the authority for assignment
Only Manager (and Director/SysAdmin) can create/modify assignments.
	•	Everything is auditable
Every create/update/transition emits an AuditEvent.
	•	Everything is research-compatible
Operational entities include clinicId, timestamps, and can be transformed to de-identified export rows.

Execution order

We build in this order because each step unblocks the next:
	1.	Shifts (staff check-in mode)
	2.	PatientCheckIn (arrivals) + Assignment (manager assigns volunteer+doctor)
	3.	Manager “Today Board” UI (check-ins + staff shifts + assignment)
	4.	Patient Portal v1 (appointment requests + self measurements)
	5.	Clinic appointment confirmation workflow
	6.	Trends v1 (patient graphs)
	7.	Admin deactivation controls
	8.	Research export transforms (design now, implement after ops stabilizes)

⸻

1) Feature 1: Staff “Check-in mode” (per day shifts)

User flow
	•	Volunteer/Doctor/Preceptor arrives → taps “Start shift” → becomes available on “Today Board”
	•	Optional: tap “End shift” when done

Data model (Prisma)

StaffShift

Fields:
	•	id, clinicId, userId
	•	roleAtShift (snapshot: VOLUNTEER/DOCTOR/PRECEPTOR/MANAGER)
	•	checkedInAt, checkedOutAt?
	•	status enum ACTIVE | CLOSED
	•	notes?

Constraints:
	•	At most one ACTIVE shift per (clinicId, userId)

Indexes:
	•	(clinicId, checkedInAt)
	•	(userId, checkedInAt)
	•	(clinicId, status)

API endpoints
	•	POST /clinics/:clinicId/shifts/check-in
	•	body: { roleAtShift }
	•	permission: must be a clinic member; simplest guard: CLINIC_READ + role membership
	•	POST /clinics/:clinicId/shifts/:shiftId/check-out
	•	GET /clinics/:clinicId/shifts/active?date=YYYY-MM-DD
	•	permission: CLINIC_READ (Manager+), optional allow staff to see active roster

Audit events
	•	SHIFT.CHECKIN
	•	SHIFT.CHECKOUT

Acceptance criteria
	•	Staff can check-in/out
	•	Manager can see active staff for today
	•	Duplicate check-in returns safe error (409) with existing shift

⸻

2) Feature 2: Patient arrival check-in + manager assignment (volunteer+doctor immediately)

User flow (in clinic)
	1.	Patient arrives → front desk/volunteer creates PatientCheckIn
	2.	Manager opens Today Board
	3.	Manager assigns:
	•	Volunteer + Doctor immediately
	4.	Assigned staff sees patient in “My Assigned” list
	5.	Volunteer starts/continues the encounter workflow → preceptor review → doctor finalize

Data model

PatientCheckIn

Fields:
	•	id, clinicId, patientId
	•	checkedInAt
	•	source enum STAFF | PATIENT_SELF (future)
	•	status enum:
	•	WAITING (created)
	•	ASSIGNED (manager assigns)
	•	IN_PROGRESS (volunteer starts encounter)
	•	COMPLETED (encounter finalized)
	•	CANCELLED
	•	encounterId? (linked after encounter is created)
	•	notes?

Indexes:
	•	(clinicId, checkedInAt)
	•	(clinicId, status, checkedInAt)
	•	(patientId, checkedInAt)

PatientAssignment

Fields:
	•	id, clinicId, patientCheckInId
	•	assignedVolunteerId (required)
	•	assignedDoctorId (required)
	•	assignedByUserId (manager)
	•	assignedAt
	•	status enum ACTIVE | REASSIGNED | CANCELLED
	•	reason?

Constraints:
	•	One ACTIVE assignment per PatientCheckIn at a time
(if reassigned, old becomes REASSIGNED and new becomes ACTIVE)

Indexes:
	•	(clinicId, assignedAt)
	•	(clinicId, status, assignedAt)

API endpoints (clinic-scoped)

Check-ins
	•	POST /clinics/:clinicId/checkins
	•	body: { patientId, notes? }
	•	permission: ENCOUNTER_CREATE (Volunteer/Doctor/Manager) or PATIENT_READ + clinic membership
	•	creates PatientCheckIn with status WAITING
	•	GET /clinics/:clinicId/checkins?date=YYYY-MM-DD&status=...
	•	permission: CLINIC_READ (Manager+)
	•	PATCH /clinics/:clinicId/checkins/:checkinId/status
	•	permission: Manager+ (or internal transitions only)
	•	mostly used internally by services (recommended)

Assignments (Manager-only)
	•	POST /clinics/:clinicId/assignments
	•	body: { patientCheckInId, assignedVolunteerId, assignedDoctorId }
	•	permission: CLINIC_MANAGE (v1)
	•	optional rule: require assigned staff has ACTIVE shift today (recommended)
	•	updates check-in status to ASSIGNED
	•	PATCH /clinics/:clinicId/assignments/:assignmentId/reassign
	•	body: { assignedVolunteerId, assignedDoctorId, reason }
	•	permission: CLINIC_MANAGE
	•	marks old ACTIVE assignment as REASSIGNED, creates new ACTIVE assignment
	•	GET /clinics/:clinicId/assignments?date=YYYY-MM-DD
	•	permission: Manager+

“My work” endpoints (for staff)
	•	GET /clinics/:clinicId/my/assignments?date=YYYY-MM-DD
	•	returns check-ins assigned to the current user as volunteer or doctor
	•	permission: ENCOUNTER_READ (and membership)

Audit events
	•	CHECKIN.CREATE
	•	ASSIGNMENT.CREATE
	•	ASSIGNMENT.REASSIGN
	•	CHECKIN.STATUS.UPDATE (optional if you want)

Acceptance criteria
	•	Manager is the only role that can assign/reassign
	•	Assignment requires both volunteer + doctor IDs
	•	Assigned staff can see “My assigned” list
	•	Check-in retains timestamps for analysis

⸻

3) Feature 3: Manager “Today Board” (basic UI now)

UI screens (basic)

/today (Manager-only; can live under /queues too)

Panels:
	1.	Staff on duty

	•	table of active shifts (volunteers/doctors/preceptors)

	2.	Patient check-ins today

	•	status columns: WAITING, ASSIGNED, IN_PROGRESS, COMPLETED
	•	each row shows: patientCode, name, checkedInAt, assigned volunteer, assigned doctor

	3.	Assignment modal

	•	pick volunteer dropdown (only those checked in today)
	•	pick doctor dropdown (only those checked in today)
	•	Assign button

	4.	My assigned (for staff)

	•	non-manager roles get a simplified view:
	•	“My assigned patients today”

Permissions
	•	Today Board full view requires CLINIC_MANAGE or CLINIC_READ + role=MANAGER
	•	“My assigned” requires ENCOUNTER_READ

⸻

4) Feature 4: Patient portal (self measurements + appointment requests)

Patient identity + access
	•	Patient logs in via Keycloak username/password
	•	Patient is mapped to Patient record in your DB (important linking rule)
	•	simplest: store patient.keycloakSub or create PatientUserLink table

Linking approach (recommended)

Add table PatientAccountLink:
	•	id, patientId, keycloakSub, createdAt
	•	Unique keycloakSub

This avoids mixing patient login identity directly into Patient PII model.

Self measurement logging

Data model: PatientMeasurement
	•	id, patientId, recordedAt
	•	source enum PATIENT | STAFF
	•	type enum BP | GLUCOSE | WEIGHT (extend later)
	•	payloadJson (BP: systolic/diastolic/pulse; glucose: value/type)
	•	notes?
	•	linkedEncounterId? optional

Endpoints
	•	POST /patients/me/measurements (patient-only)
	•	GET /patients/me/measurements?type=&from=&to=
	•	Staff view (optional v1):
	•	GET /patients/:patientId/measurements?from=&to= requires PATIENT_READ

Appointment request flow (date range request → clinic confirms)

Data model: AppointmentRequest + Appointment

You can overload Appointment with status REQUESTED, but a separate request table makes confirmation cleaner.

Recommended minimal design:

AppointmentRequest
	•	id, clinicId, patientId
	•	preferredStartDate, preferredEndDate (date range)
	•	reason?, notes?
	•	status enum: REQUESTED | TRIAGED | CONFIRMED | REJECTED | CANCELLED
	•	createdAt, updatedAt
	•	triagedByUserId?, triagedAt?

Appointment
	•	id, clinicId, patientId
	•	startsAt, endsAt
	•	status enum: CONFIRMED | CANCELLED | COMPLETED | NO_SHOW
	•	linkedRequestId?
	•	optional assigned doctor/volunteer (can be set at confirmation time)

Endpoints

Patient:
	•	POST /patients/me/appointment-requests
	•	body: { clinicId, preferredStartDate, preferredEndDate, reason?, notes? }
	•	GET /patients/me/appointment-requests

Clinic staff:
	•	GET /clinics/:clinicId/appointment-requests?status=REQUESTED&from=&to=
	•	permission: CLINIC_READ (Manager+) or make it ENCOUNTER_READ for doctors too
	•	POST /clinics/:clinicId/appointment-requests/:id/confirm
	•	body: { startsAt, endsAt, assignedDoctorId?, assignedVolunteerId? }
	•	creates Appointment and marks request CONFIRMED
	•	POST /clinics/:clinicId/appointment-requests/:id/reject
	•	with reason

Notifications
	•	When appointment confirmed: create Reminder (SMS) 24h before (config later)
	•	When follow-up scheduled from encounter: create Reminder too

⸻

5) Feature 5: De-identified research compatibility

What must be exportable (no PII)

Export includes:
	•	clinicId (or a research clinic key)
	•	pseudonymous patient key
	•	timestamps: check-in times, assignment times, encounter times
	•	clinical values: BP, glucose, classifications, follow-up adherence
	•	patient self measurements

De-identification approach (v1)
	•	Derive researchPatientKey = HMAC_SHA256(patientId, RESEARCH_KEY) and truncate
	•	Never export:
	•	name, dob, phone, email, national id, patient_code
	•	Enforce gates:
	•	clinic research enabled + patient consent granted + director export approval

This plugs cleanly into the pipeline you already planned.

⸻

6) Feature 6: Deactivate “delete buttons” everywhere (safe admin lifecycle)

UX requirement

On admin/staff tables:
	•	show “Deactivate” (not hard delete)
	•	show “Remove from clinic” (optional)

Backend behavior
	•	User.isActive=false disables access globally
	•	For clinic-only removal:
	•	remove UserClinicRole rows for that clinic (or add endedAt)

Endpoints
	•	PATCH /clinics/:clinicId/users/:userId/deactivate requires CLINIC_MANAGE
	•	PATCH /users/:userId/deactivate requires SYSTEM_ADMIN
	•	DELETE /clinics/:clinicId/users/:userId/roles/:role requires CLINIC_MANAGE

Audit:
	•	USER.DEACTIVATE
	•	ROLE.REVOKE

⸻

7) Feature 7: Graph overviews and trends (role-based)

Patient graphs (v1)
	•	BP trend (Vitals + PatientMeasurement)
	•	Glucose trend
	•	Follow-up adherence (appointments confirmed/completed)

Endpoints:
	•	GET /patients/me/trends?from=&to=
	•	GET /patients/:patientId/trends?from=&to= (staff with PATIENT_READ)

UI:
	•	Basic line charts (no fancy dashboard yet)
	•	Simple filters: last 30/90/180 days

Manager/Director graphs (later)
	•	Staff utilization: shift hours, assignments count, time-to-finalize
	•	Clinical aggregate: % stage2/crisis, suspected DM count, follow-up rate

⸻

8) Agent-executable implementation plan (phased)

Phase 1 (Ops core): Shifts + Check-ins + Assignments

Agent OPS-API
	1.	Add Prisma models + migrations:
	•	StaffShift, PatientCheckIn, PatientAssignment
	2.	Implement services with strict rules + audit events
	3.	Implement endpoints + guards:
	•	shifts checkin/out + active list
	•	checkins create/list
	•	assignments create/reassign/list
	•	my assignments list
	4.	Add tests:
	•	manager-only assignment enforcement
	•	assignment requires both volunteer+doctor
	•	“active shift required” rule (if enabled)

Agent OPS-UI
	•	Basic “Today Board”:
	•	staff roster
	•	patient check-ins list
	•	assignment modal
	•	my assignments view

Phase 2 (Patient portal): Measurements + appointment requests

Agent PATIENT-API
	•	PatientAccountLink + endpoints
	•	Measurements endpoints
	•	AppointmentRequest endpoints
	•	Clinic confirm/reject endpoints + create Appointment

Agent PATIENT-UI
	•	Patient portal pages:
	•	My health (measurements + graphs)
	•	Request appointment (date range)
	•	My requests list

Phase 3 (Clinic ready): Reminders + audit pagination + deactivation UI
	•	Reminder worker + fake SMS provider
	•	Audit filters/pagination
	•	Deactivate actions in admin tables

Phase 4 (Research transforms)
	•	De-identification transform service
	•	export dataset scaffolding
	•	director approval gates

⸻

9) A few “implementation details” to keep agents aligned

Date handling (important for daily views)
	•	Define clinic local timezone (default Africa/Accra for GH)
	•	“Today” queries use clinic timezone day boundaries:
	•	YYYY-MM-DD 00:00:00 to 23:59:59 in clinic tz

Offline behavior (v1)
	•	Staff shifts and manager assignments are online-only (recommended)
	•	Reason: coordination and conflict complexity
	•	Patient creation + encounter/screening remain offline-first (as you already have)

If you insist on offline assignments later, we can do it, but it’s not worth it for v1.

⸻

10) Final clarifications (small, but they remove ambiguity)

I’ll proceed with safe defaults unless you disagree:
	1.	Active shift required for assignment?
Default: Yes — manager can only assign to staff checked in today.
	2.	One check-in per patient per day per clinic?
Default: Allow multiple, but warn; dedupe UI later.
	3.	Does creating a PatientCheckIn automatically create an Encounter?
Default: No — encounter created when volunteer starts intake; checkin links to encounter once created.

If you confirm these defaults, I’ll write the next set of spec files (20–26) in full agent-executable form (DB schema + endpoints + DTOs + guard rules + UI wireframes + acceptance tests), starting with Shifts + Check-ins + Assignments.