# Handoff: R2.1 sidebar and labelled tablet rail

Continue the Nkwapa "Layered Clinical Workspace" UI refresh. Direct mode carries forward from HANDOFF-R1.6: the owner suspended the learning gates for this implementation sequence. Frontend only. Implement **R2.1**, validate it, update the tracker and shared contract, and commit the unit locally. Do not push unless the owner asks. This handoff is for one unit, not all of R2.

## Start here

- Read `apps/web/AGENTS.md` before editing frontend code. Next.js is 16.3.0-canary.104; consult relevant installed docs under root `node_modules/next/dist/docs/`.
- Stay on `ui-refresh/r1-1-tokens`. Inspect `git status` and recent history. Preserve unrelated work. The tree was clean when this handoff was drafted.
- Approved visual authority: `docs/design-system/ui-refresh/r0-pilot/index.html`. Token source: R0-AUDIT section 4. Paths are repository-relative; design docs are under `docs/design-system/`.
- Read `R0-AUDIT.md` sections 5, 6, 8.2 and 9; `NKWAPA-UI-REFRESH-MASTER.md` sections 6, 9.1 and 12; `MASTER.md` sections 7 to 9, especially staff shell and navigation utilities; and `PROGRESS.md` owner decisions and latest entries. Refresh rules supersede conflicting older Ruled Chart prose.
- Use the relevant installed skills. Record actual checks and a ranked P0 to P3 review of hierarchy, consistency, touch targets, focus, motion, accessibility, dark mode and edge cases. An isolated-agent critique is not required.
- The plain Node detector is `~/.claude/skills/impeccable/scripts/detect.mjs`. Run it on changed files from the correct working directory. Silent exit 0 means no mechanical findings, not proof of design quality.
- Do not depend on private agent memory, `/tmp`, or ignored screenshots surviving. The operational recipes below are self-contained.

## Current state (2026-11-08)

- R0 pilot v5 is approved.
- R1.1 through R1.4b: `7fafd137`. R1.5: `9a66f502`. R1.6: **`05374d8f`**, `UI refresh R1.6: layer table surfaces and adapt cards to container width`.
- All R1 units are built and in review, not an unconditional release/accessibility sign-off. No push occurred in this session. This handoff may have a later documentation commit; inspect history.
- R1.6 changed only `components/ui/data-table.tsx`, `app/globals.css`, two new browser fixture/spec files, and design docs. No API, database, auth, permission, clinical or offline-sync implementation changed.
- Detailed findings: `ui-refresh/R1.5-REVIEW.md` and `ui-refresh/R1.6-REVIEW.md`.

### Preserve R1.6

- Existing `renderMobileRow(row.original)` remains the only card-render API. With a renderer, named CSS inline-size container queries choose cards below **60rem available width**, table from 60rem. Without a renderer or container-query support, retain the full scrollable table.
- One TanStack v9 instance owns both presentations' row model, sorting/filtering/pagination and row/action identities. Layout changes must not reset state or refetch solely because width changed.
- Cards now expose the same sorting controls and accessible direction. Caller filters and shared pagination stay outside the switch. `display: none` removes inactive controls from the accessibility tree.
- Table body is `--card`; sticky header and hover/focus-within rows are `--surface-2`; borders use quiet `--border`. Numeric alignment, caption, `aria-sort`, row IDs, named keyboard scroll region and 44/52px cell floors remain.
- Both layouts share the supplied empty state or "Nothing to show." fallback. Refresh feedback is out of flow above either layout. No row arrival choreography.
- Production card consumers are PatientRegistryScreen and StaffInvitesCard. Other routes retain their own responsive contracts. Narrowing shell content can legitimately switch these two consumers to cards; do not force them back to viewport-based tables to satisfy old assertions.
- Permanent coverage: `e2e/data-table-surfaces.spec.js`, bundled from `e2e/component-fixtures/DataTableSurfaces.tsx` with the existing helper. Seven cases cover client/server state, row/action identity, sorting/reset, filters, pagination, narrow panel, boundary widths, fallback scrolling, empty/refresh, reduced motion, sticky header, numeric alignment and coarse pointers.

### Preserve R1.5

