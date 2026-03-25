# Nkwapa Feature Workflows Guide

This guide explains how the currently implemented product is meant to be used.

It is written for operators, implementers, QA, and future agents who need a practical understanding of the current user flow rather than only the code structure.

---

## 1. Who Uses Which Parts of the Product

### Staff roles

- `VOLUNTEER`
- `PRECEPTOR`
- `DOCTOR`
- `MANAGER`
- `DIRECTOR`
- `SYSTEM_ADMIN`

### Patient role

- `PATIENT`

### High-level route ownership


| User type    | Main surfaces                                              |
| ------------ | ---------------------------------------------------------- |
| Volunteer    | patients, encounters, queues, my assigned                  |
| Preceptor    | queues, encounters, dashboard                              |
| Doctor       | queues, encounters, dashboard, reminders, my assigned      |
| Manager      | today board, patients, admin users, audit, dashboard       |
| Director     | settings, research exports, dashboard, admin users, audit  |
| System admin | all clinics, all users, clinic lifecycle, global oversight |
| Patient      | portal overview, health, self-reports, appointments        |


---

## 2. Login and App Entry Flow

1. User authenticates through Keycloak.
2. The web app initializes bootstrap by calling `/auth/whoami`.
3. The app selects an active clinic from the stored clinic or the first available membership.
4. Navigation, route access, and buttons are permission-driven from the bootstrap response.

Important note:

- user roles are stored in Nkwapa, not in Keycloak
- if a Keycloak user has never logged into Nkwapa, they may not yet appear in the local user tables

---

## 3. Standard Staff Workflow

The product now has two major staff entry patterns:

1. classic clinical queues
2. clinic operations board and assignment flow

Both coexist and should be understood together.

### 3.1 Classic clinical workflow

Use this when moving a patient through clinical documentation:

1. search or create patient
2. open patient profile
3. start a new visit
4. complete screening and assessment sections
5. submit encounter for review
6. preceptor reviews
7. doctor finalizes and sets care plan

### 3.2 Operations-first workflow

Use this when running the daily clinic floor:

1. staff checks in for shift
2. patient is checked in on arrival
3. manager assigns patient to volunteer and doctor
4. volunteer opens "My Assigned" and starts intake
5. encounter is created/linked
6. doctor later finalizes encounter

---

## 4. Patient Creation and Search

### Create a patient

1. Open `/patients/new` or the clinic-prefixed new patient route.
2. Enter demographics and contact details.
3. If national ID is captured, the backend stores encrypted and hashed forms.
4. Submit the form.
5. On success, the app redirects to the patient profile.

Expected behaviors:

- duplicate national ID entries should be blocked or surfaced as duplicates
- phone numbers are normalized
- patient code is generated automatically

### Search for a patient

1. Open `/patients`.
2. Search by code, name, or other allowed fields supported by the API.
3. Open the patient profile from results.

---

## 5. Encounter Workflow

### Start a new encounter from patient chart

1. Open the patient profile.
2. Click the action to begin a new visit.
3. Fill clinical forms in the encounter page.
4. Save or submit as appropriate.

### Submit for review

Volunteer or staff with appropriate permissions:

1. finish the draft data entry
2. use the submit action
3. encounter moves from `DRAFT` to `IN_REVIEW`

### Preceptor review

Preceptor:

1. open an encounter in review
2. review the clinical content
3. use the preceptor review action

### Finalization

Doctor:

1. review the encounter
2. complete or update care plan
3. add prescriptions if needed
4. finalize the encounter

Finalization effects:

- encounter becomes read-only
- reminders may be scheduled if follow-up date exists
- operational check-in state may be completed downstream

---

## 6. Consent Workflow

### Record consent

1. Open the patient consent page.
2. Choose grant or revoke flow.
3. Fill witness and related required information.
4. Save.

Why this matters:

- research consent affects export eligibility
- the latest effective consent is what matters at export execution time

---

## 7. Reminders Workflow

### Follow-up reminders

1. During encounter finalization, set a follow-up date.
2. Finalize the encounter.
3. Reminder records are created.
4. Queue worker sends them through configured provider.

### Appointment reminders

1. Patient requests appointment.
2. Clinic confirms appointment time.
3. Appointment-linked reminders can be scheduled.

### View reminder status

1. Open `/reminders`.
2. Filter by status or date range.
3. Inspect queued, sent, delivered, or failed items.

---

## 8. Today Board Workflow

Route:

- `/today`

Audience:

- primarily managers, directors, and other ops-capable staff

### What the page shows

- active shifts for the selected day
- patient check-ins grouped by status
- assignment state on check-ins
- assignment actions and reassignment flow

### Staff shift flow

1. Open `/today`.
2. Select a role-at-shift.
3. Click check-in.
4. The active shift appears in the staff roster.
5. At end of shift, check out.

### Manager patient assignment flow

1. Create or view today’s patient check-ins.
2. For a `WAITING` patient, click assign.
3. Select an active volunteer and active doctor.
4. Save.
5. The patient moves into the assigned state.

### Reassignment flow

1. Open an already assigned patient.
2. Choose reassign.
3. Select new staff and provide reason if required.
4. Save.

Expected behavior:

- only actively checked-in staff are valid assignment choices

---

## 9. My Assigned Workflow

Route:

- `/my/assigned`

Audience:

- volunteers and doctors

### Volunteer flow

