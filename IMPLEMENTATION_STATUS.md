# Nkwapa EMR - Implementation Status

> Last updated: 2026-04-08
>
> This document reflects the live repository state in `release/dev`, including the April 2026 security, RLS, multi-clinic, UX hardening pass, and the new clinic-scoped messaging feature.

---

## Legend

| Emoji | Meaning                        |
| ----- | ------------------------------ |
| ✅    | Fully Implemented (90-100%)    |
| 🚧    | Partially Implemented (with %) |
| ❌    | Not Implemented (0%)           |
| 🚀    | Future / Planned               |

---

## Executive Summary

Nkwapa is a multi-surface clinical platform with:

- organization-aware clinic/location modeling
- Keycloak-backed authentication with local RBAC and clinic memberships
- Postgres-backed request-scoped RLS for clinic data isolation
- patient registry, encounter, consent, reminder, research export, and prescribing flows
- clinic operations tooling for shifts, check-ins, assignments, and dashboards
- patient portal claim, measurements, self-reports, trends, and appointment request flows
- clinic-scoped real-time staff messaging via WebSocket
- app-wide loading, empty, retry, and error fallback states

---

## Runtime Snapshot

### Repository Layout

```text
nkwapa/
├── apps/
│   ├── api/                NestJS API + workers + WebSocket gateway
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
| Real-time       | Socket.IO via @nestjs/websockets + Redis adapter                   |
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
8. WebSocket connections authenticate via JWT handshake and scope to clinic rooms.

---

## Status Matrix

### Identity, Auth & Access Control

| Feature                          | Status | %    | Notes                                             |
| -------------------------------- | ------ | ---- | ------------------------------------------------- |
| Keycloak OIDC login              | ✅     | 100% | JWT verification through JWKS                     |
| Local user hydration             | ✅     | 100% | Auto-create on first Keycloak login               |
| Clinic-scoped and global roles   | ✅     | 100% | Via `UserClinicRole` with 7 role types            |
| Effective permission computation | ✅     | 100% | Union across roles, `*` wildcard for SYSTEM_ADMIN |
| Disabled-user handling           | ✅     | 100% | `isActive` flag on User model                     |
| Patient claim onboarding state   | ✅     | 100% | Returned by `/auth/whoami`                        |
| Zone-scoped RBAC                 | ❌     | 0%   | `zoneCode` reserved in schema, policies deferred  |
| Organization-level permissions   | ❌     | 0%   | Org model exists, admin UI still clinic-first     |

### Data Isolation & Infrastructure

| Feature                              | Status | %    | Notes                                                        |
| ------------------------------------ | ------ | ---- | ------------------------------------------------------------ |
| Postgres RLS on clinic-scoped tables | ✅     | 100% | Transaction-local context via Prisma                         |
| Request-scoped Prisma context        | ✅     | 100% | User, org, clinic list, active clinic, system admin flags    |
| Keyset-friendly indexes              | ✅     | 100% | On hot list tables                                           |
| Trigram/text-search indexes          | ✅     | 100% | For human-facing search paths                                |
| API validation & sanitization        | ✅     | 100% | DTO validation, request normalization, structured errors     |
| API security hardening               | ✅     | 100% | CORS allowlist, security headers, request IDs, rate limiting |
| Organization & clinic location model | ✅     | 100% | `organizationId`, `timezone`, `locationCode`, `zoneCode`     |

### Clinical Workflows

| Feature                                           | Status | %    | Notes                                                                                    |
| ------------------------------------------------- | ------ | ---- | ---------------------------------------------------------------------------------------- |
| Patient registry (create, update, search, detail) | ✅     | 100% | Code generation, encrypted national ID                                                   |
| Patient merge & code alias                        | ✅     | 100% | SYSTEM_ADMIN-only merge with alias preservation                                          |
| Portal link/invite                                | ✅     | 95%  | Link, invite, claim flows; invite automation lighter                                     |
| Duplicate review queue                            | ❌     | 0%   | Hashed ID collision detected, no dedicated queue UI                                      |
| Cross-clinic chart consolidation                  | ❌     | 0%   | Merge is clinic-local only                                                               |
| Encounter workflow (draft -> review -> finalize)  | ✅     | 100% | Full state machine with role-based transitions                                           |
| Vitals recording                                  | ✅     | 100% | Contextual BP, pulse, temperature, respiration, SpO2, anthropometrics, tobacco screening |
| Diabetes screening                                | ✅     | 100% | Glucose, HbA1c, symptoms, DM suspicion                                                   |
| Hypertension assessment                           | ✅     | 100% | BP classification per thresholds                                                         |
| Care plan creation                                | ✅     | 100% | Counseling, medication, follow-up date                                                   |
| Prescription & drug catalog                       | ✅     | 100% | Clinic-scoped drug catalog, encounter prescriptions                                      |
| Consent grant/revoke                              | ✅     | 100% | Witness fields, snapshot text, offline supported                                         |

### Clinic Operations

| Feature                          | Status | %    | Notes                                           |
| -------------------------------- | ------ | ---- | ----------------------------------------------- |
| Staff shift check-in/out         | ✅     | 100% | One ACTIVE per user/clinic, audit logged        |
| Patient check-in                 | ✅     | 100% | WAITING -> ASSIGNED -> IN_PROGRESS -> COMPLETED |
| Staff assignments (manager-only) | ✅     | 100% | Volunteer + Doctor, reassign with reason        |
| Today board                      | ✅     | 100% | Manager view of shifts + check-ins kanban       |
| My Assigned worklist             | ✅     | 100% | Staff-specific filtered view                    |
| Wait-time analytics              | ❌     | 0%   | Not yet built                                   |
| Room/resource capacity           | ❌     | 0%   | Not yet modeled                                 |

### Patient Portal

| Feature                                 | Status | %    | Notes                                 |
| --------------------------------------- | ------ | ---- | ------------------------------------- |
| Claim record & onboarding               | ✅     | 100% | Username/password via Keycloak        |
| Self-measurements (BP, glucose, weight) | ✅     | 100% | Validation, source tracking           |
| Trends (line charts, 30/90/180 day)     | ✅     | 100% | Combined encounter + self-report data |
| Self-reports                            | ✅     | 100% | Patient-submitted health data         |
| Appointment requests                    | ✅     | 100% | Date range request -> clinic confirms |
| Portal overview                         | ✅     | 100% | Summary view                          |
| Reschedule/cancel by patient            | ❌     | 0%   | Not yet built                         |
| Patient-to-staff messaging              | 🚀     | 0%   | Future consideration                  |

### Appointment Scheduling

| Feature                               | Status | %    | Notes                                              |
| ------------------------------------- | ------ | ---- | -------------------------------------------------- |
| Appointment request (patient)         | ✅     | 100% | Date range + reason                                |
| Confirm/reject by staff               | ✅     | 100% | Creates Appointment record, schedules reminder     |
| Appointment persistence               | ✅     | 100% | CONFIRMED, CANCELLED, COMPLETED, NO_SHOW statuses  |
| Staff calendar view                   | ❌     | 0%   | No dedicated calendar UI                           |
| Reschedule/cancel flows               | ❌     | 0%   | Not yet built                                      |
| No-show handling & reporting          | ❌     | 0%   | Status exists, no workflow UI                      |
| Reminder automation tied to lifecycle | 🚧     | 40%  | Basic reminder on confirm, no full lifecycle hooks |

### Reminders & Notifications

| Feature                               | Status | %    | Notes                                          |
| ------------------------------------- | ------ | ---- | ---------------------------------------------- |
| Follow-up reminder scheduling         | ✅     | 100% | BullMQ queue, triggered on encounter finalize  |
| Appointment reminders                 | ✅     | 100% | Triggered on appointment confirm               |
| SMS delivery (Twilio + fake provider) | ✅     | 100% | Env-flagged provider selection                 |
| Email delivery                        | 🚧     | 70%  | Nodemailer adapter exists, not all paths wired |
| Delivery status tracking              | ✅     | 100% | QUEUED, SENT, DELIVERED, FAILED                |
| Webhook ingestion (SMS status)        | ✅     | 100% | `/webhooks/sms/status`                         |

### Research & Exports

| Feature                                      | Status | %    | Notes                                                   |
| -------------------------------------------- | ------ | ---- | ------------------------------------------------------- |
| Research settings (per clinic)               | ✅     | 100% | Director configures                                     |
| Export request/approval flow                 | ✅     | 100% | PENDING_APPROVAL -> APPROVED -> PROCESSING -> COMPLETED |
| De-identification (HMAC, timestamp rounding) | ✅     | 100% | Stable clinic-scoped keys                               |
| ZIP artifact generation                      | ✅     | 100% | Fixed pack contract with manifest                       |
| GitHub repo sync                             | ✅     | 100% | Implemented with mocked tests (no live creds in dev)    |
| Consent gating on export                     | ✅     | 100% | Only GRANTED patients included                          |

### Dashboard & Analytics

| Feature                     | Status | %    | Notes                             |
| --------------------------- | ------ | ---- | --------------------------------- |
| Role-aware summary metrics  | ✅     | 100% | Per-clinic dashboard              |
| Trend/distribution cards    | ✅     | 100% | Recharts visualizations           |
| Staff activity visibility   | 🚧     | 60%  | Basic metrics, no deep drill-down |
| Organization-wide rollups   | ❌     | 0%   | Org model exists, no rollup UI    |
| Cohort/population analytics | ❌     | 0%   | Not yet built                     |

### Admin & Lifecycle

| Feature                         | Status | %    | Notes                    |
| ------------------------------- | ------ | ---- | ------------------------ |
| Clinic management (CRUD)        | ✅     | 100% | Organization-aware       |
| User role assignment            | ✅     | 100% | Per-clinic role granting |
| User deactivation (soft delete) | ✅     | 100% | Global and clinic-level  |
| Role revocation                 | ✅     | 100% | Remove clinic membership |
| Audit trail                     | ✅     | 100% | Filterable audit log UI  |

### Offline & Sync

| Feature                                        | Status | %    | Notes                                      |
| ---------------------------------------------- | ------ | ---- | ------------------------------------------ |
| Core EMR offline (patients, encounters, forms) | ✅     | 100% | Dexie IndexedDB + outbox                   |
| Consent offline                                | ✅     | 100% | Included in sync scope                     |
| Prescription offline                           | ✅     | 100% | Included in sync scope                     |
| Conflict tracking & resolution                 | ✅     | 100% | SyncMutation model, APPLIED/CONFLICT/ERROR |
| Ops pages offline                              | 🚧     | 10%  | Today board, assignments are online-first  |
| Portal flows offline                           | ❌     | 0%   | All portal actions require live API        |
| Admin/research offline                         | ❌     | 0%   | Online-only by design                      |

### Clinic Messaging / Chat

| Feature                        | Status | %    | Notes                                       |
| ------------------------------ | ------ | ---- | ------------------------------------------- |
| Clinic-scoped direct messaging | ✅     | 100% | 1:1 conversations, clinic-isolated          |
| WebSocket real-time delivery   | ✅     | 100% | Socket.IO with Redis adapter                |
| Floating chat widget           | ✅     | 100% | Bottom-right, expandable panel              |
| Online presence indicators     | ✅     | 100% | Redis-backed, green/gray dots               |
| Unread message badges          | ✅     | 100% | Per-conversation and global count           |
| Typing indicators              | ✅     | 100% | Real-time broadcast                         |
| Message history & pagination   | ✅     | 100% | Cursor-based REST fallback                  |
| RLS on chat tables             | ✅     | 100% | Conversation + Message policies             |
| Group chat                     | 🚀     | 0%   | Schema supports it, not yet exposed         |
| E2E encryption                 | 🚀     | 0%   | `encrypted` field reserved, TLS-only for v1 |

### UX Resilience

| Feature                                 | Status | %    | Notes                          |
| --------------------------------------- | ------ | ---- | ------------------------------ |
| Root loading/error/not-found boundaries | ✅     | 100% | App-wide route boundaries      |
| Shared skeleton components              | ✅     | 100% | PageSkeleton, SectionSkeleton  |
| Inline error & retry states             | ✅     | 100% | InlineErrorState, RetryAction  |
| Normalized ApiError handling            | ✅     | 100% | Timeout/network/retry metadata |
| Route-specific stale-while-refresh      | 🚧     | 40%  | Not all pages have this polish |
| Optimistic mutations                    | 🚧     | 30%  | Limited to core EMR surfaces   |

### Design System Compliance

| Feature                          | Status | %    | Notes                                          |
| -------------------------------- | ------ | ---- | ---------------------------------------------- |
| Flat/minimal design language     | ✅     | 100% | No shadows/gradients on clinical views         |
| Lucide icon set (no emoji icons) | ✅     | 100% | Consistent iconography                         |
| WCAG accessibility baseline      | 🚧     | 70%  | Contrast ratios met, keyboard nav partial      |
| Responsive breakpoints           | 🚧     | 75%  | Mobile-friendly but not all surfaces optimized |
| Animation/transition standards   | 🚧     | 60%  | Some hover states inconsistent                 |

---

## Overall Progress Summary

| Category                 | Completion       |
| ------------------------ | ---------------- |
| ✅ Fully Implemented     | 23 feature areas |
| 🚧 Partially Implemented | 9 feature areas  |
| ❌ Not Implemented       | 8 feature areas  |
| 🚀 Future / Planned      | 2 feature areas  |

**Estimated overall platform completion: ~78%**

---

## Recommended Next Additions

1. 🚀 **Finish appointments V2** - Staff calendar views, reschedule/cancel, no-show handling, appointment reminder automation.

2. 🚀 **Extend org-aware administration** - Organization dashboards, clinic roster views, org-level filters.

3. 🚀 **Finish zone-aware access** - Promote `zoneCode` from schema reserve to real access/reporting policy.

4. 🚀 **Deepen patient identity** - Duplicate review queue, stronger match heuristics, cross-clinic consolidation.

5. 🚀 **Expand offline beyond core EMR** - Bring ops and portal writes into the sync/outbox model.

6. 🚀 **Group chat** - Extend the existing chat infrastructure to support group conversations.

7. 🚀 **Close RLS gaps for background jobs** - Ensure background jobs opt into tenant context.

8. 🚀 **Standardize UX resilience** - Apply shared skeleton/empty/retry states to every major screen.

---

## Key Docs To Read Next

- `docs/specs/01_ARCHITECTURE_OVERVIEW.md`
- `docs/specs/02_DOMAIN_MODEL_AND_DATA_DICTIONARY.md`
- `docs/specs/03_AUTH_AND_RBAC.md`
- `docs/specs/04_OFFLINE_FIRST_AND_SYNC.md`
- `docs/FEATURE_WORKFLOWS_GUIDE.md`
- `docs/FEATURE_GAPS_AND_NEXT_ADDITIONS.md`
- `docs/security-audit-2026-04-04.md`
