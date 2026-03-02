# Nkwapa EMR — Implementation Status

> **Last updated:** 2026-03-02
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
| **Infrastructure** | Docker Compose (Keycloak, PostgreSQL, Redis) |

---

## Fully Implemented Features

| # | Feature | Backend | Frontend | Tests |
|---|---------|---------|----------|-------|
| 1 | **Patient Management** — create, search, view, national ID encryption (AES-256), duplicate detection via hash, patient code generation (NKP-YYYY-######) | Yes | Yes | `patient.service.spec.ts` |
| 2 | **Encounter Workflow** — DRAFT → IN_REVIEW → FINALIZED, preceptor review step, doctor finalize step | Yes | Yes | — |
| 3 | **Clinical Forms** — Vitals (BP, HR, BMI), Diabetes Screening (glucose, HbA1c), Hypertension Assessment (classification), Care Plan (counseling, medication, follow-up) | Yes | Yes | — |
| 4 | **Consent Management** — research consent grant/revoke with witness info, consent version snapshots | Yes | Yes | — |
| 5 | **Encounter Queues** — 3-tab view: Drafts, Needs Review, Ready to Finalize; permission-gated tabs | Yes | Yes | — |
| 6 | **Audit Trail** — all write operations logged with before/after JSON, cursor-based pagination, filtering by action/actor/entity/date | Yes | Yes | `auth.controller.spec.ts` |
| 7 | **RBAC** — 6 roles (SYSTEM_ADMIN, DIRECTOR, MANAGER, DOCTOR, PRECEPTOR, VOLUNTEER), 30+ permissions, clinic scoping, route guards, wildcard admin | Yes | Yes | — |
| 8 | **Offline Sync** — push/pull mutations, idempotency keys, conflict detection (APPLIED/CONFLICT/ERROR), Dexie outbox, service worker | Yes | Yes | `sync.service.spec.ts`, `sync.controller.spec.ts`, `outbox.test.ts` |
| 9 | **Admin** — clinic CRUD, user-clinic-role assignment, system-admin scoped | Yes | Yes | `clinics.controller.spec.ts` |
| 10 | **Research Settings** — enable/disable per clinic, director approval toggle for exports | Yes | Yes | — |
| 11 | **Reminders** — BullMQ queue, auto-scheduled on encounter finalize when CarePlan has followUpDate, SMS channel with FakeSmsProvider | Yes | Yes | — |

---

## Partially Implemented Features

| # | Feature | What Exists | What's Missing |
|---|---------|-------------|---------------|
| 1 | **SMS Reminders** | FakeSmsProvider sends to console; Reminder model, BullMQ worker, scheduling on finalize | Real SMS provider integration (Twilio, Africa's Talking); delivery receipt tracking; retry logic |
| 2 | **Email Reminders** | `ReminderChannel.EMAIL` enum value exists | No email provider, no email templates, no email sending logic |
| 3 | **Research Export** | `ResearchExport` model with status workflow (PENDING → APPROVED → COMPLETED), `ClinicResearchSettings` model | No API endpoints for export execution, no de-identification pipeline, no file generation, no UI for export management |
| 4 | **Prescriptions** | `CarePlan.medicationPrescribed` boolean flag | No drug catalog, no dosage tracking, no interaction checking, no dispensing workflow |
| 5 | **Patient Edit/Update** | Patient create endpoint exists with full validation | No PATCH/PUT endpoint for updating patient demographics, contact info, or national ID |

---

## Not Implemented (Future Roadmap)

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Dashboard Analytics** | Role-based analytics dashboard with clinical metrics, trend charts, and staff activity summaries |
| 2 | **Appointment Scheduling** | Appointment model, calendar UI, provider availability, patient booking |
| 3 | **Billing/Invoicing** | Invoice model, line items, payment tracking, mobile money integration (MTN MoMo, Vodafone Cash) |
| 4 | **Full Prescription Management** | Drug catalog, dosages, interaction checking, dispensing workflow, refill tracking |
| 5 | **Lab Results/Orders** | Lab order model, result entry, reference ranges, abnormal flagging, trending |
| 6 | **Real-time Notifications** | WebSocket gateway, push notifications, in-app notification center |
| 7 | **Reporting** | PDF/CSV export, configurable report templates, clinic comparison reports, MOH reporting formats |
| 8 | **File/Document Uploads** | S3/MinIO integration, Document model, patient document attachments |
| 9 | **Patient Portal** | Patient-facing app, appointment booking, result viewing, medication reminders |
| 10 | **Referrals** | Inter-clinic referral workflow, referral tracking, acceptance/rejection |
| 11 | **Multi-language / i18n** | Currently English only; Twi, Ga, Ewe, Hausa translations needed for Ghana context |
| 12 | **Inventory / Supplies Management** | Drug and supplies inventory, stock levels, reorder alerts |
| 13 | **Telemedicine Integration** | Video consultation, remote triage, teleconsultation notes |
| 14 | **Patient Vitals Trending** | Historical charts per patient showing BP, glucose, BMI over time |
| 15 | **Drug Allergy / Interaction Checking** | Allergy records, drug-drug interaction database, prescribing alerts |

---

## Test Coverage Summary

### Existing Test Files

| File | Covers |
|------|--------|
| `apps/api/src/patients/patient.service.spec.ts` | Patient creation, code generation, national ID encryption/hashing, duplicate detection |
| `apps/api/src/auth/auth.controller.spec.ts` | WhoAmI endpoint, role computation, permission mapping |
| `apps/api/src/sync/sync.service.spec.ts` | Push/pull sync logic, idempotency, conflict detection |
| `apps/api/src/sync/sync.controller.spec.ts` | Sync API endpoints |
| `apps/api/src/clinics/clinics.controller.spec.ts` | Clinic CRUD endpoints |
| `packages/db/src/phone.spec.ts` | Phone number validation and E.164 formatting |
| `packages/db/src/patient-code.spec.ts` | Patient code generation (NKP-YYYY-######) |
| `apps/web/lib/outbox.test.ts` | Offline outbox queue logic |

### Missing Test Coverage

- Encounter service and controller (workflow transitions, guards)
- Clinical form services (vitals, diabetes screening, hypertension assessment, care plan)
- Consent service and controller
- Reminder service and BullMQ worker
- Admin module (user-role assignment)
- Research settings service
- Frontend component tests
- E2E / integration tests

---

## Infrastructure Status

| Component | Status | Notes |
|-----------|--------|-------|
| **Docker Compose** | Working | Keycloak, PostgreSQL, Redis containers |
| **Keycloak** | Configured | `nkwapa` realm, `nkwapa-web` client, login-required flow |
| **PostgreSQL** | Configured | Prisma migrations, seed scripts |
| **Redis** | Configured | BullMQ connection for reminder queue |
| **CI/CD** | Not configured | No GitHub Actions, no deployment pipeline |
| **Production Deployment** | Not configured | No Dockerfile for apps, no cloud deployment |
| **Monitoring / Logging** | Not configured | No structured logging, no APM, no error tracking |
| **Backups** | Not configured | No automated database backups |
