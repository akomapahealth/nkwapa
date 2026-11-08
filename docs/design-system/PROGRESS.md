# Nkwapa UI Refresh — Progress Tracker

**Direction:** Layered Clinical Workspace  
**Base branch:** `release/dev`  
**Program:** Frontend-only visual refinement  
**Status:** R0 completed 2026-11-07. R1.1, R1.1b, R1.2, R1.2b, R1.3 and R1.4 built on `ui-refresh/r1-1-tokens` (uncommitted, in review). Next: R1.5.

## Phase Status

| Phase | Workstream                             | Status      |
| ----- | -------------------------------------- | ----------- |
| R0    | Current UI audit and design pilot      | Completed   |
| R1    | Design tokens and shared components    | In progress |
| R2    | Desktop, tablet, and mobile app shells | Not started |
| R3    | Volunteer and clinical workflows       | Not started |
| R4    | Clinical review and oversight          | Not started |
| R5    | Patient portal and authentication      | Not started |
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