- Shared `.anchored-overlay` transitions use trigger-origin scale .95 and opacity, 200ms in / 160ms out. Tooltip uses 150/120ms and a 300ms skip-delay window; scanning skips entrance motion too. Combobox remains instant.
- CSS transitions reverse from the current frame. Nonvisual `anchored-presence` retains nodes through exit because Radix Presence waits for animation events.
- `components/ui/use-overlay-input.ts` shares capture listeners. Keyboard is instant. Do not replace it with `:focus-visible` inference: pointer-opened Radix menus matched that selector in browser verification.
- Switching to keyboard during exit keeps the clock name and shortens it to .01ms; cancelling it can strand closed tooltips. Reduced motion retains opacity only through the shared exception to the global clamp. Select's 4px gap is `sideOffset`, not a translation utility.
- `e2e/overlay-motion.spec.js` has six browser checks. Reuse the shared Tooltip implementation for collapsed navigation instead of copying the static pilot's pseudo-tooltip.

### R1.6 validation and evidence

- Build with audit flags, standalone TypeScript, changed-file ESLint/Prettier and detector passed. Jest with max two workers: **92 suites / 1013 tests passed**. Commit hooks also ran lint-staged and the staged secret scan successfully.
- Focused specs: `data-table-surfaces`, `shared-components`, `responsive-components`, `responsive-offline`, `responsive-migration`, `patient-redesign`, `patient-registry-screened`, `staff-invite`. **135 passed / 1 failed**, including six authentication setups: **129 distinct browser checks passed / 1 failed**. All seven new table cases passed.
- The failure is `/today` in `responsive-migration.spec.js`, expecting "Today Board" while the station-enabled route renders "Station line". An isolated recheck reproduced it. The flag-aware `/today` responsive/offline case passed.
- Six-role route audit: **12/12 tests, 228 route/theme/width rows**, zero errors, serious/critical or minor axe findings, or horizontal overflow. This is normal-state evidence only.
- Actual-consumer supplement: 16 closed-state component axe scans and 20 bounds checks passed at 390/744/1024/1440 and in a 560px desktop panel. **Four open Rows per page Select scenarios failed full-page axe assertions**. Do not count those scenarios as green.
- `ui-refresh/evidence/r1-6/after/` contains **168 synthetic PNGs**: 114 normal route shots, 30 shared component/table shots, 24 actual-consumer shots. Normal route shots are light theme; supplements include both themes. Beside `after/`: `route-audit.json`, `validation-summary.json`, `diagnostics/`. Per-case Select axe JSON is under `after/consumers/`.
- Evidence is local and git-ignored. Never force-add it or claim missing files were inspected. R1.6 is the next unit's before baseline; recreate synthetic evidence if absent.
- The temporary actual-consumer spec was removed. A local copy is in ignored diagnostics; permanent table coverage remains in the repo.

## Task: R2.1

R0-AUDIT section 9: **Sidebar restyle + rail mode 600 to 1199**. Main files, relative to `apps/web/`:

- `components/Sidebar.tsx`
- `components/app-shell/AppNavList.tsx`
- `components/AppLayout.tsx`
- `components/Header.tsx`, only the integration/breakpoint changes needed by this unit
- Existing semantic tokens and named Tailwind screens in `app/globals.css` / `tailwind.config.js`

Read `lib/app-nav.ts`, `lib/app-nav.test.ts`, `e2e/shell-navigation.spec.js`, `e2e/accessibility.spec.js`, responsive specs and `playwright/responsive-routes.js` before editing. Re-run targeted searches for consumers/assertions instead of trusting this inventory.

### Confirmed starting point

