# Handoff: R3.1 volunteer dashboard

Continue the frontend-only Layered Clinical Workspace refresh on
`ui-refresh/r1-1-tokens`. The owner suspended learning guardrails for this sequence.
Implement one unit, R3.1, validate, review, update documentation and commit locally.
Do not push. Inspect status/history and preserve unrelated work.

## Starting point

R2.5 is committed locally as **`fd8b4456`**, `UI refresh R2.5: adapt the patient
portal shell`. Nothing was pushed. The tree was clean before this handoff was
expanded; inspect current status rather than assuming it is still clean.

R2.5 validation: final audit-flag build, standalone TypeScript, changed-file lint,
formatting and detector passed. Jest: **93 suites / 1019 tests**. Focused browser
selection: **112/112**, including six authentication setups and 106 browser checks.
Six-role normal-route audit: **12/12**, including six authentication setups and six
role sweeps; **228 route/theme/width rows**, zero recorded errors, zero axe findings
including minor findings, zero horizontal overflow. This does not clear prior
open-overlay findings or constitute release sign-off. Exact coverage and limits
are in `R2.5-REVIEW.md`.

There are 142 synthetic R2.5 PNGs under ignored `evidence/r2-5/after/` when present,
with audit JSON, validation summary and completed diagnostics beside it. Do not
depend on ignored evidence or scratch scripts surviving the session reset, and do
not claim missing images were inspected.

Read `apps/web/AGENTS.md`, relevant installed Next docs, `R0-AUDIT.md` sections
4–6, 8–9, `../MASTER.md`, the latest `../PROGRESS.md` entry and `R2.5-REVIEW.md`.
Use https://claude.ai/artifact/ESPAMmNxLt1caa2owyjSX5 and checked-in
`r0-pilot/index.html` as visual authority. Inspect the embedded claudeusercontent
frame if the reader cannot access the artifact. Use synthetic data only. Never inspect real-patient or third-party
reference directories `01-current-ui` or `02-design-references`.

R2.1–R2.4 staff geometry, permission-derived navigation, compact Header, sync
states, Sheet gestures and focus contracts remain intact. R2.5 adds patient phone
BottomNav with Overview, My Health, Appointments and More, top tabs from 600px,
compact clinic/role context, and conditional sync recovery access. Patient draft
state stays mounted across widths. Preserve the existing route labels and
permissions; account/settings continue to use the patient's shell.

## Task: R3.1 only

R0 task: Volunteer dashboard, with Start shift through the existing shift action
(D2) and the approved illustration (D4). Inspect the actual dashboard, its role
composition, NeedsYouNow, existing shift read/action, station workflow flag and
all consumers before choosing the implementation. Reuse the existing shift
contract. Do not invent counts, patient names, workflows, endpoints or status.

### Concrete investigation entry points

- `apps/web/app/(workspace)/dashboard/page.tsx`: dashboard fetch, clinic/zone
  scope, role section composition and persisted dashboard-tab selection.
- `apps/web/components/dashboard/VolunteerDashboard.tsx` and `NeedsYouNow.tsx`:
  current volunteer counts, worklist/draft actions, charts and HAP draft access.
  Preserve useful content; do not silently drop existing actions or double-count
  metrics when moving them into the new presentation.
- `apps/web/lib/use-shift-controls.ts`: shared `checkIn`/`checkOut`, eligible-role
  selection, busy/error feedback and truthful applied-versus-queued copy.
- `apps/web/app/(workspace)/stations/page.tsx`: existing shift read, pending-write
  overlay and `useShiftControls` composition. Inspect its actual read helpers and
  their permission requirements before placing shift reads on the dashboard.
- `apps/web/components/ops/OpsShared.tsx`: existing `ShiftControlCard` contract.
- `apps/web/e2e/dashboard-work-first.spec.js`: work-first dashboard regressions.
  Discover actual station/offline specs with `rg`; do not assume their filenames.

