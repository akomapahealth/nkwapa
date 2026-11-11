# Nkwapa UI Refresh — Progress Tracker

**Direction:** Layered Clinical Workspace  
**Base branch:** `release/dev`  
**Program:** Frontend-only visual refinement  
**Status:** R0 completed 2026-11-07. R1.1 through R1.6, R2.1 through R2.5 and R3.1 through R3.7 are built on `ui-refresh/r1-1-tokens` and in review. Prior open-overlay accessibility findings remain separate. Next: R3.8 Encounters.

## Phase Status

| Phase | Workstream                             | Status      |
| ----- | -------------------------------------- | ----------- |
| R0    | Current UI audit and design pilot      | Completed   |
| R1    | Design tokens and shared components    | In review   |
| R2    | Desktop, tablet, and mobile app shells | In review   |
| R3    | Volunteer and clinical workflows       | In progress |
| R4    | Clinical review and oversight          | Not started |
| R5    | Patient portal and authentication      | In progress |
| R6    | Supporting public experience           | Not started |
| R7    | Motion and visual polish               | Not started |
| R8    | Final QA and release readiness         | Not started |

Allowed statuses: `Not started`, `In progress`, `Blocked`, `In review`, `Completed`.

## Screen Coverage Matrix

Track each relevant route and role, not merely each module.

| Screen family                   | Desktop | Tablet | Phone | QA  |
| ------------------------------- | ------- | ------ | ----- | --- |
| Staff application shell         | —       | —      | —     | —   |
| Volunteer dashboard             | —       | —      | —     | —   |
| Stations                        | —       | —      | —     | —   |
| Queues                          | —       | —      | —     | —   |
| Patient registry                | —       | —      | —     | —   |
| New patient form                | —       | —      | —     | —   |
| Patient profile                 | —       | —      | —     | —   |
| Vitals and trends               | —       | —      | —     | —   |
| Clinical encounters             | —       | —      | —     | —   |
| Appointments                    | —       | —      | —     | —   |
| Doctor and preceptor workspaces | —       | —      | —     | —   |
| Manager operations              | —       | —      | —     | —   |
| Director and admin workspaces   | —       | —      | —     | —   |
| Patient portal                  | —       | —      | —     | —   |
| Authentication                  | —       | —      | —     | —   |
| Public pages                    | —       | —      | —     | —   |

Legend: `—` Not reviewed, `WIP` In progress, `PASS` Verified, `FAIL` Needs correction, `N/A` Not applicable.

This summary does not replace the complete route inventory. Add every relevant existing route to `SCREEN-MATRIX.md`.

## Device Verification

At minimum verify the following CSS viewport widths:

- 320, 360, 375, 390, and 430px — narrow and standard phones
- 540 and 600px — large or foldable/dual-screen layouts
- 744, 768, and 820px — compact tablets and iPad mini-like widths
- 1024px — tablet landscape and smaller laptop
- 1280, 1440, and 1920px — desktop

Test both portrait and landscape behavior where appropriate.

Verify zoom, long content, virtual-keyboard behavior, and PWA installed display mode on supported devices.

## Unit Log

**Unit ID:** R0
**Phase:** R0, audit and design pilot
**Screen(s) or components:** Whole frontend audited; pilot covers volunteer dashboard, patient registry, station workspace, station BP entry
**Branch/commit/PR:** Not committed. Working tree on `release/dev`
**Status:** Completed 2026-11-07. Owner approved pilot v5 ("we can move forward with it, and start building"). Pilot artifact: https://claude.ai/artifact/ESPAMmNxLt1caa2owyjSX5
**Design changes:** None to the app. Token proposal, adaptive strategy, motion system and dependency plan in `ui-refresh/R0-AUDIT.md`; static pilot in `ui-refresh/r0-pilot/index.html`
**Files changed:** `.gitignore` (references 01 and 02), screenshots moved from `apps/web/public/screenshots/` to `ui-refresh/references/`, `NKWAPA-UI-REFRESH-MASTER.md` (section 2A references, section 9.1 motion, section 13 paths), `PROGRESS.md`, new `ui-refresh/R0-AUDIT.md`, `ui-refresh/SCREEN-MATRIX.md`, `ui-refresh/r0-pilot/index.html`, `ui-refresh/evidence/r0/*.png` (30 files)
**Desktop tested:** Pilot at 1440px, light and dark
**Tablet tested:** Pilot at 744px (rail, single column) and 1024px (rail, two columns)
**Phone tested:** Pilot at 360px and 390px, light; 390px dark; filter sheet and local-save state at 390px
**Dark mode:** Pilot at 390 and 1440px; proposed dark tokens measured (R0-AUDIT section 4)
**Keyboard and accessibility:** Contrast computed for every proposed token pair; pilot uses native dialogs, labelled controls, 44px targets. No axe run (static pilot)
**Offline/sync regression:** N/A, no app change. Pilot shows the local-save state ("Saved on this device. Waiting to sync"), never "synced"
**Tests executed and results:** Playwright capture script measured horizontal overflow at each width: first run found 20 to 50px overflow on phones (grid `min-width` bug in the pilot), fixed, second run 0px at all widths
**Before/after screenshots:** Before: `ui-refresh/references/01-current-ui/` (git-ignored, real patient data). After (pilot): `ui-refresh/evidence/r0/`, regenerated for pilot v2 (0 px overflow at all widths)
**Outstanding problems:** None for R0. Synthetic before-set taken: `ui-refresh/evidence/r0/before/` (102 shots). Pages still to design in the pilot language: settings, clinic settings, take a tour, notifications, messaging
**Next unit:** R1.1 token values

**Unit ID:** R1.1
**Phase:** R1, design tokens
**Screen(s) or components:** Global tokens; every route inherits them
**Branch/commit/PR:** `ui-refresh/r1-1-tokens`, not committed
**Status:** In review
**Design changes:** Pilot palette in `globals.css` (light and dark): teal-tinted canvas, white sheet, teal neutrals, selected, mint, brand, gold surface and ink, deep, faint. `--radius` 0.5rem (4/6/8/12). Light `--destructive` 51% to 49% for AA on the new canvas. Sidebar on the canvas. Named screens 600/840/1200; `font-mono` (Plex Mono, self-hosted). No component or layout change
**Files changed:** `apps/web/app/globals.css`, `apps/web/tailwind.config.js`, `apps/web/app/layout.tsx`, `apps/web/app/fonts/ibm-plex-mono-{400,500}-latin.woff2`, `apps/web/lib/app-identity.ts`, `apps/web/public/offline.html`, `ui-refresh/R0-AUDIT.md` section 4
**Desktop tested:** Route audit at 1440, every seeded role
**Tablet tested:** Not separately; token-only change
**Phone tested:** Route audit at 390, every seeded role
**Dark mode:** Route audit axe in dark at both widths; dark pairs measured
**Keyboard and accessibility:** axe (route audit): 0 violations on 228 role/route/theme/width rows, 0 horizontal overflow
**Offline/sync regression:** N/A, no logic change. `offline.html` retinted to the same tokens
**Tests executed and results:** `design:check-tokens` 24/24 pass; `design:check-charts` pass; `app/manifest.test.ts` 7/7; `tsc --noEmit` clean; route audit 12/12 against a throwaway seeded DB (both DB URLs overridden). Full e2e suite not run
**Before/after screenshots:** Before `ui-refresh/evidence/r0/before/`; after `ui-refresh/evidence/r1-1/after/` (114, adds patient-portal routes)
**Outstanding problems:** Keycloak login theme still uses the cream canvas (`infra/.../styles.css`, separate surface, own e2e); MASTER.md and PRODUCT.md still quote old token values
**Next unit:** R1.2 Button, Input, Select, Textarea (secondary fill, 48px touch, radii)

