# Handoff: R4.3 Director and system administrator oversight

Continue the frontend-only Layered Clinical Workspace refresh on
`ui-refresh/r1-1-tokens`. Learning guardrails stay suspended. Implement **R4.3
only**, validate, review, update docs and commit locally. Do not push.

## Start here

Read `R4.2-REVIEW.md`, the latest `../PROGRESS.md` entry, `../MASTER.md` (the R4.1
and R4.2 paragraphs under "Queues and encounters", section 8 for controls and
`FormActions`, section 9 for the component contract), master spec sections 7.10
and R4, and `apps/web/AGENTS.md`. Synthetic data only; never open
`references/01-current-ui` or `02-design-references`.

## Contracts from R4.1 and R4.2

- Warning ink with `ShieldCheck` is only for actions that cannot be undone here
  (Finalize, Sign, Cosign, and in this unit: merge, delete, erasure). Reversible
  changes (deactivate/reactivate, unlink) are plain outline buttons.
- A decision waiting on the viewer leads in a ruled band where the next step will
  appear; after the action, focus moves to what replaced it.
- Staff-facing dates and times go through `formatOpsDate` / `formatOpsDateTime` /
  `formatOpsTime` (Africa/Accra). Many admin screens still use
  `toLocaleString()`; convert the ones this unit touches.
- Wide oversight tables keep the name column sticky (`sticky left-0 bg-card`) while
  counts scroll sideways on phones.
- Row layouts that sit beside a side column use container queries, not viewport
  breakpoints.
- Drill-in views move focus to the new heading and return it to the row on Back.

## Scope

Director: clinic trends (`DirectorDashboard`, already touched in R4.2 for the staff
table only), `/metrics`, `/audit`, `/reports/organization`, `/admin/duplicates`.
System administrator: `SystemAdminDashboard` (network overview, zone filter),
`/admin/clinics`, `/admin/users`, `/admin/duplicates/cross-clinic`,
`/admin/data-requests`. Inspect actual consumers and permissions first. No backend,
auth or schema changes. Merge and erasure semantics, confirmation copy that has
legal weight, and permission gates stay exactly as they are.

## Known before you start

- `portal-shell` held-changes test fails on baseline; do not count it.
- `today-offline.spec.js` and other flag-off Today specs only mean something in a
  build without the station flag; the audit build has it on.
- Carried: open-overlay accessibility, transient sync, backend Crisis
  acknowledgement, Sunday appointment lifecycle, physical devices,
  Safari/Firefox, screen readers, no seeded preceptor-only identity (none exists;
  review is a doctor permission).

Validation follows `HANDOFF-R3.8.md` (audit DB guard, low-memory recipe, one
worker, six-role audit, evidence under ignored `evidence/r4-3/after/`).