- Sidebar is currently `hidden md:block`, 232px expanded / 64px collapsed, with a sticky `h-screen` inner column, scrollable nav, logo crossfade, a group list and a keyboard hint.
- AppNavList has `collapsed` and `mobile` booleans, section overrides, a navigation callback, current-route matching and clinic-aware disabled controls. Labels currently truncate in expanded mode or become sr-only in collapsed mode; icon-only links receive Radix tooltips. It does not yet distinguish a labelled tablet rail from icon-only desktop collapse.
- AppLayout owns `nkwapa.sidebar.collapsed`, initialized before paint, and persists it with guarded localStorage access. With no saved preference it currently collapses at viewport <=1280px. `[` currently toggles from 768px and is ignored in inputs, textareas, selects, editable content and with modifier keys.
- Header uses an `md:hidden` mobile navigation sheet trigger, and an `md:inline-flex` sidebar toggle with `aria-expanded` / `aria-controls="workspace-sidebar"`. Other utility visibility also uses `md`. PortalLayout renders Header without a sidebar toggle.
- AppLayout owns skip-to-main, NavigationProgress, Header, PendingStaffInviteNotice, content padding/max width and ChatWidget. Do not remove these to simplify the shell.
- `getAccessibleNavSections` / `getAccessibleNavItems` already centralize permissions, active clinic, system-admin restrictions, flags and placements. `isNavItemActive` resolves nested routes so only the most specific destination is current. Preserve those semantics and clinic-scoped patient links.

### Width discrepancy: use the actual pilot, record the choice

Confirmed from the approved pilot's CSS:

| Presentation           | Width                 | Behavior                                               |
| ---------------------- | --------------------- | ------------------------------------------------------ |
| Under 600px            | No persistent sidebar | Existing phone navigation remains until R2.2           |
| 600 to 1199px          | **76px**              | Icon above a visible label, touch usable without hover |
| From 1200px, expanded  | **232px**             | Labelled sidebar                                       |
| From 1200px, collapsed | **64px**              | Icons only, accessible labels and tooltips             |

Earlier R0 prose says 88/248px; a later paragraph says desktop collapse also uses 76px, while round-3 feedback and actual pilot use 64px. Do not present these as a single consistent owner specification. Use the shipped approved pilot's 232/76/64 geometry as the implementation baseline and document that resolution in the R2.1 entry. Do not silently alter the pilot, or invent a new approval. Preserve >=44px targets even where the static pilot has smaller desktop rows.

### Intended outcome

- Sidebar/rail sit on the tinted canvas. Active navigation uses approved semantic selected/surface/primary tokens with clear current state, keyboard focus and readable muted labels in both themes. Keep brand, typography roles, group hierarchy and existing navigation labels.
- Tablet rail is a distinct presentation with visible, readable labels. Long names such as "Cross-clinic duplicates" and "Organization report" must wrap or be deliberately laid out without clipping, overlap or hover-dependent discovery. Keep New Patient available.
- Desktop starts expanded when no preference exists at >=1200px. Saved desktop collapse preference survives resize into tablet/phone and back. Forced compact layout must not overwrite that preference. Avoid initial width flashes or hydration regressions; inspect AppLayout's existing client-only initialization assumptions before changing them.
- Desktop header toggle and `[` affect collapse only at >=1200px. Repeated keyboard actions respond instantly. Preserve input/editable/modifier guards, persistence failure handling and truthful `aria-expanded` / `aria-controls`.
- Pointer collapse may use the existing 200ms drawer curve and interrupt from its current width. Reduced motion removes movement. Keep logo transitions subordinate and preserve shared R1.5 tooltip behavior, including focus and scan cleanup. Set the first collapsed navigation tooltip delay to the approved 300ms if the current local 200ms override conflicts; verify it rather than guessing.
- Coordinate **600 to 767px** carefully: simply exposing Sidebar at `compact` while hiding the phone trigger can make header utilities still hidden by `md` unreachable. Audit every affected utility and make only necessary Header breakpoint/integration changes. Do not globally replace every `md` class.
- Align the single shared workspace surface with the pilot through AppLayout if needed: one sheet inset from 600px, semantic `--card`, coherent edge/radius/gutters and a scroll structure that keeps navigation usable. Do not add cards around individual page sections or redesign route content. Preserve skip link and main focus target, long-page nav scrolling, content min-width, sticky behavior and safe areas. Check the actual scroll owner before changing overflow rules.
- Under 600px retain working phone sheet access for all existing destinations until R2.2 replaces it. Do not ship a navigation gap in this intermediate unit.

### Boundaries and follow-ups

