# Nkwapa EMR - Implementation Status

> Last updated: 2026-04-05
>
> This document reflects the live repository state in `main`, including the April 2026 security, RLS, multi-clinic, and UX hardening pass.

---

## Executive Summary

Nkwapa is no longer a thin clinic-scoped EMR prototype. The current product is a multi-surface platform with:

- organization-aware clinic/location modeling
- Keycloak-backed authentication with local RBAC and clinic memberships
- Postgres-backed request-scoped RLS for clinic data isolation
- patient registry, encounter, consent, reminder, research export, and prescribing flows
- clinic operations tooling for shifts, check-ins, assignments, and dashboards
- patient portal claim, measurements, self-reports, trends, and appointment request flows
- app-wide loading, empty, retry, and error fallback states

The main remaining work is no longer "build the basics." It is finishing the second layer of scale and product depth:

- zone-aware access and organization-level reporting
- richer appointment/calendar workflows
- broader offline coverage outside the original EMR flow
- stronger dedupe and patient identity operations
- deeper UX polish on some newer screens

---

## Runtime Snapshot

### Repository Layout

```text
nkwapa/
├── apps/
│   ├── api/                NestJS API + workers
│   └── web/                Next.js App Router frontend
├── packages/
│   └── db/                 Prisma schema, migrations, seed scripts
├── infra/
│   └── nkwapa/             Docker Compose, Keycloak realm/theme
├── docs/                   Operational guides, specs, audits
└── memory/                 Agent memory and implementation notes
```

### Core Runtime Services

| Service  | Default                 |
| -------- | ----------------------- |
| Web app  | `http://localhost:3000` |
| API      | `http://localhost:4000` |
| Postgres | `localhost:5433`        |
| Redis    | `localhost:6379`        |
| Keycloak | `http://localhost:8080` |

### Core Stack

| Layer           | Technology                                                         |
| --------------- | ------------------------------------------------------------------ |
| Backend         | NestJS 10, TypeScript, BullMQ                                      |
| Frontend        | Next.js 14 App Router, React 18, Tailwind, shadcn/ui, MUI DataGrid |
| Database        | PostgreSQL + Prisma 7                                              |
| Auth            | Keycloak OIDC/JWKS + local DB-backed roles                         |
| Offline         | Dexie IndexedDB + outbox sync                                      |
| Search/indexing | B-tree + keyset-friendly indexes + trigram indexes                 |
| Messaging       | Twilio-compatible SMS, Nodemailer email                            |
| Background jobs | Redis + BullMQ                                                     |

---

## Current Architectural Rules

1. Keycloak owns identity, password hashing, session expiry, password reset, and brute-force protection.
2. Nkwapa owns authorization through `UserClinicRole`, effective permissions, clinic context, and RLS-scoped data access.
3. `Organization -> Clinic(Location)` is the current tenant model. `Clinic.zoneCode` exists for future zone-aware rollups, not current RBAC.
4. Clinic-scoped HTTP traffic is expected to run through the request-scoped Prisma RLS context.
5. `/auth/whoami` remains the frontend bootstrap contract for memberships, active clinic, permissions, and onboarding state.
6. The API returns structured error envelopes with request IDs and recovery actions instead of raw exception payloads.
7. Root loading, error, and not-found boundaries are part of the product contract and should be preserved on new pages.

---

## Status Matrix

| Area                                           | Status                            | Notes                                                                                                                           |
| ---------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Authentication and local RBAC                  | Implemented                       | Keycloak JWT verification, user hydration, clinic/global roles, effective permission computation, patient onboarding state.     |
| API validation and sanitization                | Implemented                       | DTO validation at boundaries, request normalization, structured validation errors, input sanitization helpers.                  |
| API security hardening                         | Implemented                       | Exact-origin CORS allowlist, security headers, request IDs, stable error envelopes, endpoint-level Redis rate limiting.         |
| Organization and clinic location model         | Implemented                       | `Organization` model added; clinics now carry `organizationId`, `timezone`, `locationCode`, `zoneCode`.                         |
| Postgres RLS and request-scoped tenant context | Implemented                       | Clinic-scoped tables protected by DB policies; Prisma uses transaction-local context for request handling.                      |
| Patient registry and chart management          | Implemented with follow-on work   | Create, update, registry, search, code generation, encrypted national ID, portal link/invite, merge handling.                   |
| Encounter workflow and clinical forms          | Implemented                       | Draft -> review -> finalize flow with vitals, diabetes screening, hypertension assessment, care plan, prescriptions.            |
| Consent and research gating                    | Implemented                       | Grant/revoke flows, witness fields, consent snapshotting, export inclusion checks.                                              |
| Offline-first sync foundations                 | Implemented for core EMR only     | Patients, encounters, forms, consent, prescriptions, outbox, sync state. Newer ops/portal screens remain mostly online-first.   |
| Audit logging                                  | Implemented                       | Major mutations emit audit events; audit UI supports filtering and list access.                                                 |
| Clinic operations                              | Implemented                       | Shifts, patient check-ins, assignments, Today board, My Assigned worklist.                                                      |
| Dashboard analytics                            | Implemented baseline              | Role-aware metrics and trend/distribution cards. Organization-wide rollups are not yet built.                                   |
| Patient portal                                 | Implemented for core portal flows | Claim record, measurements, trends, self-reports, appointment requests, portal overview.                                        |
| Appointment scheduling                         | Partially implemented             | Request, confirm, reject, and appointment persistence exist; richer calendar operations and reschedule flows are still pending. |
| Reminder infrastructure                        | Implemented baseline              | Follow-up reminders, queue processing, delivery status tracking, SMS/email adapters, webhook ingestion.                         |
| Research export pipeline                       | Implemented V1                    | Approval-aware async exports, de-identification, ZIP artifacts, GitHub snapshot sync.                                           |
| Error/loading/empty state UX                   | Implemented baseline              | App-wide route boundaries and shared fallback components are live; some route-specific polish remains.                          |
| Zone-scoped RBAC                               | Not implemented                   | `zoneCode` is reserved in schema and RLS context, but zone-level access policies are deferred.                                  |
| Organization-level admin/reporting             | Not implemented                   | Org data model exists, but most UI and permissions still operate at clinic scope.                                               |

