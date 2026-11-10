# Handoff: R3.3 Patient registry

Continue the frontend-only Layered Clinical Workspace refresh on
`ui-refresh/r1-1-tokens`. The owner suspended learning guardrails for this
sequence. Implement **R3.3 only**, validate, review, update documentation and
commit locally. Do not push. Inspect status/history and preserve unrelated work.

## Start here

Read `R3.2-REVIEW.md`, the latest `../PROGRESS.md` entry, `../MASTER.md`,
`apps/web/AGENTS.md`, relevant installed Next docs, R0-AUDIT sections 4–6 and 8–9,
and the approved `r0-pilot/index.html`. The live authority is
https://claude.ai/artifact/ESPAMmNxLt1caa2owyjSX5; inspect its embedded frame if
necessary. Use synthetic data only. Never inspect `references/01-current-ui` or
`references/02-design-references`.

The incoming owner modification to `HANDOFF-R3.1.md` was preserved separately.
Inspect current status rather than assuming a clean tree. Nothing has been pushed.

## Preserve R3.1 and R3.2

- Dashboard role composition, welcome band, shift read/write permission split,
  once-only licensed illustrations, needs, chart alternatives and draft access.
- Stations shift-first overview, unknown/refused and retained/stale states,
  offline pending overlays, reconciliation and duplicate-submission guards.
- Station Sheet bottom below 600px and right-side above, retained open/selection
  state, closure notice, actual screener, waiting/being-seen counts and capacity.
- Next-patient ticket, existing patient/handoff/attribution details, all claim and
  Continue actions, fixed phone Take with safe-area/nav/chat clearance.
- Existing server claim/refusal rules, clinical forms and offline replay semantics.
  Today/My Assigned/shared shift hook are not redesigned in R3.2.
- R2 shell, portal, sync recovery and Sheet gesture/focus contracts.

## Scope

R0 names R3.3 as **Patient registry: toolbar, filter sheet, cards on phone**.
Read the pilot round-3/round-4 decisions before implementation. Inspect the registry routes,
shared DataTable surfaces, permission gates, patient search/filter/sort/pagination,
check-in and duplicate/identity flows and every consumer before choosing a boundary.
Keep actual data, routes, clinical copy and existing permissions. Do not infer
counts, queue status, undo, workflow steps or new endpoints from synthetic pilot
content. No backend, auth, schema, clinical form or queues redesign in this unit.

## Validation and operations

Use HANDOFF-R2.1's guarded audit-database and low-memory recipes. Apply
`${APP_DATABASE_URL%/nkwapa}/nkwapa_audit` and guard both URLs separately. Never
print credentials. Redirect API logs. Escalate sandbox compilation/binding failures
rather than changing product code. Build once per final source/flag state; spec-only
edits do not require rebuilding.

Search changed labels/roles/classes and shared consumers before choosing focused
regressions. Retain table and actual-consumer coverage, patient identity/duplicate,
registry/check-in, shell and offline paths reached by the change. Historical station
`#197` cases remain excluded under the established recipe, never counted as passes.
No full e2e suite. One browser worker, at most three failures; Jest at most two workers.

R3.2 also ran the legacy `today-offline.spec.js` under the station-enabled build:
two cases failed because they expect Today Board/legacy controls, and its third
case did not run. This is recorded separately in the review, not a passing result.
The Stations and dashboard online/offline shift cases pass. Do not change the
station-enabled product to satisfy those legacy expectations. The station workflow
handoff-note assertion is now scoped to the current run's synthetic patient, so
leftovers from interrupted runs do not create a global-text collision.

Run build, standalone TypeScript, changed-file lint/formatting, detector, focused
regressions and the six-role normal-route audit. Check
320/390/599/600/744/767/768/1024/1199/1200/1440, both themes, keyboard, enlarged
text, reduced motion, retained filters/selection, and final actions. Preserve
truthful unknown/refused/stale/offline states. Record exact totals and limits.

Update MASTER/PROGRESS, write a ranked P0–P3 review and the next handoff, and
commit locally without pushing. Evidence belongs in ignored `evidence/r3-3/after/`;
never force-add it or create GitHub issues. Existing overlay accessibility and
short dropdown-row findings, physical-device/screen-reader checks, Safari/Firefox,
installed PWA, virtual keyboard/real safe areas, Vitals/Crisis/backend acknowledgement
and Sunday appointment lifecycle findings remain separate unless actually tested.
