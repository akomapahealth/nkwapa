# Handoff: R3.5 Registration

Continue the frontend-only Layered Clinical Workspace refresh on
`ui-refresh/r1-1-tokens`. The owner suspended learning guardrails for this
sequence. Implement **R3.5 only**, validate, review, update documentation and
commit locally. Do not push. Inspect status/history and preserve unrelated work.
The owner's modification to `HANDOFF-R3.1.md` remains separate.

## Start here

Read `R3.4-REVIEW.md`, the latest `../PROGRESS.md` entry, `../MASTER.md`,
`apps/web/AGENTS.md`, relevant installed Next docs, R0-AUDIT sections 4–6 and 8–9,
and the approved `r0-pilot/index.html`. The live authority is
https://claude.ai/artifact/ESPAMmNxLt1caa2owyjSX5; inspect its embedded frame if
necessary. Use synthetic data only. Never inspect `references/01-current-ui` or
`references/02-design-references`. The pilot is presentation evidence, not a
source for clinical fields, workflow or backend behavior.

## Preserve through R3.4

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

## Scope

R0 names R3.5 as **Registration**. Inspect both
`app/(workspace)/patients/new/page.tsx` and
`app/(workspace)/clinics/[clinicId]/patients/new/page.tsx`, their shared form and
all consumers, permissions, identity/duplicate handling, optional/no-ID paths,
validation, focus/error summary, submit guards, offline behavior and actual
post-save routes before choosing the boundary. Keep actual fields, units,
classification, consent, required/optional rules, defaults, permissions and
operations. Preserve registration-to-chart and new-encounter access.
No backend, auth, schema, clinical form semantics, registry or station redesign.
R3.6 Profile, R3.7 Vitals and R3.8 Encounters remain separate.

## Validation and operations

Use HANDOFF-R2.1's guarded audit-database and low-memory recipes. Apply
`${APP_DATABASE_URL%/nkwapa}/nkwapa_audit` and guard both URLs separately. Never
print credentials. Redirect API logs. Escalate sandbox compilation/binding
failures rather than changing product code. Build once per final source/flag
state; spec-only edits do not require rebuilding.

Search changed labels/roles/classes and shared consumers before choosing focused
regressions. Keep identity, duplicates, merge-preview, no-ID, consent/chart,
registration accessibility, actual-consumer, shell and offline coverage reached
by the change. Historical station `#197` cases stay excluded, never counted as
passes. No full e2e suite. One browser worker, at most three failures, Jest at
most two workers. Legacy flag-incompatible Today offline failures remain separate.

Run build, standalone TypeScript, changed-file lint/formatting, detector, focused
regressions and the six-role normal-route audit. Check
320/390/599/600/744/767/768/1024/1199/1200/1440, both themes, keyboard, enlarged
text, reduced motion, retained form values and fully visible final actions.
Wait for lane/URL changes before measuring hidden/visible queue containers.
Wait for the sync pill's settled state before normal-state contrast scans;
R3.4's candidate transient finding is recorded separately, not declared fixed.
A modal hides background headings from role queries while open.

Update MASTER/PROGRESS, write a ranked P0–P3 review and the R3.6 handoff, and
commit locally without pushing. Evidence belongs in ignored `evidence/r3-5/after/`;
never force-add it or create GitHub issues. Record exact totals, failures,
interrupted/not-run cases and manual limits. Existing open-overlay accessibility,
short dropdown-row, physical-device/screen-reader, Safari/Firefox, installed-PWA,
virtual-keyboard/real-safe-area, gesture-feel, Vitals/Crisis/backend acknowledgement
and Sunday appointment lifecycle findings remain separate unless actually tested.