1. Check in for shift if not already active.
2. Open `/my/assigned`.
3. Review assigned patients.
4. Click `Start Intake` for a patient.
5. The app creates or links the encounter and routes into the encounter UI.

### Doctor flow

1. Open `/my/assigned`.
2. Review assigned patients.
3. Open the linked encounter when ready to continue clinical work.

Operational note:

- this page is effectively online-only

---

## 10. Dashboard Workflow

Route:

- `/dashboard`

What changes by role:

- doctor sees finalization workload and clinical patterns
- preceptor sees review workload
- manager/director sees clinic and operational metrics
- volunteer sees task-oriented summaries
- system admin sees broader admin-oriented views

How to use it:

1. Open dashboard after login.
2. Confirm the active clinic is correct.
3. Read summary counts first.
4. Use charts and recent activity sections to identify backlog or trends.

---

## 11. Admin Users and Access Workflow

Route:

- `/admin/users`

### Assign a role

1. Open staff access page.
2. Find a user.
3. Open the details sheet.
4. Choose role and clinic.
5. Save assignment.

### Revoke a role

1. Open the same user details sheet.
2. Inspect current roles.
3. Revoke the selected role.

### Deactivate a user

1. Open the user row.
2. Choose deactivate.
3. Confirm the action.

Expected system behavior:

- deactivated users should lose access through auth/bootstrap
- self-deactivation should be blocked
- actor authority is constrained by clinic/global role rules

---

## 12. Clinic Settings Workflow

Route:

- `/settings/clinic`

Current purpose:

- manage research settings for the clinic

Actions:

1. open clinic settings
2. turn research on or off
3. decide whether every export needs director approval
4. save changes

---

## 13. Research Export Workflow

Route:

- `/clinics/[clinicId]/research/exports`

### Request an export

1. Open the research export console.
2. Pick a date range or preset.
3. Review the de-identification summary.
4. Submit export request.

### Approve or reject

If the clinic requires approval:

1. a director opens the request row
2. chooses approve or reject
3. approval queues processing automatically

### Processing flow

Once approved:

1. export moves to `PROCESSING`
2. backend generates the fixed v1 research pack
3. ZIP artifact is written locally
4. GitHub repo snapshot sync is attempted
5. export becomes `COMPLETED` or `FAILED`

### Retry

If export failed:

1. use retry action
2. export is re-queued
3. status progresses again through processing

### Download

When completed:

1. use download action
2. ZIP artifact downloads locally

### What is inside the v1 pack

- de-identified CSV tables
- manifest metadata
- checksums
- stable research keys
- no direct identifiers

---

## 14. Patient Portal Workflow

Routes:

- `/portal`
- `/portal/health`
- `/portal/self-reports`
- `/portal/self-reports/new`
- `/portal/appointments`
- `/portal/appointments/request`

### Portal overview

1. patient logs in
2. opens `/portal`
3. sees summary, reminders, recent data, and shortcuts

### Log a measurement

1. open health or self-report creation
2. choose BP, glucose, or weight style entry
3. enter data
4. submit
5. trend views update

### Review trends

1. open `/portal/health`
2. inspect BP and glucose trends
3. compare recent readings and follow-up context

### Request appointment

1. open `/portal/appointments/request`
2. choose date range
3. provide optional reason or notes
4. submit

### Review appointments

1. open `/portal/appointments`
2. inspect pending requests and confirmed appointments

---

## 15. Staff Use of Portal-Related Data

Staff can use patient portal data through:

- patient self-report listing
- patient trend views
- patient measurement reads
- portal account linking
- clinic appointment request APIs

Current product note:

- clinic-side appointment triage APIs exist
- a dedicated staff calendar UI is still a good next UI layer

---

## 16. Recommended Daily User Flow by Role

### Volunteer

1. log in
2. check in for shift
3. review my assigned patients
4. start intake
5. complete encounter draft
6. submit for review

### Preceptor

1. log in
2. open queue or dashboard
3. review in-review encounters
4. complete preceptor review

### Doctor

1. log in
2. review assigned or ready-to-finalize cases
3. inspect trends if needed
4. add care plan and prescriptions
5. finalize encounter
6. confirm reminders are scheduled if follow-up is needed

### Manager

1. log in
2. open today board
3. confirm who is on duty
4. monitor check-ins
5. assign patients
6. monitor audit and operational progress

### Director

1. monitor dashboard and audit
2. manage staff access where allowed
3. manage research settings
4. approve or reject research exports

### System admin

1. manage clinics
2. manage global or cross-clinic user access
3. deactivate users when required

### Patient

1. open portal overview
2. log readings
3. review trends
4. request appointment
5. watch for reminder and follow-up information

---

## 17. Features That Need Special Deployment Attention

### Reminder flows

Need:

- Redis
- provider env configuration
- API worker running

### Research export flows

Need:

- research env configuration
- `RESEARCH_HMAC_KEY`
- GitHub repo settings and token
- Redis

### Portal flows

Need:

- `PATIENT` role
- patient account link
- patient active clinic alignment

---

## 18. When a Workflow Changes

If you change a user-visible workflow, update all relevant docs:

1. `IMPLEMENTATION_STATUS.md`
2. `docs/FEATURE_WORKFLOWS_GUIDE.md`
3. `docs/USER_AND_ROLE_SETUP_GUIDE.md`
4. `docs/USER_TESTING_GUIDE.md`
5. feature-specific docs like the research export spec

