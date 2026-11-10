# Handoff: R3.2 Stations

Continue the frontend-only Layered Clinical Workspace refresh on
`ui-refresh/r1-1-tokens`. The owner suspended learning guardrails for this
sequence. Implement **R3.2 only**, validate, review, update documentation and
commit locally. Do not push. Inspect status/history and preserve unrelated work.

## Start here

R3.1 implements the volunteer dashboard, not station content. Read
`R3.1-REVIEW.md`, the latest `../PROGRESS.md` entry, `../MASTER.md`,
`apps/web/AGENTS.md`, relevant installed Next docs, R0-AUDIT sections 4–6 and 8–9,
and the approved `r0-pilot/index.html`. The live authority is
https://claude.ai/artifact/ESPAMmNxLt1caa2owyjSX5; inspect its embedded frame if
necessary. Use synthetic data only. Never inspect `references/01-current-ui` or
`references/02-design-references`.

The incoming tree already had a modified `HANDOFF-R3.1.md`. R3.1 preserves that
owner change separately; inspect current status rather than assuming a clean tree.
Nothing has been pushed.

## R3.1 contracts to preserve

- Volunteer-only welcome band; mixed-role band inside the volunteer tab. Existing
  composition, stored tab, Needs you now, summaries, five charts, HAP draft access,
  clinical measurement coverage and quick actions remain.
- Dashboard shift reads require station flag, clinic and `OPS.SHIFT.READ`;
  writes require `OPS.SHIFT.WRITE`. No station-board read is needed there.
  `dashboard-shifts` is a separate existing-store cache kind, not a migration.
- Shared `useShiftControls` has an in-flight duplicate guard. The dashboard's
  reconciliation lock releases after its existing read/overlay catches up, so
  later server-side shift changes do not lock the user out. Keep loading/refusal
  unknown and saved/offline/queued outcomes truthful.
- `useOpsView.refreshError` is additive and used by the dashboard to disclose
  failed refreshes over retained data. Do not silently change every consumer.
- Hello and checklist source downloads were structurally matched to the supplied
  JSON. Their Lottie Simple License terms and URLs are in `public/lottie/`.
  Pinned local lazy player 5.13.0; Hello 0–60 once; checklist 0–98 once, only after
  server-confirmed dashboard start. Reduced motion and failures keep static SVG.
  `scripts/export-dashboard-illustrations.cjs` regenerates SVG/compiled rest frames.
- R2 shell geometry, role navigation, sync recovery, patient portal and Sheet
  gesture/focus contracts remain intact.

## R3.2 scope

R0 names Stations as shift-first, station sheet, next patient and sticky Take
action. Use round-3/round-4 pilot decisions as the presentational authority.
Inspect the actual read/action and all consumers before choosing a component
boundary. Do not invent station counts, names, waits, assignment status, workflow
steps, endpoints or undo semantics. Keep real data and existing permissions.

Start with `app/(workspace)/stations/page.tsx`, `lib/stations.ts`,
`components/stations/ScreenerControl.tsx`, `components/ops/OpsShared.tsx`,
`lib/use-shift-controls.ts`, `lib/use-ops-view.ts`, `lib/use-pending-ops-writes.ts`
and `lib/ops-offline.ts`. Inspect `today/page.tsx` and `my/assigned/page.tsx`,
which share shift controls. Preserve claim/refusal handling, station capacity,
closed-station notices, actual screener attribution, pending start/end overlays,
all actions and final-action access. Use existing Sheet primitives, 44px targets,
visible focus, safe areas, chat clearance, both themes, reduced motion and
retained state across width changes.

No patient registry/queues redesign, clinical form or backend work in this unit.
R3.3 is patient registry; later units retain their recorded order.

## Validation and operations

Use the exact guarded audit-database and low-memory recipes in HANDOFF-R2.1.
Apply `${APP_DATABASE_URL%/nkwapa}/nkwapa_audit` and guard both URLs separately.
Never print credentials. API logs must be redirected. Escalate sandbox
compilation/binding failures rather than changing product code. Build once per
final source/flag state; do not rebuild for spec-only edits.

Search changed labels/roles/classes and every shared consumer before selecting
regressions. Existing relevant specs include `station-workflow.spec.js`,
`station-redesign.spec.js`, `volunteer-dashboard-refresh.spec.js`,
`dashboard-work-first.spec.js` and offline operation/replay coverage. Discover
actual filenames with rg. The historical `#197` station-cache cases are excluded
under the established low-memory recipe; never call excluded or skipped cases
passes. Do not run the full e2e suite. One browser worker, at most three failures;
Jest at most two workers.

Run build, standalone TypeScript, changed-file lint/formatting, detector, focused
regressions and the six-role normal-route audit. Check
320/390/599/600/744/767/768/1024/1199/1200/1440, both themes, keyboard, enlarged
text, reduced motion, retained selection and long/final actions. Cover unknown,
refused and stale reads, off/on duty, eligible roles, pending offline start/end,
real server outcomes, retry without duplicates, station selection/closure and
claim/refusal flows reachable by the change. Record exact totals and limits.

Update MASTER/PROGRESS, write a ranked P0–P3 review and the next handoff, and
commit locally without pushing. Evidence belongs in ignored `evidence/r3-2/after/`;
never force-add it or create GitHub issues. Prior open-overlay accessibility and
short dropdown-row findings, physical-device/screen-reader checks, Safari/Firefox,
installed PWA, virtual keyboard/real safe areas, Vitals/Crisis/backend acknowledgement
and Sunday appointment lifecycle findings remain separate unless actually tested.
