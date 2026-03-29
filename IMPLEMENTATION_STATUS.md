# Nkwapa EMR - Implementation Status

> Last updated: 2026-03-22
>
> This document reflects the current codebase in the repository, not the older branch-by-branch rollout plan.

---

## Executive Summary

Nkwapa is now a clinic-scoped EMR platform with:

- staff-facing patient and encounter workflows
- consent-aware research settings and export pipeline
- offline-first sync foundations for core EMR records
- follow-up and appointment reminder infrastructure
- medication catalog and prescribing
- role-aware dashboards and analytics
- clinic operations tooling for shifts, patient check-ins, and assignments
- patient portal surfaces for measurements, trends, self-reports, and appointment requests
- user lifecycle and access management for clinic and system administrators

The codebase is no longer a minimal EMR. It is now a multi-surface system spanning staff operations, patient self-service, and research-safe data movement.

---

## Monorepo and Runtime

### Repository layout

```text
nkwapa/
├── apps/
│   ├── api/                NestJS API
│   └── web/                Next.js App Router frontend
├── packages/
│   └── db/                 Prisma schema, migrations, seed scripts, shared helpers
├── infra/
│   └── nkwapa/             Docker Compose for Postgres, Redis, Keycloak
├── docs/                   Specs, guides, workflow docs
├── memory.md               Agent memory index
└── memory/                 Detailed codebase memory files
```

### Runtime services

| Service | Default |
| --- | --- |
| Web app | `http://localhost:3000` |
| API | `http://localhost:4000` |
| Postgres | `localhost:5433` |
| Redis | `localhost:6379` |
| Keycloak | `http://localhost:8080` |

### Core stack

| Layer | Technology |
| --- | --- |
| Backend | NestJS 10, TypeScript, BullMQ |
| Frontend | Next.js 14, React 18, Tailwind, shadcn/ui, MUI DataGrid |
| Database | PostgreSQL + Prisma 7 |
| Auth | Keycloak JWT + local DB-backed RBAC |
| Offline | Dexie IndexedDB + outbox sync |
| Charts | Recharts |
| Messaging | Twilio-compatible SMS, Nodemailer email |
| Research sync | GitHub API-based snapshot sync |

---

## Core Architectural Rules

1. Keycloak is the identity provider only. App roles are stored in `UserClinicRole`.
2. `X-Clinic-Id` is part of the normal request contract for clinic-scoped features.
3. `/auth/whoami` is the main frontend bootstrap endpoint.
4. Redis is required for reminders and research export background processing.
5. The API process currently hosts both HTTP routes and queue workers.
6. Research exports are now asynchronous and approval-aware.
7. Core EMR surfaces are more offline-capable than the newer ops and portal pages.

---

## What Is Implemented

### 1. Authentication and RBAC

Status: implemented

Backend:

- JWT auth via Keycloak JWKS
- local user hydration and provisioning
- clinic-scoped and global role support
- effective permission computation
- disabled user handling
- clinic scope guard and permission decorators

Frontend:

- Keycloak login bootstrap
- active clinic persistence
- route-level permission gating
- role-aware sidebar and navigation

Current roles:

- `SYSTEM_ADMIN`
- `DIRECTOR`
- `MANAGER`
- `DOCTOR`
- `PRECEPTOR`
- `VOLUNTEER`
- `PATIENT`

### 2. Patient Management

Status: implemented

Backend:

- create patient
- update patient demographics
- patient search
- patient detail reads
- patient code generation
- phone normalization
- encrypted national ID storage with hash-based duplicate protection

Frontend:

- patient list/search
- new patient form
- patient detail page
- clinic-prefixed patient route variants
- edit patient page under clinic-prefixed route

### 3. Encounter Workflow and Clinical Forms

Status: implemented

Workflow:

- draft encounter creation
- volunteer/intake data entry
- preceptor review
- doctor finalize
- finalized read-only behavior

Clinical forms persisted as separate relational models:

- `Vitals`
- `DiabetesScreening`
- `HypertensionAssessment`
- `CarePlan`

Frontend includes:

- encounter detail page
- vitals form
- diabetes screening form
- hypertension form
- care plan form

### 4. Consent Management

Status: implemented

Capabilities:

- grant research consent
- revoke consent
- store witness data and consent snapshots
- surface patient consent workflow in UI
- use consent as a gate for research export inclusion

### 5. Offline Sync Foundations

Status: implemented for core EMR surfaces

Current offline-oriented local stores:

- patients
- encounters
- vitals
- diabetes screenings
- hypertension assessments
- care plans
- patient consents
- prescriptions
- outbox
- sync state

Current sync features:

- outbox mutation construction
- idempotency keys
- sync push/pull endpoints
- conflict tracking via `SyncMutation`

Note:

- the newest ops and portal screens are more online-first than the older EMR flow

### 6. Audit Trail

Status: implemented

Capabilities:

- write audit events for major mutations
- filterable audit history
- cursor-based or paginated read flows
- surfaced in management UI

### 7. Clinic and Admin Management

Status: implemented

Capabilities:

- clinic list/create/update for admin
- clinic roster views
- user role assignment
- user role revocation
- clinic-scoped deactivation
- global user deactivation
- lifecycle safety rules to prevent unsafe self-action

Frontend:

- `/admin/clinics`
- `/admin/users`

### 8. Research Settings

Status: implemented

Per-clinic settings:

- `researchEnabled`
- `requiresDirectorApprovalEachExport`

Frontend:

- clinic settings page for research settings

### 9. Reminder Infrastructure

Status: implemented

Reminder features:

- BullMQ queue processing
- reminder list UI
- fake and real SMS providers
- fake and real email providers
- Twilio delivery callback route
- follow-up reminder scheduling
- appointment reminder scaffolding and templates

Channels:

- SMS
- email

### 10. Drug Catalog and Prescriptions

Status: implemented

Drug catalog:

- clinic-scoped drugs
- create/update/list/read APIs

Prescriptions:

- create/read/update/delete on encounter
- finalized encounter lock
- dedicated frontend components for list and form

### 11. Dashboard Analytics

Status: implemented

Backend:

- clinic summary metrics
- doctor metrics
- preceptor metrics
- director/manager metrics
- volunteer metrics
- system admin metrics
- trend series and distributions

Frontend:

- role-aware dashboard page
- KPI cards
- chart cards
- distribution and trend charts

### 12. Clinic Ops: Shifts, Check-Ins, Assignments

Status: implemented

Backend models:

- `StaffShift`
- `PatientCheckIn`
- `PatientAssignment`

Capabilities:

- staff shift check-in
- shift check-out
- list active shifts
- create patient check-in
- list check-ins
- create assignments
- reassign assignments with history preservation
- list clinic assignments
- list my assignments
- start intake from a check-in

Frontend:

- `/today` manager-oriented operations board
- `/my/assigned` staff worklist
- shift controls
- assignment modal
- grouped check-in views

### 13. Patient Portal

Status: implemented for core portal flows

Portal features:

- patient overview page
- measurement logging
- trend visualization
- self-reports
- appointment request creation
- appointment request history
- recommendation and reminder summary

Portal-related backend models:

- `PatientAccountLink`
- `PatientMeasurement`
- `PatientSelfReport`
- `AppointmentRequest`
- `Appointment`

Portal routes:

- `/portal`
- `/portal/health`
- `/portal/self-reports`
- `/portal/self-reports/new`
- `/portal/appointments`
- `/portal/appointments/request`

Staff-facing portal-related capabilities:

- read patient measurements
- read patient trends
- list patient self-reports
- link portal account to patient
- confirm or reject appointment requests via API

### 14. Research Export Pipeline V1

Status: implemented

Current v1 design:

- export request requires clinic research enablement
- separate request and approval permissions
- auto-approval supported per clinic settings
- async processing via BullMQ
- stable clinic-scoped HMAC research keys
- 15-minute timestamp rounding
- PII and free-text stripping
- fixed CSV pack + `manifest.json` + `SHA256SUMS.txt`
- local ZIP artifact generation
- GitHub repo snapshot sync
- failure tracking and retry flow

Current fixed pack files:

- `manifest.json`
- `SHA256SUMS.txt`
- `research_subjects.csv`
- `research_ops_checkins.csv`
- `research_ops_assignments.csv`
- `research_clinical_vitals.csv`
- `research_clinical_screenings.csv`
- `research_measurements.csv`
- `research_appointments.csv`
- `research_revocations.csv`

Frontend:

- research export console with date presets
- approve, reject, retry, and download actions
- row counts and repo commit metadata

---

## Backend Route Surface

### Auth

- `GET /auth/me`
- `GET /auth/whoami`

### Clinics and admin