- Stop after R2.1. R2.2 is BottomNav + More; R2.3 is compact Header/sync presentation; R2.4 is draggable Sheet; R2.5 is Portal shell. Do not implement those units wholesale now.
- Do not change app-nav labels, order, permissions, feature flags or routes to satisfy old snapshots. No count badges (owner D3), new navigation product features or second permission filter.
- Update flag-incompatible **test expectations** for navigation and `/today` as a directly relevant shell validation fix, keeping independent expected sets. Do not derive expected links by calling the same production helper under test. Enabled behavior includes Stations and excludes My Assigned for eligible roles; flag-off retains the existing path. Account for each role's actual permissions, not a blanket replacement.
- Shell bottom clearance/chat interception is an existing R2 candidate. If AppLayout scroll/sheet changes directly touch the problem, inspect and fix it narrowly with a browser regression; otherwise explicitly defer it to R2.2/R2.3. Do not claim it fixed from overflow or screenshot results alone. Appointments reschedule/cancel failures were observed on Sunday; date dependence remains a hypothesis.
- Do not silently change Radix modal/focus-trap behavior, suppress axe rules or remove validation as a shell styling fix. Dedicated focus-management review remains required before release.

## R2.1 validation plan

- Search e2e/fixtures for every changed label, role, class, width and breakpoint before editing. `shell-navigation.spec.js` currently asserts 232/64 widths and old flag-independent link arrays; update intentional geometry/flag assertions with provenance.
- Verify all five existing staff-shell role sets (staff, doctor, volunteer, manager, director), plus the six-role route harness. Check expanded desktop, collapsed desktop, labelled tablet rail and phone sheet; preserve header/account utilities, no-clinic disabled destinations, nested active routes and clinic-scoped hrefs.
- Widths: at least 390, 599/600, 744, 767/768, 1024, 1199/1200 and 1440; both themes. Exercise short viewport heights and long nav lists, a fresh desktop preference and both stored preferences, tablet-to-desktop round trips, reload, failed localStorage and text scaling where feasible.
- Check 44px targets, label clipping, nav scroll access to last destinations, visible focus, skip-to-main, Enter navigation, `[` guards, truthful toggle state, tooltip keyboard/hover scanning, reduced motion and interrupted pointer collapse. Inspect transition frames for initial flash or state resets if changing width motion.
- R1.6 table state must survive shell resize/collapse, including when available width crosses 60rem. Run permanent `data-table-surfaces.spec.js` and check actual patient/invitation layouts in the shell. Preserve filters, sort/page state, actions and horizontal scrolling on tables without cards.
- Core relevant specs: `shell-navigation`, `overlay-motion` if tooltip integration changes, `accessibility`, `responsive-components`, `responsive-offline`, `responsive-migration`, `data-table-surfaces`. Also run every spec reached by actual changed text/role/class searches. Header changes may reach `role-access`, `workspace-smoke`, `dark-mode` and `console-clean`; choose by impact, not a blanket full-suite run.
- Existing `accessibility.spec.js` has some axe exclusions. Do not use excluded scans as evidence that the known full-page open-overlay findings are cleared. Retain unfiltered diagnostics for any claimed fix.
- Prefer focused flag-on browser validation plus existing independent nav unit checks for both flag modes. A full flag-off browser build is optional unless needed to validate changed behavior; report exactly what ran. Changing NEXT_PUBLIC flags needs a rebuild.
- Run build with audit flags, standalone TypeScript, changed-file ESLint/Prettier, appropriate Jest with **--maxWorkers=2**, and the detector. Build once per source/flag state; do not rebuild for spec-only edits.
- Re-run the six-role normal route audit and synthetic after shots into `docs/design-system/ui-refresh/evidence/r2-1/after/`. Supplement with expanded/collapsed desktop and labelled tablet rail at boundary widths, both themes, focus and relevant open navigation states. Keep evidence git-ignored.
- Update `MASTER.md`, `PROGRESS.md` and a ranked review with exact checks, failures, evidence, the width discrepancy resolution, unresolved items and next unit R2.2. Commit locally; do not push.

## Known findings to retain

