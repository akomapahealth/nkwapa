# Handoff: R4.2 Preceptor and manager oversight

Continue the frontend-only Layered Clinical Workspace refresh on
`ui-refresh/r1-1-tokens`. Learning guardrails stay suspended. Implement **R4.2
only**, validate, review, update docs and commit locally. Do not push.

## Start here

Read `R4.1-REVIEW.md`, the latest `../PROGRESS.md` entry, `../MASTER.md` (the
R4.1 paragraph under "Queues and encounters", section 8 for controls and
`FormActions`), master spec sections 7.9, 7.10 and R4, and `apps/web/AGENTS.md`.
Synthetic data only; never open `references/01-current-ui` or
`02-design-references`.

## Contracts from R4.1

- Irreversible clinical actions (Finalize, Sign, Cosign) use outlined warning ink
  with `ShieldCheck`, sit in the ruled warning band when they are the thing
  waiting, and confirm once through the shared dialog with focus on the safe
  choice.
- Clinical text that is read, not edited, is body text at a 70ch measure on the
  sheet, never inside a bordered box. Provenance is a `<dl>`.
- Times shown to staff go through `formatOpsDateTime` / `formatOpsDate`
  (Africa/Accra), never `toLocaleString()`.
- Recent-visit tables use `components/dashboard/recent-visit-columns.tsx`.
- Do not give a wrapper an accessible name that contains a field label
  (`getByLabel('History')` broke once).

## Scope

Preceptor review (Mark Reviewed, review lane, `ReviewDashboard`) and manager
oversight: Today board, staff activity, volunteers, the manager dashboard
section. Inspect actual consumers and permissions first. No backend, auth or
schema changes. There is no seeded preceptor identity: say so rather than
claiming preceptor-only coverage.

## Known before you start

- `portal-shell` held-changes test fails on baseline; do not count it.
- Many staff screens still use `toLocaleString()`; convert only the ones this
  unit touches.
- Carried: open-overlay accessibility, transient sync, backend Crisis
  acknowledgement, Sunday appointment lifecycle, physical devices,
  Safari/Firefox, screen readers.

Validation follows `HANDOFF-R3.8.md` (audit DB guard, low-memory recipe, one
worker, six-role audit, evidence under ignored `evidence/r4-2/after/`).
