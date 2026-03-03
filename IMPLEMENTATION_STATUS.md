# Nkwapa EMR — Implementation Status

> **Last updated:** 2026-03-03
>
> Nkwapa is an offline-first Electronic Medical Records (EMR) system for hypertension and diabetes care in Ghana.

---

## Architecture Overview

### Monorepo Layout

```
nkwapa/
├── apps/
│   ├── api/          NestJS backend (port 4000)
│   └── web/          Next.js 14 frontend (port 3000)
├── packages/
│   └── db/           Prisma schema + shared DB utilities
├── package.json      NPM workspaces root
└── docker-compose.yml
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | NestJS 10, TypeScript, Prisma 7, PostgreSQL |
| **Frontend** | Next.js 14 (App Router), React 18, Tailwind CSS, shadcn/ui (Radix), MUI DataGrid |
| **Auth** | Keycloak (OAuth/OIDC), passport-jwt, JWKS |
| **Task Queue** | BullMQ + Redis |
| **Offline** | Dexie (IndexedDB), Service Worker, outbox-based sync |
| **Email** | Nodemailer (SMTP), configurable provider (fake/nodemailer) |
| **SMS** | Twilio (REST API via native fetch), configurable provider (fake/twilio) |
| **Infrastructure** | Docker Compose (Keycloak, PostgreSQL, Redis) |

---

## Fully Implemented Features

| # | Feature | Backend | Frontend | Tests |
|---|---------|---------|----------|-------|
| 1 | **Patient Management** — create, search, view, edit/update, national ID encryption (AES-256), duplicate detection via hash, patient code generation (NKP-YYYY-######) | Yes | Yes | `patient.service.spec.ts` (5 tests) |
| 2 | **Patient Edit/Update** — PATCH endpoint for demographics (firstName, lastName, dob, sex, phone, email), phone re-normalization to E.164, national ID immutable, audit logging with beforeJson/afterJson | Yes | Yes | `patient.service.spec.ts` |
| 3 | **Encounter Workflow** — DRAFT → IN_REVIEW → FINALIZED, preceptor review step, doctor finalize step | Yes | Yes | — |
| 4 | **Clinical Forms** — Vitals (BP, HR, BMI), Diabetes Screening (glucose, HbA1c), Hypertension Assessment (classification), Care Plan (counseling, medication, follow-up) | Yes | Yes | — |
| 5 | **Consent Management** — research consent grant/revoke with witness info, consent version snapshots | Yes | Yes | — |
| 6 | **Encounter Queues** — 3-tab view: Drafts, Needs Review, Ready to Finalize; permission-gated tabs | Yes | Yes | — |
| 7 | **Audit Trail** — all write operations logged with before/after JSON, cursor-based pagination, filtering by action/actor/entity/date | Yes | Yes | `auth.controller.spec.ts` |
| 8 | **RBAC** — 6 roles (SYSTEM_ADMIN, DIRECTOR, MANAGER, DOCTOR, PRECEPTOR, VOLUNTEER), 30+ permissions, clinic scoping, route guards, wildcard admin | Yes | Yes | — |
| 9 | **Offline Sync** — push/pull mutations, idempotency keys, conflict detection (APPLIED/CONFLICT/ERROR), Dexie outbox, service worker; supports patients, encounters, vitals, diabetes screenings, hypertension assessments, care plans, consents, prescriptions | Yes | Yes | `sync.service.spec.ts`, `sync.controller.spec.ts`, `outbox.test.ts` |
| 10 | **Admin** — clinic CRUD, user-clinic-role assignment, system-admin scoped | Yes | Yes | `clinics.controller.spec.ts` |
| 11 | **Research Settings** — enable/disable per clinic, director approval toggle for exports | Yes | Yes | — |
| 12 | **SMS Reminders (Twilio)** — real Twilio provider via native fetch (no npm dep), configurable fake/twilio via `SMS_PROVIDER` env var, delivery receipt webhook (`POST /webhooks/sms/status`) with Twilio signature validation, DELIVERED/FAILED status tracking, BullMQ retry with exponential backoff (3 attempts, 60s base delay), scheduled send at `scheduledAt` time | Yes | — | `twilio-sms.provider.spec.ts` (4 tests), `reminder-webhook.controller.spec.ts` (3 tests) |
| 13 | **Email Reminders** — EmailProvider interface, FakeEmailProvider and NodemailerEmailProvider (SMTP), configurable via `EMAIL_PROVIDER` env var, HTML follow-up reminder template with `{{patientCode}}`/`{{clinicName}}`/`{{followUpDate}}` placeholders, dual-channel support (patients with both phone + email get two reminders), encounter finalize auto-schedules email when patient has email | Yes | — | `nodemailer-email.provider.spec.ts` (2 tests) |
| 14 | **Prescriptions (Drug Catalog)** — Drug model (per-clinic scoping, 5 categories: ANTIHYPERTENSIVE/ANTIDIABETIC/DIURETIC/BETA_BLOCKER/OTHER), Prescription model (dosage, frequency, duration, quantity, instructions), CRUD endpoints for drugs and prescriptions, encounter-finalized lock (no create/update/delete on finalized encounters), drug seed data (8 common HTN/DM medications), sync push/pull support, Dexie offline storage | Yes | Yes | `drug.service.spec.ts` (2 tests), `prescription.service.spec.ts` (5 tests) |
| 15 | **Research Export** — full request→approve/reject→execute→download workflow, de-identification pipeline (HMAC-SHA256 subject IDs, PII stripping, DOB year-only generalization), CSV/JSON output, consent-gated (only RESEARCH_DEIDENTIFIED GRANTED patients), cursor-paginated listing, RBAC-gated (RESEARCH.EXPORT.REQUEST / RESEARCH.EXPORT.APPROVE permissions), audit logging on every action | Yes | Yes | `research-export.service.spec.ts` (8 tests), `de-identification.service.spec.ts` (4 tests) |

---

## Feature Branches (Pending Merge to `release/dev`)

All features are implemented on separate branches off `release/dev`. Each needs to be merged via PR:

| Branch | Feature | Files Changed | Lines Added |
|--------|---------|---------------|-------------|
| `feature/patient-update` | Patient Edit/Update | 8 | ~520 |
| `feature/sms-provider` | Twilio SMS + Webhooks | 9 | ~374 |
| `feature/email-reminders` | Email Reminders + Templates | 9 | ~250 |
| `feature/prescriptions` | Drug Catalog + Prescriptions | 26 | ~1,379 |
| `feature/research-export` | Research Export + De-identification | 13 | ~1,297 |

**Recommended merge order** (due to schema/permission dependencies):
1. `feature/patient-update` (permissions only, no schema changes)
2. `feature/sms-provider` (adds DELIVERED to ReminderStatus enum)
3. `feature/email-reminders` (extends reminder service, depends on #2 module changes)
4. `feature/prescriptions` (new Drug + Prescription models, new permissions)
5. `feature/research-export` (extends ResearchExport model)

---

## Permissions Added (by Feature)

### Patient Update
- `PATIENT.UPDATE` → DOCTOR, MANAGER, DIRECTOR

### Prescriptions
- `PRESCRIPTION.WRITE` → DOCTOR
- `PRESCRIPTION.READ` → DOCTOR, DIRECTOR, MANAGER, PRECEPTOR
- `DRUG.READ` → DOCTOR, DIRECTOR, MANAGER, PRECEPTOR, VOLUNTEER
- `DRUG.MANAGE` → MANAGER, DIRECTOR

### Research Export (pre-existing, now fully wired)
- `RESEARCH.EXPORT.REQUEST` → DIRECTOR
- `RESEARCH.EXPORT.APPROVE` → DIRECTOR

---

## API Endpoints Added (by Feature)

### Patient Update
| Method | Path | Permission |
|--------|------|------------|
| PATCH | `/clinics/:clinicId/patients/:patientId` | `PATIENT.UPDATE` |

### SMS Webhooks
| Method | Path | Permission |
|--------|------|------------|
| POST | `/webhooks/sms/status` | None (Twilio callback, signature validated) |

### Prescriptions — Drugs
| Method | Path | Permission |
|--------|------|------------|
| GET | `/clinics/:clinicId/drugs` | `DRUG.READ` |
| GET | `/clinics/:clinicId/drugs/:drugId` | `DRUG.READ` |
| POST | `/clinics/:clinicId/drugs` | `DRUG.MANAGE` |
| PATCH | `/clinics/:clinicId/drugs/:drugId` | `DRUG.MANAGE` |

### Prescriptions — Prescriptions
| Method | Path | Permission |
|--------|------|------------|
| GET | `/clinics/:clinicId/encounters/:encounterId/prescriptions` | `PRESCRIPTION.READ` |
| POST | `/clinics/:clinicId/encounters/:encounterId/prescriptions` | `PRESCRIPTION.WRITE` |
| PATCH | `/clinics/:clinicId/encounters/:encounterId/prescriptions/:id` | `PRESCRIPTION.WRITE` |
| DELETE | `/clinics/:clinicId/encounters/:encounterId/prescriptions/:id` | `PRESCRIPTION.WRITE` |

### Research Export
| Method | Path | Permission |
|--------|------|------------|
| POST | `/clinics/:clinicId/research/exports` | `RESEARCH.EXPORT.REQUEST` |
| GET | `/clinics/:clinicId/research/exports` | `RESEARCH.EXPORT.REQUEST` |
| GET | `/clinics/:clinicId/research/exports/:exportId` | `RESEARCH.EXPORT.REQUEST` |
| POST | `/clinics/:clinicId/research/exports/:exportId/approve` | `RESEARCH.EXPORT.APPROVE` |
| POST | `/clinics/:clinicId/research/exports/:exportId/reject` | `RESEARCH.EXPORT.APPROVE` |
| POST | `/clinics/:clinicId/research/exports/:exportId/execute` | `RESEARCH.EXPORT.APPROVE` |
| GET | `/clinics/:clinicId/research/exports/:exportId/download` | `RESEARCH.EXPORT.REQUEST` |

---

## Database Migrations Added

| Migration | Description |
|-----------|-------------|
| `20260302000000_add_reminder_delivered_status` | Adds `DELIVERED` to `ReminderStatus` enum |
| `20260302010000_add_drug_prescription_models` | Adds `DrugCategory` enum, `Drug` model, `Prescription` model with relations |
| `20260303000000_extend_research_export` | Adds `rejectionReason`, `filePath`, `fileFormat`, `recordCount` to `ResearchExport` |

---

## Frontend Pages Added

| Path | Feature | Branch |
|------|---------|--------|
| `/clinics/[clinicId]/patients/[patientId]/edit` | Patient edit form with offline fallback | `feature/patient-update` |
| `/clinics/[clinicId]/research/exports` | Research exports list with approve/reject/execute/download | `feature/research-export` |

## Frontend Components Added

| Component | Feature | Branch |
|-----------|---------|--------|
| `PrescriptionForm.tsx` | Drug search autocomplete, dosage form with offline outbox | `feature/prescriptions` |
| `PrescriptionList.tsx` | Prescription list with delete, finalization lock | `feature/prescriptions` |

---

## Environment Variables Added

### SMS (feature/sms-provider)
| Variable | Description |
|----------|-------------|
| `SMS_PROVIDER` | `fake` (default) or `twilio` |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_FROM_NUMBER` | Twilio sender phone number |
| `TWILIO_STATUS_CALLBACK_URL` | URL for delivery receipt webhooks |