- **P1 open overlays:** R1.5 menus/Select reported serious `aria-hidden-focus` on background `.px-safe`, even with animations disabled. R1.6 reproduced it on Rows per page on both actual card consumers, light/dark, plus moderate `page-has-heading-one` and `region`. All four supplement scenarios failed their unfiltered assertions. The 228 clean normal route rows do not erase this. Attribution to unchanged Radix modal semantics is a strong inference; no old-build comparison ran.
- **Confirmed flag/assertion mismatch:** R1.6 `/today` migration test expects "Today Board" but station flag renders "Station line"; isolated repeat failed the same way. Five old shell-nav role scenarios were excluded from R1.5's remaining run after three failed against old link arrays. Do not describe those as passing or change product behavior to satisfy them.
- Existing short dropdown action rows remain below 44px. R1.6 table/control floors do not fix menus. Non-Chromium, physical-device and installed-PWA verification remain open. Old-browser container-query fallback was reviewed in code only.
- R1.4 knob stretch, label wipe and scrolled 390px tab underline still lack the requested manual feel-check. Encounter Vitals tab and new-encounter Crisis dialog need explicit browser checks. Do not expand R2.1 into those paths.
- Crisis acknowledgement recording remains backend work in `ui-refresh/TASK-crisis-acknowledgement.md`; patient-portal wording/offline recording design remain open. Do not implement it here.
- Real/third-party reference directories, synthetic stage-tag gaps, login/Keycloak sheet work (R5) and earlier handoff exclusions remain outside R2.1.

## Rules that still apply

- Don't touch APIs, the database schema, auth, permissions, clinical logic, validation or offline sync semantics. Don't add product features (R1.4b's Crisis dialog was an explicit owner exception). Don't create GitHub issues.
- docs/design-system/ui-refresh/references/01-current-ui and 02-design-references are git-ignored (real patient data / third-party). Never commit, crop, upload or cite them. Use synthetic shots only.
- Never print env values or route credentials through the session.
- Jest: max 2 workers (a bare full jest run froze the Mac). Don't run a bare full e2e; use the low-memory recipe below. Station specs: exclude the #197 offline tests with `--grep-invert "#197"`.
- I'm working in the main checkout, so the local Keycloak serves this checkout's theme directly.
- Radix components do not render under jest here (root-hoisted React). Mock the primitives as `confirm-dialog.test.tsx` and `toast.test.tsx` do.

## Route audit harness (throwaway DB nkwapa_audit exists and is seeded)

The new session has a different scratchpad, so recreate two files there (S = the scratchpad path).

S/audit-env.sh:

    for n in CLINICAL_NOTES GUIDED_CHRONIC_TABS MEDICAL_HISTORY MEDICATION_RECONCILIATION STATION_WORKFLOW; do
      export FEATURE_${n}_ENABLED=true NEXT_PUBLIC_FEATURE_${n}_ENABLED=true
    done
    export NEXT_PUBLIC_FEATURE_PWA_INSTALL_ENABLED=true
    for n in AUTH_ME AUTH_WHOAMI DEFAULT SYNC_PULL SYNC_PUSH; do export RATE_LIMIT_${n}_LIMIT=100000; done
    export EMAIL_PROVIDER=nodemailer SMTP_HOST=localhost SMTP_PORT=1025 EMAIL_FROM=info@akomapa.org EMAIL_DELIVERABILITY_ALLOWED_DOMAINS=nkwapa.local MAILPIT_BASE_URL=http://localhost:8025
    export APP_DATABASE_URL="${APP_DATABASE_URL%/nkwapa}/nkwapa_audit"

(The DB user is nkwapa_app, so a `%/nkwapa*` pattern corrupts the URL. Never print it.)

S/env.sh (source it; `return`, not `exit`, on the guard):

    cd /Users/nanaagyei/Documents/Codes/Projects/nkwapa; set -a; . ./.env 2>/dev/null; set +a; . S/audit-env.sh
    export DATABASE_URL=postgresql://nkwapa:nkwapa@localhost:5433/nkwapa_audit
    case "$APP_DATABASE_URL$DATABASE_URL" in *nkwapa_audit*nkwapa_audit) ;; *) echo BAD-DB; return 1;; esac
    cd apps/web

