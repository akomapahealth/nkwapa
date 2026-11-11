# Handoff: R5.1 Patient portal

Continue the frontend-only Layered Clinical Workspace refresh on
`ui-refresh/r1-1-tokens`. Learning guardrails stay suspended. Implement **R5.1
only**, validate, review, update docs and commit locally. Do not push.

R4 is complete (R4.1 doctor review, R4.2 preceptor and manager oversight, R4.3
director and system administrator oversight).

## Start here

Read `R4.3-REVIEW.md`, the latest `../PROGRESS.md` entry, `../MASTER.md` (section 8
for controls and `FormActions`, section 9 for the component contract, "Patient
portal (#276)" and the R4.3 paragraph under "Administration and oversight"),
master spec sections 7.11 and R5, `R2.5` notes on the portal shell in
`../PROGRESS.md`, and `apps/web/AGENTS.md`. Synthetic data only; never open
`references/01-current-ui` or `02-design-references`.

## Contracts carried from R4

- Warning ink with `ShieldCheck` only for what cannot be undone from the screen
  (finalize, sign, cosign, merge, erasure, consent). Reversible changes are plain
  outline buttons; reversible states use the neutral `secondary` badge.
- Counts belong in words at the end of a section description, never a boxed tile.
  Metric groups hold figures only.
- Dates and times go through `formatOpsDate` / `formatOpsDateTime` /
  `formatOpsTime` / `formatOpsTimestamp` or `formatInviteDate` (all Africa/Accra).
  Do not call `toLocaleString()`.
- Phone lists are hairline rows (`divide-y divide-rule`), not rounded cards. Tables
  of counts keep the name column sticky (`meta.className`
  `sticky left-0 z-[1] bg-card [thead_&]:bg-surface-2`) with right-aligned counts.
- A waiting decision leads in a ruled band; after the action, focus moves to what
  replaced it.

## Scope

Patient portal: `/portal`, `/portal/health`, `/portal/appointments` (and request),
`/portal/self-reports` (and new), the portal profile and "Your data" requests.
Patients are mostly on phones: design 390 and 320 first, 44px targets, plain
language. Preserve the R2.5 portal shell, held-changes behaviour, offline notices
and every portal permission and claim flow. No backend, auth or schema changes.

## Known before you start

- `portal-shell` held-changes test fails on baseline; do not count it.
- `portal-offline.spec.js` and `portal.spec.js` cover portal routing and offline
  copies; grep e2e for every string you change.
- Carried: open-overlay accessibility, transient sync, backend Crisis
  acknowledgement, Sunday appointment lifecycle, physical devices,
  Safari/Firefox, screen readers, MASTER #274's older warning rule (fold into one
  rule in a docs pass), page eyebrows (R7 cross-app pass).

Validation follows `HANDOFF-R3.8.md` (audit DB guard, low-memory recipe, one
worker, six-role audit, evidence under ignored `evidence/r5-1/after/`). The R2.1
handoff holds the self-contained env and build recipe.
