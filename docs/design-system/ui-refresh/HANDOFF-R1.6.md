# Handoff: R1.6 DataTable surfaces and narrow-width cards

Continue the Nkwapa "Layered Clinical Workspace" UI refresh. Direct mode. The owner explicitly suspended all learning guardrails. Frontend only. Implement R1.6, validate it, update the tracker, and commit the unit locally. Do not push unless the owner asks.

## Start here

- Read `apps/web/AGENTS.md` before editing frontend code. This is Next.js 16.3.0-canary.104; relevant local docs live in root `node_modules/next/dist/docs/`.
- Stay on `ui-refresh/r1-1-tokens`. Check status and history before changing anything. Preserve unrelated work.
- Repository-relative paths in this handoff are explicit; design docs are under `docs/design-system/`, not the repository root.
- Use the installed skills appropriate to the work. Record exactly which checks ran. If a requested review tool is unavailable, write the hierarchy, consistency, touch-target, focus, motion, accessibility, dark-mode and edge-case review instead, ranked P0 to P3, each fixed or deferred with a reason. An isolated-agent critique is not required.
- The plain Node detector exists at `~/.claude/skills/impeccable/scripts/detect.mjs`; run it against the changed files from the correct working directory. Silent exit 0 means no findings, not proof of design quality.
- All necessary context is in repository docs and the operational recipes below. Do not depend on private agent memory or `/tmp` surviving.

## Current state (2026-11-08)

- R0 is completed. Approved pilot v5: `docs/design-system/ui-refresh/r0-pilot/index.html`.
- R1.1 through R1.4b: commit `7fafd137`, built and in review.
- R1.5: commit `9a66f502` (`UI refresh R1.5: anchor overlay motion to triggers`), built and in review. It is not an unconditional accessibility sign-off.
- Neither implementation commit was pushed in the previous session. This handoff may have its own later documentation commit; inspect `git log`.
- `docs/design-system/PROGRESS.md` has the Unit Log and owner decisions. `docs/design-system/ui-refresh/R0-AUDIT.md` section 4 is the token source of truth; `docs/design-system/MASTER.md` mirrors it.
- R1.5 code and detailed consumer inventory: `docs/design-system/ui-refresh/R1.5-REVIEW.md`.

### Preserve R1.5

- DropdownMenu, submenus, Select and InfoHint use shared `.anchored-overlay` CSS: scale 0.95 and opacity, trigger origin, 200ms in / 160ms out, existing ease-out.
- Tooltip uses 150/120ms and a 300ms skip-delay window. Scanning neighbouring icons skips the entrance transition too. Combobox remains instant because focus and typing are routine.
- CSS transitions reverse from the current frame. A **nonvisual** `anchored-presence` animation retains the node through its exit because Radix Presence waits for animation events, not transition events.
- `components/ui/use-overlay-input.ts` tracks input through one shared set of capture listeners. Keyboard interactions are instant. Do not substitute `:focus-visible` inference: Radix's focus handoff matched it on pointer-opened menus in a browser check.
- When switching to keyboard during an exit, keep the clock name and shorten its duration to 0.01ms. Cancelling the clock can strand a closed tooltip in Radix Presence.
- Reduced motion retains opacity only through a shared exception to the global 0.01ms clamp. Keyboard and scanning remain instant.
- Select's 4px gap is `sideOffset`, not translation utilities. Translation classes overrode the scale transform during browser verification.
- `apps/web/e2e/overlay-motion.spec.js` contains six passing browser checks for actual transition frames, origins, reduced motion, keyboard focus, reversal, targets and tooltip cleanup.

### R1.5 validation and evidence

- Production build, standalone TypeScript, changed-file ESLint/Prettier and detector passed. Jest: **92 suites / 1013 tests**, max two workers.
- **58 distinct focused browser regressions passed**, including all six new motion cases.
- Route harness: **six roles / 228 rows**, zero errors, zero serious/critical axe findings, zero horizontal overflow. This scans normal route states, not every open overlay.
- **132 screenshots** in `docs/design-system/ui-refresh/evidence/r1-5/after/`: 114 route shots and 18 open-overlay shots at 390/744/1024 in light/dark.
- Beside `after/`: `motion-samples.json`, `route-audit.json`, `overlay-a11y.json`, `validation-summary.json`.
- Evidence is **local and git-ignored** by the existing repository rule. Do not force-add it. If a clean checkout lacks it, recreate synthetic evidence with the harness. Do not claim missing files were inspected.
- The R1.5 route set is the before baseline for R1.6. The supplemental viewport spec was intentionally removed after capture; the permanent motion spec remains.

## Task: R1.6

R0-AUDIT section 9: **"DataTable header and row surfaces; card-render slot for narrow widths"**. Main file: `apps/web/components/ui/data-table.tsx`. This is shared presentation work, followed by R2 shell work. Do not turn it into a broad page redesign or a table-library migration.

### Read before editing