Then:

    . S/env.sh && NODE_OPTIONS=--max-old-space-size=3072 npm run build
    . S/env.sh && WEB_DIR=$PWD EVIDENCE_DIR=S/audit SHOTS_DIR=<abs evidence dir> npx playwright test -c ../../docs/design-system/route-audit/route-audit.config.cjs --workers=1 --reporter=line

- In R1.5, the sandboxed Turbopack build stalled at compilation; the normal escalated build completed. If binding or sandbox restrictions block build/browser verification, request the required tool escalation rather than changing product code or silently skipping checks.
- `AUDIT_ROLES=staff,manager` limits the identities. Station setup is a staff route.
- Summarise with: `node -e` over `S/audit/route-audit.json`; each row has a `violations` array (sum its length), numeric `overflowX` (nonzero means overflow), and possibly `error`. Do not count an empty array as a violation.
- Targeted e2e: `. S/env.sh && npx playwright test e2e/<spec> --workers=1 --reporter=line`. Pipe through `grep -v WebServer`, because the API logs every request.
- A scratch spec must live inside the repo to resolve @playwright/test. Delete it afterwards.
- Landing screenshots: a scratch spec beside route-audit.spec.js with `storageStateFor(role)`, viewport 1920x1080 (phone 404x872), deviceScaleFactor 2, and before navigating set localStorage `nkwapa-theme=dark` and `nkwapa.sidebar.collapsed=false`.
- Appointment fixtures: see "Reset the appointment fixtures" below.
- If nkwapa*audit is missing: createdb, db:migrate:deploy, then seed with SEED_ENVIRONMENT=local and SEED_SAMPLE*{APPOINTMENTS,DUPLICATES,IDENTITY,PATIENT,CROSS_CLINIC}=true.

## Low-memory e2e recipe (8 GB Mac)

Never run the full e2e suite locally. Run only the specs a change can reach, in one Playwright invocation.

1. **Choose specs by text, not by screen.** For every label, placeholder, heading, role or class you changed, run `rg -n "<old text>" apps/web/e2e apps/web/playwright`. Run every spec that matches. A placeholder change once broke three unrelated specs in CI and stalled the run for 3 hours.
2. **Build once with the flags** (S/env.sh sets them): `NODE_OPTIONS=--max-old-space-size=3072 npm run build` in apps/web. `NEXT_PUBLIC_*` flags are baked in at build time. Rebuild only when web source or flags change. A spec-only edit needs no rebuild.
3. **Run everything in one invocation, in the background:** `npx playwright test <spec> <spec> --workers=1 --reporter=line > log 2>&1`, then grep the log. Add `--max-failures=3` to stop early, and `-g "<title>"` for one test.
4. **Watch for these traps:**
   - macOS has no `timeout`. `timeout 900 npx …` exits instantly and looks like a pass.
   - Station specs skip themselves without the station flag, so a "pass" in a non-station build means nothing.
   - A full local run flakes about 1 spec. Re-run that file alone before blaming a change.
   - Re-runs eat fixtures. See below.

## Reset the appointment fixtures

`npm run db:seed` alone does NOT restore consumed appointment fixtures. `seedSampleAppointments` checks that the demo patient (`firstName: 'Appointment', lastName: 'Demo'`) exists, not the appointments, so it reports "already exist; skipping". Delete that patient (appointments cascade), then re-seed.

- The delete needs the system-admin flag, or row-level security blocks it: `new PrismaPg({ connectionString: process.env.DATABASE_URL, options: '-c app.is_system_admin=true' })`, then `prisma.patient.deleteMany({ where: { firstName: 'Appointment', lastName: 'Demo' } })`.
- Run that script from inside the repo, so Node resolves `@prisma/client`, with S/env.sh sourced so DATABASE_URL is the audit DB.
- Then, from the repo root with S/env.sh sourced: `SEED_ENVIRONMENT=local SEED_SAMPLE_APPOINTMENTS=true npm run db:seed`.
- Seed flags must be the string `true`. `=1` silently skips.
- `patient-claim.spec.js` also consumes its fixture. `SEED_SAMPLE_IDENTITY=true npm run db:seed` restores it.
- The `lifecycle actions` failures are not a fixture problem (see Other open work).
