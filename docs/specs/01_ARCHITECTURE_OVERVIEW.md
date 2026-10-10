# Architecture Overview

## Purpose

Describe the live application architecture for Nkwapa after the April 2026 security and scale hardening pass.

This document is about the current repo, not the original bootstrap plan.

---

## Product Shape

Nkwapa is a multi-surface healthcare platform with three major runtime concerns:

- staff-facing EMR and clinic operations
- patient-facing portal and claim onboarding
- research-safe exports and reminders running through background jobs

The current tenancy model is:

`Organization -> Clinic(Location) -> Patients / Staff / Operations`

`Clinic.zoneCode` groups clinics for reporting and filtering. It is a filter dimension and not a permission scope: sharing a zone never grants access to a clinic. See the Zone Model section of `docs/specs/03_AUTH_AND_RBAC.md`.

---

## Monorepo Layout

```text
nkwapa/
├── apps/
│   ├── api/                NestJS HTTP API and BullMQ workers
│   └── web/                Next.js App Router frontend
├── packages/
│   └── db/                 Prisma schema, migrations, seed scripts, helpers
├── infra/
│   └── nkwapa/             Docker Compose, Keycloak realm export, login theme
├── docs/                   Architecture, workflows, setup guides, audit notes
└── memory/                 Agent-maintained codebase memory
```

---

## Runtime Services

### Web

- Next.js App Router
- Keycloak browser login flow
- Dexie-backed offline state for core EMR records
- shared loading, error, retry, and empty-state UI components

### API

- NestJS modules for auth, patients, encounters, consents, sync, audit, reminders, research, admin, dashboard, patient portal, and ops
- BullMQ workers in the same runtime process for reminders and research export jobs
- request logging, request IDs, security headers, validation, structured errors, and Redis-backed rate limiting

### Data and Infra

- PostgreSQL as system of record
- Prisma as the application data layer
- Redis for rate limiting and background jobs
- Keycloak for identity, login, password reset, and session policy

---

## Request and Access Flow

1. A user authenticates with Keycloak.
2. The web app calls `/auth/whoami` after obtaining a token.
3. The API verifies the JWT via JWKS and hydrates the local `User`.
4. Local roles from `UserClinicRole` determine effective permissions.
5. Clinic-scoped routes validate the requested clinic, permissions, and membership.
6. The Prisma layer opens a transaction-scoped RLS context that sets current request, user, organization, clinic list, active clinic, zone, and system-admin flags. The zone is diagnostic context; no policy reads it.
7. Postgres RLS policies enforce clinic isolation for protected tables.

This means authorization is enforced in three layers:

- Keycloak identity
- NestJS guards and decorators
- Postgres RLS for clinic-scoped data access

---

## Cross-Cutting Rules

### Tenant Model

- `Organization` is the top-level business boundary.
- `Clinic` is the operational and physical location boundary.
- Most product behavior still operates at clinic scope.
- Zone filters narrow the admin clinic registry, the network overview and the staff roster. Organization-wide reporting is still follow-on work.

### Security Defaults

- DTO validation uses `transform`, `whitelist`, and `forbidNonWhitelisted`.
- Error responses return `{ code, message, requestId, retryable, fieldErrors?, recoveryAction? }`.
- CORS uses an exact allowlist from `CORS_ALLOWED_ORIGINS`.
- Rate limiting is Redis-backed and endpoint specific.
- Security headers and request IDs are applied at the API edge.

### UX Resilience

- App Router root `loading.tsx`, `error.tsx`, `global-error.tsx`, and `not-found.tsx` are part of the platform contract.
- Shared skeleton and error-state components are reused across the app.
- Frontend API calls normalize timeouts, network failures, and structured API errors.

### Background Processing

- Reminder sending and research export processing rely on Redis and BullMQ.
- Research exports are asynchronous, approval-aware, de-identified, and artifact-based.
- Background jobs still need deliberate tenant-context handling where DB isolation matters.

---

## Current Strengths

- secure identity split between Keycloak and local RBAC
- DB-level clinic isolation through RLS
- scale-ready clinic location model with organization grouping
- strong error/loading recovery baseline in the frontend
- clear separation between operational, clinical, portal, and research concerns

---

## Current Follow-On Work

- org-level reporting, and zone-scoped RBAC if a zone is ever to mean more than a filter
- deeper offline support outside the original EMR flow
- fuller appointment calendar and rescheduling UX
- broader job/script adoption of the same RLS safety model