### Email (feature/email-reminders)
| Variable | Description |
|----------|-------------|
| `EMAIL_PROVIDER` | `fake` (default) or `nodemailer` |
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP server port |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `EMAIL_FROM` | Sender email address |

### Research (feature/research-export)
| Variable | Description |
|----------|-------------|
| `EXPORT_DIR` | Directory for research export files (default: `./data/exports`) |

---

## Not Implemented (Future Roadmap)

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Dashboard Analytics** | Role-based analytics dashboard with clinical metrics, trend charts, and staff activity summaries |
| 2 | **Appointment Scheduling** | Appointment model, calendar UI, provider availability, patient booking |
| 3 | **Billing/Invoicing** | Invoice model, line items, payment tracking, mobile money integration (MTN MoMo, Vodafone Cash) |
| 4 | **Lab Results/Orders** | Lab order model, result entry, reference ranges, abnormal flagging, trending |
| 5 | **Real-time Notifications** | WebSocket gateway, push notifications, in-app notification center |
| 6 | **Reporting** | PDF/CSV export, configurable report templates, clinic comparison reports, MOH reporting formats |
| 7 | **File/Document Uploads** | S3/MinIO integration, Document model, patient document attachments |
| 8 | **Patient Portal** | Patient-facing app, appointment booking, result viewing, medication reminders |
| 9 | **Referrals** | Inter-clinic referral workflow, referral tracking, acceptance/rejection |
| 10 | **Multi-language / i18n** | Currently English only; Twi, Ga, Ewe, Hausa translations needed for Ghana context |
| 11 | **Inventory / Supplies Management** | Drug and supplies inventory, stock levels, reorder alerts |
| 12 | **Telemedicine Integration** | Video consultation, remote triage, teleconsultation notes |
| 13 | **Patient Vitals Trending** | Historical charts per patient showing BP, glucose, BMI over time |
| 14 | **Drug Allergy / Interaction Checking** | Allergy records, drug-drug interaction database, prescribing alerts |
| 15 | **Dispensing Workflow** | Track actual medication dispensing, pharmacy integration, refill tracking |

