# Handoff: R2.3 compact Header and sync presentation

Continue the frontend-only Layered Clinical Workspace refresh on
`ui-refresh/r1-1-tokens`. The owner explicitly said “Ignore all learning guardrails”
for this implementation sequence and asked to follow the live Claude artifact and
references closely. Implement one unit, R2.3, then validate, review, update docs and
commit locally. Do not push. Inspect git status/history first and preserve unrelated work.

## Authority and starting point

- Read `apps/web/AGENTS.md` and relevant installed Next docs before editing.
- Visual authority: https://claude.ai/artifact/ESPAMmNxLt1caa2owyjSX5 and the matching
  checked-in `r0-pilot/index.html`. The artifact opens with a browser even when the
  web reader cannot access it; inspect its embedded claudeusercontent frame.
- Read `R0-AUDIT.md` sections 4–6, 8–9, the owner decisions and latest entry in
  `../PROGRESS.md`, `../MASTER.md` staff shell/navigation utilities, and
  `R2.2-REVIEW.md`. Apply relevant installed Impeccable, shadcn and motion guidance.
- Approved geometry remains 232px expanded / 64px icons-only desktop from 1200px;
  76px labelled rail at 600–1199; BottomNav below 600px. Earlier R0 prose conflicts;
  use the actual pilot. No new width decision or approval is needed.
- The owner noticed labels in compact navigation. Live artifact CSS and a 1440px
  interaction confirm collapsed desktop labels are 1px/absolute, while tablet labels
  are intentionally visible. R2.2's permanent regression confirms the production
  behavior. Do not remove the tablet labels or declare an unverified sidebar bug.

## Preserve R2.2

- `lib/mobile-nav.ts` partitions existing authorized items. Priority: Dashboard,
  Stations, Today Board, My Assigned, Queues, Patients, Appointments; up to four + More.
  Remaining sidebar groups, header/profile links and account/sync utilities live in More.
  Keep owner D7 labels; the static pilot's Home/Assigned sample is not the real role model.
- `components/app-shell/BottomNav.tsx` uses the existing shared Radix Sheet, opening
  from the bottom with a titled header and scrollable 85dvh body. Escape restores
  More focus; crossing 600px closes it and focuses main. Navigation/history closes it.
  Sync opens from More's close-autofocus callback, after its focus trap releases.
  `SyncCenterSheet` records its actual entry point on open and restores focus to it
  on close, or main if it is gone/hidden. This fixes a confirmed return-focus gap;
  modal/focus-trap and queue behavior remain unchanged.
- More's full-page light/dark axe diagnostics were clean. This does not clear earlier
  Select/menu findings. No modal semantics or shared Sheet implementation changed.
- `AppLayout` owns `--workspace-bottom-nav-height`: 3.75rem on phone, zero from 600px.
  Chat uses it for launcher placement/panel height, with zero fallback outside staff.
  Main bottom clearance is 10rem plus safe area on phone and 6rem otherwise.
- Staff Header shows the existing brand mark instead of the old hamburger. Desktop
  collapse integration remains. Portal Header's old phone behavior remains out of scope.
- Shared AppNavList/Sidebar and API/database/auth/permissions/clinical/offline logic
  did not change. One mounted table state still survives shell presentation changes.

## R2.2 verification baseline

Final audit build, TypeScript, changed-file ESLint/Prettier and detector passed.
Jest: 93 suites / 1019 tests. Final focused browser run: 65/65 tests, including
six auth setups and 59 browser checks. Six-role route audit: 12/12 tests, 228 rows,
zero errors/axe violations/overflow. More's two unfiltered axe scans are clean.
166 synthetic after PNGs and exact failure/correction history are documented in
`R2.2-REVIEW.md` and PROGRESS. Earlier Select/menu P1 findings remain open.

## Task: R2.3 only

R0 task: “Header: compact phone bar, sync pill icon crossfade.” Main files:
`components/Header.tsx`, `components/sync/SyncStatusBar.tsx`, and necessary integration.

Match the pilot's compact brand/clinic/sync/account hierarchy using existing tokens,
fonts, icons, controls and utility destinations. Preserve clinic switching and its
failure feedback, role context, account actions, message delivery from 600px and
truthful desktop-collapse state. Use the approved pilot as the visual authority;
do not invent new navigation or decorate the clinical workspace.

The sync pill must preserve offline, syncing, attention, failed, queued, held and
synced states and recovery access. Presentation may crossfade icons without a
layout jump or masking status. Do not alter queue ownership, sync actions, retries,
blocked-change handling, provider state or events. Repeated changes should interrupt
cleanly; reduced motion and keyboard access remain. Inspect actual rendered states
and their accessible names before claiming improvement.

Keep R2.2's bar and More. Do not implement R2.4 draggable sheets, R2.5 Portal shell,
R3 dashboard content, crisis acknowledgement backend work or unrelated fixes.

## Validation and operations

Use an isolated audit database and the audit flags, never the main data. The
self-contained environment/build/Playwright recipes are in `HANDOFF-R2.1.md` under
“Route audit harness” and “Low-memory e2e recipe.” Recreate scripts in a fresh scratch
directory if needed; do not rely on `/tmp` surviving. Never print env/credential values.
Use the exact APP_DATABASE_URL `%/nkwapa` suffix replacement and guard both DB URLs.

- Build once per final source/flag state. The sandboxed Turbopack build stalled;
  approved outside-sandbox builds passed. Escalate restrictions instead of changing code.
- Jest max two workers; never run the full e2e suite. Run relevant specs in one
  invocation with one worker and max three failures; redirect API output to a log.
- Search changed labels/roles/classes in e2e first. R2.2 ran bottom-navigation,
  shell-navigation, shell-responsive, shell-consumers, overlay-motion,
  data-table-surfaces, accessibility, responsive-components, responsive-offline,
  responsive-migration, role-access, workspace-smoke, dark-mode, console-clean,
  patient-registry-screened and staff-invite. Choose R2.3 coverage by actual impact.
- Keep independent role and flag expectations. Station-enabled browser build and
  both-mode nav unit tests are distinct evidence; do not claim a flag-off browser run.
- Check 320/390/599/600/744/767/768/1024/1199/1200/1440, both themes, long clinic/role
  text, no clinic, text scaling, keyboard, reduced motion and rapid sync-state changes.
- Re-run the six-role route harness, save synthetic shots in ignored
  `evidence/r2-3/after/`, and record exact counts, failures and limits. R2.2 evidence
  is the before baseline when present; recreate it if absent.
- Run standalone TypeScript, changed-file ESLint/Prettier, the design detector and
  meaningful tests. Update MASTER, PROGRESS and a ranked P0–P3 review; commit locally.

## Unresolved findings

Prior P1 full-page open-Select/menu `aria-hidden-focus` and heading/region findings
remain open. Existing short dropdown action rows, non-Chromium/physical-device/PWA/
screen-reader and manual motion checks remain. More's two clean scans and normal
route sweeps are bounded evidence. R1.4 feel checks, encounter Vitals/Crisis checks,
crisis acknowledgement backend work, Sunday appointment lifecycle failures and
prior exclusions remain separate. Never use real-patient or third-party reference
folders (`01-current-ui`, `02-design-references`), force-add evidence, or create issues.
