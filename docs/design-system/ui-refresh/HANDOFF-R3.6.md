# Handoff: R3.6 Profile

Continue the frontend-only Layered Clinical Workspace refresh on
`ui-refresh/r1-1-tokens`. The owner suspended learning guardrails for this
sequence. Implement **R3.6 only**, validate, review, update documentation and
commit locally. Do not push. Inspect status/history and preserve unrelated work.
The owner's modification to `HANDOFF-R3.1.md` remains separate.

## Start here

Read `R3.5-REVIEW.md`, the latest `../PROGRESS.md` entry, `../MASTER.md`,
`apps/web/AGENTS.md`, relevant installed Next docs, R0-AUDIT sections 4–6 and 8–9,
and the approved `r0-pilot/index.html`. The live authority is
https://claude.ai/artifact/ESPAMmNxLt1caa2owyjSX5; inspect its embedded frame if
necessary. Use synthetic data only. Never inspect `references/01-current-ui` or
`references/02-design-references`. The pilot is presentation evidence, not a
source for clinical fields, workflow or backend behavior.

## Preserve through R3.5

- R2 shell, portal, sync recovery and Sheet gesture/focus contracts.
- R3.1 role dashboards, welcome band, permission split, licensed illustrations,
  needs, chart alternatives and draft access.
- R3.2 shift-first Stations, truthful read/write states, reconciliation,
  duplicate guards, responsive station Sheet and staffing/capacity counts.
  Existing claim/Continue, phone Take patient clearance, clinical forms and
  replay semantics remain. Today/My Assigned were not redesigned.
- R3.3 shared registry routes, debounced search, URL filter/sort/page state,
  permission-gated New Patient/Check in, responsive filter Sheet and custom-date
  recovery. Immediate filters; Show results only dismisses. Same Sheet state
  across resize. Native touch check-in shares the existing synchronous guard;
  vertical/cancelled gestures do not write. Child-to-row capture takeover is
  intentional. Cancelled swipes preserve keyboard activation. No undo or row
  removal. Enlarged-text Sheet header/footer must not shrink.
- R3.4 Queues use permission-gated existing labels and role defaults. URL lane
  selection supports history; inaccessible/invalid lanes fall back. A single
  DataTable/card model retains sort/page/rows across resize and tab changes.
  Only Queues changed; the shared table and other consumers remain unchanged.
- Queue counts are true totals when available, otherwise explicitly loaded
  counts. Unknown first reads never become zero. Full pages can load more
  without totals. Offset advances by received rows, independent of deduplication.
  Cosign uses note IDs as row keys and encounter IDs as destinations, with actual
  authors/submitted times. Clinical labels and glucose thresholds remain.
- Queue refreshes use the existing resource lifecycle; prior data survives
  refusal/offline. Clinic/permission changes remount the workspace. All allowed
  lanes are still one atomic snapshot. Only confirmed current online emptiness
  shows checklist/dashboard; stale/offline/contradictory totals cannot say caught
  up. Checklist starts on first viewing and stays mounted, at rest frame 98,
  through refresh and lane changes. No live polling promise or new mutation.
- DataTable uses its available 60rem container, including when shell collapse
  makes a table fit at 1200px. Assert geometry rather than viewport assumptions.

- R3.5 keeps both registration routes on the shared form, existing fields,
  defaults, native validation/summary links, no-ID omission, residential clearing,
  duplicate handling and chart destinations. Registration-only section layout
  uses paired fields from 600px and side headings from 1200px. Shared form,
  location, phone and error components remain unchanged.
- Registration phone actions are fixed below 600px, above measured Primary-nav
  height and clear of the measured chat launcher, including 200% root text.
  The nominal shell variable is insufficient when navigation labels wrap.
  A registration-local observer owns those CSS clearances; do not change the
  shell to satisfy the form. The registration duplicate dialog has a bounded
  single grid track and wrapping recovery actions for enlarged text/long IDs.
- Registration's synchronous guard blocks same-event pending submits and stays
  held through successful navigation. Refusal permits retry. Offline copy asks
  for a connection; no outbox, local save or automatic replay was invented.

## Scope

R0 names R3.6 as **Profile**. Inspect the canonical route
`app/(workspace)/clinics/[clinicId]/patients/[patientId]/page.tsx`, the legacy
`app/(workspace)/patients/[patientId]/page.tsx` redirect, chart components,
`lib/patient-chart.ts`, tab helpers and current permission/flag gates before
choosing the boundary. Read the pilot's patient-header handover decision and
actual record screen; port only real identity/action fields and operations.
Preserve clinic context, legacy/merged-chart redirects, URL tab state, lazy
longitudinal reads, consent, identity/merge refusal, portal access, check-in,
new-encounter access and offline/read/replay semantics. Keep clinical labels,
units, defaults and validation. No backend, auth, schema, registration, registry
or station redesign. R3.7 Vitals and R3.8 Encounters remain separate.

## Validation and operations

Use HANDOFF-R2.1's guarded audit-database and low-memory recipes. Apply
`${APP_DATABASE_URL%/nkwapa}/nkwapa_audit` and guard both URLs separately. Never
print credentials. Redirect API logs. Escalate sandbox compilation/binding
failures rather than changing product code. Build once per final source/flag
state; spec-only edits do not require rebuilding.

Search changed labels/roles/classes and shared consumers before choosing focused
regressions. Keep identity, duplicates, merge-preview, consent/chart, chart tabs/history,
portal access, role/flag gates, actual-consumer, shell and offline coverage reached
by the change. Historical station `#197` cases stay excluded, never counted as
passes. No full e2e suite. One browser worker, at most three failures, Jest at
most two workers. Legacy flag-incompatible Today offline failures remain separate.

Run build, standalone TypeScript, changed-file lint/formatting, detector, focused
regressions and the six-role normal-route audit. Check
320/390/599/600/744/767/768/1024/1199/1200/1440, both themes, keyboard, enlarged
text, reduced motion, retained tab/data state and fully visible final actions.
Wait for lane/URL changes before measuring hidden/visible queue containers.
Wait for the sync pill's settled state before normal-state contrast scans;
R3.4's candidate transient finding is recorded separately, not declared fixed.
A modal hides background headings from role queries while open.

Update MASTER/PROGRESS, write a ranked P0–P3 review and the R3.7 handoff, and
commit locally without pushing. Evidence belongs in ignored `evidence/r3-6/after/`;
never force-add it or create GitHub issues. Record exact totals, failures,
interrupted/not-run cases and manual limits. Existing open-overlay accessibility,
short dropdown-row, physical-device/screen-reader, Safari/Firefox, installed-PWA,
virtual-keyboard/real-safe-area, gesture-feel, Vitals/Crisis/backend acknowledgement
and Sunday appointment lifecycle findings remain separate unless actually tested.
