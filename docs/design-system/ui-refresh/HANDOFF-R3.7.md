# Handoff: R3.7 Vitals

Continue the frontend-only Layered Clinical Workspace refresh on
`ui-refresh/r1-1-tokens`. The owner suspended learning guardrails for this
sequence. Implement **R3.7 only**, validate, review, update documentation and
commit locally. Do not push. Inspect status/history and preserve unrelated work,
including the owner's separate `HANDOFF-R3.1.md` modification.

## Start here

Read `R3.6-REVIEW.md`, the latest `../PROGRESS.md` entry, `../MASTER.md`,
`apps/web/AGENTS.md`, relevant installed Next docs, R0-AUDIT sections 4–6 and 8–9,
and `r0-pilot/index.html`. The live visual authority is
https://claude.ai/artifact/ESPAMmNxLt1caa2owyjSX5; inspect the embedded frame.
Use synthetic data only. Never inspect `references/01-current-ui` or
`references/02-design-references`. The pilot is presentation evidence, not a
source of clinical fields, workflows, thresholds or backend behavior.

Use the installed Emil design engineering, Apple design, Impeccable and shadcn
skills as appropriate. Preserve the pinned fonts, tokens and clinical identity.
Avoid motion on repeated/keyboard actions; respect reduced motion and maintain
visible focus, readable units, truthful connection states and 44px targets.

## Preserve through R3.6

All preservation requirements from `HANDOFF-R3.6.md` remain. In particular:

- R2 shell, portal, sync recovery and Sheet gesture/focus contracts.
- R3.1 role dashboards, permission split, needs, chart alternatives and draft access.
- R3.2 shift-first Stations, truthful read/write states, reconciliation,
  duplicate guards, responsive station Sheet and staffing/capacity counts.
- R3.3 shared registry routes, debounced search, URL filter/sort/page state,
  existing permission-gated registration/check-in and native-touch guard.
- R3.4 Queue totals versus loaded counts, atomic snapshots, pagination offsets,
  cosign note keys/destinations, freshness/empty states and mounted checklist.
  Wait for URL/lane changes before measuring hidden/visible containers.
- R3.5 shared registration form fields/defaults/validation, no-ID omission,
  residential clearing, duplicate recovery, synchronous submit guard and
  navigation hold. Phone actions use measured navigation/chat clearance at
  enlarged text; shared shell/form components stay unchanged.
- R3.6 canonical chart and legacy/merged redirects, real clinic-scoped back link,
  patient identity/consent header and existing permission-gated Edit/check-in.
  Compact identity uses measured shell geometry, no duplicate focus stops,
  no entrance animation, a body portal outside page spacing/clipping, and yields when it
  would obscure keyboard focus. Keep URL tab state and lazy reads intact.
- Needs you now still leads. Summary columns change at 840px; profile detail
  columns at 1200px. Existing clinical labels/units and portal/merge/consent/
  reminder operations remain. No backend or new mutation was introduced.
- Normal-route audit waits for a settled synced pill before contrast scans.
  This does not clear the earlier transient sync-state finding.

## Scope

R0 names R3.7 as **Vitals**. Inspect the actual chart Vitals panel, encounter
Vitals tab, station measurements, shared form controls and all consumers before
choosing the boundary. Preserve actual fields, units/preferences, defaults,
validation, clinical thresholds/classification, provenance, chronological reads,
chart/table alternatives, cursor pagination, permissions, offline/outbox/replay
and existing save/finalize semantics. Read the prior Crisis work and the separate
`TASK-crisis-acknowledgement.md`; acknowledgement persistence is backend work,
not an authorization to invent it in a frontend refresh. R3.8 Encounters stays
separate. No backend, auth, schema, registry, registration or station-workflow
redesign. Do not replace functioning forms with the pilot's simplified fields.

## Validation and operations

Use `HANDOFF-R2.1.md`'s guarded audit-database and low-memory recipes. Apply
`${APP_DATABASE_URL%/nkwapa}/nkwapa_audit` and guard both URLs separately.
Never print credentials. Redirect API logs. Escalate sandbox compilation/binding
failures. Build once per final source/flag state; spec-only edits need no rebuild.

Search changed labels/roles/classes and shared consumers before selecting focused
regressions. Include affected chart/history, identity/merge refusal, consent,
portal, role/flag gates, actual consumers, shell and offline coverage. Keep
`patient-profile-workspace.spec.js` for identity/scroll/focus/responsive behavior.
Its fixture explicitly resets scroll before asserting the initial header state;
its long-identity interception targets `/patients/:id?clinicId=...`, excluding
document requests. Action geometry centers controls clear of fixed navigation.
Profile-local wrapping covers portal and merge buttons at enlarged text. Existing station
`#197` cases remain excluded, never counted as passes. Do not run the full e2e
suite. One browser worker, at most three failures; Jest at most two workers.
Legacy flag-incompatible Today offline failures remain separate.

Run build, standalone TypeScript, changed-file lint/formatting, detector, focused
regressions and the six-role normal-route audit. Check
320/390/599/600/744/767/768/1024/1199/1200/1440, both themes, keyboard, enlarged
text, reduced motion, retained form/tab/data state and fully visible actions.
A modal hides background headings from role queries while open. Explicitly test
encounter Vitals and Crisis dialog paths if reached; earlier normal-page scans
do not certify them.

Update MASTER/PROGRESS, write a ranked P0–P3 review and the R3.8 handoff, and
commit locally without pushing. Evidence belongs in ignored `evidence/r3-7/after/`;
never force-add evidence or create GitHub issues. Record exact totals, failures,
interrupted/not-run cases and manual limits. Existing open-overlay accessibility,
short dropdown-row, physical-device/screen-reader, Safari/Firefox, installed-PWA,
virtual-keyboard/real-safe-area, gesture-feel, Vitals/Crisis/backend acknowledgement
and Sunday appointment lifecycle findings remain separate unless actually tested.