- `GET /clinics/:id`
- `GET /admin/clinics`
- `POST /admin/clinics`
- `GET /admin/users`
- `GET /admin/users/:userId/roles`
- `POST /admin/users/:userId/roles`
- `DELETE /admin/users/:userId/roles`
- `GET /clinics/:clinicId/users`
- `PATCH /clinics/:clinicId/users/:userId/deactivate`
- `DELETE /clinics/:clinicId/users/:userId/roles/:role`
- `PATCH /users/:userId/deactivate`

### Patients

- `GET /patients/:patientId`
- `POST /clinics/:clinicId/patients`
- `PATCH /clinics/:clinicId/patients/:patientId`
- `GET /clinics/:clinicId/patients/search`
- `POST /clinics/:clinicId/patients/:patientId/portal-link`
- `GET /clinics/:clinicId/patients/:patientId/self-reports`

### Encounter workflow

- `GET /clinics/:clinicId/encounters`
- `GET /clinics/:clinicId/encounters/:encounterId`
- `POST /clinics/:clinicId/encounters`
- `POST /clinics/:clinicId/encounters/:encounterId/submit`
- `POST /clinics/:clinicId/encounters/:encounterId/preceptor-review`
- `POST /clinics/:clinicId/encounters/:encounterId/finalize`
- duplicate by-id convenience routes under `/encounters/:encounterId/...`

### Consents

- `POST /clinics/:clinicId/patients/:patientId/consents`
- `POST /clinics/:clinicId/patients/:patientId/consents/revoke`

### Sync

- `POST /sync/push`
- `GET /sync/pull`

### Audit

- `GET /clinics/:clinicId/audit`

### Reminders

- `GET /clinics/:clinicId/reminders`
- `POST /webhooks/sms/status`

### Drugs and prescriptions

- `GET /clinics/:clinicId/drugs`
- `GET /clinics/:clinicId/drugs/:drugId`
- `POST /clinics/:clinicId/drugs`
- `PATCH /clinics/:clinicId/drugs/:drugId`
- `POST /clinics/:clinicId/encounters/:encounterId/prescriptions`
- `GET /clinics/:clinicId/encounters/:encounterId/prescriptions`
- `PATCH /clinics/:clinicId/encounters/:encounterId/prescriptions/:id`
- `DELETE /clinics/:clinicId/encounters/:encounterId/prescriptions/:id`

### Dashboard

- `GET /clinics/:clinicId/dashboard`

### Ops

- `POST /clinics/:clinicId/shifts/check-in`
- `POST /clinics/:clinicId/shifts/:shiftId/check-out`
- `GET /clinics/:clinicId/shifts/active`
- `POST /clinics/:clinicId/checkins`
- `GET /clinics/:clinicId/checkins`
- `POST /clinics/:clinicId/assignments`
- `PATCH /clinics/:clinicId/assignments/:assignmentId/reassign`
- `GET /clinics/:clinicId/assignments`
- `GET /clinics/:clinicId/my/assignments`
- `POST /clinics/:clinicId/checkins/:checkinId/start-intake`

### Patient portal and appointments

- `GET /clinics/:clinicId/patient-portal/me`
- `GET /clinics/:clinicId/patient-portal/self-reports`
- `POST /clinics/:clinicId/patient-portal/self-reports`
- `POST /patients/me/measurements`
- `GET /patients/me/measurements`
- `GET /patients/me/trends`
- `POST /patients/me/appointment-requests`
- `GET /patients/me/appointment-requests`
- `GET /patients/:patientId/measurements`
- `GET /patients/:patientId/trends`
- `GET /clinics/:clinicId/appointment-requests`
- `POST /clinics/:clinicId/appointment-requests/:requestId/confirm`
- `POST /clinics/:clinicId/appointment-requests/:requestId/reject`

### Research

- `GET /clinics/:clinicId/research/settings`
- `PUT /clinics/:clinicId/research/settings`
- `POST /clinics/:clinicId/research/exports`
- `GET /clinics/:clinicId/research/exports`
- `GET /clinics/:clinicId/research/exports/:exportId`
- `POST /clinics/:clinicId/research/exports/:exportId/approve`
- `POST /clinics/:clinicId/research/exports/:exportId/reject`
- `PATCH /clinics/:clinicId/research/exports/:exportId/retry`
- `GET /clinics/:clinicId/research/exports/:exportId/download`

---

## Frontend Route Surface

### Public and shell

- `/`

### Staff and admin

