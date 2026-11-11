# Handoff: R3.8 Encounters

Continue the frontend-only Layered Clinical Workspace refresh on
`ui-refresh/r1-1-tokens`. The owner suspended learning guardrails for this
sequence. Implement **R3.8 only**, validate, review, update documentation and
commit locally. Do not push. Inspect status/history and preserve unrelated work,
including the owner's separate `HANDOFF-R3.1.md` modification.

## Start here

Read `R3.7-REVIEW.md`, the latest `../PROGRESS.md` entry, `../MASTER.md`,
`apps/web/AGENTS.md`, relevant installed Next docs, R0-AUDIT sections 4–6 and 8–9,
and `r0-pilot/index.html`. The live visual authority is
https://claude.ai/artifact/ESPAMmNxLt1caa2owyjSX5; inspect its embedded frame.
Use synthetic data only. Never inspect `references/01-current-ui` or
`references/02-design-references`. The pilot is presentation evidence, not a
source of clinical fields, workflows, thresholds or backend behavior.

Apply installed Emil, Apple design, Impeccable and shadcn guidance as appropriate.
Preserve the pinned fonts, semantic tokens, clinical identity, visible focus,
explicit units and truthful connection states. No repeated-action or clinical
number animation. Keep reduced-motion behavior and at least 44px targets.

## Preserve through R3.7

All preservation requirements in `HANDOFF-R3.7.md` remain, including the R2 shell,
portal, sync and Sheet contracts; R3.1 role dashboards; R3.2 shift-first Stations;
R3.3 registry URL state; R3.4 queue totals and atomic snapshots; R3.5 shared
registration behavior; and R3.6 canonical chart, clinic back link, compact
identity portal, measured shell/focus protection, URL tabs and lazy reads.

R3.7 keeps one shared `VitalsForm` across the encounter Vitals tab, new-encounter
wizard, blood-pressure station and anthropometry station. Presentation uses
`RecordSection` and local `vitals-workspace.module.css`, with ruled groups,
container-width measurement grids and a distinct blood-pressure pair. Fields,
labels, units/preferences, defaults, validation ranges, classification, saves,
finalization, section-limited writes, offline/outbox and replay remain unchanged.
On phones the wrapping save/tobacco-review row sticks within its form, with
measured bottom-navigation, chat-launcher and field-scroll clearance. Preserve
those ResizeObserver measurements and the parent-bounded sticky behavior. The
small prescription-allergy label and encounter-container wrapping fixes are
presentation only. At narrow text widths the save row reserves vertical chat
clearance instead of squeezing action labels.
The shared form controls and surrounding encounter/station workflow are unchanged.

`FieldError` accepts the field id and appends `-error` itself. R3.7 repairs
Select, temperature, Other context and Notes descriptions accordingly. Preserve
those associations and all original error text. Select items retain their group.

Chart Vitals keeps chronological record identity/provenance, source-visit links,
status/locked badges, cursor pagination and complete read states. Trends retains
its existing requests, range/measurement state, exact values, units and literal
table alternatives. Resize must not reset fields, tab, selected trend or loaded
history. The explicit one-column trend grid and zero minimum width prevent
minimum-content overflow. Vitals-local CSS uses the inert `data-chart-frame`
marker to wrap chart headings/actions; other ChartFrame consumers keep their
existing layout. Existing trend charts never animate through clinical values.

Crisis still saves the reading first and awaits the one-button alert before the
parent continues. Escape/outside clicks cannot dismiss it. Re-saving the same
reading does not repeat the alert. No acknowledgement persistence was introduced.
Read `TASK-crisis-acknowledgement.md`; that work needs its own backend branch.

## Scope

Inspect actual encounter detail, new-encounter wizard, visit history, station
session links, clinical note/review/cosign/finalization controls and every shared
consumer before choosing the boundary. Preserve real role/flag gates, tab-save
coordination, save refs, dirty/error handling, review/finalize semantics, locked
records, clinic context, patient identity, offline/read/write distinctions and
all current fields. Do not redesign clinical forms, invent workflow or fold in
backend, auth, schema, registry, registration or station-workflow changes.

## Validation and operations

Use `HANDOFF-R2.1.md`'s guarded audit-database and low-memory recipes. Apply
`${APP_DATABASE_URL%/nkwapa}/nkwapa_audit` and guard APP_DATABASE_URL and DATABASE_URL
separately. Never print credentials; redirect API logs. Escalate sandbox build or
binding failures. Build once per final UI source/flag state; spec-only edits do
not need another build.

Search changed labels/roles/classes and all consumers before choosing focused
regressions. Include Vitals, new encounter, chart/history, identity/merge refusal,
consent, portal, role/flag, shell and offline coverage. Keep
`patient-profile-workspace.spec.js` and `vitals-workspace.spec.js` for chart,
identity, retained state, responsive, keyboard and Crisis behavior. A modal hides
background headings from role queries while open. Measure actions centered clear
of fixed navigation/chat. Wait for tab/lane URL changes before measuring hidden
containers; wait for the settled synced pill before normal-page contrast scans.
This does not certify transient sync states or open overlays.

No full e2e suite. One browser worker, at most three failures; Jest at most two
workers. Exclude historical station `#197` cases and never count them as passes.
Legacy flag-incompatible Today offline failures stay separate.

Run production build, standalone TypeScript, changed-file lint/formatting,
detector, focused regressions and the six-role normal-route audit. Check
320/390/599/600/744/767/768/1024/1199/1200/1440, both themes, keyboard, enlarged
text, reduced motion, retained fields/tab/data and fully visible actions.
Explicitly test encounter dialogs reached by the change.

Update MASTER/PROGRESS, write a ranked P0–P3 review and the next-unit handoff,
and commit locally without pushing. Evidence belongs in ignored
`evidence/r3-8/after/`; never force-add evidence or create GitHub issues. Record
exact totals, failures, interrupted/not-run checks and manual limits. Carry
forward unresolved open-overlay accessibility, short dropdown rows, physical
devices/screen readers, Safari/Firefox, installed PWA, virtual keyboard/real safe
areas, gesture feel, backend Crisis acknowledgement and Sunday appointment
lifecycle findings unless actually tested and resolved.
