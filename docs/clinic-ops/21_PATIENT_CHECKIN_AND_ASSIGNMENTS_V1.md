
/docs/specs/21_PATIENT_CHECKIN_AND_ASSIGNMENTS_V1.md

Goal

Track patient arrivals per day and allow Manager-only assignments to BOTH:
	•	assignedVolunteerId (required)
	•	assignedDoctorId (required)

Also support “My assigned patients” for staff.

Roles & Permissions
	•	Create check-in: ENCOUNTER_CREATE or Manager/Director/SysAdmin with clinic membership
	•	View clinic check-ins + assignments: CLINIC_READ (Manager UI)
	•	Create/reassign assignment: Manager-only using CLINIC_MANAGE
	•	View “my assignments”: ENCOUNTER_READ

Prisma: New Enums & Models

Enums
	•	CheckInSource = STAFF | PATIENT_SELF
	•	CheckInStatus = WAITING | ASSIGNED | IN_PROGRESS | COMPLETED | CANCELLED
	•	AssignmentStatus = ACTIVE | REASSIGNED | CANCELLED

Model: PatientCheckIn

Fields:
	•	id, clinicId, patientId
	•	checkedInAt
	•	source default STAFF
	•	status default WAITING
	•	encounterId? nullable
	•	notes?
	•	createdAt, updatedAt

Indexes:
	•	(clinicId, status, checkedInAt)
	•	(patientId, checkedInAt)

Model: PatientAssignment

Fields:
	•	id, clinicId
	•	patientCheckInId
	•	assignedVolunteerId (required)
	•	assignedDoctorId (required)
	•	assignedByUserId (manager)
	•	assignedAt
	•	status default ACTIVE
	•	reason?
	•	createdAt, updatedAt

Constraints:
	•	One ACTIVE assignment per check-in (enforced in service by transitioning old ACTIVE to REASSIGNED)

Indexes:
	•	(clinicId, status, assignedAt)
	•	(patientCheckInId)

API Endpoints

POST /clinics/:clinicId/checkins

Body:

{ "patientId": "uuid", "notes": "optional" }

Rules:
	•	Creates PatientCheckIn status WAITING at checkedInAt = now().
	•	Does NOT create Encounter.
	•	For “one per day” you chose allow multiple; if same patient already checked-in today, return 200 with warning field or 201 anyway. (Default: allow and return 201.)

Audit:
	•	CHECKIN.CREATE

GET /clinics/:clinicId/checkins?date=YYYY-MM-DD&status=WAITING|ASSIGNED|...

Rules:
	•	Manager+ view
	•	Return list with patient summary (patientCode, name) and assignment summary if exists.

POST /clinics/:clinicId/assignments

Body:

{
  "patientCheckInId": "uuid",
  "assignedVolunteerId": "uuid",
  "assignedDoctorId": "uuid"
}

Rules:
	•	Requires CLINIC_MANAGE.
	•	Check-in must exist and status must be WAITING or ASSIGNED.
	•	Active shift required for assigned staff (default confirmed by you).
	•	Verify StaffShift ACTIVE today for volunteer and doctor.
	•	If an ACTIVE assignment already exists for check-in:
	•	either reject (409) OR treat as reassignment (recommended: reject and require explicit reassign endpoint).
	•	Default: reject 409 “ASSIGNMENT_ALREADY_EXISTS”.
	•	Create assignment ACTIVE, set check-in status to ASSIGNED.

Audit:
	•	ASSIGNMENT.CREATE
	•	optionally CHECKIN.STATUS.UPDATE

PATCH /clinics/:clinicId/assignments/:assignmentId/reassign

Body:

{ "assignedVolunteerId": "uuid", "assignedDoctorId": "uuid", "reason": "string" }

Rules:
	•	Requires CLINIC_MANAGE.
	•	Must verify new staff have ACTIVE shifts today.
	•	Old assignment ACTIVE → REASSIGNED (set reason)
	•	Create new ACTIVE assignment.

Audit:
	•	ASSIGNMENT.REASSIGN

GET /clinics/:clinicId/assignments?date=YYYY-MM-DD

Rules:
	•	Manager+ view.
	•	Returns assignment rows with check-in + patient + assignees.

GET /clinics/:clinicId/my/assignments?date=YYYY-MM-DD

Rules:
	•	Requires ENCOUNTER_READ.
	•	Returns check-ins where the current user is assignedVolunteerId OR assignedDoctorId.

Status transitions (operational)
	•	check-in starts WAITING
	•	assignment sets ASSIGNED
	•	when volunteer starts encounter intake → check-in becomes IN_PROGRESS (hook from encounter create or “start intake” endpoint)
	•	when encounter finalized → check-in becomes COMPLETED (hook from finalize)

Implement IN_PROGRESS and COMPLETED updates via service hooks (not UI calls where possible).

Tests (integration)
	•	volunteer creates check-in
	•	manager assigns (requires CLINIC_MANAGE)
	•	assignment fails if staff not checked in (no active shift)
	•	staff can list “my assignments”
	•	reassignment preserves history