- `/queues`
- `/patients`
- `/patients/new`
- `/patients/[patientId]`
- `/patients/[patientId]/consent`
- `/patients/[patientId]/encounters/new`
- `/encounters/[encounterId]`
- `/dashboard`
- `/audit`
- `/reminders`
- `/settings/clinic`
- `/today`
- `/my/assigned`
- `/admin/clinics`
- `/admin/users`

### Clinic-prefixed aliases

- `/clinics/[clinicId]/patients`
- `/clinics/[clinicId]/patients/new`
- `/clinics/[clinicId]/patients/[patientId]`
- `/clinics/[clinicId]/patients/[patientId]/edit`
- `/clinics/[clinicId]/patients/[patientId]/consent`
- `/clinics/[clinicId]/encounters`
- `/clinics/[clinicId]/encounters/[encounterId]`
- `/clinics/[clinicId]/research/exports`

### Patient portal

- `/portal`
- `/portal/health`
- `/portal/self-reports`
- `/portal/self-reports/new`
- `/portal/appointments`
- `/portal/appointments/request`

---

## Background Jobs and Integrations

### Queues

| Queue | Purpose |
| --- | --- |
| `reminders` | send follow-up and appointment reminders |
| `research-exports` | generate pack, zip artifact, and GitHub snapshot |

### External services

| Integration | Current role |
| --- | --- |
| Keycloak | identity provider |
| PostgreSQL | primary operational database |
| Redis | BullMQ broker/state |
| Twilio-compatible SMS | optional real SMS provider |
| SMTP/Nodemailer | optional real email provider |
| GitHub | research export data repo sync target |

---

## Database and Migration Status

### Major model families present in schema

- organization and access
- patients and consents
- encounters and clinical forms
- medications
- reminders
- ops
- patient portal and appointments
- research settings and exports
- audit and sync

### Current migration history in repo

- `20250225120000_add_patient_code_sequence`
- `20250226000000_init`
- `20260226142050_add_sync_mutation`
- `20260228205620_add_user_first_last_name`
- `20260302000000_add_reminder_delivered_status`
- `20260302010000_add_drug_prescription_models`
- `20260303000000_extend_research_export`
- `20260304063017_prescriptions_and_research`
- `20260319000000_patient_portal_and_self_reports`
- `20260321000000_ops_api_v1`
- `20260321100000_patient_api_v1`
- `20260321120000_research_export_pipeline_v1`

---

## Testing Coverage Snapshot

### API test files currently present

- auth controller and permission tests
- clinics controller/admin controller tests
- patient service tests
- encounter service tests
- sync controller/service tests
- drug service tests
- prescription service tests
- reminder provider and webhook tests
- admin service tests
- ops controller/service tests
- patient portal service and patient-api controller tests
- research de-identification, transform, repo sync, and export service tests
- user service tests

### Web test files currently present

- `lib/outbox.test.ts`
- `lib/patient-portal.test.ts`
- `lib/patient-trends.test.ts`

### Shared utility tests currently present

- `packages/db/src/phone.spec.ts`
- `packages/db/src/patient-code.spec.ts`

---

## Current Documentation and Memory Surface

Primary docs now intended to stay current:

- `IMPLEMENTATION_STATUS.md`
- `memory.md`
- `memory/01_architecture_runtime.md`
- `memory/02_backend_api_modules.md`
- `memory/03_frontend_routes_state.md`
- `memory/04_domain_models_workflows.md`
- `docs/FEATURE_WORKFLOWS_GUIDE.md`
- `docs/USER_AND_ROLE_SETUP_GUIDE.md`
- `docs/USER_TESTING_GUIDE.md`
- `docs/clinic-ops/26_RESEARCH_EXPORT_TRANSFORMS_V1.md`

---

## Partial or Still-Evolving Areas

These are important to describe precisely:

1. Staff appointment triage is implemented in the backend API, but there is not yet a dedicated staff appointment management calendar page in the web app.
2. Offline capability is strongest in the original patient and encounter flow; newer ops and portal surfaces are more online-first.
3. Research GitHub sync is implemented and tested with mocks, but live credentials and a live repo were not exercised in this workspace session.
4. Older spec documents outside the updated guide set may still describe an earlier design shape.

---

## Immediate Operational Next Steps for Any Deployment

1. Ensure `.env` includes research GitHub settings before using research exports in non-fake mode.
2. Run Prisma migrate flow against the target database.
3. Seed or manually create a system admin and clinic memberships.
4. Confirm Keycloak users log in once before expecting them in app admin tables.
5. Keep Redis running if reminders or research exports are expected to process.
