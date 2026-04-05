# Prioritized Implementation Plan

## Purpose

Turn the current feature gap map into a phased execution plan that can be used for sprint planning, ticket creation, and implementation sequencing.

This plan assumes the current live baseline described in:

- `IMPLEMENTATION_STATUS.md`
- `docs/FEATURE_GAPS_AND_NEXT_ADDITIONS.md`
- `docs/security-audit-2026-04-04.md`

---

## Planning Principles

1. Prioritize the highest user-value additions that sit on top of already implemented data models and APIs.
2. Keep tenant isolation and security work moving alongside feature delivery instead of treating them as a later cleanup.
3. Avoid broad rewrites when targeted incremental work can deliver value faster.
4. Ship each phase with API, UI, tests, and docs together.

---

## Suggested Delivery Order

| Phase   | Focus                                                  | Why now                                                             |
| ------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| Phase 1 | Appointment Operations V2                              | Highest visible product value on top of existing appointment models |
| Phase 2 | Patient Identity And Portal Access Hardening           | Directly improves safety, dedupe, and onboarding quality            |
| Phase 3 | Organization And Zone Rollout                          | Unlocks multi-location scale the schema is already prepared for     |
| Phase 4 | Offline Expansion And Tenant-Safe Background Execution | Extends resilience and closes operational safety gaps               |
| Phase 5 | UX Recovery And Analytics Polish                       | Makes the product feel complete and trustworthy at scale            |

---

## Phase 1: Appointment Operations V2

### Outcome

Upgrade appointments from basic request-confirm persistence into a complete staff and patient scheduling workflow.

### Tickets

#### `PH1-APPT-01` Staff calendar API and list views

- Scope:
  - add staff-facing day/week appointment query endpoints
  - support filtering by clinic date, assigned doctor, status, and patient
  - return data optimized for list and calendar-style UI
- Main areas:
  - `apps/api/src/patient-portal`
  - `apps/api/src/clinics` or a dedicated appointments controller
  - `apps/web/app` staff scheduling views
- Dependencies:
  - existing `Appointment` and `AppointmentRequest` models
- Done when:
  - staff can browse upcoming appointments without relying only on request lists

#### `PH1-APPT-02` Appointment lifecycle mutations

- Scope:
  - add reschedule, cancel, complete, and no-show actions
  - preserve audit logging and permission enforcement
  - validate safe status transitions
- Main areas:
  - appointment service/controller
  - audit integration
  - DTO validation
- Done when:
  - the appointment lifecycle is no longer limited to confirm or reject

#### `PH1-APPT-03` Patient-visible appointment history and actions

- Scope:
  - improve patient appointment history in `/portal/appointments`
  - show upcoming, completed, cancelled, and no-show states
  - allow patient-safe cancel or reschedule request flows where policy allows
- Main areas:
  - `apps/web/app/portal/appointments/page.tsx`
  - portal API client and backend read/write endpoints
- Done when:
  - patients can understand and manage their appointment state from the portal

#### `PH1-APPT-04` Reminder automation for confirmed appointments

- Scope:
  - create reminder scheduling rules for confirmed and rescheduled appointments
  - cancel or suppress reminders for cancelled appointments
  - surface delivery state in staff-facing UI where useful
- Main areas:
  - reminders module
  - appointment lifecycle service
  - background jobs
- Dependencies:
  - `PH1-APPT-02`
- Done when:
  - confirmed appointments produce predictable reminder behavior

#### `PH1-APPT-05` Appointment regression and acceptance suite

- Scope:
  - add end-to-end and integration tests for request -> confirm -> reschedule -> complete/cancel/no-show
  - add portal UAT scenarios to docs
- Main areas:
  - API tests
  - web/manual QA docs
- Done when:
  - appointment lifecycle changes are covered by repeatable regression checks

### Phase Exit Criteria

- staff can view and manage appointments in a dedicated workflow
- patients can see meaningful appointment history
- reminder automation matches appointment state
- all lifecycle changes are audited and tested

---

## Phase 2: Patient Identity And Portal Access Hardening

### Outcome

Make chart identity safer and easier to manage as portal use and multi-clinic scale increase.

### Tickets

#### `PH2-ID-01` Suspected duplicate review queue

- Scope:
  - add an admin/system-admin queue for likely duplicate patient records
  - seed queue candidates from existing dedupe signals and lightweight heuristics
- Main areas:
  - admin module
  - patient service/repository
  - admin UI
- Done when:
  - likely duplicates can be reviewed from a dedicated surface instead of only at merge time

#### `PH2-ID-02` Merge preview and safety checks

