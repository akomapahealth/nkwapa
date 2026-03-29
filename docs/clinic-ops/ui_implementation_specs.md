Awesome — I’ll go ahead and produce the basic UI wireframes + page-by-page acceptance criteria for:
	•	Manager Today Board (staff shifts + patient check-ins + assignments)
	•	Staff “My Assigned” (volunteer/doctor)
	•	Patient Portal (measurements + appointment request + history)

I’ll keep it implementation-ready for agents: layout, components, states, empty/loading/error, and the exact API calls each screen makes.

⸻

1) UI Wireframes and Specs

1.1 Manager Today Board

Route
	•	Preferred: /today (clean, direct)
	•	Also link from /queues as “Today Board” if user has CLINIC_MANAGE

Permissions
	•	Full Today Board requires: CLINIC_MANAGE
	•	Read-only Today Board (optional) can be CLINIC_READ for Director/SysAdmin

Data dependencies (API calls)

On page load (activeClinicId resolved):
	1.	GET /clinics/:clinicId/shifts/active?date=YYYY-MM-DD
	2.	GET /clinics/:clinicId/checkins?date=YYYY-MM-DD (optionally filtered by status)
	3.	GET /clinics/:clinicId/assignments?date=YYYY-MM-DD (optional if checkins already include assignment summary)

Optimization: If you can make checkins return “assignmentSummary” inline, you can skip #3.

Wireframe (basic)

[TopBar: ClinicSelector | RoleBadges | SyncStatusPill | UserMenu]
[SideNav]

TODAY BOARD (YYYY-MM-DD)     [Refresh]  [Timezone: Africa/Accra]

Row 1: STAFF ON DUTY (ACTIVE SHIFTS)
-----------------------------------------------------------
| Volunteers (count) | Doctors (count) | Preceptors (count)|
-----------------------------------------------------------
| DataGrid: Name | RoleAtShift | CheckedInAt | Status       |
| Filter chips: [Volunteer] [Doctor] [Preceptor]           |
| Empty state: “No staff checked in yet today.”            |
-----------------------------------------------------------

Row 2: PATIENT CHECK-INS (KANBAN-LIKE COLUMNS)
-----------------------------------------------------------
WAITING            ASSIGNED            IN_PROGRESS          COMPLETED
---------          ---------           -----------          ----------
[Card/List]        [Card/List]         [Card/List]          [Card/List]
PatientCode        PatientCode         PatientCode          PatientCode
Name               Name                Name                 Name
CheckInAt          CheckInAt           CheckInAt            CheckInAt
[Assign] button    Volunteer/Doctor    Volunteer/Doctor     Encounter link
                   [Reassign]          [View]               [View]
-----------------------------------------------------------

Patient Check-in row/card design

Show:
	•	patientCode + patient name
	•	check-in time
	•	status badge
	•	assignment badges (volunteer + doctor names) if assigned

Actions:
	•	If status WAITING: Assign
	•	If status ASSIGNED: Reassign
	•	If status IN_PROGRESS/COMPLETED: View Encounter (if encounterId linked) else View Patient

Assign modal (critical)

Triggered by “Assign” or “Reassign”.

Modal layout

Assign Patient: NKP-2026-000123 - John Doe

Volunteer (required) [Dropdown: only active VOLUNTEER shifts]
Doctor (required)    [Dropdown: only active DOCTOR shifts]
Reason (optional for assign, required for reassign) [Textarea]

[Cancel] [Assign]

Rules:
	•	Only show staff who are currently ACTIVE in shifts today.
	•	Disable Assign until both volunteer and doctor selected.
	•	For reassign, require reason.

API calls:
	•	Assign: POST /clinics/:clinicId/assignments
	•	Reassign: PATCH /clinics/:clinicId/assignments/:assignmentId/reassign

Success UI:
	•	toast “Assigned successfully”
	•	patient card moves WAITING → ASSIGNED
	•	assigned badges appear immediately (optimistic is fine)

Error UI:
	•	If API rejects due to missing shift: show “Staff member is not checked in”
	•	If assignment already exists: show “Already assigned — use Reassign”

Acceptance criteria (Today Board)
	•	Manager can see “Staff on duty” list (shifts)
	•	Manager can see check-ins grouped by status
	•	Manager can assign both volunteer and doctor
	•	Only staff with ACTIVE shifts appear in dropdowns
	•	Assignment updates reflect immediately (UI update or re-fetch)
	•	Reassign preserves previous assignment history (backend), UI just shows latest ACTIVE assignment
	•	Page works with a simple refresh button