The dashboard does not currently mount the shared shift controls. Reuse the
existing operation and offline overlay rather than introducing a second shift
state machine or a new endpoint. Retain selected-role behavior, current/pending
shift state, duplicate-submit prevention, error recovery and truthful offline
feedback. A queued start is saved on this device, not confirmed by the server.
Permission or feature-flag gaps must be handled through the existing UI contract,
without broadening permissions. Preserve the flag-off dashboard and mixed-role
composition. Loading or failed reads must not imply that the person is off duty.

### Illustration and motion

Read the complete D4 and section 8.1 illustration/Lottie constraints. Round-3
and round-4 decisions supersede the first concept. The pilot's greeting band,
contour/wave treatment, inline divided metrics and next steps are presentational
references; all content and actions must come from existing data and permissions.
`apps/web/public/lottie/Hello.json` and `checklist.json` are currently present.
Hello is the chosen greeting illustration; checklist is chosen for shift-start
confirmation. Their download-page licence/source provenance is still unverified
in the recorded decision. Verify and record commercial-use rights before shipping
an asset; do not infer a licence from a free download or invent a source URL.
The three historically rejected files are already absent in this checkout.

The pilot uses Hello frames 0–60, approximately 2.5 seconds, once; checklist must
stop at frame 98 because its actual final frame is empty. This specific recorded
segment differs from the earlier approximate two-second guideline. Inspect the
pilot and source files before authoring playback. No decorative looping. Reduced
motion and load/player failure need a suitable static SVG of the chosen rest
frame, with theme-aware recolouring and no content or action hidden by asset
failure. Any confirmation must follow the real applied/queued outcome. A local
or lazy-loaded player is an R3.1 decision; do not ship the pilot's CDN script or
upgrade unrelated dependencies. Use the appropriate installed animation skill
when implementing motion; this handoff itself does not prescribe a video build.

Do not implement R3.2 station content or redesign doctor/manager/director/admin
content within this unit. Shared changes must preserve their behavior.

Keep approved tokens, 44px targets, visible focus, both themes, reduced motion,
long-content handling, safe areas, chat clearance and enlarged text. Clinical
copy, validation, queue/auth/permission logic and backend Crisis acknowledgement
remain outside scope.

## Validation and operations

Use the isolated audit database and exact flags/guards under “Route audit
harness” and “Low-memory e2e recipe” in `HANDOFF-R2.1.md`. Recreate scratch scripts
as needed; never print credentials. Apply the exact
`${APP_DATABASE_URL%/nkwapa}/nkwapa_audit` replacement and guard each URL.
Escalate sandbox compilation/binding restrictions instead of changing product
code. Build once per final source/flag state, not for spec-only edits.

Search changed labels/roles/classes and shared consumers before choosing focused
specs. Never run the full e2e suite. Use one worker, at most three failures and
redirected API output. Jest uses at most two workers. Run TypeScript, changed-file
lint/formatting, detector, focused regressions and the six-role normal-route audit.
Record exact counts, failures and coverage limits in a ranked P0–P3 review and
PROGRESS. Check 320/390/599/600/744/767/768/1024/1199/1200/1440, keyboard, both themes,
enlarged text, reduced motion, final-action access and retained state. Cover
volunteer-only and mixed-role dashboards, no active clinic, loading/refusal/error,
off duty/on duty, eligible role selection, pending offline start/end, server
confirmation and retry without duplicate writes. Inspect shared consumers before
choosing the smallest meaningful regression selection. Never claim skipped
flag-dependent checks as passes.

Update MASTER and PROGRESS and write a ranked review plus the next handoff. Save
synthetic evidence under ignored `evidence/r3-1/after/`; do not force-add it or
create GitHub issues. Prior open-Select/menu accessibility findings, short dropdown
rows, physical gesture checks, Vitals/Crisis/backend acknowledgement and Sunday
appointment lifecycle findings remain separate. Physical devices, screen readers,
Safari/Firefox, installed PWA, virtual keyboard and real safe areas remain manual
unless actually performed.