- Scope:
  - add a preview step showing chart differences before merge
  - surface records that will move, cancel, or be preserved as aliases
  - block unsafe merges with clearer reasons
- Main areas:
  - admin merge service
  - patient detail merge dialog
- Done when:
  - merge is operator-safe and reviewable before execution

#### `PH2-ID-03` Cross-clinic duplicate investigation

- Scope:
  - add org-aware duplicate review views across clinics
  - allow investigation without forcing immediate cross-clinic merge support
- Main areas:
  - admin/org reporting
  - patient search and duplicate heuristics
- Dependencies:
  - organization-aware admin context from Phase 3 can deepen this later
- Done when:
  - operators can at least identify likely duplicates across clinic boundaries

#### `PH2-ID-04` Portal invite delivery and expiry improvements

- Scope:
  - improve invite lifecycle handling, expiry visibility, and resend/cancel behavior
  - optionally connect invites to outbound notification delivery
- Main areas:
  - patient portal service
  - patient chart UI
  - reminder or messaging hooks
- Done when:
  - portal invites are easier to manage and less opaque to staff

#### `PH2-ID-05` Patient identity QA suite

- Scope:
  - add tests for duplicate review, merge preview, claim edge cases, invite expiry, and canonical redirects
- Done when:
  - patient identity and onboarding flows have dedicated regression coverage

### Phase Exit Criteria

- duplicate management is visible and reviewable
- merge is safer and easier to reason about
- portal invite handling is easier for staff and patients

---

## Phase 3: Organization And Zone Rollout

### Outcome

Promote the current schema-level organization/location model into actual admin, reporting, and access behavior.

### Tickets

#### `PH3-ORG-01` Organization admin context

- Scope:
  - add organization-aware filters and context switching for system-admin and higher-level admin views
  - show clinics grouped by organization where relevant
- Main areas:
  - `/admin/clinics`
  - `/admin/users`
  - bootstrap/admin APIs
- Done when:
  - org-level oversight exists in the UI instead of only in the DB model

#### `PH3-ORG-02` Organization reporting endpoints

- Scope:
  - add org-level rollup endpoints for dashboards and operational summaries
  - aggregate across clinics while preserving clinic drilldown links
- Main areas:
  - dashboard module
  - admin/reporting services
- Done when:
  - leadership can see organization-wide snapshots without manual clinic switching

#### `PH3-ORG-03` Zone-aware filters and policy design

- Scope:
  - define the first zone-aware access model using the existing `zoneCode`
  - support zone filtering in reporting and operations views
  - decide whether zone is only a reporting filter or a real permission scope in V1
- Main areas:
  - auth/RBAC docs
  - admin/reporting APIs
  - clinic metadata flows
- Done when:
  - the product has an explicit zone model rather than a reserved field with no behavior

#### `PH3-ORG-04` Location and zone data quality pass

- Scope:
  - verify all clinics have correct `organizationId`, `timezone`, `locationCode`, and optional `zoneCode`
  - add admin validation or tooling for bad/missing location metadata
- Main areas:
  - clinic admin flows
  - seed/setup docs
- Done when:
  - org and zone features are backed by reliable clinic metadata

#### `PH3-ORG-05` Org/zone security and permission tests

- Scope:
  - add test coverage for org rollups, allowed zone filters, and any new role or scope rules
- Done when:
  - the new multi-location access layer is tested rather than assumed

### Phase Exit Criteria

- organization context is visible in the product
- org-wide reporting exists
- zone behavior is explicit and documented

---

## Phase 4: Offline Expansion And Tenant-Safe Background Execution

### Outcome

Extend resilience beyond the original EMR capture flow and close the gap between request-time safety and non-request execution paths.

### Tickets

#### `PH4-OFF-01` Offline support for high-value ops mutations

- Scope:
  - evaluate and add outbox support for the safest Today board actions
  - likely candidates: shift check-in/check-out and selected patient check-in actions
- Main areas:
  - sync module
  - Dexie schema/outbox
  - Today board UI
- Done when:
  - critical floor operations are less dependent on perfect connectivity

#### `PH4-OFF-02` Safer offline read caches for portal history

- Scope:
  - preserve recent portal appointment and history reads locally where safe
  - keep stale data clearly labeled
- Main areas:
  - portal pages
  - local storage/sync support
- Done when:
  - patient portal history doesn’t disappear completely on transient network loss

#### `PH4-OFF-03` Background job tenant context adoption

- Scope:
  - ensure reminder and research jobs explicitly opt into the same tenant-safety conventions they need
  - document the rule for future background jobs and scripts
- Main areas:
  - Prisma service usage
  - reminders
  - research exports
  - maintenance scripts