**Unit ID:** R1.1b
**Phase:** R1, token consistency pass
**Screen(s) or components:** Keycloak login theme, landing hero and product frames, token docs. First-run and public surfaces checked: landing, privacy, terms, cookies, `/login`, accept-invite, account name, claim-record (patient account setup), `WelcomeTour`, `OnboardingFrame`, not-found, error, global-error, loading, `offline.html`
**Branch/commit/PR:** `ui-refresh/r1-1-tokens`, not committed
**Status:** In review
**Design changes:** Keycloak theme variables mapped to R0-AUDIT section 4 (canvas `#F2F7F7`, white surface, ink `#19282E`, muted `#55666D`, border `#DBE4E6`, selected as the soft primary, destructive `#D72323`, status surfaces, radii 4/6/8/12). Landing hero ground and product-frame bezels moved from hue 200 to the dark canvas/card family (192 to 195). Every other first-run surface already used tokens only: no old values, no `rounded-2xl` or larger. The phone mock-up bezel keeps its `rounded-[1.75rem]` (depicts hardware; noted in MASTER section 5). No layout change
**Files changed:** `infra/nkwapa/keycloak/themes/nkwapa/login/resources/css/styles.css`, `apps/web/components/landing/HeroSection.tsx`, `apps/web/components/landing/ProductFrames.tsx`, `docs/design-system/MASTER.md` (sections 2, 3, 4, 5, 7, 8), `apps/web/PRODUCT.md` (brand commitments, logo hex to `#008DA3`), `docs/design/landing-page-redesign.md` section 3
**Desktop tested:** Login theme and landing specs at their committed widths (375 to 1440)
**Tablet tested:** Same specs (768, 1024)
**Phone tested:** Same specs (375)
**Dark mode:** Landing theme toggle spec; Keycloak theme is light only by design (#83)
**Keyboard and accessibility:** Login focus-order spec and landing axe spec pass. Theme pairs measured: ink 15.17:1 and muted 5.99:1 on white, ink 14.03:1 on canvas, input 3.59:1, primary on selected 4.55:1, status inks on their surfaces 5.23 to 7.27
**Offline/sync regression:** N/A, no logic change
**Tests executed and results:** `design:check-tokens` 24/24; e2e `login-theme`, `landing`, `public-routes` 36/36 pass (local Keycloak serves this checkout's theme). e2e grepped for every changed value: no assertions on them
**Before/after screenshots:** Not taken for this pass (colour-only; the specs cover radius, fill and overflow)
**Outstanding problems:** Keycloak email templates (`themes/nkwapa/email/html/*.ftl`) still use Tailwind greys and `#0f766e`, not the brand; out of this pass. Dark `*-foreground` tokens stay `200 25% 10%`; consider the dark canvas `#0C1416` with R1.2. The login page and Keycloak form still sit on the canvas rather than a sheet: layout, deferred to R5
**Next unit:** R1.2 Button, Input, Select, Textarea

**Unit ID:** R1.2
**Phase:** R1, shared controls
**Screen(s) or components:** `components/ui/button.tsx`, `input.tsx`, `select.tsx`, `textarea.tsx`; every route inherits them
**Branch/commit/PR:** `ui-refresh/r1-1-tokens`, not committed
**Status:** In review
**Design changes:** Button: flat (no shadows), semibold labels, `touch-manipulation`; primary hovers darker to new `--primary-hover` (`188 100% 24%` light, `188 80% 56%` dark); `outline` and `secondary` are the A4 secondary action, white `--card` fill + `--input` border, hover `--muted` (secondary was gold; zero Button call sites used it); ghost hover `--muted`; gold only via `gold`. Input and SelectTrigger 48px under `pointer: coarse`, 44px otherwise (existing DataTable precedent); controls lose `shadow-sm`, padding 14px; Select menu 8px radius, chevron `text-muted-foreground`. Radii already 6px controls / 4px items via R1.1. Motion untouched (popover motion is R1.5); press scale 0.97 kept
**Files changed:** the four components, `apps/web/app/globals.css` (`--primary-hover`), `apps/web/tailwind.config.js` (`primary.hover`), `scripts/check-design-tokens.mjs` (primary label pairs), `MASTER.md` section 8, `ui-refresh/R0-AUDIT.md` section 4
**Desktop tested:** Route audit 1440, every seeded role
**Tablet tested:** Not separately
**Phone tested:** Route audit 390 (Chromium desktop emulation is a fine pointer, so the 48px touch height is not in these shots)
**Dark mode:** Route audit axe in dark at both widths; dark hover 9.42:1
**Keyboard and accessibility:** Skills run: impeccable (craft floor + detector, 0 findings), web-design-guidelines (one finding, `touch-action`, fixed), accessibility (contrast check moved destructive hover back to `/95`: `/90` was 4.51:1). Route audit axe 0 violations on 228 rows, 0 overflow
**Offline/sync regression:** N/A, styling only
**Tests executed and results:** `design:check-tokens` 28/28 (4 new pairs) and its unit test 4/4; `tsc --noEmit` clean; jest `components/ui` + manifest 9/9; e2e `stale-refresh`, `accessibility`, `responsive-components`, `design-foundations`, `dark-mode` 49/49; route audit 12/12
**Before/after screenshots:** Before `ui-refresh/evidence/r1-1/after/` (the pre-R1.2 state); after `ui-refresh/evidence/r1-2/after/` (114)
**Outstanding problems:** Hover is not yet gated to `@media (hover: hover)` (motion rule 25); Tailwind's `future.hoverOnlyWhenSupported` would do it app-wide and needs its own unit. Gold name chips on station setup are a badge question for R1.3. No real-device touch check of the 48px height yet
**Next unit:** R1.2b follow-ups, then R1.3

**Unit ID:** R1.2b
**Phase:** R1, follow-ups from R1.1b and R1.2
**Screen(s) or components:** Keycloak and API emails, every `hover:` utility, dark on-fill ink, touch height
**Branch/commit/PR:** `ui-refresh/r1-1-tokens`, not committed
**Status:** In review
**Design changes:** Emails: the API layout (`apps/api/src/notifications/templates/layout.ts`, five colour constants, owner approved touching it) and the Keycloak email `.ftl` copy retinted together to brand `#00778A`, ink `#19282E`, muted `#55666D`, border `#DBE4E6`, canvas `#F2F7F7`; button radius 8 to 6px. Tailwind `future.hoverOnlyWhenSupported` (motion rule 25): every `hover:` utility is now under `@media (hover:hover) and (pointer:fine)`; no content is revealed only on hover (checked). Dark `*-foreground` on bright fills moved from `200 25% 10%` to the dark canvas `192 29.4% 6.7%`; light `--warning-foreground` to the ink (5.52:1)
**Files changed:** `apps/api/src/notifications/templates/layout.ts`, `infra/nkwapa/keycloak/themes/nkwapa/email/html/{template,executeActions}.ftl`, `apps/web/tailwind.config.js`, `apps/web/app/globals.css`, `apps/web/e2e/accessibility.spec.js` (popup axe waits for finite animations), `MASTER.md` section 4, `ui-refresh/R0-AUDIT.md` section 4
**Desktop tested:** e2e at Desktop Chrome
**Tablet tested:** Not separately
**Phone tested:** Emulated touch (Chromium, 390px, `isMobile` + `hasTouch`, `pointer: coarse` true, `hover: hover` false) on `/patients/new`: 7 inputs and 6 select triggers measure 48px. Scratch probe, not kept in the repo. No real device
**Dark mode:** Dark on-fill pairs: primary 8.34, gold 10.73, success 8.47, warning 9.05, destructive 6.01, primary hover 10.11
**Keyboard and accessibility:** Popup axe race fixed: right after a Radix Select opens, axe measured the mid-fade text at 2.0 to 3.8:1; 400ms later it was clean in every run. The helper now waits for finite animations
**Offline/sync regression:** N/A
**Tests executed and results:** API `src/notifications` jest 195/195 (2 workers); `design:check-tokens` 28/28 and unit 4/4; e2e `accessibility` x3 42/42; `dark-mode`, `design-foundations`, `responsive-components`, `landing`, `info-hint` pass (69/70 in the first run, the one failure being the race above); Prettier clean
**Before/after screenshots:** None new (colour and hover-media only; R1.2 after set still current)
**Outstanding problems:** Real-device touch check still to do. Login and Keycloak form on a sheet is R5 layout. Gold name chips on station setup go to R1.3. Some small inline triggers (help icons) measure 20 to 24px with pseudo-element targets, per MASTER section 8
**Next unit:** R1.3 Panel surface + StatusLabel/Badge unification

**Unit ID:** R1.3
**Phase:** R1, panel surface and status tags
**Screen(s) or components:** `components/ui/badge.tsx`, `card.tsx`, `status-label.tsx` (via `lib/status-presentation.ts`), `ChartStatusBadge.tsx`; every route with a badge or card inherits them
**Branch/commit/PR:** `ui-refresh/r1-1-tokens`, not committed
**Status:** In review
**Design changes:** Badge is the pilot `.tag` (min 24px, 4px radius, 12.5px semibold, no shadow or hover, wraps instead of overflowing). `secondary` was logo gold and is now neutral (`--surface-2` + `--border` + muted ink), so "Closed", "Deactivated", station kind chips, "With …", portal recommendation chips and every `'secondary'` status map read as neutral. New `info` (selected) for "Suggested match" and the portal "Selected" tag; new `gold` for "new" highlights only (no call site yet). A8: new `--severe-surface` / `--severe-ink` tokens and `severe` variant; one map `HYPERTENSION_BADGE_VARIANTS` gives Normal/Elevated neutral, Stage 1 warning, Stage 2 severe, Crisis filled destructive, used by `statusVariant()` (queue BP column, doctor and review dashboards) and the hypertension history panel (Normal moved from green to neutral there). Classifier untouched. Card: 8px radius, full `--border`, shadow removed. Owner decision: all 24 `rounded-full` badge call sites stripped (workspace and portal; landing kept); the two hand-rolled research pills and `ChartLockedBadge` now use the Badge styles; the filter chip remove button is 24px `rounded-sm` with its 44px pseudo-target kept
**Files changed:** `apps/web/components/ui/{badge,card}.tsx`, `components/patients/chart/ChartStatusBadge.tsx`, `lib/{hypertension,status-presentation}.ts`, `lib/status-presentation.test.ts`, `app/globals.css`, `tailwind.config.js` (`severe`), `scripts/check-design-tokens.mjs` (8 new pairs), call sites in `app/(workspace)/appointments/page.tsx`, `app/(workspace)/clinics/[clinicId]/patients/[patientId]/page.tsx`, `components/app-shell/ActiveFilterSummary.tsx`, `components/patients/{HypertensionHistoryPanel,PatientTrendsPanel,PortalAccessCard}.tsx`, `components/portal/{Appointments,Health,Overview}PortalScreen.tsx`, `MeasurementComposerScreen.tsx`, `components/research/ResearchExportsScreen.tsx`; `MASTER.md` section 4; `ui-refresh/R0-AUDIT.md` section 4
**Desktop tested:** Route audit 1440, every seeded role
**Tablet tested:** Not separately
**Phone tested:** Route audit 390
**Dark mode:** Route audit axe in dark at both widths; dark tag pairs 5.54 to 9.82:1
**Keyboard and accessibility:** Skills run: impeccable (craft floor + detector over 13 changed files, 0 findings), web-design-guidelines (fetched live, 0 findings), accessibility (static: all tag pairs >= 4.5:1, BP stage always named in text, remove button 24px visual + 44px target; rendered: axe below). Route audit 0 axe violations on 228 rows, 0 overflow
**Offline/sync regression:** N/A, presentation only
**Tests executed and results:** `design:check-tokens` 36/36 and its unit test 4/4; `tsc --noEmit` clean; ESLint and Prettier clean; jest `status-presentation`, `hypertension`, `appointment-status`, `notification-delivery` 67/67 (2 workers); e2e `shared-components`, `accessibility`, `dark-mode`, `design-foundations`, `responsive-components`, `hypertension-assessment`, `research-schedules`, `appointments` 74/76 on `nkwapa_audit`; route audit 12/12. The 2 failures are `appointments` lifecycle actions (no "Open appointment actions" row in this week's view): earlier specs in the same run had moved three of the five seeded appointments to completed, cancelled and no-show, and the two confirmed ones left fall on Sun 11-08 and Mon 11-09. The failing locator is an untouched `Button`. Strong inference, not yet re-run on a fresh DB
**Before/after screenshots:** Before `ui-refresh/evidence/r1-2/after/`; after `ui-refresh/evidence/r1-3/after/` (114)
**Outstanding problems:** See R1.3b. Real-device touch check still to do
**Next unit:** R1.3b

**Unit ID:** R1.3b
**Phase:** R1, R1.3 follow-ups (owner asked for the remaining impeccable passes, the outstanding items and landing screenshots)
**Screen(s) or components:** Dashboard BP chart, station results summary, portal appointment tags, `AppPageHeader`, landing role deck and phone frame
**Branch/commit/PR:** `ui-refresh/r1-1-tokens`, not committed
**Status:** In review
**Design changes:** Chart: `HYPERTENSION_TONES` Stage 1 `warning`, Stage 2 new `severe` tone with bar fill `--severe` (`20 85% 44%` light, 4.34:1 on card; `22 85% 62%` dark, 6.81:1); Normal and Elevated unchanged in the chart. Station results summary shows the BP stage as its severity tag (Crisis was plain text in the same amber box as Stage 1; critique P1). Four more pill tags stripped (`AppointmentStatusBadge`, `AppointmentRequestStatusBadge` in the portal; critique B found them). `AppPageHeader` gives badges their own wrapping row, so a tag no longer stretches into a full-width bar in the phone column (critique B, every page header). Landing: `CareTeamSection` deck shows each role's own dashboard (`public/dashboards/{volunteer,doctor,manager}.png`, 3840x2160, dark, labelled sidebar, synthetic demo clinic, new alt text); `public/mobile.png` is now the volunteer dashboard at 808x1744 with a new `PHONE_ALT`; `desktop.png` kept because ProductShowcase markers are measured from it
**Files changed:** `apps/web/app/globals.css`, `tailwind.config.js`, `components/dashboard/DistributionChart.tsx`, `lib/hypertension.ts` + test, `components/stations/StationResultsSummary.tsx`, `components/portal/{Appointments,Overview}PortalScreen.tsx`, `components/app-shell/AppPageHeader.tsx`, `components/landing/{CareTeamSection,ProductFrames}.tsx`, `public/dashboards/*.png`, `public/mobile.png`, `scripts/check-design-tokens.mjs` (bar pair), `MASTER.md` section 4, `ui-refresh/HANDOFF-R1.4.md`
**Desktop tested:** Route audit 1440 (all roles after the chart and portal fixes; staff and volunteer again after the header fix)
**Tablet tested:** Not separately
**Phone tested:** Route audit 390
**Dark mode:** Route audit axe in dark; `--severe` bar 6.81:1 on the dark card
**Keyboard and accessibility:** Skills run: impeccable critique (two isolated sub-agents: design review 16/24 Nielsen, detector 0 findings), polish and harden (applied as the fixes above), accessibility. Route audit 0 axe violations, 0 overflow
**Offline/sync regression:** N/A
**Tests executed and results:** `design:check-tokens` 38/38 and unit 4/4; `check-chart-palette` pass; tsc, ESLint, Prettier clean; jest 25/25; route audit 12/12 (228 rows); e2e `appointments` + `landing` 40/42; staff and volunteer route audit plus `shared-components`, `responsive-components`, `landing`, `accessibility` after the header change: route audit 8/8 (124 rows, 0 axe violations, 0 overflow), e2e 52/52. **Correction to R1.3:** the two `appointments` lifecycle failures are not consumed fixtures. A fresh seed creates the same five rows, and the specs still fail. Playwright reports that the fixed chat launcher (`chat-toggle`) intercepts the click: on a Sunday the only actionable row is the last one on the page and cannot scroll clear of it. Date-dependent test failure plus a real shell issue (no bottom space for the floating button), handed to R2
**Before/after screenshots:** Before `ui-refresh/evidence/r1-2/after/`; after `ui-refresh/evidence/r1-3/after/` (refreshed)
**Outstanding problems:** Owner decisions in HANDOFF-R1.4: "High glucose" filled destructive (critique P1), station setup kind tag placement (P2), whether Crisis should interrupt the flow. The seed never renders BP tags at 1440, so the A8 colours have no screenshot evidence
**Next unit:** R1.4 SegmentedControl + Tabs (`ui-refresh/HANDOFF-R1.4.md`)

**Unit ID:** R1.4
**Phase:** R1, SegmentedControl + Tabs
**Screen(s) or components:** `components/app-shell/SegmentedControl.tsx`, `components/ui/tabs.tsx`. The 9 SegmentedControl call sites and the 5 Tabs call sites inherit them. Two hand-rolled toggle groups moved onto SegmentedControl
**Branch/commit/PR:** `ui-refresh/r1-1-tokens`, not committed
**Status:** In review
**Design changes:** R0-AUDIT §2.3 had three looks for one job. Now there are two looks, each with its own job (master §5.3). SegmentedControl (view and filter) is the pilot `.seg`: a `--surface-2` track, a raised `--card` knob and the active label in `--primary`. It replaces the filled teal segment. Tabs (record sections) are the pilot `.tabs`: a rule, an ink active label and a 2px primary underline. They replace the filled teal tab, the bordered box (encounter) and the per-page underline overrides (patient chart, queues). Motion: the knob and the underline are each one shared Motion `layoutId` element (`layoutDependency` = value, so unrelated re-renders never slide them). Ease-in-out, 220ms knob, 200ms underline. The knob stretches to 1.12 on x mid-move. The active label colour is wiped in by `clip-path`, and the insets of options at rest sum to 100%, so an option the knob jumps over never flashes. Only the change a pointer press made animates. Keyboard presses, arrow keys, the first render and changes made elsewhere snap. `MotionConfig reducedMotion="user"` plus the global CSS clamp cover reduced motion. Tabs keep weight 500 in both states (the pilot goes to 600), so the active tab never widens. Tabs never wrap: `TabsList` brings its own `overflow-x-auto` `layoutScroll` wrapper, and the 4 call-site wrappers are gone. Four-option segmented controls sit 2x2 on a phone. Focus rings are inset on both, because the track and the scroll wrapper clip offsets. Trends "30/90/180 days" (outlined buttons) and the My assigned status filter (default/outline buttons) are now SegmentedControl. The encounter tab list gained the `aria-label` that sat on a role-less div. Gold as a selection colour: none left (grep of `gold` with active, selected, pressed or state finds only the comments saying so)
**Files changed:** `apps/web/components/app-shell/SegmentedControl.tsx`, `components/ui/tabs.tsx`, `components/patients/{PatientTrendsPanel,chart/PatientChartTabs}.tsx`, `app/(workspace)/{appointments,dashboard,queues,my/assigned}/page.tsx`, `app/(workspace)/encounters/[encounterId]/page.tsx`, `scripts/check-design-tokens.mjs` (new pair: `--primary` on `--card`), `docs/design-system/MASTER.md` §8
**Desktop tested:** Route audit 1440, every seeded role
**Tablet tested:** e2e `workspace-smoke` tablet project only
**Phone tested:** Route audit 390. Queue tabs are one scrolling row (`doctor-queues-390.png`)
**Dark mode:** Route audit axe in dark at both widths. `--primary` on `--card` 7.67:1 dark, 5.22:1 light. No dark screenshots in the evidence set
**Keyboard and accessibility:** Skills run: impeccable detector (9 changed files, 0 findings), impeccable critique (one isolated sub-agent, 17/24; P1 stretch never played because of `initial={false}` on a remounting knob, P2 clipped and white-offset focus rings, P2 wrapped queue tabs, P2 `layoutScroll`, P3 stale animate flag, P3 3+1 wrap; all fixed), polish (applied as those fixes). Not run as separate skills: web-design-guidelines and accessibility. Their checks were covered inline: contrast pairs, `aria-pressed` kept for segmented and Radix roles kept for tabs, the duplicate label copy `aria-hidden`, and route audit axe. Route audit: 0 axe violations on 228 rows, 0 overflow
**Offline/sync regression:** N/A, presentation only
**Tests executed and results:** `design:check-tokens` 40/40 and unit 4/4; `check-chart-palette` pass; tsc, ESLint, Prettier clean; jest 91 suites green, 2 workers (the test count read 1012, 1002, then 1012 again on unchanged code, so a suite's case count varies between runs; it is not from this unit); e2e `metrics`, `workspace-smoke`, `accessibility`, `medical-history`, `role-access`, `clinician-plan`, `shared-components`, `dark-mode`, `responsive-components`, `design-foundations`, `assigned-redesign`, `appointments`: 87/89 on `nkwapa_audit`. The 2 failures are the known `appointments` lifecycle specs: `chat-toggle` intercepts pointer events, the same error as R1.3b. Route audit 12/12 (228 rows)
**Before/after screenshots:** Before `ui-refresh/evidence/r1-3/after/`; after `ui-refresh/evidence/r1-4/after/` (114)
**Outstanding problems:** Not verified in a real browser by hand: the knob stretch, the mask wipe and the `layoutScroll` underline in a scrolled tab row (static shots cannot show motion). The knob always stretches on x, even when a wrapped control moves rows (code comment marks it as a shortcut). An unknown `value` shows no pressed option. Owner decisions carried over from HANDOFF-R1.4 are still open
**Next unit:** R1.5 (`ui-refresh/HANDOFF-R1.5.md`)

**Unit ID:** R1.4b
**Phase:** R1, owner decisions carried over from R1.3 (Decision Log 2026-11-08)
**Screen(s) or components:** Station setup rows; `VitalsForm` (station visit, new encounter, encounter Vitals tab); `ConfirmHost`
**Branch/commit/PR:** `ui-refresh/r1-1-tokens`, not committed
**Status:** In review
**Design changes:** (1) "High glucose" stays filled destructive. No change. (2) Station setup: the kind tag left the "Name" `<Label>`, whose accessible name used to be "Name Blood pressure". It now sits in the row's identity cluster (number, move buttons, kind). The first grid column is fixed at 19rem from `lg`, so every row's Name field starts at the same x. (3) Crisis interruption. After a vitals save succeeds, a reading that classifies `CRISIS` (180/120 or higher, existing classifier, unchanged) opens an alert dialog through the global `ConfirmHost`. The new `acknowledgeOnly` mode has `role="alertdialog"`, one button, and Escape or a click outside does nothing. The dialog says "This visit needs a clinician now", gives the reading and "The reading is saved", and has the button "I've told a clinician". It is awaited inside `handleSave`, so a parent's save-then-navigate (next station, tab switch, submit) waits for it. The reading is saved first and never held back. A ref of the last alerted reading stops repeat alerts on a re-save, or on reopening a visit whose crisis reading was already saved. Wording reuses the hypertension interview's existing "This visit needs a clinician now". Patient portal excluded (owner)
**Files changed:** `apps/web/app/(workspace)/stations/setup/page.tsx`, `components/VitalsForm.tsx`, `components/ui/confirm-dialog.tsx` + new `confirm-dialog.test.tsx`, `e2e/station-redesign.spec.js` (shared `openBloodPressureVisit` helper, new crisis test), `ui-refresh/TASK-crisis-acknowledgement.md`
**Desktop tested:** Route audit 1440 staff (setup)
**Tablet tested:** No
**Phone tested:** Route audit 390 staff (setup)
**Dark mode:** Route audit axe in dark
**Keyboard and accessibility:** The alert dialog takes focus on its only button. Escape does not dismiss it (it must be answered). axe on the open dialog: 0 violations (e2e). Setup page axe 0 in `station capacity (#32)`
**Offline/sync regression:** None. The save path is unchanged and the dialog runs after it. Not stored anywhere yet
**Tests executed and results:** tsc, ESLint, Prettier clean; jest 92 suites / 1013 tests (new: acknowledge-only host). e2e `station-redesign`, `station-workflow` (excluding the four #197 offline tests that fail locally on release/dev too), `clinician-plan`: 26/26, including the new "a crisis reading saves, then interrupts until a clinician is told". That test checks the reading is in the API before acknowledgement, one button, Escape ignored, axe on the dialog, and no second alert on re-save. `station capacity` 8/8 after the grid fix; staff route audit 7/7 (104 rows, 0 violations, 0 overflow)
**Before/after screenshots:** `ui-refresh/evidence/r1-4/after/staff-stations-setup-{1440,390}.png`. No screenshot of the dialog (e2e only)
**Outstanding problems:** Recording the acknowledgement needs an API endpoint and sync ordering. Spec in `ui-refresh/TASK-crisis-acknowledgement.md`, a separate backend branch, and its offline design is still open. The "no second alert" e2e check is weak: the same status text appears on both saves, so it can pass before a late dialog would open. Not checked: the encounter Vitals tab and new-encounter page in a browser (same component, covered by the station visit test only)
**Next unit:** R1.5 (`ui-refresh/HANDOFF-R1.5.md`)

**Unit ID:** R1.5
**Phase:** R1, shared components
**Screen(s) or components:** DropdownMenu and submenus, Select, Tooltip, direct Radix Popover in InfoHint; Combobox reviewed and deliberately kept instant
**Branch/commit/PR:** `ui-refresh/r1-1-tokens`; local commit `UI refresh R1.5: anchor overlay motion to triggers`. No push or new PR
**Status:** In review. Motion implemented and verified; open-overlay axe finding deferred
**Design changes:** Trigger-origin scale 0.95 and opacity, 200ms enter / 160ms exit with existing ease-out. Tooltips 150/120ms, explicit 300ms skip-delay window, instant-open skips the transition. Shared CSS transitions reverse from the current frame; a nonvisual animation holds Radix Presence through exits. Shared input tracking makes keyboard interactions immediate. Reduced motion keeps opacity only through a scoped exception to the global clamp. Select uses Radix sideOffset for the existing 4px gap, freeing transform for scale. Combobox stays instant because focus, typing and suggestion selection are frequent
**Files changed:** `apps/web/components/ui/{dropdown-menu,select,tooltip,info-hint}.tsx`, new `use-overlay-input.ts`, `app/globals.css`, `tailwind.config.js`, new `e2e/overlay-motion.spec.js`; `MASTER.md` motion contract, this tracker, `ui-refresh/R1.5-REVIEW.md` consumer inventory and ranked review; synthetic evidence under `ui-refresh/evidence/r1-5/`
**Desktop tested:** Chromium at 1440, both themes in route audit; actual menu/Select transitions sampled at intermediate frames, header and row action origins checked on enter and exit
**Tablet tested:** Open header menu, Select and help popover at 744 and 1024, light/dark. Bounds checks and captures completed; full-page open-menu axe findings remain below
**Phone tested:** Route harness at 390, light/dark; open overlays at 390, both themes; existing help collision check at 375. No physical device
**Dark mode:** All route families scanned; open-overlay captures at 390/744/1024. Existing semantic tokens retained
**Keyboard and accessibility:** Keyboard menu and Select open/close instantly and restore focus; tooltip scanning skips delay and motion, Escape removes both current and exiting tooltips. Help pseudo-target measured 44x44px. Dark help axe passes. All 228 route rows have zero serious/critical findings and zero overflow. Full-page axe with a menu or Select open reports aria-hidden-focus on background .px-safe in all six viewport scenarios. The finding persists with all motion disabled and menu focus active; pre-existing Radix semantics are a strong inference, not a tested old-build baseline
**Offline/sync regression:** No source changes to offline, synchronization, validation, permissions, clinical logic, API or database schema. Station workflow regressions passed; #197 offline tests excluded as instructed
**Tests executed and results:** Production build and standalone tsc passed; changed-file ESLint, Prettier and impeccable Node detector clean. Jest 92 suites / 1013 tests, max two workers. 58 distinct focused browser regressions passed, including six new motion tests; six route audit tests produced 228 clean rows. Six supplemental viewport tests completed geometry checks and screenshots but retain failing full-page axe assertions, with findings recorded rather than suppressed. Motion-disabled diagnostic reproduced the menu finding. Three existing shell navigation snapshots failed because the station flag intentionally substitutes Stations for My Assigned; five incompatible navigation scenarios were excluded from the remaining run, while account-menu/tooltip and station checks passed
**Critique and polish:** Impeccable, Animate and Shadcn guidance applied; plain Node impeccable detector ran. Per the non-Claude handoff, a written hierarchy, consistency, target, focus, motion, semantics, dark-mode and edge-case review substitutes for `/critique`, `/polish`, web-design-guidelines, accessibility commands and isolated-agent critique. Each P0-P3 item is fixed or explicitly deferred in `ui-refresh/R1.5-REVIEW.md`
**Before/after screenshots:** Before: `ui-refresh/evidence/r1-4/after/` (114). After: `ui-refresh/evidence/r1-5/after/` (114 route shots plus 18 open-overlay shots). Intermediate browser motion measurements in `motion-samples.json`; totals and limitations in `validation-summary.json`; route rows and open-overlay axe findings alongside them. Evidence remains local and git-ignored under the existing repository policy. Temporary viewport spec removed after capture
**Outstanding problems:** P1 open-overlay background aria-hidden-focus finding requires a dedicated focus-management review before release; changing Radix modal behavior was deferred from this motion unit. Existing short dropdown rows remain below the design's 44px target, deferred to density work. Shell navigation snapshots need station-flag-aware expectations. Non-Chromium and physical-device checks remain open. R1.4 motion and crisis-dialog gaps in HANDOFF-R1.5 remain unchanged
**Next unit:** R1.6, DataTable header and row surfaces plus the narrow-width card-render slot. Clean-session instructions: `ui-refresh/HANDOFF-R1.6.md`

**Unit ID:** R1.6
**Phase:** R1, shared table surfaces and available-width cards
**Screen(s) or components:** Shared `DataTable`; patient registry and staff invitation card presentations; all existing table consumers
**Branch/commit/PR:** `ui-refresh/r1-1-tokens`; this unit's local commit; no push or PR
**Status:** In review
**Design changes:** Layered `--card` table body, sticky `--surface-2` header, quiet `--border` edges/dividers, and legible hover/focus-within rows replace the old strong top rule. Existing `renderMobileRow` uses a named CSS inline-size container: cards below 60rem, table from 60rem. The threshold reserves room for patient identifiers/contact fields and record actions and works in a narrow panel inside a wide viewport. Cards expose the same sorting controls and accessible direction; filters and pagination stay shared. One TanStack instance, one row model and unchanged state/action handlers. Both presentations share the empty fallback and non-shifting refresh indicator. No row arrival motion. Without cards or container-query support, retain the complete scrollable table.
**Files changed:** `apps/web/components/ui/data-table.tsx`, `apps/web/app/globals.css`, new `apps/web/e2e/component-fixtures/DataTableSurfaces.tsx`, new `apps/web/e2e/data-table-surfaces.spec.js`, `docs/design-system/MASTER.md`, this tracker, and `ui-refresh/R1.6-REVIEW.md`. No production consumer implementation changes were needed. Temporary authenticated consumer evidence spec removed after capture.
**Desktop tested:** New shared fixture at 1440px; 560px local panel in a 1440px viewport; actual patient/invitation consumers at 1440px and in the 560px panel. Existing responsive specs also exercise 1280px. Both 959px and 960px content widths tested via 991/992px viewports.
**Tablet tested:** New fixture and actual consumers at 744/1024px; existing responsive component checks at 768/1024px. CSS chooses by local width, independent of shell mode.
**Phone tested:** New fixture, actual consumers and responsive/offline checks at 390px. Fallback tables remain horizontally scrollable by keyboard.
**Dark mode:** New fixture and actual-consumer checks in both themes, including intermediate widths and narrow panels. Synthetic screenshots visually inspected against the R1.5 baseline and approved pilot surface rules.
**Keyboard and accessibility:** New checks verify active-presentation-only role visibility, shared action identity with Enter, sorting/reset and state across resize, scroll-region focus and ArrowRight scrolling, sticky headers, numeric alignment, disabled pagination, 44px controls and 52px coarse-pointer cells. New fixture axe scans pass. Sixteen closed actual-consumer component scans and 20 bounds checks pass. Four open Rows per page Select scenarios **fail** their retained full-page axe assertions: `aria-hidden-focus` (serious), `page-has-heading-one` and `region` (moderate), in both themes on both consumers. Per-case diagnostics retained. No axe exclusions or Radix modal/focus changes.
**Offline/sync regression:** Existing responsive/offline cases pass, including uncached offline reads, failed reads and staff-role detail errors. No offline implementation changed.
**Tests executed and results:** Production build (3GB Node heap, audit flags) and standalone `npm run typecheck --workspace=@nkwapa/web` pass. Sandboxed Turbopack stalled at compilation and was interrupted; approved build outside the sandbox completed. Changed-file ESLint (`--max-warnings 0`), Prettier and legacy-path Impeccable detector pass with no findings. Jest `--maxWorkers=2`: **92 suites / 1013 tests pass**. One focused Playwright invocation: `data-table-surfaces`, `shared-components`, `responsive-components`, `responsive-offline`, `responsive-migration`, `patient-redesign`, `patient-registry-screened`, `staff-invite`, one worker and max three failures: **135 passed / 1 failed**, including six authentication setups, so **129 distinct browser checks passed / 1 failed**. All seven new DataTable cases pass. The sole failure is the unchanged `/today` migration heading expectation: "Today Board" versus flag-enabled "Station line". Its isolated recheck reproduces the failure; the flag-aware `/today` responsive/offline case passes. This is a confirmed flag/assertion mismatch, not an observed DataTable regression. Initial new-spec assertions were corrected for accessible-name whitespace and the existing reduced-motion duration clamp, then all seven passed. Actual-consumer supplement: four scenarios complete bounds, sorting, screenshots and closed-state scans but each fails its open-Select full-page assertion; not counted as green. A repeat retained separate JSON per worker/case after the first capture overwrote the aggregate file. Six-role route harness (`WEB_DIR`, isolated audit DB, `EVIDENCE_DIR`, `SHOTS_DIR`, one worker): **12/12 tests pass; 228 route/theme/width rows; zero errors, serious/critical or minor axe findings, and zero horizontal overflow**. This normal-state result does not clear the open-Select failures.
**Before/after screenshots:** Baseline `ui-refresh/evidence/r1-5/after/` (the local staff registry baseline was inspected); after `ui-refresh/evidence/r1-6/after/`: **168 synthetic PNGs**, consisting of 114 route shots, 30 shared component/table shots and 24 actual-consumer shots. Beside `after/`: `route-audit.json`, `validation-summary.json` and filtered diagnostic logs. Consumer per-case open-Select axe JSON is under `after/consumers/`. All evidence remains local and git-ignored; nothing force-added.
**Ranked review:** Full hierarchy, consistency, touch-target, focus, motion, accessibility, dark-mode and edge-case review in `ui-refresh/R1.6-REVIEW.md`. P0 none found. P1 open-overlay focus/background semantics deferred to the dedicated release review. P2 fixed: hidden card sorting, viewport-based adaptation, missing empty fallback and card refresh. P2 deferred: existing short menu rows, real-device/non-Chromium verification. P3 retained: R2 shell clearance and flag-aware expectations, earlier R1.4/crisis gaps. Skills used: Impeccable adapt/craft floor/context and detector, shadcn guidance; no independent reviewer or isolated-agent critique was run.
**Outstanding problems:** The open Select findings above remain a release concern. No old-build comparison of those findings ran, so attribution to unchanged Radix modal semantics remains a strong inference from R1.5 investigation, not a new baseline comparison. Physical devices, Safari/Firefox and old-browser fallback execution remain unverified. Shell heading/navigation expectations need flag-aware R2 follow-up; no product heading/navigation was changed to satisfy them. Other HANDOFF-R1.6 exclusions remain unchanged.
**Next unit:** R2, adaptive app shell, beginning with R2.1 sidebar/rail; use R0-AUDIT section 9 and NKWAPA-UI-REFRESH-MASTER sections 6 and 12. Preserve R1.5 overlay motion, this DataTable contract, and the open findings above. Clean-session instructions: `ui-refresh/HANDOFF-R2.1.md`.

## 2026-11-08 — R2.1 sidebar and labelled tablet rail

**Unit ID:** R2.1

**Phase:** R2, adaptive app shell

**Screen(s) or components:** Sidebar, AppNavList, AppLayout and necessary Header breakpoint integration

**Branch/commit/PR:** `ui-refresh/r1-1-tokens`; local unit commit, no push or PR

**Status:** In review, not an unconditional release/accessibility sign-off

**Design changes:** Approved-pilot geometry: 232px expanded / 64px collapsed from 1200px; a distinct 76px labelled rail from 600 to 1199px. Earlier R0 prose says 248/88px and elsewhere 76px desktop collapse; those conflict with the shipped pilot and round-3 feedback. Use 232/76/64 as the implementation baseline, without inventing a new owner approval. Tablet labels use the pilot's 11.5px role in rem, wrapping real navigation names with 74px available and inset focus. Current state uses selected/primary tokens; inactive labels use muted ink and surface-2 hover. Native disabled clinic controls retain readable ink. Desktop defaults expanded; guarded storage preserves either preference through compact modes and reload. Header toggle and `[` work only from 1200px, with instant keyboard changes, guarded editable/modifier handling, 200ms interruptible pointer width motion and reduced-motion handling. Collapsed navigation uses the shared R1.5 Tooltip with a configured 300ms first hover delay. One card-token workspace sheet is inset 8px from 600px, with 12px corners and quiet borders; document/main scroll ownership and existing shell services remain. Staff Message delivery is exposed from 600px so the phone-trigger breakpoint cannot conceal it at 600–767px. Phone sheet remains below 600px and closes through its existing lifecycle when resizing into persistent navigation. Main bottom clearance is 6rem plus the safe area, narrowly covering a final action above chat. No R2.2 BottomNav or wider Header/Sheet/Portal redesign.

**Files changed:** `apps/web/components/{Sidebar,AppLayout,Header}.tsx`, `components/app-shell/AppNavList.tsx`; `lib/app-nav.test.ts`; `e2e/{shell-navigation,responsive-migration}.spec.js`, new `e2e/{shell-responsive,shell-consumers}.spec.js`; `MASTER.md`, this tracker, `ui-refresh/R2.1-REVIEW.md`. The existing uncommitted R2.1 handoff and tracker link are preserved.

**Desktop tested:** Fresh preference and stored true/false; 1199/1200 and 1440; expanded/collapsed, reload, first eight mount frames, unavailable localStorage, interrupted pointer width transition, repeated keyboard collapse, modifier/editable guards.

**Tablet tested:** 600, 744, 767, 768, 1024 and 1199; visible labels, complete-word width and text bounds, 44px target floors, last destination at 640px viewport height, desktop round trips, root text scaling. Patient/invitation layouts retain state when shell space crosses the 60rem card threshold.

**Phone tested:** 390 and 599; all five staff-role destinations and account utilities remain in the existing sheet; no-clinic disabled controls and resizing an open sheet into the rail.

**Dark mode:** Both themes in shell boundaries and actual-consumer supplements; route audit result below.

**Keyboard and accessibility:** Skip-to-main focus, Enter navigation, nested active-route identity, visible focus, current state, disabled clinic destinations, tooltip scanning/cleanup, reduced motion and guard behavior. Existing accessibility/overlay specs passed in the main run. Their documented exclusions do not establish that the known full-page open-overlay findings are cleared.

**Offline/sync regression:** Main focused run passed responsive/offline route inventory, loaded/offline/error-state checks and both-theme sync/table fixtures. No sync implementation changed.

**Tests executed and results:** Production audit-flag builds pass, including the final source state; the initial sandboxed Turbopack attempt stalled and was interrupted, then the approved outside-sandbox build passed. Standalone TypeScript, changed-file ESLint (`--max-warnings 0`), Prettier, whitespace checks and the legacy-path Node detector pass (silent detector exit 0). ESLint emits the existing root-cwd pages-directory advisory; no lint error or warning-count failure. Jest `--maxWorkers=2`: **92 suites / 1015 tests passed**, including independent nav checks for both station flag modes. Main 14-spec Playwright invocation, one worker/max three failures: **194 passed**, including six authentication setups (**188 browser checks**). All five role snapshots pass with independent flag-on/off expected sets; `/today` migration now expects Station line only when its flag is enabled. A consumer supplement was interrupted on an incorrect View locator for cards (existing label View record), then **8/8 browser cases passed** with current stored auth, including two repeated boundary captures and six new consumer/no-clinic/mount cases. Two strengthened invitation sort/page/action assertions also passed in an isolated rerun. Screenshot review and a complete-word-width assertion caught Appointments splitting; two intermediate final-focused runs each had **44 passed / 2 failed**, one boundary failure per theme. A temporary read-only font measurement found Appointments 73.12px at 11.5px; the final rail gives labels 74px and keeps the assertion. The temporary measurement spec was removed. **Final source-state focused rerun: 46/46 passed**, including six authentication setups (**40 browser checks**): shell-navigation, shell-responsive, shell-consumers, overlay-motion and data-table-surfaces. Six-role normal route audit: **12/12 tests passed**, including six authentication setups and six role sweeps; **228 route/theme/width rows**, **zero errors, serious/critical or other axe violations, and zero horizontal overflow**. These are normal-state results and do not clear the known open-overlay findings. No full e2e suite or flag-off browser build ran.

**Before/after screenshots:** Baseline `ui-refresh/evidence/r1-6/after/` exists; synthetic staff dashboard baseline inspected. After `ui-refresh/evidence/r2-1/after/`, **179 synthetic PNGs**: 114 normal route shots, 39 shell/consumer boundary and focus shots, 26 shared table/component shots. Beside `after/`: `route-audit.json`, `validation-summary.json`, and filtered diagnostic logs plus rendered navigation font measurements in `diagnostics/`. Evidence remains local and git-ignored. No real/third-party references were used or force-added.

**Ranked review:** `ui-refresh/R2.1-REVIEW.md`, covering P0–P3 hierarchy, consistency, touch, focus, motion, accessibility, dark mode and edge cases. Skills: Impeccable context/adapt/craft floor/detector and installed shadcn guidance. No isolated-agent critique.

**Outstanding problems:** P1 full-page open-overlay focus/background findings remain unresolved; modal/focus-trap semantics and axe exclusions were not changed. Existing short dropdown action rows, physical devices, Safari/Firefox, installed-PWA and manual screen-reader/motion checks remain open. The final-action sentinel proves only shell-end clearance; other interception paths and Sunday appointment lifecycle failures are not declared fixed. Earlier R1.4/Vitals/Crisis/backend acknowledgement and handoff exclusions remain.

**Next unit:** R2.2 BottomNav + More, derived from existing accessible navigation helpers. R2.3 Header/sync, R2.4 draggable Sheet and R2.5 Portal shell remain unbuilt.

## R2.2: phone BottomNav and More (2026-11-08)

**Branch/commit/PR:** `ui-refresh/r1-1-tokens`; local unit commit, no push or PR.

**Status:** In review, not an unconditional release/accessibility sign-off.

**Owner direction:** “Ignore all learning guardrails.” Follow the live Claude artifact and references closely, and use skills to avoid generic generated UI. The linked artifact was inspected directly in its browser iframe, along with the checked-in pilot and proposed tablet concept. Live artifact collapse at 1440px measured labels at 1px/absolute; production checks confirm every collapsed desktop label is visually hidden. The visible 600–1199px tablet labels are intentional in both the pilot and production. No Sidebar source correction was necessary.

**Design changes:** A persistent phone bar below 600px uses the pilot's 60px row floor, 11.5px labels, teal current state and one moving 2px top indicator. `getMobileNavigation` partitions existing authorized destinations by R0-AUDIT section 5 priority, taking up to four plus More. Existing labels, clinic-aware hrefs, role/feature gates, remaining groups and header/profile utilities are preserved. More reuses the shared Radix Sheet with a titled header and scrolling 85dvh body. It retains account/settings and existing sync access; route/history and crossing 600px close it, with focus returned to More or main as appropriate. A small brand mark replaces the staff hamburger. Chat clears the bar and its panel height accounts for the additional space. Main has 10rem plus safe-area phone clearance and 6rem otherwise. A stronger keyboard test found missing focus after sync closed; `SyncCenterSheet` now remembers the actual entry point and restores focus there, or main if it is gone/hidden. Queue behavior and modal focus-trap semantics remain unchanged. Portal shell, Header/sync redesign and draggable sheets remain R2.5/R2.3/R2.4.

**Files changed:** `components/app-shell/BottomNav.tsx`, `lib/mobile-nav.ts` and its unit tests, `components/{AppLayout,Header}.tsx`, `components/chat/ChatWidget.tsx`, `components/sync/SyncCenterSheet.tsx`, new `e2e/bottom-navigation.spec.js`, adapted `e2e/{shell-navigation,shell-responsive,shell-consumers}.spec.js`, MASTER, this tracker, `ui-refresh/R2.2-REVIEW.md` and `ui-refresh/HANDOFF-R2.3.md`.

**Desktop/tablet tested:** Retained fresh/stored preferences, 232/64px desktop, labelled 76px tablet, boundary widths, tooltip keyboard/scanning, no-clinic controls, short nav heights, current routes and width-driven table state. A dedicated regression checks collapsed label positioning/width and then visible tablet labels.

**Phone tested:** 320/390/599 and transition at 600px; primary targets at least 44px wide and 60px high, no horizontal overflow, More scroll access to final actions, focus containment, Escape return, route/history closure, sync handoff and close-focus from both entry points, reduced motion and root text scaling. Chat launcher/panel bounds and an actual click on a synthetic shell-end final action are covered. Existing five-role inventory tests now compare the union of primary and remaining destinations, retaining independent expected sets for both flag modes.

**Dark mode and accessibility:** Light/dark bar, More, boundaries and desktop states inspected. Two unfiltered full-page open-More axe scans report zero violations, with JSON retained. No axe rule was disabled or subtree excluded for these scans. This does not clear the prior Select/menu P1 findings. The existing accessibility suite retains its documented limitations.

**Offline/sync regression:** Existing responsive/offline states and sync/table fixtures are retained. No provider, queue, retry, clinical save or permission behavior changed; the sync-sheet change is limited to open/close focus restoration.

**Tests executed and results:** Production audit-flag builds passed, including the focus-correction source state. The initial sandboxed Turbopack attempt stalled and was interrupted; approved outside-sandbox builds passed. Standalone TypeScript passed after correcting missing required fields in the synthetic unit-test bootstrap. Changed-file ESLint, formatting, whitespace and the detector passed. Jest with `--maxWorkers=2`: **93 suites / 1019 tests passed**, including independent station flag-on/off nav partition checks. The initial 16-spec Playwright run stopped at three failures: **168 passed / 3 failed / 33 not run**, with one additional runner-level stop summary. All three were a test-order error querying the background Primary landmark after opening a modal, when it is correctly hidden from assistive technology. The assertion moved before opening More. The follow-up completed **47 passed / 1 failed**; its strengthened sync-close focus assertion caught a real missing return target, which was corrected. The final-source focused run passed **65/65 tests**, including six authentication setups and **59 browser checks**, covering accessibility, BottomNav, More/sync focus from both entry points, overlay motion, responsive components, authenticated table consumers, all five staff role inventories and shell boundaries. Six-role normal route audit: **12/12 tests passed**, including six authentication setups and six role sweeps; **228 route/theme/width rows**, with **zero errors, zero axe violations and zero horizontal overflow**. These normal-state results do not clear earlier open-Select/menu findings. No full e2e suite or flag-off browser build ran.

**Evidence:** **166 synthetic PNGs** in ignored `ui-refresh/evidence/r2-2/after/`: 114 normal-route images and 52 shell/consumer boundary, focus and navigation images. Unfiltered More axe JSON is retained alongside them; reference captures and filtered logs are in `diagnostics/`, with `route-audit.json` and `validation-summary.json` beside `after/`. The R2.1 after directory is the before baseline. Live artifact, proposed tablet concept, phone light/dark, open/scrolled More and icons-only desktop screenshots were inspected. No real-patient or third-party reference directories were used or force-added.

**Ranked review:** `ui-refresh/R2.2-REVIEW.md`. Impeccable adaptation/craft/detector and existing shadcn composition guidance; the reference-first discipline also preserves the incumbent visual world. No isolated-agent critique ran.

**Outstanding problems:** Prior P1 open-Select/menu focus/background findings, short dropdown rows, physical-device/PWA/non-Chromium/screen-reader/manual-motion checks remain. Synthetic shell-end clearance is not evidence that every route action or Sunday appointment lifecycle issue is fixed. Earlier R1.4/Vitals/Crisis/backend acknowledgement and scope exclusions remain.

**Next unit:** R2.3 compact Header and sync icon presentation. Self-contained continuation guidance is in `ui-refresh/HANDOFF-R2.3.md`, with links to the established isolated-audit recipes.

## R2.3: compact Header and sync presentation (2026-11-08)

**Unit ID:** R2.3

**Phase:** R2 adaptive app shell

**Branch:** `ui-refresh/r1-1-tokens`, local commit only; no push.

**Status:** Complete within the validation boundaries below.

**Screen(s) or components:** Staff Header and shared sync pill; existing clinic picker, account utilities, Sync now and sync-center integration.

**Design changes:** Staff clinic and role now form two independently truncated lines at every width, with full existing context in the accessible name. Explicit selected text keeps wrapping Select options from expanding the phone bar. Phone pixel gutters, a minimum context width and wrapping actions preserve visible clinic/role text with enlarged fonts. The sync pill precedes Message delivery and account actions, with quiet semantic status surfaces inside 44px minimum targets. Its phone width is 6.75rem (108px normally, capped at 180px when enlarged), reserving 192px from 600px. Short phone labels and capped visual counts retain complete accessible status. The existing seven-state priority, clinic/owner counts, recovery access and actions remain. Persistent decorative icons crossfade with 150ms shared ease-out; text updates immediately, transitions reverse from the current frame and reduced motion removes movement/spinner rotation under the shared clamp. No new libraries, routes, permission filters, backend, database, clinical or sync behavior.

**Files changed:** `components/Header.tsx`, `components/sync/SyncStatusBar.tsx`; new `e2e/header-sync.spec.js`, `e2e/component-fixtures/{SyncPill,SyncPillState}.tsx`; MASTER, this tracker, `ui-refresh/R2.3-REVIEW.md` and `ui-refresh/HANDOFF-R2.4.md`.

**Desktop/tablet tested:** Eleven widths through 1440px, long clinic/role context, existing 232/64px desktop and labelled 76px rail, truthful collapse state/preferences, Message delivery and Sync now from 600px, role inventories and mounted table state. Both station modes retain independent Jest nav expectations; no flag-off browser build is claimed.

**Phone tested:** 320/390/599, transition at 600px, 44px targets, single-line clinic text, visible context and status at 200% root text, no clinic, clinic-switch success/refusal feedback, account keyboard actions, More/route/history lifecycle and sync handoff/close focus. Root-font tests are bounded automation, not physical-device or browser-zoom validation.

**Dark mode and accessibility:** Both themes, all seven states at all eleven widths, exact accessible names, stable adjacent control positions, final icon visibility, interrupted transitions, reduced-motion styles/spinner, keyboard sheet access and refresh wiring. Fourteen state-scoped axe scans, two closed-Header full-page scans and the two existing open-More full-page scans are clean. No rule exclusions or modal semantics changed; prior open-Select/menu findings remain open.

**Offline/sync regression:** Real conflict recovery, offline patient-edit replay, owner/other-clinic queues, retry/idempotency and responsive/offline routes were exercised. The isolated pill fixture uses valid synthetic rows/provider state and a stub pass-event subscription; production queue/state selection, markup and sheet remain in the bundle. It never writes a real outbox.

**Tests executed and results:** Final audit-flag build, standalone TypeScript, changed-file ESLint/Prettier, whitespace and detector checks passed. ESLint retains the existing repository-root Pages-directory notice while exiting successfully. Jest with two workers: **93 suites / 1019 tests passed**. Final-source 70-case focused run: **68 passed / 2 failed**, including six auth setups; the two pill cases had an obsolete `0s` assertion against the existing `0.01ms` reduced-motion clamp. Corrected Header/sync recheck: **6/6 passed** without rerunning auth setup. Thus **64 distinct browser cases** have passing final-source evidence across these runs; this is not a single 70/70 run. Earlier runs: initial **28 passed / 3 failed / 175 not run** (42px enlarged-text clinic target in both themes and duplicate toast locator), broad candidate **204 passed / 1 failed / 1 not run** (fixture transport import reached `node:crypto`), intermediate focused **68 passed / 2 failed** (incomplete synthetic queue rows). Corrections and retained diagnostics are detailed in R2.3-REVIEW. No full e2e suite ran.

**Route audit:** The six-role normal-route audit passed **12/12 tests** (six authentication setups and six role sweeps), producing **228 route/theme/width rows**, with **zero errors, zero axe violations including minor findings, and zero horizontal overflow**. Normal-route scans do not clear open-overlay findings.

**Evidence:** **232 synthetic PNGs** in ignored `ui-refresh/evidence/r2-3/after/`: 114 normal-route light-theme images, 66 Header/sync images and 52 shell/consumer images. Header/sync and shell supplements include both themes. Sixteen Header/pill axe JSON files and two open-More JSON files are clean. `route-audit.json`, `validation-summary.json` and retained failure/correction logs are beside/under the evidence directory. R2.2 images are the before baseline. No real-patient or third-party reference folders were used, and evidence remains untracked.

**Ranked review:** `ui-refresh/R2.3-REVIEW.md`. Impeccable adaptation/craft/detector, shadcn composition, animate, accessibility and current Web Interface Guidelines consulted; approved sentence case and tiny icon blur retained. No separate agent review ran.

**Outstanding problems:** Prior P1 open-Select/menu background accessibility findings and short dropdown rows remain. Physical devices, installed PWA, non-Chromium, screen readers, virtual keyboard/safe-area behavior and subjective motion checks remain manual. Earlier R1.4/Vitals/Crisis/backend acknowledgement work, Sunday appointment lifecycle findings and prior scope exclusions remain separate.

**Next unit:** R2.4 draggable Sheet, no tween while held and rubber band, using `ui-refresh/HANDOFF-R2.4.md`. R2.5 Portal shell and R3 content remain unbuilt.

## Required Entry for Every Completed Unit

**Unit ID:**  
**Phase:**  
**Screen(s) or components:**  
**Branch/commit/PR:**  
**Status:**  
**Design changes:**  
**Files changed:**  
**Desktop tested:**  
**Tablet tested:**  
**Phone tested:**  
**Dark mode:**  
**Keyboard and accessibility:**  
**Offline/sync regression:**  
**Tests executed and results:**  
**Before/after screenshots:**  
**Outstanding problems:**  
**Next unit:**

## Guardrail Verification

For every unit, confirm:

- [ ] No backend API changes
- [ ] No database or migration changes
- [ ] No RBAC changes
- [ ] No clinical logic or validation changes
- [ ] No offline or synchronization behavior changes
- [ ] No unsupported feature claims
- [ ] No production patient data in evidence
- [ ] Existing workflows remain operational

## Decision Log

| Date       | Decision                                                                                                                                         | Reason                                                                                                      | Impact                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 2026-11-07 | Replace Ruled Chart visual direction with Layered Clinical Workspace                                                                             | Improve visual separation, discoverability, and interaction clarity                                         | Frontend presentation only                                       |
| 2026-11-07 | Build a distinct adaptive mobile PWA interface                                                                                                   | Provide a mobile-app-like experience across smaller viewports                                               | Frontend shell and responsive components                         |
| 2026-11-07 | Track work in repository Markdown rather than new GitHub issues                                                                                  | Reduce issue-management overhead while retaining traceability                                               | Project workflow                                                 |
| 2026-11-07 | Adopt the hybrid concepts in `03-PROPOSED-DIRECTION/` as the primary visual direction; all agents consult the three screenshot folders first     | Owner direction                                                                                             | Master spec section 2A                                           |
| 2026-11-07 | Shell modes by width: bottom nav under 600px, labelled rail 600 to 1199px, sidebar from 1200px; bottom nav derived from `getAccessibleNavItems`  | Concepts plus master section 6; no permission change                                                        | R2                                                               |
| 2026-11-07 | Adopt the owner's 20 motion principles plus 7 added in R0                                                                                        | Owner direction; mapping in R0-AUDIT section 6                                                              | R1, R2, R7                                                       |
| 2026-11-07 | Keep `--primary`; proposed `#00778A` matches it within rounding                                                                                  | Measured                                                                                                    | R1.1 is a surface and canvas change, not an action-colour change |
| 2026-11-07 | D1: move reference screenshots out of `public/`; git-ignore 01 (real patient data) and 02 (third-party product)                                  | Privacy; `public/` is deployed                                                                              | References in `ui-refresh/references/`                           |
| 2026-11-07 | D2: dashboard runs the existing shift action, labelled "Start shift"                                                                             | Owner                                                                                                       | R3.1                                                             |
| 2026-11-07 | D3: no nav count badges                                                                                                                          | Avoids a request on every page                                                                              | R2                                                               |
| 2026-11-07 | D4: owned SVG or licensed Lottie, play once, static under reduced motion                                                                         | Owner; master section 9 bans looping decoration                                                             | R3.1                                                             |
| 2026-11-07 | Synthetic "before" set: 102 light-theme shots, 5 roles, 1440 and 390, in `ui-refresh/evidence/r0/before/`                                        | Route audit harness (`SHOTS_DIR`) on a throwaway seeded DB; 204 checks, 0 errors, 0 serious axe, 0 overflow | Replaces `01-current-ui/` as the citable before set              |
| 2026-11-07 | Pilot passes Web Interface Guidelines review and axe (WCAG 2.2 AA) on 7 views x 3 widths x 2 themes                                              | `web-design-guidelines` and `accessibility` skills; Title Case rule declined (master uses sentence case)    | Re-run both on every R1 to R3 unit                               |
| 2026-11-07 | Motion rule 18 confirmed as blur                                                                                                                 | Owner                                                                                                       | Master 9.1                                                       |
| 2026-11-07 | Greeting and icon follow the device clock (morning, afternoon, evening, night); drawn SVG sun and moon replace the glyph                         | Owner                                                                                                       | R3.1 dashboard header                                            |
| 2026-11-07 | Undo toasts replace confirmations for reversible actions; swipe gestures always keep a button alternative                                        | Owner, WCAG 2.5.7                                                                                           | R2 toast primitive, R3 patient list                              |
| 2026-11-07 | D4 asset: `Hello.json` for the dashboard band, `checklist.json` for the shift confirmation; three others rejected                                | Recolourable line art, size budget (R0-AUDIT 8.1)                                                           | Licences to confirm before R3.1                                  |
| 2026-11-07 | Pilot v2 direction: one sheet with no card stacks, radii 4 to 12 px, "The line" station route, queue ticket, BP readout, Plex Mono for codes     | Owner rejected v1 as generic (R0-AUDIT 8.2)                                                                 | R1.1 radius and font tokens                                      |
| 2026-11-07 | D5: IBM Plex Sans across the workspace; Source Serif 4 for public and auth brand moments                                                         | Concepts; fixes mixed families in tables                                                                    | R1                                                               |
| 2026-11-07 | D6: named screens 600 / 840 / 1200 beside Tailwind defaults                                                                                      | Lets shells migrate without breaking `md:`/`lg:`                                                            | R1.1                                                             |
| 2026-11-07 | D7: keep `app-nav.ts` labels                                                                                                                     | Owner                                                                                                       | R2                                                               |
| 2026-11-07 | D8: palette built only from the logo teal and gold, neutrals tinted to hue 188, derived mint, gold tint and deep teal                            | Owner: stay on brand                                                                                        | R1.1                                                             |
| 2026-11-08 | "High glucose" in the queue stays a filled destructive tag, the same weight as BP Crisis                                                         | Owner (R1.3 critique P1)                                                                                    | No change                                                        |
| 2026-11-08 | Station setup kind tag moves out of the "Name" label into the row's identity cluster now, not in R3.2                                            | Owner (R1.3 critique P2)                                                                                    | R1.4b                                                            |
| 2026-11-08 | A Crisis BP reading interrupts staff vitals entry: the reading saves, then an alert dialog must be acknowledged; the acknowledgement is recorded | Owner. Patient portal excluded until a clinician writes the patient-facing wording                          | R1.4b (dialog); recording is a separate backend task             |

## Rules

1. Update the tracker after each independently testable implementation unit.
2. Never mark a task complete without validation evidence.
3. Use actual screenshots, commits, and test results.
4. Record blockers explicitly rather than silently expanding scope.
5. Preserve previous design documentation as historical context.
6. Do not restart completed work simply because a new agent takes over.
7. Keep the next implementation task clearly documented for handoff.

## R2.4: draggable Sheet (2026-11-08)

**Unit ID:** R2.4

**Phase:** R2 adaptive app shell

**Branch:** `ui-refresh/r1-1-tokens`, local commit only; no push.

**Status:** Complete within the validation boundaries below.

**Screen(s) or components:** Shared Radix Sheet and all six call sites: Header navigation, public menu, More, sync, duplicate comparison and staff access. All four edges have primitive coverage; top has no production consumer and the existing portal Header left menu remains dormant pending R2.5.

**Design changes:** A separate handle, 64 by 44px at default text size, closes by click/keyboard or drags outward along the configured edge. Only the handle owns capture and touch panning, leaving bodies and controls scrollable. Held displacement follows the pointer directly with no tween; inward movement meets rubber-band resistance. Distance/flick release dismisses through the existing Radix close control; reversal/cancellation restores through an interruptible physical spring carrying velocity. Reduced motion removes the release spring. Capture loss, resize, blur, visibility, history, pathname changes, external close and unmount have explicit cleanup. Movement in either axis suppresses a trailing click, avoiding accidental cross-axis dismissal. Default focus return remembers the opener or falls back to main, including triggerless/replaced-trigger panels. Custom More/sync focus callbacks retain precedence; no modal/focus-trap override, clinical save, queue action, permission, provider or backend change.

**Files changed:** `components/ui/sheet.tsx`, new `components/ui/use-sheet-drag.ts`, new `e2e/component-fixtures/DraggableSheet.tsx`, `e2e/sheet-drag.spec.js`, `e2e/sheet-consumers.spec.js`; MASTER, this tracker, `ui-refresh/R2.4-REVIEW.md` and `ui-refresh/HANDOFF-R2.5.md`.

**Desktop/tablet and phone tested:** Bottom/right primitives at 320/390/599/600/744/767/768/1024/1199/1200/1440 in both themes. All four edges exercise tracking, resistance, reversal, cancellation, dismissal and return focus. Long bodies scroll to final actions; 320px bottom presentation covers 200% root text. Tests cover held Escape, lost capture, regrab, resize reset, history, repeated opening, reduced motion, Chromium touch/secondary-pointer exclusion, short outward flick and 12px/90px cross-axis drags. Actual More/sync, comparison, staff access and public-menu drag flows pass in both themes. Patient portal eligibility/navigation remains unchanged; no dormant left-menu flow is claimed as live.

**Dark mode and accessibility:** Both themes, 44px target floors, preserved title/description and Radix focus containment, click/keyboard alternatives, More-to-sync sequencing, actual entry-point return and replaced-trigger main focus. Four new open-fixture full-page axe assertions and two actual open-More scans are clean. Existing Header/sync, public keyboard/reduced-motion and shared recovery checks pass. These scopes do not clear earlier open-Select/menu findings.

**Tests executed and results:** Final audit-flag build, standalone TypeScript, changed-file ESLint/Prettier, whitespace and detector checks passed. ESLint retains its existing root Pages-directory configuration notice while exiting successfully. Jest with two workers: **93 suites / 1019 tests passed**. Final-source focused selection: **77/77 passed**, including six auth setups and **71 distinct browser checks**, after the focus and cross-axis fixes. Existing patient/invitation table-state, real sync conflict recovery and once-only offline replay checks pass. No full e2e suite or flag-off browser build is claimed.

**Correction history:** Intermediate failures exposed both spec mistakes and real source bugs. Chromium zero-translation serialization, an accidental flick in the settle setup, an ineligible patient-sync assumption and asynchronous resize delivery were corrected in specs. A strengthened disconnected-trigger check found the body-to-main focus fallback bug, fixed in the primitive. A 75/75 candidate still missed cross-axis click dismissal; stronger open-state assertions failed both added cases and the source now counts movement across either axis. Exact candidate counts, interruptions and retained logs are in R2.4-REVIEW. The final 77/77 is a single green run, not combined candidate coverage. Production queue/clinical logic and modal semantics were not weakened.

**Route audit:** **12/12 passed**, with six fresh authentication setups and six role sweeps. **228 route/theme/width rows**, **zero recorded errors, zero axe violations including minor findings, zero horizontal overflow**. Normal-state evidence does not clear open-overlay findings.

**Evidence:** **193 synthetic PNGs** under ignored `ui-refresh/evidence/r2-4/after/`: 114 light-theme route images, 54 Sheet fixture/consumer images and 25 shell images. Supplements include both themes. Two open-More axe JSON files are clean. `route-audit.json`, `validation-summary.json` and retained diagnostics sit beside `after/`. R2.3's 232 local PNGs remain the before baseline. No real-patient or third-party reference directories were inspected; evidence remains untracked.

**Ranked review:** `ui-refresh/R2.4-REVIEW.md`. Live pilot/frame, checked-in pilot, animate/Apple guidance, shadcn composition, accessibility, Impeccable audit/craft/detector and current Web Interface Guidelines consulted. No separate agent review ran.

**Outstanding problems:** Prior P1 open-Select/menu background accessibility findings and short dropdown rows remain. Physical gesture feel, screen readers, Safari/Firefox, physical devices, installed PWA, virtual keyboard and real safe-area checks remain manual. Root-text scaling and CDP touch input are bounded browser evidence. Earlier R1.4/Vitals/Crisis/backend acknowledgement work and Sunday appointment lifecycle findings remain separate.

**Next unit:** R2.5 patient portal shell; use `ui-refresh/HANDOFF-R2.5.md`. R3 content remains unbuilt.

## R2.5: patient portal shell (2026-11-10)

**Unit ID:** R2.5

**Phase:** R2 adaptive app shell

**Branch:** `ui-refresh/r1-1-tokens`, local commit only; no push.

**Status:** Complete within the validation boundaries below.

**Screen(s) or components:** PortalLayout and its sole production caller in
SyncWithAuth, the shared Header and BottomNav, patient portal/account/settings
routes and existing authorized Header utilities for staff visiting portal routes.

**Design changes:** Overview, My Health, Appointments and More share the existing
phone BottomNav below 600px. Top tabs replace it from 600px. Existing labels,
routes, clinic scoping and permissions stay intact. Health owns self-reports and
Appointments owns request routes; More marks account/settings. The portal Header
uses the compact mark and stacked, independently truncating clinic/role context.
Its dormant left-menu trigger is removed from the portal presentation. Header
utilities appear from 600px, preventing a gap when phone More is hidden. The
portal sits on one card surface with an 8px inset from 600px, 12px corners and
phone bottom clearance. CSS selects navigation presentations without remounting
page content.

**Recovery and account access:** More exposes profile/settings and existing
permission-filtered header/profile utilities. It excludes staff sidebar items
and empty navigation groups. Sync recovery appears only with an active clinic
and existing sync permissions or owned/held changes, including other clinics.
More closes before the provider-controlled sync sheet opens, and return focus
remembers More or the Header pill. Existing Radix semantics, Sheet gestures,
queue ownership, authentication, providers, clinical copy and save behavior remain.
The portal does not newly mount staff chat.

**Files changed:** `components/PortalLayout.tsx`, `components/Header.tsx`,
`components/app-shell/BottomNav.tsx`, new `lib/portal-nav.ts`, new
`lib/use-sync-recovery-availability.ts` and `e2e/portal-shell.spec.js`; MASTER,
this tracker, `ui-refresh/R2.5-REVIEW.md` and `ui-refresh/HANDOFF-R3.1.md`.

**Validation:** Final-source focused selection: **112/112 passed**, comprising
six fresh authentication setups and **106 distinct browser checks**. The eight
new portal cases cover the established 11 boundary widths in both themes,
retained draft/input identity, long clinic names, 200% root text, 44px targets,
final-action access, More keyboard/drag/focus/route/history/reduced-motion behavior,
active/other-clinic held recovery and authorized Header utilities. Existing portal
offline/refusal, settings, dark-mode, responsive, form-error/date and accessibility
checks and shared staff navigation/Header/sync/Sheet/table-state regressions pass.
Final audit-flag build, standalone TypeScript, changed-file ESLint/Prettier,
whitespace and detector checks pass. Jest with two workers: **93 suites / 1019
tests passed**. The initial 99/99 candidate preceded empty-group and utility-gap
corrections found in screenshot/code review, not a browser failure. The sandbox
build stalled and API binding failed with EPERM; approved outside-sandbox runs
used guarded audit URLs and redirected API logs. The six-role normal-route audit passed **12/12** with six fresh authentication
setups and six role sweeps: **228 route/theme/width rows**, **zero recorded errors,
zero axe violations including minor findings, zero horizontal overflow**. No full
e2e suite, flag-off browser build or blanket release/accessibility sign-off is
claimed. Exact results and limits are in `ui-refresh/R2.5-REVIEW.md`.

**Evidence:** **142 synthetic PNGs** under ignored `ui-refresh/evidence/r2-5/after/`:
114 light-theme route images and 28 portal supplements in both themes.
`route-audit.json`, `validation-summary.json` and build/test/detector diagnostics
sit beside `after/`. The existing R2.4 patient phone baseline and new phone,
wide, dark, enlarged-text, More and recovery images were inspected. Evidence
remains untracked; no real-patient or third-party reference directories were
inspected. No separate agent review ran.

**Outstanding problems:** Prior P1 open-Select/menu accessibility findings and
short dropdown rows remain separate. Physical gesture feel, screen readers,
Safari/Firefox, physical devices, installed PWA, virtual keyboard and real safe
areas remain manual. Root-text scaling is bounded browser evidence. Earlier
R1.4/Vitals/Crisis/backend acknowledgement and Sunday appointment lifecycle work
remain separate.

**Next unit:** R3.1 volunteer dashboard; use `ui-refresh/HANDOFF-R3.1.md`.
No R3 content was implemented here.

## R3.1: volunteer dashboard (2026-11-10)

**Unit ID:** R3.1

**Phase:** R3 volunteer and clinical

**Branch:** `ui-refresh/r1-1-tokens`, local commit only; no push.

**Status:** Complete within the validation boundaries below.

**Screen(s) or components:** Volunteer-only dashboard and the volunteer view of
mixed-role dashboards; new welcome, shift and illustration components, shared
shift in-flight guard and additive operations-refresh error result.

**Design changes:** Approved mint greeting band, device-clock greeting/date,
IBM Plex Sans, contour reveal and gold/phase wave edge. Long names truncate
independently; narrow available measures, including enlarged text, give the
full line to the greeting and omit decorative art. Existing worklist/draft rows
get numbered markers in the volunteer-only view. Personal intake counts remain
once in Needs you now; HAP totals/breakdown, draft links, quick actions and five
charts remain. Existing clinic totals, measurements, mixed-role composition and
persisted tabs stay intact; other role content is not redesigned.

**Shift integration:** Station flag, clinic and `OPS.SHIFT.READ` gate the roster
read; `OPS.SHIFT.WRITE` gates actions. The dashboard uses `fetchActiveShifts`
without fetching the station board, and `useOpsView` with a distinct
`dashboard-shifts` cache kind, without an IndexedDB migration. Existing eligible
roles, `useShiftControls`, operation submission and pending overlays remain the
contract. Loading/refused first reads are unknown; stale reads retain known data
with retry. A synchronous in-flight guard and reconciliation lock prevent double
writes and release for later server-side changes. Offline start/end say saved on
this device. No auth, permission, queue/sync operation, clinical validation or
backend implementation changed.

**Illustration:** Source downloads were structurally matched to Hello and
checklist JSON. Both download pages specify the Lottie Simple License; URLs and
full terms accompany files in `public/lottie/`. Pinned local lazy player 5.13.0,
Hello 0–60 once and checklist 0–98 once. Checklist follows server-applied starts;
queued starts get truthful device-saved feedback. Static theme-aware SVGs appear
immediately and survive reduced motion, missing JSON or player failure.
Fallback IDs are isolated; a checked-in exporter reproduces the files.

**Files changed:** Dashboard page, VolunteerDashboard and NeedsYouNow; new
VolunteerWelcome, DashboardShiftControls, DashboardIllustration, CSS modules,
compiled/static rest frames and source/licence records; `use-shift-controls.ts`,
`use-ops-view.ts`, frontend cache-kind type, web package/lock; two component test
files, `volunteer-dashboard-refresh.spec.js`, rest-frame exporter and design docs.
The pre-existing owner edit to HANDOFF-R3.1 is preserved outside this unit's commit.

**Validation:** Final-source focused selection **47/47 passed**, including six
fresh authentication setups and **41 distinct browser checks**. Fifteen new
volunteer checks cover all 11 boundary widths in both themes, retained state,
long names, enlarged text, keyboard, clock/theme/font, permission/no-clinic/no-role,
unknown/read/write refusal and retry, duplicate calls, later external shift end,
mixed-role persistence, rest frames and asset failure. Real online and offline
start/end/replay pass, alongside existing dashboard/chart/table, workspace/chat,
station workflow/closure/screener and offline replay regressions. A subsequent
**4/4 spec-only recheck** strengthens 200% text through primary-action clearance
and final quick-action navigation, and refreshes settled screenshots. It repeats
four of the 41 browser cases; no product source changed or rebuild was needed.
Historical `#197` station cases were excluded per the recipe, never counted as
passes. No full e2e suite ran.

Final audit-flag build, standalone TypeScript, changed-file ESLint/Prettier,
whitespace and detector pass; detector findings are empty. The script/e2e ESLint
selection retains its existing root Pages-directory notice. Jest with two workers:
**95 suites / 1022 tests passed**. New component checks cover the flag-off mount
gate, reduced motion without fetching/player, player failure and unique fallback
IDs. No separate flag-off browser build is claimed. The exporter ran and its SVGs
match the original transformed exports. Candidate history: **24/24** initial;
**46/47** broader candidate exposed the wrong font utility. Screenshot review
found serif/system fallback, an absent gold token and narrow enlarged-text
measure; code review found the stale-feedback action lock. These were corrected
before the final source run. Exact scope and operational limits are in
`ui-refresh/R3.1-REVIEW.md`.

**Route audit:** **12/12 passed**, six fresh authentication setups and six role
sweeps; **228 route/theme/width rows**, **zero recorded errors, zero axe findings
including minor findings, zero horizontal overflow**. Normal-state scans do not
clear prior open-Select/menu findings.

**Evidence:** **146 synthetic PNGs** under ignored `ui-refresh/evidence/r3-1/after/`:
114 route images and 32 volunteer supplements. The R2.5 volunteer phone baseline,
approved live pilot and final phone/wide/dark/long-name/enlarged-text/start states
were inspected. Audit JSON, validation summary and diagnostics accompany them.
No real-patient or third-party reference directories were inspected; evidence
remains untracked. No separate agent review ran.

**Outstanding problems:** Prior open-overlay accessibility findings and short
dropdown rows remain separate. Physical devices, screen readers, Safari/Firefox,
installed PWA, virtual keyboard, real safe areas and gesture feel remain manual.
Root-text scaling is bounded browser evidence. Full dashboard metrics still do
not support an offline cold load; continuation is tested after dashboard load.
Earlier Vitals/Crisis/backend acknowledgement and Sunday appointment lifecycle
work remains separate.

**Next unit:** R3.2 Stations; use `ui-refresh/HANDOFF-R3.2.md`. No station content
redesign was implemented in R3.1.

## R3.2: Stations (2026-11-10)

**Unit/phase:** R3.2, role/workspace content.
**Screen/components:** Stations overview, new Stations-only shift strip, station
picker Sheet and the shared screener's associated checkbox label.
**Branch/commit:** `ui-refresh/r1-1-tokens`, local commit for this unit; no push.
The incoming owner edit to `ui-refresh/HANDOFF-R3.1.md` remains separate.
**Status:** Complete within the recorded validation boundaries.

**Design changes:** Shift-first off duty; one active station trigger and responsive
Sheet on duty; next-patient ticket with deep-teal/dashed stub; retained claim and
Continue actions; capacity/places-in-use information; real staffing/screener route
stops; fixed phone Take patient with full accessible patient name and chat/nav/
safe-area clearance. IBM Plex Sans is explicit on route and Sheet headings.
Unknown first reads, retained stale data, refusals, closed-station notices and
queued shift overlays remain truthful. Existing operations, permission definitions,
clinical forms/validation and replay implementation are unchanged. The shared
shift hook and Today/My Assigned/dashboard presentations are preserved.

**Desktop/tablet/phone/dark:** All 11 boundary widths
320/390/599/600/744/767/768/1024/1199/1200/1440 in both themes, same mounted
screener draft, role and open/selected station Sheet across resize. Bottom Sheet
below 600px; right-side from 600px. 200% root text/long names checked at 390px.
The bounded phone action remains clickable and clear of chat. Keyboard, Escape,
focus restoration, reduced motion and screener final action are covered.

**Tests:** 56 distinct browser checks passed, including 15 new Stations cases,
with six fresh focused-run authentication setups. Existing dashboard work-first,
station-board, complete station/doctor path, screener attribution/closure and
offline replay regressions pass. The new Stations cases exercise real online and
offline queued start/end/replay. Passing completions span 11 new checks, 33 passing
checks in the broader run and an 18/18 remaining run; a final 2/2 Sheet typography
recheck repeats two of those cases. Exact candidate failures and limits are in
`ui-refresh/R3.2-REVIEW.md`. Two legacy flag-incompatible Today offline checks
remain failed and their third case did not run; none is counted as a pass.
Historical `#197` cases remain excluded. No full e2e suite or flag-off build ran.

Final audit-flag build, standalone TypeScript, changed-file ESLint/Prettier,
whitespace and detector pass; detector findings are empty. Focused Jest:
3 suites / 45 tests passed, at most two workers. Sandboxed compilation/binding
failures used escalation rather than product workarounds. Both database URLs were
separately guarded for `nkwapa_audit`; credentials were never printed and API logs
were redirected.

**Route audit/evidence:** 12/12 tests passed, including six fresh
authentication setups and six role sweeps. All 228 route/theme/width rows are clean:
zero recorded errors, zero axe findings including minor, zero horizontal overflow.
Ignored `ui-refresh/evidence/r3-2/after/` contains 144 implementation PNGs (114 normal
routes and 30 Stations supplements), audit/validation-summary JSON and diagnostics.
The approved pilot, candidate failures, final phone/wide/dark/enlarged-text,
whole-line and both Sheet presentations were visually inspected. No evidence was
force-added.

**Outstanding:** Prior open Select/menu accessibility findings and short dropdown
rows remain separate; normal-state scans and Sheet interaction coverage do not
clear them. Physical devices, screen readers, Safari/Firefox, installed PWA,
virtual keyboard and real safe areas remain manual. Earlier Vitals/Crisis/backend
acknowledgement and Sunday appointment lifecycle work remain separate. No backend,
API, database, RBAC definition, clinical validation or sync implementation changed.
No unsupported data was added and no production patient data entered evidence.
No separate agent review ran.

**Next unit:** R3.3 patient registry: toolbar, filter Sheet, cards on phone.
Use `ui-refresh/HANDOFF-R3.3.md`.

## R3.3: Patient registry (2026-11-10)

**Unit/phase:** R3.3, role/workspace content.
**Screen/components:** Both registry routes, toolbar, filter Sheet, patient cards,
and the registry-only controlled custom-screening selection.
**Branch/commit:** `ui-refresh/r1-1-tokens`, local commit for this unit; no push.
The incoming owner edit to `ui-refresh/HANDOFF-R3.1.md` remains separate.
**Status:** Complete within the recorded validation boundaries.

**Design changes:** Search and active filters sit directly on the workspace sheet.
Location/completed-screening controls move into the existing draggable Sheet,
bottom below 600px and right-side from 600px. Same mounted open/selection state
across resize; custom selection retained across dismissal; immediate filtering
and Show results dismissal. Real 44px filter-removal buttons wrap long text.
Existing region/district and screened-sort dependencies remain. Invalid/refused
dates remain editable after dismissal. `/` focuses search outside typing/overlays;
Escape clears it. New Patient follows the existing create permission.

Registry cards retain actual identity/contact fields, View record and Check in.
Workspace names explicitly use IBM Plex Sans and codes Plex Mono. Native touch
swipes share the existing check-in operation and synchronous duplicate guard with
buttons, cancel safely and retain the row on every outcome. Native child-to-row
capture transfer is handled, and cancelled swipes preserve keyboard activation.
No undo, row removal, queue status, last-visit data or new endpoints were invented.
The shared DataTable, other consumers, API, auth, RBAC definitions, database,
clinical validation and sync implementation remain unchanged.

**Desktop/tablet/phone/dark:** All 11 boundary widths
320/390/599/600/744/767/768/1024/1199/1200/1440 in both themes. Same Sheet state and
selection across boundaries, 200% root text/long names at 390px, full final-button
visibility, keyboard, Escape/focus return and both motion preferences. Native
Chromium touch caught and verified the capture-transfer correction; screenshot
review caught the enlarged-text footer shrink. Header/footer now keep their size
while controls scroll. Physical touch/assistive-technology testing remains manual.

**Validation:** 53 distinct focused browser checks have passing completions:
30 registry/date/location/shell/offline cases after the capture/footer correction,
plus 23 unchanged-path table, replay, identity, merge and registration/chart/consent
regressions from the earlier candidate. The latter 23 were not repeated after the
registry-only correction. Earlier focused runs completed 12 authentication setups;
subsequent focused runs reused them. Exact failures/not-run counts and source-state
boundaries are in `ui-refresh/R3.3-REVIEW.md`. No full e2e suite ran.

Audit-flag build, standalone TypeScript, changed-file ESLint/Prettier, whitespace
and detector pass; the detector has no findings. Jest with one worker passes
7 suites / 88 tests. Sandboxed compilation/binding failures used escalation,
with both database URLs separately guarded and API logs redirected.

**Route audit/evidence:** 12/12 tests, six fresh authentication setups and six role
sweeps. All 228 route/theme/width rows have zero errors, zero axe findings including
minor and zero horizontal overflow. Normal-state scans do not clear prior open
overlay findings. The audit preceded the final event-only keyboard-click
hardening. Its **2/2 final-source native touch/keyboard rechecks** pass for Enter
and Space after cancellation in both motion modes; these repeat two of the 53
checks. The final keyboard source also passes build, standalone TypeScript,
lint/formatting and detector. Ignored
`ui-refresh/evidence/r3-3/after/` holds 164 implementation PNGs (114 normal routes,
50 registry supplements), audit/validation JSON and diagnostics. No real-patient
or third-party reference directories were inspected.

**Outstanding:** Prior open Select/menu findings and short dropdown rows remain
separate. Physical devices, screen readers, Safari/Firefox, installed PWA,
virtual keyboard, real safe areas and gesture feel remain manual. Earlier
Vitals/Crisis/backend acknowledgement and Sunday appointment lifecycle work
remain separate. The registry still needs a connection for a cold read.
Historical station `#197` cases and legacy flag-incompatible Today offline cases
are not claimed as passes. No separate agent review ran; no evidence was force-added.

**Next unit:** R3.4 Queues. Use `ui-refresh/HANDOFF-R3.4.md`.

## R3.4: Queues (2026-11-10)

**Unit/phase:** R3.4, role/workspace content.
**Screen/components:** Queue route, lane tabs, table/cards and confirmed empty state.
**Branch/commit:** `ui-refresh/r1-1-tokens`, local commit for this unit; no push.
The incoming owner edit to `ui-refresh/HANDOFF-R3.1.md` remains separate.
**Status:** Complete within the recorded validation boundaries.

**Design changes:** Existing permission-gated lane labels and clinical explanations
sit directly on the workspace sheet. Role default priority remains; URL lane
selection now follows history and falls back for invalid/inaccessible parameters.
Cosign still requires the flag, doctor clinic role and permission. One DataTable/
card state per mounted lane preserves sort/page/loaded rows through resize,
lane switches and desktop collapse. Cards add actual created/submitted times;
both layouts have explicit keyboard-accessible Open encounter links. Cosign rows
use note IDs, actual authors and encounter destinations. Clinical severity and
glucose thresholds are unchanged.

Unknown first reads never show zero. Missing totals are labelled loaded counts;
full pages can still load more. Offsets advance by received rows independently
of deduplication, and refused paging retains rows with retry. Existing resource
abort/supersession/reconnect behavior retains visibly qualified snapshots;
clinic/permission changes remount the workspace. The all-lane read stays atomic.
Only confirmed current online emptiness without contradictory totals shows the
licensed checklist and dashboard action. It starts on first viewing and retains
its rest-frame-98 player across refresh/lane switches; reduced motion uses the
existing static SVG. No completion totals, polling promise, undo or new mutation.
Shared primitives, other table consumers, shell, forms, API, auth, RBAC definitions,
database and sync implementation remain unchanged.

**Desktop/tablet/phone/dark:** All 11 widths
320/390/599/600/744/767/768/1024/1199/1200/1440 in both themes. Actual-container
modes, retained lane/sort/page, Back/Forward, keyboard, 200% root text, long identity
fields and fully visible encounter/Show more actions. The 1200px collapse supplement
proves the same page in expanded cards and collapsed tables in both themes.
Physical devices and assistive-technology verification remain manual.

**Validation:** 59 distinct focused browser checks have passing completions.
The final-source 41-case run completed 40 passed / 1 failed; the following
18-case selection completed 16 passed / 2 failed; corrected boundary/offline
selection passed 6/6, and the queue-collapse supplement passed 2/2. Failures were
an unsettled lane-container measurement and hidden-panel legacy selectors.
The earlier candidate completed 20 passed / 3 failed / 21 not run, including six
authentication setups and 14 table/dashboard passes. Its heading-order defect was
corrected; one shared sync-pill contrast finding did not recur after waiting for
settled state and is not declared a product fix. Repeated checks are counted once.
Exact totals and source boundaries are in `ui-refresh/R3.4-REVIEW.md`.
No full suite or flag-off browser build ran; historical station `#197` and legacy
flag-incompatible Today offline cases are not claimed as passes.

Audit-flag build, standalone TypeScript, changed-file lint/formatting, whitespace
and final detector pass; detector findings are empty. Focused Jest passed
7 suites / 54 tests with one worker, retaining existing illustration act warnings.
Sandbox compilation/binding limits used escalation without product workarounds.
Both database URLs were separately guarded for the audit database; API logs were
redirected and credentials were never printed.

**Route audit/evidence:** 12/12 tests, six fresh authentication setups and six role
sweeps. All 228 route/theme/width rows have zero errors, zero axe findings including
minor and zero horizontal overflow. Ignored `ui-refresh/evidence/r3-4/after/`
contains 147 implementation PNGs (114 normal routes, 33 queue supplements),
audit/validation summaries, selected logs and separate pilot/candidate diagnostics.
Phone, wide, dark, confirmed-empty and enlarged-text evidence was visually inspected.
No real-patient or third-party reference directories were inspected; no evidence
was force-added. No separate agent review ran.

**Outstanding:** Prior open Select/menu findings and short dropdown rows remain
separate; normal-route scans do not clear them. Physical devices, screen readers,
Safari/Firefox, installed PWA, virtual keyboard, real safe areas and gesture feel
remain manual. Earlier Vitals/Crisis/backend acknowledgement and Sunday appointment
lifecycle work remain separate. Queues require a connection for a first read;
one refused lane still blocks replacing the atomic snapshot.

**Next unit:** R3.5 Registration. Use `ui-refresh/HANDOFF-R3.5.md`.

## R3.5: Registration (2026-11-10)

**Unit/phase:** R3.5, role/workspace content.
**Screen/components:** Shared registration form, registration-only layout,
phone actions, duplicate-dialog presentation and submit guard.
**Branch/commit:** `ui-refresh/r1-1-tokens`, local commit for this unit; no push.
The owner's incoming `ui-refresh/HANDOFF-R3.1.md` edit remains separate.
**Status:** Complete within the recorded validation boundaries.

**Design changes:** Both new-patient routes retain their shared form, existing
permission guards, clinic payload/registry links and chart destination. Four
ruled sections sit directly on the sheet; paired controls use two columns from
600px and headings/explanations sit beside controls from 1200px. Existing safety
help remains in a flat disclosure. All fields, options, defaults, native
constraints, error summaries/links, no-ID omission/restore, residential clearing,
duplicate handling and clinical copy remain. Shared form/location/phone/error,
dialog, shell and edit components are unchanged.

Phone Create patient/Cancel remain visible below 600px, above measured Primary
navigation height and clear of the actual chat launcher. A local observer handles
text-size changes; the nominal shell variable was insufficient at 200% text.
Both actions wrap with at least 44px targets. The registration-only duplicate
dialog bounds its grid and wraps actions for long identities/enlarged text.
The synchronous guard stops repeated pending submits, allows refusal retry and
stays held through successful chart navigation. Existing API idempotency remains.
Offline copy asks for a connection; values stay in the mounted form after failure.
No local save, registration outbox or automatic replay was invented. No backend,
auth, RBAC definitions, database/schema, clinical logic, dependency or sync changes.

**Desktop/tablet/phone/dark:** All 11 widths
320/390/599/600/744/767/768/1024/1199/1200/1440 in both themes. Retained field and
residential selections, paired-field geometry, unfiltered normal-page axe scans,
keyboard/native error focus, summary links, 200% root text, reduced motion and
full visibility/center hit testing for Create patient/Cancel. Enlarged duplicate
recovery actions remain fully visible, with no horizontal dialog scrolling.
Phone, wide, dark, enlarged-action/error and long-identity images were inspected.

**Validation:** 48 distinct focused browser checks have passing completions:
24/24 final-source checks, plus 24 unchanged-path duplicate/chart/identity/merge
checks from the first candidate. Those 24 were not repeated after the local
clearance/dialog fixes. Initial invocation: 51 passed / 2 failed, including six
fresh authentication setups; both failures exposed the 200% navigation/action
interception. One separate duplicate-dialog candidate failed clipping. Both
source defects were corrected together before the 24/24 final run, which reused
authenticated sessions. Failed checks are not counted as passes. Exact scope and
source boundaries are recorded in `ui-refresh/R3.5-REVIEW.md`.

Final audit-flag production build, standalone TypeScript, changed-file lint/
formatting, whitespace and detector pass; detector findings are empty. Jest with
one worker passes 6 suites / 107 tests. Build/server commands used the established
sandbox escalation; both database URLs were separately guarded for the audit DB
and API logs redirected. No full suite or flag-off browser build ran. Historical
station `#197` and legacy flag-incompatible Today offline cases are not claimed.

**Route audit/evidence:** 12/12 tests, six fresh authentication setups and six role
sweeps. All 228 route/theme/width rows have zero errors, zero axe findings including
minor and zero horizontal overflow. Ignored `ui-refresh/evidence/r3-5/after/`
contains 141 implementation PNGs (114 normal routes, 27 registration supplements),
audit/validation summaries, selected logs and separate candidate diagnostics.
No evidence was force-added; no real-patient or third-party reference directories
were inspected. No separate agent review ran.

**Outstanding:** Prior open Select/menu findings and short dropdown rows remain
separate. Physical devices, screen readers, Safari/Firefox, installed PWA, virtual
keyboard, real safe areas and gesture feel remain manual. Earlier Vitals/Crisis/
backend acknowledgement and Sunday appointment lifecycle work remain separate.
Registration needs a connection and does not persist an unsaved form across reload.

**Next unit:** R3.6 Profile. Use `ui-refresh/HANDOFF-R3.6.md`.

## R3.6: Profile (2026-11-10)

**Unit/phase:** R3.6, role/workspace content.

**Confirmed implementation:** The canonical chart has a dedicated patient
identity header with real name/code/sex and existing consent badge, a real
clinic-scoped back link and original permission-gated Edit/check-in operations.
A measured, opaque compact identity strip takes over on scroll. It is portaled
outside page spacing/clipping, follows shell resizing/collapse, adds no focus
stops/duplicate announcements/entrance motion, and yields if it would obscure
keyboard focus. Complete identity values remain in the full header/details;
compact context can ellipsize on narrow or enlarged screens.

Needs you now remains first. Summary columns split at 840px; profile
identity/location and existing portal/admin/next-step details use one column
below 1200px and a bounded 2:1 split above. Existing portal and merge buttons
wrap at enlarged text within the profile. Shared primitives, shell, location,
portal and merge implementations remain unchanged. The normal-route audit now
waits for a settled synced pill before contrast scans, without clearing prior
transient sync-state findings.

The R3.6 handoff, R0 patient-header handover decision, checked-in pilot and live
artifact's embedded record screen informed the layout. Installed Emil design
engineering, Apple design, Impeccable and shadcn skills informed the craft.
Pinned fonts/tokens remain. No backend, schema, auth, clinical thresholds/units,
validation, consent or offline/outbox/replay logic changed. Legacy/merged-chart
redirects, URL tabs, lazy longitudinal reads, portal and new-encounter access
remain on their existing paths. Vitals/Encounters remain separate units.

**Confirmed validation:** Final-source focused Chromium checks pass **50/50**:
six new Profile cases and 44 existing chart/identity/merge/duplicate/consent/
portal/role/consumer cases. The six new cases cover all eleven handoff widths
in both themes, all 22 unfiltered normal-page axe scans, retained tab/URL state,
long identity values, measured scroll/shell handover, keyboard/focus protection,
reduced motion, and 200% root text at 320/390/600/1200 in both themes with
header/portal/merge actions fully visible and hit-testable and no page/main
overflow. Five focused Jest suites pass **100 tests**. Production build,
standalone TypeScript, changed-file ESLint/Prettier and detector pass; ESLint
retains its existing root Pages-directory notice. The final-source
six-role route audit passes **12/12 tests**, including six fresh authentication
setups. All **228 route/theme/width rows** have **zero errors, zero axe findings
including minor and zero horizontal overflow**. The ignored after evidence has
**147 implementation PNGs**: 114 normal routes and 33 Profile supplements, plus
separate candidate diagnostics and validation summaries.

Candidate failures and corrections are retained in `ui-refresh/R3.6-REVIEW.md`:
initial scroll/API-interception fixture errors, inherited strip spacing/clipping,
portal/merge button overflow at enlarged text and viewport-edge action measuring.
A sandbox build was interrupted and successfully escalated. Failed and not-run
cases are not counted as passes. No full suite or flag-off browser build ran.
Evidence is ignored under `ui-refresh/evidence/r3-6/after/`; no force-add or push.
The owner's incoming `HANDOFF-R3.1.md` change remains separate. No agent review ran.

**Outstanding:** Prior open-overlay accessibility and short dropdown rows remain
separate. Physical devices, screen readers, Safari/Firefox, installed PWA, virtual
keyboard, real safe areas and gesture feel remain manual. Earlier Vitals/Crisis/
backend acknowledgement and Sunday appointment lifecycle work remain separate.

**Next unit:** R3.7 Vitals. Use `ui-refresh/HANDOFF-R3.7.md`.

---

## R3.7 Vitals (2026-11-10)

**Status:** Built and in review on `ui-refresh/r1-1-tokens`. Local commit only;
no push. Review: `ui-refresh/R3.7-REVIEW.md`. Next: R3.8 Encounters.

**Implementation:** Chart Vitals/history/trends and the shared measurement form
now follow the Layered Clinical Workspace. Ruled groups replace nested panels
and tinted icon tiles; the BP pair is distinct without replacing its real fields
or measurement context. Container-width grids adapt without remounting form,
chart or history state. Read-only values retain explicit units. Phone actions
wrap and use measured navigation/chat/action geometry; at enlarged text, vertical
chat clearance preserves full-width labels. Error descriptions now point to the
actual Select, temperature, Other context and Notes messages. Trends retains
range/selection, exact data, source descriptions, cursor history and chart/table
alternatives. Vitals-local chart header wrapping and explicit zero-minimum grid
tracks fix enlarged chart overflow. An inert ChartFrame marker leaves other
consumers' layout unchanged. Small adjacent prescription-allergy label and
encounter-container wrapping fixes address the enlarged viewport around Vitals.

Emil design engineering, Apple design, Impeccable and shadcn guidance informed
the implementation. Pinned fonts/tokens remain. No backend, schema, auth/RBAC,
clinical threshold/classification, unit/preference/default, validation range,
consent, offline/outbox/replay, save or finalization handler changed. All four
shared-form consumers retain their fields and workflow. Crisis still saves first
and waits for its existing acknowledgement dialog; persistence is separate
backend work. R3.8 remains the encounter redesign.

**Confirmed focused validation:** **79/79 distinct Chromium browser checks**,
including seven new Vitals cases and 72 existing focused cases. Authentication
states were reused; no setup tests are included in 79. The new cases cover all
eleven handoff widths in both themes for editable encounter Vitals, loaded chart
history/trends and read-only measurements; **66 unfiltered normal-size axe scans**
have zero findings. All three presentations also pass 200% root-text bounds at
320/390/600/1200 in both themes. They check retained fields/tab/selected trend/
loaded cursor pages, provenance/source links, keyboard order, reduced motion,
error descriptions, visible/hit-testable edit actions and finalized read-only
values. The encounter Crisis check confirms API persistence before acknowledgement,
focus, Escape refusal, full-page axe and no repeat after completed re-save.
Existing station Crisis, real offline Vitals/review/finalization, wizard,
prescribing, clinician-plan, chart/identity/merge/consent/portal/role/shell and
once-only replay checks pass. Six focused Jest suites pass **64 tests**.
Production build, standalone TypeScript, changed-file ESLint/Prettier and the
empty-array detector pass.

**Confirmed normal-route audit:** **12/12 tests** (six fresh authentication
setups and six role sweeps). All **228 route/theme/width rows** have zero errors,
zero axe findings including minor and zero horizontal overflow. These are
settled normal-route scans at 390/1440 in both themes, not open-overlay or
transient-sync certification. Final ignored evidence contains **218 implementation
PNGs**: 114 normal routes, 71 Vitals supplements and 33 Profile supplements,
with candidate diagnostics and live-pilot inspection kept separate.

**Candidate findings:** Earlier runs and exact failed/not-run totals are retained
in `ui-refresh/R3.7-REVIEW.md`. They exposed error-fixture omission, adjacent
allergy/long-word overflow, measured resize timing, chart minimum-content overflow
and cramped enlarged action labels. These are not counted as successful coverage.
No full suite or flag-off browser build ran. Historical station `#197` and legacy
flag-incompatible Today offline cases were not run. Evidence is ignored under
`ui-refresh/evidence/r3-7/after/`; nothing is force-added. The owner's incoming
`HANDOFF-R3.1.md` change remains separate. No agent review ran.

**Outstanding:** Prior open-overlay accessibility, short dropdown rows and
transient-sync findings remain separate. These specific Crisis checks do not
certify every dialog viewport/theme. Physical devices, screen readers,
Safari/Firefox, installed PWA, virtual keyboards, real safe areas and gesture feel
remain manual. Backend Crisis acknowledgement and Sunday appointment lifecycle
work remain separate.

**Next unit:** R3.8 Encounters. Use `ui-refresh/HANDOFF-R3.8.md`.

---

## R3.7 follow-up: Persistent BP signals (2026-11-10)

**Status:** Built and in review. See `ui-refresh/R3.7-SIGNALS-REVIEW.md`.

The owner requested an enduring highlight alongside the Crisis popup, with
broader stratification later. BP entry now shows the exact reading/unit, existing
category badge and a checked five-band strip. History and read-only measurements
keep compact tags. Stage 1 uses warning, Stage 2 severe and Crisis destructive;
text/checks carry meaning without color. Unsaved BP is distinguished from BP
matching the locally saved reading, independently of bundle sync state.

This is reading-level staging, not an overall patient-risk score. The existing
shared classifier, plausible bounds, ordering and low-BP predicate are reused.
Incomplete/invalid pairs have no category; low readings do not acquire a
reassuring Normal/Elevated tag. No clinical thresholds, validation, save,
permissions, sync/outbox/replay or acknowledgement logic changed. A future
low/medium/high risk model needs an agreed decision, inputs, missing/stale-data
rules and clinical approval. The Crisis popup remains unchanged.

**Validation:** Final build, standalone TypeScript, changed-file lint/format and
empty-array detector pass. Focused Jest passes **4 suites / 39 tests**. Focused
Chromium passes **25/25 distinct checks**, including two new category/persistence
cases and 23 existing Vitals/wizard/station/chart cases. Both themes, all five
categories, invalid/low readings, draft/saved state, reload/history persistence,
responsive/enlarged text, Crisis, offline replay and finalization are covered.
The initial candidate had **24 passes / 1 failure**: dark Stage 1 secondary copy
measured 4.49:1. Warning/severe ink fixes that measured contrast defect. No test
was removed or relaxed. Evidence: **83 ignored PNGs** under
`ui-refresh/evidence/r3-7-signals/after/` plus logs and separate candidate output.

No full suite, flag-off build or six-role route audit was repeated for this
bounded follow-up. Prior open-overlay/transient-sync findings and physical-device,
screen-reader, non-Chromium, installed-PWA, virtual-keyboard/safe-area and gesture
limits remain. Overall risk scoring, backend Crisis acknowledgement and Sunday
appointment lifecycle work remain separate. The owner's `HANDOFF-R3.1.md` edit
is preserved. R3.8 handoff includes the new signal contract. Local commit only;
no push.

## R3.8 Encounters and pointer-aware controls (2026-11-10)

Encounter detail and the new-visit wizard now share a back link, an `h1`
identity line and a ruled review route; stage actions sit on the right, and
prescriptions follow the clinical tabs. Owner decisions the same day: controls
are 36px (buttons) and 40px (fields) on a mouse and 44px under touch, controls
use a 4px radius, and forms end in the new `FormActions` row (right-aligned,
primary last). The encounter forms adopted it; other screens adopt it in their
own unit. Rules are in MASTER section 8 and PRODUCT.md.

**Validation:** build, TypeScript, lint, format and detector pass; related Jest
5 suites / 11 tests. Focused Chromium first pass 139/168 (26 outdated
size assertions, 2 real defects fixed, 1 pre-existing portal-shell failure that
also fails on baseline); final re-run 37/37. Six-role audit 12/12, 228 rows, 0
violations, 0 overflow. Details and limits in `ui-refresh/R3.8-REVIEW.md`. R3 is
complete; next is `ui-refresh/HANDOFF-R4.1.md`. Follow-up the same day: tabs
(40px mouse) and select, dropdown and combobox rows (36px mouse, 44px touch) use
the same tokens. Local commit only; no push.

## R4.1 Doctor review (2026-11-10)

The HAP note is one ruled section (title and status, a provenance list, History,
Assessment and Plan as ruled reading text) instead of a card holding boxes. A note
waiting on this doctor leads with the encounter sign-off band, "Waiting for your
cosign", which holds the only Cosign note action; the dialog names the author.
Finalize now confirms once ("Finalize this visit?", focus on Not yet), since it
locks the record. Prescriptions, Add prescription and addenda drop their cards for
ruled lists. Note, encounter and dashboard times show in Africa/Accra. The doctor
and review dashboard tables share one column set, and each patient links to the
visit. Rules are in MASTER under "Queues and encounters".

**Validation:** audit-flag build, TypeScript, changed-file lint/format pass;
detector `[]`; no related Jest suites. Focused Chromium over clinical-notes,
vitals, prescribing, diabetes-screening, workspace-smoke,
volunteer-dashboard-refresh and dashboard-work-first: **50/50** (6 auth setups,
44 checks, including a new cosign-band test and the three Finalize flows, now
confirmed through the dialog). Six-role audit **12/12, 228 rows, 0 violations,
0 overflow, 0 errors**. Scratch screenshot spec 23/23 before and after (light,
dark, 1440, 390); it caught one real defect, fixed before the runs above.
Details and limits in `ui-refresh/R4.1-REVIEW.md`; synthetic evidence in ignored
`ui-refresh/evidence/r4-1/` (before, after, routes). Next is
`ui-refresh/HANDOFF-R4.2.md`. Local commit only; no push.

## R4.2 Preceptor and manager oversight (2026-11-10)

A visit waiting on the reviewer leads with a "Ready for your review" band (teal rule,
`ClipboardCheck`, primary Mark Reviewed) where sign-off appears next. Focus moves to the
sign-off heading after the press, and Mark Reviewed left the header. There is no preceptor
role: review is a doctor permission. The flag-off Today Board is rebuilt work first: one
ruled patient-flow list grouped by Waiting for a pair, Assigned and In intake (Completed and
Cancelled are closed disclosures), with rows laid out by container width, and a 20rem
shift-and-roster column whose role filter is a `SegmentedControl` carrying the counts.
Staff activity uses Accra date formatting, a sticky name column and focus handoff in and
out of a person. The manager dashboard's staff table names roles and visits and links to
Staff activity; Station flow's longest-wait note is a ruled warning band. Volunteer
Deactivate is plain outline. Rules are in MASTER under "Queues and encounters".

**Validation:** flag-off and audit-flag builds, TypeScript, changed-file lint/format pass;
detector `[]`; no related Jest suites. Flag-off focused Chromium 37/38 first pass (the
failure was an ambiguous scratch-spec locator; fixed re-runs 9/9 and 8/8). It covers
today-offline, `/today` and `/volunteers*` responsive-offline, staff activity, the
volunteer roster, and the three Mark Reviewed → Finalize flows. Audit-flag focused
Chromium **58/58**. Six-role audit **12/12, 228 rows, 0 violations, 0 overflow, 0
errors**. Details and limits in `ui-refresh/R4.2-REVIEW.md`; synthetic evidence in
ignored `ui-refresh/evidence/r4-2/`. Next is `ui-refresh/HANDOFF-R4.3.md`. Local commit
only; no push.

## R4.3 Director and system administrator oversight (2026-11-11)

Warning ink and `ShieldCheck` now mark only what cannot be undone here (merge, erasure, queueing a
confirmed duplicate for merge). Deactivate account, Remove role and taking a clinic offline are
plain outline buttons or a routine Save, and Inactive and Deactivated are neutral badges. Boxed
"Showing N" tiles became words at the end of each section description, and non-figure metric cells
(audit "Has more results", Staff "Scope" and "15 / 0") are gone. The network clinic comparison is
one table at every width with a sticky clinic column and right-aligned counts, as are director
staff activity and both organization tables. The audit log opens on 25 rows (its Rows select was
blank), shows Accra timestamps with seconds, and ends its filters in `FormActions`. Data requests
no longer spin forever without a clinic. The access sheet's nested cards are ruled sections; phone
rows are hairlines. Rules are in MASTER under "Administration and oversight".

**Validation:** audit-flag build, TypeScript, changed-file lint/format pass; detector `[]`; related
Jest 5 suites / 100 tests. Focused Chromium over 15 specs (governance, clinic metadata, both
duplicate screens, metrics, both organization specs, dashboard-work-first, workspace-smoke,
staff-invite, route-audit-findings, responsive-migration, responsive-offline, shell-navigation,
portal): **210/210**. Scratch evidence spec **11/11**: 144 rows at 1440 to 320 in both themes, 0
violations, 0 overflow, plus the sticky-column, audit and access-sheet checks. Six-role audit **12/12,
228 rows, 0 violations, 0 overflow, 0 errors**. Details and limits in `ui-refresh/R4.3-REVIEW.md`; synthetic evidence in ignored
`ui-refresh/evidence/r4-3/`. R4 is complete; next is `ui-refresh/HANDOFF-R5.1.md`. Local commit
only; no push.

## R5.1 Patient portal (2026-11-11)

Overview now leads with the next appointment in a ruled band, then latest readings, care team
advice and reminders. The four identity and count tiles became one name and patient code line, and
waiting requests are said at the end of the appointment description. Quick actions are hairline
thumb rows (64px, icon, title, one-line hint). Appointments lost its four count tiles (counts end
the history descriptions), and the clinic note is a ruled band. Health's five follow-up counts are
one sentence. Portal dates now format in Africa/Accra at the root (`formatPortalDate*`), and chart
ticks read `12 Nov` through `formatTrendLabel` instead of an ambiguous `11/12`. "Your data" uses
hairline rows and `FormActions`.

**Validation:** CI-flag build, TypeScript, changed-file lint/format pass; related Jest 2 suites / 14
tests. Focused Chromium over portal, portal-offline, portal-shell, appointments and settings:
**55/55** after applying the local database's missing migrations (the first run's 39 failures were
`/auth/whoami` 500s, not this change). Six-role audit **12/12, 228 rows, 0 violations, 0 overflow,
0 errors**; portal evidence at 390/320 in both themes **28 rows, 0 violations, 0 overflow**, no touch
target under 44px on a touch pointer. Details in
`ui-refresh/R5.1-REVIEW.md`. Local commit only; no push.

