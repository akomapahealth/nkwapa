# Feature Gaps And Next Additions

## Purpose

Track the product areas that are already partially implemented or scale-ready in the data model, but still need the next layer of feature depth.

This is the roadmap companion to `IMPLEMENTATION_STATUS.md`.

For the delivery-ready version of this roadmap, see `docs/PRIORITIZED_IMPLEMENTATION_PLAN.md`.

---

## Priority Overview

| Area                   | Current state                                                                    | Recommended next addition                                                                     |
| ---------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Organization and zones | `Organization` and `zoneCode` exist in schema and RLS context                    | Add org-level admin/reporting and true zone-aware RBAC                                        |
| Patient identity       | Merge flow, aliases, and portal invite claim exist                               | Add duplicate review queue, stronger match heuristics, cross-clinic consolidation             |
| Appointments           | Full workflow ships: requests, staff triage, calendar, lifecycle, reminders      | Resolve the clinic/browser/UTC timezone split; paginate the week view; make TRIAGED reachable |
| Patient portal         | Claim, measurements, self-reports, trends, overview, appointment change requests | Add richer self-service history, better invite delivery, patient messaging                    |
| Operations             | Shifts, check-ins, assignments, Today board, My Assigned are live                | Add wait-time analytics, room/resource capacity, richer staffing and queue metrics            |
| Offline                | Core EMR sync is implemented                                                     | Extend safe offline coverage to high-value ops and portal writes                              |
| Analytics              | Role-aware dashboard baseline exists                                             | Add org rollups, drilldowns, cohort views, and appointment/ops analytics                      |
| RLS adoption           | HTTP request paths are covered                                                   | Add explicit tenant-context patterns for jobs, maintenance scripts, and one-off tools         |
| UX resilience          | Shared boundaries, skeletons, retry states, and API error normalization are live | Finish route-by-route stale-refresh and optimistic update polish                              |

---

## Recommended Sequencing

### 1. Strengthen Patient Identity Operations

Why next:

- merge exists, which means real dedupe pressure is already present
- portal linking and claim make identity quality more important

Suggested additions:

- duplicate review queue
- confidence scoring for likely duplicates
- operator-safe merge previews
- org-wide patient identity review tooling

### 2. Promote Organization And Zone Features

Why next:

- the data model is now ready for multi-location scale
- current UI and permissions are still mostly clinic-first

Suggested additions:

- organization dashboard
- organization clinic filters
- zone-aware operational views
- role scopes above the individual clinic

### 3. Extend Offline Beyond Core EMR

Why next:

- the sync foundation already exists
- the main value is finishing the surfaces most exposed to unstable connectivity

Suggested additions:

- high-value Today board mutations
- safer offline read caches for portal history views
- clearer conflict resolution UI

### 4. Standardize UX Recovery Across All Surfaces

Why next:

- root fallbacks are in place
- users now expect the same polish on every page

Suggested additions:

- loading skeletons for every list/detail page
- section-level retry states
- stale-data refresh patterns
- consistent empty-state guidance for portal, admin, and research screens