⸻

1.2 Staff “My Assigned” view

Route
	•	/my/assigned (simple)
or
	•	/queues/my-assigned (if you want it under queues)

Permission
	•	ENCOUNTER_READ + clinic membership

API calls
	•	GET /clinics/:clinicId/my/assignments?date=YYYY-MM-DD

Wireframe

MY ASSIGNED PATIENTS (Today)

DataGrid columns:
- PatientCode
- Patient Name
- CheckInAt
- Assigned Role: Volunteer / Doctor (chip)
- Status (WAITING/ASSIGNED/IN_PROGRESS/COMPLETED)
- Action button:
  - Volunteer: [Start Intake] or [Continue]
  - Doctor: [Open Encounter] (if exists) else [Waiting for intake]

Action behavior (defaults you confirmed):
	•	Creating a PatientCheckIn does not create encounter.
	•	Volunteer begins intake → encounter gets created/linked and checkin → IN_PROGRESS.
	•	UI button “Start Intake” triggers:
	•	POST /clinics/:clinicId/encounters (create DRAFT)
	•	then backend hook should link encounterId to checkin and set IN_PROGRESS
	•	or call a dedicated endpoint POST /clinics/:clinicId/checkins/:id/start-intake that creates encounter + links (recommended)

Acceptance criteria (My Assigned)
	•	Volunteer sees assigned patients and can start intake
	•	Doctor sees assigned patients and can open encounter once it exists
	•	If offline, show banner “Assignment views require connectivity” (recommended; keep ops online-only)

⸻

2) Patient Portal UI (basic, clean)

We’ll keep patient portal as a separate “mode” in the app shell, because navigation differs.

2.1 Patient Portal Routes
	•	/patient (landing)
	•	/patient/health (measurements + trend)
	•	/patient/appointments/request
	•	/patient/appointments (requests + confirmed appointments)
	•	/patient/visits (past encounters summary; optional in v1 if ready)

Patient portal still uses Keycloak login, but backend enforces “me” endpoints.

2.2 Patient Portal Navigation (minimal)
	•	My Health
	•	Appointments
	•	Request Appointment
	•	(optional) Visit History

2.3 My Health (measurements + trends)

Route
	•	/patient/health

API calls
	•	GET /patients/me/measurements?from=&to= (default last 90 days)
	•	GET /patients/me/trends?from=&to= (optional if separate endpoint exists; else compute client-side from measurements)

Wireframe

MY HEALTH

[Range: 30d | 90d | 180d]

Card: Blood Pressure Trend
- line chart (sys/dia)
- recent reading summary

Card: Glucose Trend
- line chart
- show fasting/random markers (simple chips)

Button row:
[Add BP Reading] [Add Glucose Reading] [Add Weight]

Add measurement modal:
	•	BP: systolic, diastolic, pulse optional, recordedAt default now, notes optional
	•	Glucose: value, type (FASTING/RANDOM), recordedAt default now
	•	Weight: kg, recordedAt default now

API:
	•	POST /patients/me/measurements

Validation:
	•	client basic validation
	•	server enforces sane ranges

Acceptance criteria:
	•	Patient can add measurement and see it appear immediately
	•	Graph updates after adding
	•	Works on mobile width

⸻

2.4 Request Appointment (date range)

Route
	•	/patient/appointments/request

API calls
	•	POST /patients/me/appointment-requests

Wireframe

REQUEST APPOINTMENT

Clinic (if multiple) [Dropdown]
Preferred start date [Date]
Preferred end date   [Date]
Reason               [Select optional: Follow-up | New concern | Medication | Other]
Notes                [Textarea]

[Submit Request]

Behavior:
	•	Show success confirmation: “Your clinic will confirm a time.”
	•	Add to “My Appointments” list automatically.

Acceptance criteria:
	•	Date range required and valid (end >= start)
	•	Submits successfully and shows in list

⸻

2.5 My Appointments (requests + confirmed)

Route
	•	/patient/appointments

API calls
	•	GET /patients/me/appointment-requests
	•	(optional) GET /patients/me/appointments if you store confirmed appointments separately

Wireframe

MY APPOINTMENTS