---

## Test Coverage Summary

### Test Files (32 tests total across API)

| File | Covers | Tests |
|------|--------|-------|
| `apps/api/src/patients/patient.service.spec.ts` | Patient create, update, phone normalization, national ID immutability, duplicate detection | 5 |
| `apps/api/src/auth/auth.controller.spec.ts` | WhoAmI endpoint, role computation, permission mapping | 3 |
| `apps/api/src/sync/sync.service.spec.ts` | Push/pull sync logic, idempotency, conflict detection | 3 |
| `apps/api/src/sync/sync.controller.spec.ts` | Sync API endpoints | 2 |
| `apps/api/src/clinics/clinics.controller.spec.ts` | Clinic CRUD endpoints | 2 |
| `apps/api/src/reminders/twilio-sms.provider.spec.ts` | Twilio send success/failure, env validation | 4 |
| `apps/api/src/reminders/reminder-webhook.controller.spec.ts` | Twilio delivery callback, signature validation | 3 |
| `apps/api/src/reminders/nodemailer-email.provider.spec.ts` | Email send, template rendering | 2 |
| `apps/api/src/drugs/drug.service.spec.ts` | Drug search, category filter | 2 |
| `apps/api/src/prescriptions/prescription.service.spec.ts` | Create, update, delete, finalized encounter lock, audit | 5 |
| `apps/api/src/research/research-export.service.spec.ts` | Request, approve, reject, execute, gating (disabled research), status validation | 8 |
| `apps/api/src/research/de-identification.service.spec.ts` | PII stripping, HMAC subject IDs, consent gating, empty dataset | 4 |
| `packages/db/src/phone.spec.ts` | Phone number validation and E.164 formatting | — |
| `packages/db/src/patient-code.spec.ts` | Patient code generation (NKP-YYYY-######) | — |
| `apps/web/lib/outbox.test.ts` | Offline outbox queue logic | — |

### Missing Test Coverage

- Encounter service and controller (workflow transitions, guards)
- Clinical form services (vitals, diabetes screening, hypertension assessment, care plan)
- Consent service and controller
- Reminder service (scheduling, BullMQ worker processing)
- Admin module (user-role assignment)
- Research settings service
- RBAC guard unit tests (role-permission denial scenarios)
- Frontend component tests
- E2E / integration tests

---

## Infrastructure Status

| Component | Status | Notes |
|-----------|--------|-------|
| **Docker Compose** | Working | Keycloak, PostgreSQL, Redis containers |
| **Keycloak** | Configured | `nkwapa` realm, `nkwapa-web` client, login-required flow |
| **PostgreSQL** | Configured | Prisma migrations, seed scripts (includes 8 common drug seeds) |
| **Redis** | Configured | BullMQ connection for reminder queue |
| **CI/CD** | Not configured | No GitHub Actions, no deployment pipeline |
| **Production Deployment** | Not configured | No Dockerfile for apps, no cloud deployment |
| **Monitoring / Logging** | Not configured | No structured logging, no APM, no error tracking |
| **Backups** | Not configured | No automated database backups |