1. `docs/design-system/ui-refresh/R0-AUDIT.md` sections 4, 5, 6 and 9.
2. `docs/design-system/NKWAPA-UI-REFRESH-MASTER.md` section 5.5 (tables and lists), 6.5 (shared architecture) and 9.1 (motion).
3. `docs/design-system/MASTER.md` sections 7, 8 and 9, including current DataTable contracts. Owner-approved refresh rules supersede older Ruled Chart descriptions that conflict.
4. Pilot table and patient-list CSS/markup in `docs/design-system/ui-refresh/r0-pilot/index.html`: `table`, `thead th`, `tbody td`, `tbody tr`, `.no-phone`, patient view. Locate by text rather than trusting old line numbers. The pilot hides `.no-phone` under 600px; that is reference behavior, not proof every data table fits at 600px.
5. The existing primitive, its current consumers, relevant fixture bundles and e2e assertions.

### Confirmed starting point

- **The card-render slot already exists:** `renderMobileRow?: (row: TData) => React.ReactNode`. It maps `table.getRowModel().rows` and receives `row.original`. Current production consumers are PatientRegistryScreen and StaffInvitesCard.
- Cards currently show below viewport `md`; the table shows at/above `md`. This does not measure the table's available container width. Extend or adapt this API; do not add a second competing `renderCard` API just because the plan used that provisional name.
- There is one TanStack v9 table instance, with stable module-level features. It owns client filtering/sorting/pagination or accepts controlled server state. Server mode is selected by `rowCount !== undefined`.
- Table wrapper still has the old strong top rule: `border-t-2 border-rule-strong`. Header is sticky `bg-muted`; rows use `border-rule`, hover `bg-muted/50`. These are the surface migration starting points.
- Desktop cells are 44px; coarse-pointer cells are 52px. Preserve those floors and 44px controls. Numeric data is tabular; numeric/action columns can align right through metadata.
- Preserve caption, named keyboard-scroll region, sticky header, `aria-sort`, sorting buttons, row IDs, column metadata, pagination controls and the non-shifting refresh indicator.
- Existing `onRowClick` also handles Enter and warns against mixing row-level activation with nested buttons. Do not introduce ambiguous nested actions.
- Current mobile empty branch renders `emptyState` directly; desktop has a "Nothing to show." fallback. Check both when reviewing edge cases.
- Some routes have their own responsive card/table layouts. Audit them before changing any shared breakpoint. Do not force every route through this unit's slot or rebuild all page cards.

### Intended outcome and boundaries

- Replace the old ruled table surface with the approved layered surface: clear header contrast, quiet row dividers, legible hover/focus, semantic light/dark tokens and existing typography roles. Use the pilot as visual authority; do not blindly copy its mono/uppercase labels over the app's semantic type contract.
- Adapt tables to **available width** where a card renderer exists, including a narrow panel inside a wide viewport. CSS container queries are a reasonable candidate; justify the threshold and preserve compatibility with existing consumers.
- Keep one data source, one row model, one sort/filter/page state and one action implementation. Resize must not reset state, refetch solely for layout, or expose duplicate controls to assistive technology.
- Preserve sensible horizontal scrolling for tables without a card renderer. Do not automatically turn arbitrary cells into generic cards or silently hide essential columns/actions.
- Preserve access to sorting, filtering, pagination and record actions in the card presentation. Audit actual current behavior rather than assuming shared state alone makes controls available.
- Scope consumer edits to integrating the shared contract and fixing direct regressions. Leave broader registry, appointments, queue and administration redesigns to their planned phases.
- No row arrival choreography on paging, filtering or refresh. Repeated keyboard actions and clinical numbers remain instant. Existing refresh feedback must remain truthful and reduced-motion-safe.

### Consumer inventory

Confirmed imports when drafting this handoff, relative to `apps/web/`. Re-run the search at implementation time:

- `app/(workspace)/admin/users/page.tsx`
- `app/(workspace)/audit/page.tsx`
- `app/(workspace)/my/assigned/page.tsx`
- `app/(workspace)/notifications/page.tsx`
- `app/(workspace)/queues/page.tsx`
- `app/(workspace)/volunteers/events/[eventId]/page.tsx`
- `app/(workspace)/volunteers/events/page.tsx`
- `app/(workspace)/volunteers/page.tsx`
- `components/admin/ClinicRegistryScreen.tsx`
- `components/admin/CrossClinicInvestigationScreen.tsx`
- `components/admin/DuplicateReviewScreen.tsx`
- `components/dashboard/DirectorDashboard.tsx`
- `components/dashboard/DoctorDashboard.tsx`
- `components/dashboard/ReviewDashboard.tsx`
- `components/dashboard/SystemAdminDashboard.tsx`
- `components/patients/PatientRegistryScreen.tsx`
- `components/reports/OrganizationAnalyticsPanel.tsx`
- `components/reports/OrganizationReportScreen.tsx`
- `components/staff/StaffInvitesCard.tsx`
- `e2e/component-fixtures/ResponsiveOffline.tsx`
- `e2e/component-fixtures/SharedComponents.tsx`

