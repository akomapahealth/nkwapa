# Handoff: R3.4 Queues

Continue the frontend-only Layered Clinical Workspace refresh on
`ui-refresh/r1-1-tokens`. The owner suspended learning guardrails for this
sequence. Implement **R3.4 only**, validate, review, update documentation and
commit locally. Do not push. Inspect status/history and preserve unrelated work.

## Start here

Read `R3.3-REVIEW.md`, the latest `../PROGRESS.md` entry, `../MASTER.md`,
`apps/web/AGENTS.md`, relevant installed Next docs, R0-AUDIT sections 4–6 and 8–9,
and the approved `r0-pilot/index.html`. The live authority is
https://claude.ai/artifact/ESPAMmNxLt1caa2owyjSX5; inspect its embedded frame if
necessary. Use synthetic data only. Never inspect `references/01-current-ui` or
`references/02-design-references`.

The owner's incoming modification to `HANDOFF-R3.1.md` remains separate.
Inspect current status rather than assuming a clean tree. Nothing has been pushed.

## Preserve through R3.3

- R2 shell, portal, sync recovery and Sheet gesture/focus contracts.
- R3.1 dashboard role composition, welcome band, permission split, licensed
  once-only illustrations, needs, chart alternatives and draft access.
- R3.2 Stations shift-first overview, truthful unknown/refused/retained/stale/
  offline states, shift reconciliation, duplicate guards, responsive station
  Sheet, actual screener, staffing/capacity counts and patient/handoff details.
- Existing claim/Continue actions, fixed phone Take patient clearance, server
  claim/refusal rules, clinical forms and replay semantics. The shared shift
  hook and Today/My Assigned presentations were not redesigned in R3.2.
- R3.3 shared registry route screen, debounced search, URL filter/sort/page state,
  permission-gated New Patient and Check in, toolbar and active-filter buttons.
- Registry filter Sheet is bottom below 600px and right-side from 600px. It
  retains open state and selection across resize, and custom-range choice across
  dismissal. Filters apply immediately; Show results only dismisses. Date
  validation/refusal remains editable after dismissal.
- Registry cards use actual patient identity/contact fields, View record and
  Check in. Touch swipe calls the same existing check-in with a synchronous guard;
  cancelled/vertical gestures do not submit. No row removal, queue status or undo
  was invented. Existing offline feedback and replay remain.
- Native touch implicitly captures a touched child. A bubbled descendant capture-loss
  event must not cancel the row taking capture. The native Chromium touch tests
  cover this; fabricated PointerEvents previously missed it. Registry Sheet header
  and footer do not shrink at enlarged text, and final-action checks require full
  visibility.
- DataTable still selects cards from its available 60rem container width, not a
  viewport rule. All other consumers retain their existing presentation.

## Scope

R0 names R3.4 as **Queues**. Read the pilot round-3/round-4 decisions, current
`app/(workspace)/queues/page.tsx`, `lib/encounter-queues.ts`, flag/permission gates,
queue tabs and every actual DataTable consumer before choosing a boundary.
Inspect actual draft/review/finalize/cosign totals, role-specific defaults,
clinical-note flag behavior, deep links, errors, retained data and connection
handling. Keep existing routes, real clinical copy, units, classification,
permissions and operations. An empty queues illustration may use the existing
licensed asset contract only when the queue read actually confirms emptiness.
Do not infer completed work, unread counts, undo or new workflow steps from the
synthetic pilot. No backend, auth, schema, clinical form or station redesign.

## Validation and operations

Use HANDOFF-R2.1's guarded audit-database and low-memory recipes. Apply
`${APP_DATABASE_URL%/nkwapa}/nkwapa_audit` and guard both URLs separately. Never
print credentials. Redirect API logs. Escalate sandbox compilation/binding
failures rather than changing product code. Build once per final source/flag
state; spec-only edits do not require rebuilding.

Search changed labels/roles/classes and shared consumers before choosing focused
regressions. Retain table/actual-consumer, role queue/lane/deep-link, clinical
classification, shell and offline coverage reached by the change. Historical
station `#197` cases stay excluded, never counted as passes. No full e2e suite.
Use one browser worker, at most three failures, and Jest at most two workers.

Two legacy `today-offline.spec.js` cases failed against the station-enabled R3.2
build because they expect Today Board/legacy controls; its third case did not
run. Those are recorded separately, not passing coverage. Do not change the
station-enabled product to satisfy those expectations. R3.3 exercises real
registry check-in/offline replay through the existing operation.

Run build, standalone TypeScript, changed-file lint/formatting, detector, focused
regressions and the six-role normal-route audit. Check
320/390/599/600/744/767/768/1024/1199/1200/1440, both themes, keyboard, enlarged
text, reduced motion, retained selections and final actions. Assert responsive
modes from actual container geometry; shell collapse can make a table fit at
1200px. A modal hides background headings from role queries while open.
Preserve truthful unknown/refused/stale/offline states. Record exact totals and
limits, including candidate failures and interrupted/not-run cases.

Update MASTER/PROGRESS, write a ranked P0–P3 review and the next handoff, and
commit locally without pushing. Evidence belongs in ignored `evidence/r3-4/after/`;
never force-add it or create GitHub issues. Existing open-overlay accessibility
and short dropdown-row findings, physical-device/screen-reader checks,
Safari/Firefox, installed PWA, virtual keyboard/real safe areas, gesture feel,
Vitals/Crisis/backend acknowledgement and Sunday appointment lifecycle findings
remain separate unless actually tested.