- Done when:
  - non-request code paths no longer rely on implicit owner-level access assumptions

#### `PH4-OFF-04` Sync conflict UX improvements

- Scope:
  - add better conflict messaging and recovery flows where duplicate or canonical-chart issues arise
- Main areas:
  - sync UI
  - patient create and merge-adjacent flows
- Done when:
  - users can recover from common sync conflicts without support intervention

#### `PH4-OFF-05` Offline and job execution test matrix

- Scope:
  - add regression tests for outbox replay, idempotency, conflict behavior, and tenant-aware job execution
- Done when:
  - offline and background safety behavior is verifiable

### Phase Exit Criteria

- selected ops workflows tolerate weak connectivity better
- background jobs follow deliberate tenant-context rules
- common sync conflicts have clearer recovery paths

---

## Phase 5: UX Recovery And Analytics Polish

### Outcome

Make the platform feel consistent, trustworthy, and scalable from both the staff and patient perspective.

### Tickets

#### `PH5-UX-01` Route-by-route fallback audit

- Scope:
  - audit each major page for loading, empty, error, and retry states
  - fill gaps using the shared feedback components
- Main areas:
  - dashboard
  - patients
  - patient detail
  - audit
  - reminders
  - today board
  - admin
  - portal
  - research screens
- Done when:
  - every major route has a deliberate fallback story

#### `PH5-UX-02` Stale-refresh and optimistic update pass

- Scope:
  - preserve last-known-good data while refetching
  - add optimistic handling for low-risk mutations where it improves trust and speed
- Main areas:
  - frontend API consumers and page state logic
- Done when:
  - pages feel faster and don’t unnecessarily reset during refresh

#### `PH5-AN-01` Operations analytics

- Scope:
  - add wait-time, assignment latency, staffing, and check-in throughput metrics
- Main areas:
  - dashboard module
  - Today board-related reporting
- Done when:
  - ops leaders can see how the clinic floor is performing, not just clinical totals

#### `PH5-AN-02` Organization and cohort analytics

- Scope:
  - add org-level rollups, drilldowns, and patient or workflow cohort views
- Dependencies:
  - `PH3-ORG-02`
- Done when:
  - leadership reporting moves beyond per-clinic snapshots

#### `PH5-UX-03` UX regression and acceptance checklist refresh

- Scope:
  - update the user testing guide with the final route-level fallback and analytics checks
- Done when:
  - the polished UX layer is part of routine release validation

### Phase Exit Criteria

- fallback behavior is consistent across major surfaces
- refresh and mutation behavior feels more trustworthy
- analytics support both clinic operators and multi-location leadership

---

## Cross-Phase Ticket Backlog

These can start earlier when bandwidth allows, but they should not block the main phase order unless they become dependencies.

### `XPLAT-01` Feature flag conventions for phased rollouts

- add a simple rollout strategy for higher-risk features such as org/zone views and appointment lifecycle changes

### `XPLAT-02` Docs and operator training updates

- refresh user/admin guides after each phase rather than waiting for the end

### `XPLAT-03` Metrics and instrumentation coverage

- add product and operational metrics around appointment conversion, merge actions, invite claim success, and retry/error behavior

---

## Recommended Sprint Packaging

If you want to split this into practical sprint-sized groups:

1. Sprint A:
   - `PH1-APPT-01`
   - `PH1-APPT-02`
   - `PH1-APPT-05`

2. Sprint B:
   - `PH1-APPT-03`
   - `PH1-APPT-04`
   - `PH5-UX-01` for appointment-related routes

3. Sprint C:
   - `PH2-ID-01`
   - `PH2-ID-02`
   - `PH2-ID-05`

4. Sprint D:
   - `PH2-ID-04`
   - `PH3-ORG-01`
   - `PH3-ORG-04`

5. Sprint E:
   - `PH3-ORG-02`
   - `PH3-ORG-03`
   - `PH3-ORG-05`

6. Sprint F:
   - `PH4-OFF-01`
   - `PH4-OFF-03`
   - `PH4-OFF-05`

7. Sprint G:
   - `PH4-OFF-02`
   - `PH4-OFF-04`
   - `PH5-UX-02`

8. Sprint H:
   - `PH5-AN-01`
   - `PH5-AN-02`
   - `PH5-UX-03`

---

## Immediate Next Step

If this plan is accepted, the best next move is to convert Phase 1 into repo issues or sprint tickets first, because it has the strongest mix of:

- visible user value
- leverage on existing data models
- manageable implementation risk
- follow-on benefit for reminders, portal usage, and clinic operations