### Validation plan

- Before changing labels, placeholders, headings, roles or classes, search e2e and fixtures for the old values. Run every spec reached by an actual text/role change.
- Start with `e2e/shared-components.spec.js` and `e2e/component-fixtures/SharedComponents.tsx`. Existing checks exercise sort, pagination, keyboard actions, resource states and axe. Use the existing bundle helper rather than inventing a public specimen route.
- Also inspect `e2e/responsive-offline.spec.js` and `e2e/component-fixtures/ResponsiveOffline.tsx`, `responsive-components.spec.js`, `responsive-migration.spec.js`, `patient-redesign.spec.js`, `patient-registry-screened.spec.js`, and staff-invite coverage if that card consumer changes. Select specs by actual impact; this is not a command to run the whole e2e suite.
- Meaningful coverage should demonstrate client and controlled-server behavior, stable sort/filter/page state across width changes, identical row/action identities in cards and table, narrow container inside a wide viewport, fallback scrolling without a card renderer, empty state and refresh without row displacement.
- Check sticky headers, sort direction and reset, numeric alignment, long names/text, disabled pagination, keyboard scroll/focus, coarse-pointer target height, dark mode, reduced motion and accessible visibility of only the active presentation.
- Browser widths: at least 390, 744/1024 and 1440. Exercise the chosen container threshold on both sides. Scope and report any additional widths honestly.
- Run build/typecheck, changed-file lint/format, appropriate tests and the detector. Jest must use `--maxWorkers=2`.
- Take synthetic after shots with the route harness into `docs/design-system/ui-refresh/evidence/r1-6/after/`. Supplement with open table/card, sorting and narrow-panel states that the normal route audit does not show.
- Update `docs/design-system/MASTER.md` with the final shared contract and `docs/design-system/PROGRESS.md` with a full R1.6 entry: changed files, actual checks, evidence, ranked review, unresolved items and next unit R2. Commit per unit; no push.

## Known findings and exclusions: do not erase or misreport

### P1: full-page axe with an open menu or Select

- R1.5's six supplemental viewport scenarios completed bounds and screenshot checks but **failed their retained full-page axe assertions**. Both header menu and Select report `aria-hidden-focus` on background `.px-safe`.
- The menu finding persisted with every animation and transition disabled, while focus was on role `menu`. **Strong inference:** unchanged Radix modal background semantics rather than the motion. **Unknown:** whether an old production build gives the identical result; no old-build comparison ran.
- This is distinct from the 228 clean normal-route rows. Never describe the entire R1.5 accessibility run as green.
- A dedicated focus-management review is required before release. Do not silently change Radix `modal`, focus trapping, background semantics or axe rules as part of DataTable surface work. If Rows per page reveals the same finding, record it separately and retain validation. R1.6 may investigate it, but it is not a required scope expansion.

### Flag-incompatible shell snapshots

- With station workflow enabled, unchanged `apps/web/lib/app-nav.ts` intentionally shows Stations and hides My Assigned.
- Three `shell-navigation.spec.js` "sees the same navigation" scenarios failed against old expected arrays; five such scenarios were excluded from the remaining R1.5 run. Other shell account-menu, tooltip and station checks passed.
- Keep this distinction from a regression. Do not change product navigation to satisfy obsolete expectations. A flag-aware snapshot update is a follow-up, plausibly R2.

### Other open work

- Dropdown action rows are approximately 32px, below the design's 44px target. Density follow-up is still open; do not mistake DataTable's existing 44/52px row contract for fixing menu targets.
- Physical-device and non-Chromium verification remain open. Help's 44x44 pseudo-target was measured in Chromium; this is not a real-device result.
- R1.4 knob stretch, label wipe and underline in a scrolled 390px tab row still lack the requested manual feel-check.
- Crisis acknowledgement recording is backend work: `docs/design-system/ui-refresh/TASK-crisis-acknowledgement.md`. Do not implement it on this branch. Staff acknowledgement dialog exists; patient portal wording and offline recording design remain open.
- Encounter Vitals tab and new-encounter Crisis dialog paths still need explicit browser checks. If touching `station-redesign.spec.js`, strengthen its weak no-second-alert check rather than relying on identical save-status text.
- Floating chat can intercept the last row's action. Appointments lifecycle reschedule/cancel failures were observed on Sunday; date dependence is still a hypothesis. R2 candidate: main-scroll bottom clearance. Do not assume fixture reset fixes click interception.
- Existing appointment and patient-claim fixtures can be consumed by runs; reset using the recipes below only when needed.
- Synthetic stage-tag screenshot coverage, login/Keycloak sheet layout (R5), and the other earlier handoff gaps remain outside this unit.
- Jest counts have varied on unchanged code; last observed result is 92 suites / 1013 tests. Do not invent a stable count or claim a passing suite proves correctness.

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