---

## What Is Fully Implemented

### Identity, Auth, and Access

- Keycloak OIDC login
- JWT verification through JWKS
- local user hydration on first successful login
- clinic-scoped and global roles via `UserClinicRole`
- effective permissions computed in the API
- disabled-user handling
- patient claim onboarding state returned by `/auth/whoami`

### Data Isolation and Scale Foundations

- Postgres RLS on clinic-scoped operational and clinical tables
- request-scoped Prisma context with user, organization, clinic list, active clinic, and system admin flags
- keyset-friendly indexes on hot list tables
- trigram/text-search indexes for human-facing search paths
- organization-aware clinic uniqueness through `(organizationId, locationCode)`

### Clinical and Administrative Workflows

- patient registry create, update, search, detail, and code generation
- duplicate handling through hashed national ID checks
- duplicate chart merge into canonical patient with code alias preservation
- encounter creation, review, finalization, and clinical forms
- prescription catalog and encounter prescriptions
- consent grant and revoke flows
- admin clinic management and user role assignment
- lifecycle deactivation paths
- audit trail

### Operations, Portal, and Research

- shift check-in and check-out
- patient check-ins and staff assignments
- Today board and My Assigned staff worklist
- patient portal measurements, trends, self-reports, appointment requests
- portal link, invite, and claim-record onboarding
- research settings, approval-aware exports, ZIP artifact generation, and GitHub sync

### Runtime UX Hardening

- shared `PageSkeleton`, `SectionSkeleton`, `InlineErrorState`, `RetryAction`, and `NotFoundState`
- root `loading.tsx`, `error.tsx`, `global-error.tsx`, and `not-found.tsx`
- normalized frontend `ApiError` handling with timeout/network/retry metadata
- clear recovery messaging instead of blank screens or raw crashes

---

## Partially Completed Features

### Offline Coverage

The original EMR flow is offline-capable, but newer surfaces are not yet at the same maturity:

- Today board and most ops views are online-first
- portal flows rely on live API access
- claim/invite/admin flows do not currently queue offline mutations

### Appointment Management

The data model and core request-confirm/reject flow exist, but the product still lacks:

- a richer calendar view for staff
- reschedule and cancel-by-patient flows
- reminder templates tied to confirmed appointment lifecycle states
- stronger no-show and follow-up operations reporting

### Organization and Zone Scale-Up

The schema is ready for multi-location scale, but the higher-order product layer is still incomplete:

- `Organization` exists but most admin UI is still clinic-first
- `zoneCode` exists but zone-aware RBAC and reporting are deferred
- most dashboards are clinic-level, not org rollups

### Page-by-Page UX Polish

Baseline loading and recovery states exist globally, but not every page has identical polish for:

- stale-while-refresh transitions
- optimistic mutations
- empty-state guidance
- inline retry affordances on every subsection

---

## Recommended Next Additions

1. Extend org-aware administration.
   - Add organization dashboards, organization clinic roster views, and org-level filters.

2. Finish zone-aware access.
   - Promote `zoneCode` from schema reserve field to real access/reporting policy.

3. Deepen patient identity management.
   - Add a duplicate review queue, stronger match heuristics, and cross-clinic chart consolidation flows.

4. Finish appointments V2.
   - Add staff calendar views, reschedule/cancel operations, no-show handling, and appointment reminder automation.

5. Expand offline beyond the original EMR path.
   - Bring ops and portal writes into the sync/outbox model where it is safe and valuable.

6. Close the RLS coverage gap for non-request code paths.
   - Ensure background jobs and scripts opt into the same tenant context where appropriate.

7. Keep standardizing UX resilience.
   - Apply shared skeleton, empty, retry, and inline failure states to every major screen, not just root segments.

---

## Key Docs To Read Next

- `docs/specs/01_ARCHITECTURE_OVERVIEW.md`
- `docs/specs/02_DOMAIN_MODEL_AND_DATA_DICTIONARY.md`
- `docs/specs/03_AUTH_AND_RBAC.md`
- `docs/specs/04_OFFLINE_FIRST_AND_SYNC.md`
- `docs/FEATURE_WORKFLOWS_GUIDE.md`
- `docs/FEATURE_GAPS_AND_NEXT_ADDITIONS.md`
- `docs/security-audit-2026-04-04.md`