Section: Requests
DataGrid/List:
- Date Range
- Status: REQUESTED/CONFIRMED/REJECTED/CANCELLED
- CreatedAt
- Clinic

Section: Confirmed
List:
- StartsAt
- Status
- Clinic
- Notes

Acceptance criteria:
	•	Requests show updated status after clinic confirms (poll or refresh)
	•	Patient sees confirmed time when status is CONFIRMED

⸻

3) Implementation notes to keep agents aligned

Timezone handling
	•	All “Today” views use clinic timezone (Africa/Accra default).
	•	Frontend displays local time, but queries should specify date in clinic tz.

Online-only rule (for ops screens)
	•	Today Board, staff shifts, assignments: online only (show offline banner and disable actions).

Linking check-in → encounter (recommended endpoint)

To avoid race/fragility in UI, implement:
	•	POST /clinics/:clinicId/checkins/:checkinId/start-intake
	•	permission: ENCOUNTER_CREATE
	•	creates encounter (DRAFT), links to checkin, sets checkin status IN_PROGRESS
	•	audit: CHECKIN.START_INTAKE, ENCOUNTER.CREATE

This will make “Start Intake” a single reliable button.

⸻

4) Acceptance test checklist (end-to-end)

Clinic ops day workflow
	1.	Volunteer checks in (creates StaffShift)
	2.	Doctor checks in (creates StaffShift)
	3.	Patient arrives → check-in created (WAITING)
	4.	Manager assigns volunteer + doctor (ASSIGNED)
	5.	Volunteer opens My Assigned → Start Intake (creates encounter + IN_PROGRESS)
	6.	Volunteer completes screening → submit review
	7.	Preceptor reviews
	8.	Doctor finalizes → check-in becomes COMPLETED
	9.	Follow-up date set → reminder queued

Patient portal
	1.	Patient logs in → sees My Health
	2.	Adds BP reading → appears in trend
	3.	Requests appointment date range
	4.	Clinic confirms → patient sees confirmed appointment

⸻

5) Hand-off prompts for UI agents (for these new screens)

UI Agent: Manager Today Board

Build Manager Today Board UI (basic).

Route: /today
Permissions: require CLINIC_MANAGE. If denied, show NoAccess.

UI:
- Panel A: Staff on duty (active shifts) with DataGrid
- Panel B: Patient check-ins today grouped by status (WAITING/ASSIGNED/IN_PROGRESS/COMPLETED)
- Assign/Reassign modal: selects active volunteer + doctor shifts only

API:
- GET /clinics/:clinicId/shifts/active?date=YYYY-MM-DD
- GET /clinics/:clinicId/checkins?date=YYYY-MM-DD
- POST /clinics/:clinicId/assignments
- PATCH /clinics/:clinicId/assignments/:id/reassign

Behavior:
- Optimistic UI ok, but must refresh after assign.
- Online-only: disable actions if offline.

UI Agent: Staff My Assigned

Build Staff My Assigned view.

Route: /my/assigned
Permission: ENCOUNTER_READ.

API:
- GET /clinics/:clinicId/my/assignments?date=YYYY-MM-DD
- POST /clinics/:clinicId/checkins/:checkinId/start-intake (recommended)
- OR fallback: create encounter then link (if endpoint doesn't exist)

UI:
- Grid list of assigned patients with actions:
  - Volunteer: Start Intake / Continue
  - Doctor: Open Encounter if available
Online-only.

UI Agent: Patient Portal (v1)

Build Patient Portal v1.

Routes:
- /patient/health (measurements + basic charts)
- /patient/appointments/request (date range form)
- /patient/appointments (requests list + confirmed times)

API:
- POST/GET /patients/me/measurements
- POST/GET /patients/me/appointment-requests
- GET /patients/me/trends (if exists)

UI:
- Mobile-friendly
- Simple success states and error handling


⸻

Next step: assign agents (recommended)

Immediate build order (Ops first)
	1.	OPS-API implements specs 20 + 21 (Shifts, Check-ins, Assignments)
	2.	OPS-UI builds “Today Board” + “My Assigned”
	3.	PATIENT-API implements specs 22 + 23 (Requests + Measurements + PatientAccountLink)
	4.	PATIENT-UI builds basic patient portal pages
	5.	ADMIN implements spec 24
	6.	ANALYTICS implements spec 25
	7.	Research transform spec 26 stays design-only until exports are next