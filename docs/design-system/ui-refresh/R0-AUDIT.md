# Phase R0: Audit and Design Pilot

**Program:** Layered Clinical Workspace UI refresh (see `../NKWAPA-UI-REFRESH-MASTER.md`)
**Date:** 2026-11-07
**Base:** `release/dev` at `57e138a9`
**Status:** Checkpoint decisions D1 to D8 answered by the owner on 2026-11-07 (section 8). No application code has changed. Shareable review copy of the pilot: https://claude.ai/artifact/ESPAMmNxLt1caa2owyjSX5 (private).

Conclusions are labelled **Confirmed** (read in code or measured), **Strong inference**, or **Open** (needs an owner decision).

---

## 1. What was reviewed

| Source                                           | Contents                                                                                                                                                                                                                                | Result                                                                                                     |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `references/01-current-ui/` (git-ignored)        | 12 screenshots of the live staff workspace (volunteer role, desktop): dashboard, stations, queues, patients, appointments, new patient, patient profile, vitals trends                                                                  | All 12 opened and reviewed. **Several contain what appear to be real patient records. See section 8, D1.** |
| `references/02-design-references/` (git-ignored) | 14 screenshots of a third-party hospital product (ProVita): staff calendar, front desk, patient detail, urgent-arrival and duplicate dialogs, patient portal dashboard, prescriptions, reschedule, consent signing, sign-in, activation | All 14 opened and reviewed. Demo data in the source product.                                               |
| `references/03-proposed-direction/`              | 4 PNG concepts (desktop, tablet, phone, phone + tablet board) and 2 HTML sources                                                                                                                                                        | All opened. Tokens extracted from the HTML (section 4).                                                    |
| Code                                             | `globals.css`, `tailwind.config.js`, `AppLayout`, `Sidebar`, `Header`, `PortalLayout`, `lib/app-nav.ts`, `components/app-shell/*`, `components/ui/*`, dashboard, stations, patients and sync components                                 | Section 2 and 3                                                                                            |
| Docs                                             | `NKWAPA-UI-REFRESH-MASTER.md`, `PROGRESS.md`, `MASTER.md` (Ruled Chart system, sections 1 to 13), `REDESIGN-2.0.md`                                                                                                                     | Read                                                                                                       |

The folders started in `apps/web/public/screenshots/` and were moved to `docs/design-system/ui-refresh/references/` under decision D1.

---

## 2. Current frontend audit

### 2.1 Keep (Confirmed)

The Ruled Chart program left a strong engineering base. None of this should be redone; R1 changes values and composition on top of it.

- **Semantic tokens.** Every colour in `globals.css` is a role (`--primary`, `--success-ink`, `--warning-surface`, `--input` split from `--border`, chart palette checked in CI by `scripts/check-chart-palette.mjs`). Most components read tokens, so a palette change is mostly a value change.
- **Motion tokens.** `--ease-out`, `--ease-in-out`, `--ease-drawer`, `--duration-fast` (150ms), `--duration-base` (200ms), exposed as Tailwind `ease-out-strong`, `ease-drawer`, `duration-base`. `Button` already scales to 0.97 on `:active`. Global `prefers-reduced-motion` rule exists.
- **44px target floor** enforced in primitives (`Button`, `Input`, `Select`, `Tabs`, help triggers).
- **Shared composition contract** (MASTER.md section 9): `AppPageHeader`, `AppMetricCard`, `FormSectionCard`, `ResourceState`, `EmptyState`, `InlineErrorState`, `SegmentedControl`, `ActiveFilterSummary`, `DataTable` (TanStack v9, sticky headers, 44/52px rows), `Combobox`, `InfoHint`, `ProgressiveHelp`.
- **Navigation model.** One list in `lib/app-nav.ts` with permission, `anyOf`, feature-flag and placement gates. `getAccessibleNavItems(bootstrap, placement)` is the only filter. A bottom nav can derive from it with no permission change.
- **Offline and sync presentation.** `SyncStatusBar`, `SyncCenterSheet`, honest "Review saved changes" pill, stale notices, failed-vs-empty distinction (#281).
- **Safe-area utilities** (`pt-safe`, `px-safe`, `safe-edges-y`), `viewport-fit=cover`, `overscroll-behavior-y: contain`.
- **Sidebar fixes** worth carrying forward: initial collapsed state resolved before first paint, sticky contents inside a full-height aside, `[` shortcut ignored while typing.

### 2.2 Change (Confirmed from screenshots and code)

| #   | Finding                                                                                                                                                | Evidence                                                                      | Direction                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | One surface everywhere. Canvas, sidebar, header and content are all cream `54 63% 97%`; separation is 2px ink rules and hairlines                      | Every `01-Current UI` shot; `Sidebar.tsx` deliberately sits on `--background` | Four surface levels: cool canvas, white nav and panels, mint highlight, overlay                                                                    |
| A2  | Ruled 2px `--rule-strong` bars above every section read as dividers between unrelated blocks, so hierarchy is flat                                     | Dashboard, Stations, Patients                                                 | Bordered panels with headers; drop the ink rule                                                                                                    |
| A3  | Serif page titles (Source Serif 4) plus a serif patient name in the registry table mixes families inside a table                                       | Patients shot: names in serif, codes in sans                                  | Workspace in IBM Plex Sans throughout (decision D5)                                                                                                |
| A4  | Secondary actions look like plain text or quiet outlines; the primary teal reads grey-blue on cream                                                    | "Open Stations", "Refresh", station list buttons that look disabled           | Secondary = white fill + `--input` border; primary keeps the teal                                                                                  |
| A5  | Off-duty Stations page shows six disabled-looking station buttons, an empty queue column and the "whole line" grid at once                             | Stations shot                                                                 | One clear shift action first; station choice becomes a list or sheet once on duty                                                                  |
| A6  | Patient registry spends roughly 900px on search and filters before the first result                                                                    | Patients shot                                                                 | Search + compact filter row; sheet on phone; active filter chips                                                                                   |
| A7  | Dashboard leads with five equal metrics, then three more, then empty charts; the one action ("Open Stations") is a small outline button                | Dashboard shot                                                                | Next action first, metrics compact, trends lowest                                                                                                  |
| A8  | Queue BP column uses the same red badge for Stage 1 and Stage 2, so a common finding looks like an emergency                                           | Queues shot                                                                   | Severity scale with separate tokens: normal neutral, Stage 1 warning, Stage 2 stronger warning, crisis destructive. Classification logic unchanged |
| A9  | Patient profile overview is a long ruled list of equal-weight sections                                                                                 | Profile shots                                                                 | Summary panels in a grid with one "Needs you now" panel on top                                                                                     |
| A10 | Phones get the desktop page plus a hamburger sheet. There is no bottom navigation, and below `md` the rail is hidden entirely                          | `Header.tsx` Sheet trigger `md:hidden`; `Sidebar.tsx` `hidden md:block`       | Bottom nav under 600px, labelled rail 600 to 1199px, sidebar from 1200px                                                                           |
| A11 | Breakpoints are Tailwind defaults (640/768/1024/1280) while MASTER.md section 8 documents 375/768/1024/1440 and the refresh spec asks for 600/840/1200 | `tailwind.config.js` has no `screens`                                         | Add named screens (D6)                                                                                                                             |
| A12 | Motion is CSS only. `framer-motion` is installed but used in one file (`WelcomeTour.tsx`)                                                              | grep                                                                          | Keep CSS for most; use Motion only for shared-layout indicators and drag sheets (section 6)                                                        |

### 2.3 Inconsistencies to fix in R1 (Confirmed)

- Status pills use three different shapes (rounded rect "Off Duty", pill "Consent Granted", square-ish "Stage 1").
- Metric numerals are 36px on the dashboard and 44px on vitals ("No data" set at metric size, so absence looks like a value).
- Segmented controls: "Day/Week" uses a filled teal segment; "30/90/180 days" uses three separate outlined buttons; the patient profile uses underline tabs inside a bordered box.
- The yellow "Trends" pill uses brand gold as a selected state, against the master rule that gold is not a state colour.
- Header sync and refresh are two joined controls; "Refresh" also appears as a page button on most pages, so there are two refresh affordances.

---

## 3. Screenshot comparison

**From the references, borrow (principles only):** white panels on a cool canvas with a visible edge; one filled primary per region; segmented controls with a raised white active segment; dialogs with a purpose icon, title, one-line context, grouped fields, and a right-aligned Cancel + primary pair; "What you typed / Existing record" side by side in the duplicate dialog (Nkwapa already has a duplicate flow, so this is presentation only); tinted status text pills; a "next to check in" side panel pattern, which maps to Nkwapa's next patient at a station.

**Do not borrow:** ProVita branding, blue primary, red active-tab underline, hospital photography, payments, prescriptions with product art, urgent anonymous arrival, time-slot booking and rescheduling, consent e-signature, dose reminders, emergency-number banner, avatars of patients. None of these exist in Nkwapa's API.

**The approved concepts (03) agree with the master spec** and add three things the spec did not state: a greeting header, a mint "next action" hero with an illustration, and a numbered "next steps" list. All three are presentational and fed by data the app already has, with two exceptions recorded as decisions D2 and D3.

---

## 4. Token proposal (for R1)

Measured with WCAG 2.x relative luminance (script kept in the session scratchpad; R1 will add these pairs to the existing CI contrast check).

Decision D8: stay on the brand. The logo teal (`188 100% 32%`, `#008DA3`) and logo gold (`47 100% 55%`, `#FFCD1A`) are the only hues the palette starts from.

- **Every neutral is tinted from the logo teal (hue 188 to 198)**, so canvas, borders and ink read as one family with the brand instead of a generic grey.
- **Action teal is today's `--primary`**, unchanged. Dark mode keeps today's dark `--primary` (`188 80% 47%`).
- **New colours are derived, not imported:** mint is analogous to teal (hue 170, for the next-action hero); gold tint and gold ink come from the logo gold (for highlights such as a "new" marker, never a status); deep teal (hue 190) is reserved for one high-emphasis brand surface such as the sign-in panel.

Shipped in R1.1 as `globals.css` tokens with the pilot values. Measurements are from `npm run design:check-tokens` plus a scratchpad check of the pairs it does not cover. `--canvas` is `--background`, `--surface` is `--card`, `--ink` is `--foreground`.

### Light

| Token                                      | HSL                                     | Hex                   | Key measurement                                     |
| ------------------------------------------ | --------------------------------------- | --------------------- | --------------------------------------------------- |
| `--background` (canvas)                    | `180 23.8% 95.9%`                       | `#F2F7F7`             | Ink 14.04:1, muted 5.55:1, action teal 4.83:1       |
| `--card` / `--popover` (sheet)             | `0 0% 100%`                             | `#FFFFFF`             | Ink 15.18:1, muted 6.00:1                           |
| `--muted` / `--surface-2`                  | `180 23.1% 97.5%`                       | `#F7FAFA`             | Muted text 5.72:1, action teal 4.98:1               |
| `--accent` / `--selected`                  | `186.3 46.3% 92%`                       | `#E1F2F4`             | Action teal 4.53:1, muted 5.20:1                    |
| `--mint` / `--mint-line`                   | `171.4 38.9% 92.9%` / `170 31.6% 85.1%` | `#E6F4F2` / `#CDE5E1` | Muted 5.30:1                                        |
| `--primary` (unchanged)                    | `188 100% 27%`                          | `#00778A`             | White on it 5.22:1                                  |
| `--primary-hover` (R1.2)                   | `188 100% 24%`                          | `#006A7A`             | White on it 6.27:1                                  |
| `--brand` (logo, decorative only)          | `188.1 100% 32%`                        | `#008DA3`             | 3.93:1 on white: never text, never under white text |
| `--secondary` (logo gold, unchanged)       | `47 100% 55%`                           | `#FFCD1A`             | Ink on it 10.14:1. Accent only, never a state       |
| `--gold-surface` / `--gold-ink`            | `46.7 100% 92.9%` / `37.8 89.5% 26.1%`  | `#FFF7DB` / `#7E5207` | 6.31:1                                              |
| `--deep`                                   | `190.2 74.7% 17.1%`                     | `#0B414C`             | White 11.18:1                                       |
| `--foreground` (ink)                       | `197.1 29.6% 13.9%`                     | `#19282E`             |                                                     |
| `--muted-foreground`                       | `197.5 12.4% 38%`                       | `#55666D`             | AA on every light surface above                     |
| `--faint`                                  | `195.7 10.9% 58.6%`                     | `#8A9BA1`             | 2.89:1: placeholder and disabled only               |
| `--border` (decorative)                    | `190.9 18% 88%`                         | `#DBE4E6`             | 1.29:1 on white, exempt under 1.4.11                |
| `--input` (unchanged)                      | `200 15% 52%`                           | `#728B97`             | 3.59:1 on white, 3.33:1 on canvas                   |
| `--destructive`                            | `0 72% 49%` (was 51%)                   | `#D72323`             | 4.68:1 as text on canvas (51% fell to 4.44:1)       |
| `--severe-surface` / `--severe-ink` (R1.3) | `20 86% 89%` / `20 88% 31%`             | `#FBDBCB` / `#953809` | 5.67:1. Stage 2 blood pressure only (A8)            |
| `--sidebar`                                | canvas                                  | `#F2F7F7`             | Rail sits on the canvas; the sheet separates it     |

### Dark

| Token                                      | HSL                                   | Hex                   | Measurement                                            |
| ------------------------------------------ | ------------------------------------- | --------------------- | ------------------------------------------------------ |
| `--background`                             | `192 29.4% 6.7%`                      | `#0C1416`             | Ink 15.74:1, muted 7.66:1                              |
| `--card`                                   | `195 23.1% 10.2%`                     | `#141D20`             | Ink 14.48:1, muted 7.04:1                              |
| `--muted` / `--surface-2`                  | `192.9 21.9% 12.5%`                   | `#192427`             | Muted 6.54:1                                           |
| `--accent` / `--selected`                  | `188.1 42.5% 17.1%`                   | `#19393E`             | Muted 5.08:1, action teal 5.54:1                       |
| `--mint` / `--mint-line`                   | `182.6 35.4% 12.7%` / `178.1 32% 19%` | `#152B2C` / `#21403F` | Muted 6.12:1                                           |
| `--primary` (unchanged)                    | `188 80% 47%`                         | `#18BED8`             | Dark ink (`#0C1416`) on it 8.34:1; text on card 7.67:1 |
| `--primary-hover` (R1.2)                   | `188 80% 56%`                         | `#35D1E9`             | Dark ink on it 10.11:1                                 |
| `--gold-surface` / `--gold-ink`            | `42.6 40.3% 15.1%` / `47.1 84.6% 72%` | `#362D17` / `#F4DA7B` | 9.82:1                                                 |
| `--input`                                  | `192.4 11.8% 48%`                     | `#6C8389`             | 4.27:1 on card                                         |
| `--severe-surface` / `--severe-ink` (R1.3) | `18 38% 22%` / `22 85% 76%`           | `#4D3023` / `#F6B48E` | 6.72:1                                                 |
| `--border`                                 | `198 20.8% 18.8%`                     | `#26343A`             | Decorative                                             |
| `--deep`                                   | selected                              | `#19393E`             | No deeper teal exists in dark                          |

Status and chart tokens keep their derivation and pass on the new surfaces (status ink on surface 5.20 to 7.29 light, 6.37 to 6.83 dark); only light `--destructive` moved.

Geometry: `--radius: 0.5rem`, so `rounded-sm` 4px, `md` 6px, `lg` 8px, `xl` 12px; no squircles, circles only for avatars, dots and route stops. Form controls 48px tall on touch (44px floor stays), page gutter 16px phone / 24px tablet / 32px desktop. Named screens `compact` 600, `tablet` 840, `desktop` 1200. `font-mono` is self-hosted IBM Plex Mono 400/500 for codes, readings and times.

---

## 5. Adaptive layout strategy

One shell, three presentations, chosen by available width only. No user-agent checks. Same data hooks and state in every mode.

| Width         | Mode                      | Navigation                                                                                            | Content                                                                                                     |
| ------------- | ------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| under 600px   | Phone                     | Compact top bar (mark, clinic, sync pill, account) + **bottom nav**: up to 4 role destinations + More | Single column, cards replace tables, sheets for filters and pickers, sticky action bar above the bottom nav |
| 600 to 1199px | Compact tablet and tablet | **Labelled navigation rail** (88px, icon over label)                                                  | 2 columns from 840px; tables only when they fit, else cards; dialogs centred                                |
| 1200px and up | Desktop                   | **Labelled sidebar** (248px, collapsible to the rail)                                                 | 2 to 3 columns, full tables, side panels                                                                    |

**Role destinations for the bottom nav** come from `getAccessibleNavItems(bootstrap, 'sidebar')` in a fixed priority order: Dashboard, Stations, Today Board, My Assigned, Queues, Patients, Appointments. The first four the user can see become tabs; the rest, plus header and profile items and the sync center, go in the More sheet. A volunteer gets Home, Stations, Queues, Patients, More; a doctor without station access gets Home, Queues, Patients, Appointments, More. No route, permission or flag changes. Patients in the portal keep `PortalLayout` and get Home, Health, Appointments, More from the existing portal routes.

**Sheets:** filters, station choice, More, clinic switch and the sync center open as bottom sheets under 600px and as centred dialogs or side sheets above it. Small menus (account, row actions) stay popovers at every width.

**Data presentation:** `DataTable` stays the desktop surface. A `renderCard` (or equivalent) prop gives the same rows, sort and pagination state a card layout under a container width, so there is no second fetch and no second state machine.

**Forms:** single column under 600px with a sticky save bar; two columns from 600px for short paired fields (systolic/diastolic, first/last name). React state is not unmounted across breakpoints: the layout changes by CSS, not by rendering a different tree.

**Proof:** `r0-pilot/index.html` implements this adaptation in one file. Screenshots in `evidence/r0/` at 360, 390, 744, 1024 and 1440px; dark at 390 and 1440. No horizontal overflow at any of those widths (measured `scrollWidth - innerWidth = 0` after fixing a grid `min-width` bug the first run found).

---

## 6. Motion system

Owner-supplied principles, mapped to where each applies in Nkwapa. Durations use the existing tokens. Everything inherits the global reduced-motion rule, which keeps opacity changes and removes movement.

| #   | Principle                    | Where in Nkwapa                                                                                                              | Rule                                                                                                                                                                  |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Ease-out for entrances       | Sheets, dialogs, popovers, toasts, list rows                                                                                 | `--ease-out`; never `ease-in` for anything the user is waiting on                                                                                                     |
| 2   | Dropdowns at 150 to 250ms    | Select menus, account menu, row action menus, combobox                                                                       | Enter 200ms, exit 160ms                                                                                                                                               |
| 3   | Stagger list rows by 30ms    | First render of queue, station queue, next steps, search results                                                             | 30ms apart, cap at 6 rows (180ms). **Not** on refresh or pagination, where rows must not re-animate                                                                   |
| 4   | Scale to 0.97 on press       | Buttons, nav items, cards that are links                                                                                     | Already in `Button`; extend to nav and tappable cards                                                                                                                 |
| 5   | Stretch moving knobs 12%     | `SegmentedControl` indicator, any switch                                                                                     | The indicator stretches up to 12% in the travel direction mid-move and settles                                                                                        |
| 6   | Stagger as details settle    | Patient summary panels on the profile, dialog body after the frame                                                           | Container first, then contents 30ms apart                                                                                                                             |
| 7   | Arcs for object movement     | Rare. Chat widget launcher to panel; item moving between queue lanes if ever animated                                        | Curved path only for free movement across the screen; never for in-flow layout                                                                                        |
| 8   | Pulse to confirm success     | Local save of a reading, shift started, check-in completed                                                                   | **Must match the true state.** A local save pulses with "Saved on this device. Waiting to sync"; only a confirmed server write may say synced (master spec section 8) |
| 9   | Ease-in-out for moves        | Rail collapse, segmented indicator, shared nav pill                                                                          | `--ease-in-out` or `--ease-drawer` for things already on screen that move                                                                                             |
| 10  | Start popovers at 0.95       | All popovers and menus                                                                                                       | `scale(.95)` + opacity from 0                                                                                                                                         |
| 11  | Enter from the trigger       | Popovers, menus, tooltips                                                                                                    | Radix exposes `--radix-*-content-transform-origin`; use it as `transform-origin`                                                                                      |
| 12  | Exit to the trigger          | Same                                                                                                                         | Same origin on exit, so the menu collapses back into its button                                                                                                       |
| 13  | No bounce on everyday UI     | Everything clinical                                                                                                          | No overshoot springs on nav, forms, tables or status. Springs only with zero bounce (critically damped) for drag release                                              |
| 14  | Don't tween while held       | Bottom sheet drag, any slider                                                                                                | While the pointer is down, position follows the finger 1:1; animate only after release                                                                                |
| 15  | Make exits 20% shorter       | All enter/exit pairs                                                                                                         | 200ms in, 160ms out; sheets 240ms in, 190ms out                                                                                                                       |
| 16  | Overlap old and new states   | Route content, tab panels, sync pill text                                                                                    | Crossfade with overlap rather than fade-out then fade-in, so nothing blinks empty                                                                                     |
| 17  | Masks for reveals and colour | Segmented control active label, tab underline                                                                                | `clip-path` reveals the active label colour under the moving indicator instead of animating text colour per letter                                                    |
| 18  | Crossfade icons + blur       | Sync pill (cloud to device to warning), copy to check, show/hide password                                                    | Opacity, `blur(3px)` and `scale(.6)` swap in 150ms. ("Blue" in the brief meant blur; owner confirmed 2026-11-07.)                                                     |
| 19  | Rubber band past bounds      | Bottom sheet dragged up past its top, pull past list ends where the platform does not                                        | Resistance curve beyond the bound, spring back with no bounce                                                                                                         |
| 20  | Reuse the same layout        | Active nav indicator shared between items; segmented control pill; patient name moving from list card into the record header | Motion `layoutId` (Framer Motion is already a dependency) so the element moves rather than disappearing and reappearing                                               |

**Added after review of the codebase and current practice:**

21. **Do not animate what people repeat hundreds of times a day.** Keyboard actions (`[` rail toggle, Ctrl+S save, table paging) respond instantly.
22. **Never animate clinical numbers.** No count-up on BP, glucose or metrics; a value that animates through intermediate numbers shows readings that never happened.
23. **Interruptible by default.** State changes use CSS transitions, not keyframes, so a reversed toggle reverses from where it is.
24. **Transform and opacity only** for anything frequent, so nothing triggers layout or shifts measured content (the route audit measures overflow).
25. **Hover effects only where hover exists:** `@media (hover: hover)`; touch never gets a stuck hover state.
26. **Tooltips skip the delay** once one is open (Radix `skipDelayDuration`), so scanning icons is not slowed.
27. **Loading in the final shape,** already MASTER.md policy: skeletons match the layout they become.

The pilot demonstrates 1, 3, 4, 8, 10, 11, 12, 15, 16 and 18 with these exact values. The rest are specified here and land in R1 (primitives) and R2 (sheets, nav indicator).

---

## 7. Workflow validation of the concepts

| Concept element                                                  | Backed by existing data and behaviour? | Notes                                                                                                                          |
| ---------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Registered patients, visits today, draft visits, awaiting review | Yes                                    | Same figures the current dashboard shows                                                                                       |
| Stations overview with waiting counts                            | Yes                                    | `StationLineLanes` data                                                                                                        |
| Your work today: patients added, visits started, HAP notes       | Yes                                    | `VolunteerDashboard`                                                                                                           |
| Next steps 1 to 3                                                | Yes, derived                           | From shift state and draft count; no new API                                                                                   |
| "All synced" pill                                                | Yes                                    | `SyncStatusBar` states, including the local-save state                                                                         |
| Find patient button                                              | Yes                                    | Link to `/patients`                                                                                                            |
| Start volunteer shift **on the dashboard**                       | Partly                                 | The action exists in `ShiftControlCard` on Stations. Running it from the dashboard needs the shift read there too. Decision D2 |
| Queues count badge in the sidebar                                | Not today                              | Needs a count on every page. Decision D3                                                                                       |
| Doctor illustration                                              | No asset                               | Decision D4                                                                                                                    |
| Tablet rail label "Visits"                                       | Mismatch                               | The route is Appointments; labels stay as `app-nav.ts` names them (D7)                                                         |
| Phone hides Appointments and New patient                         | Fine                                   | They move to More                                                                                                              |

Station workflow in the pilot (off duty, start shift, choose station in a sheet, next patient, take patient, record BP with units, save locally, sync pending) follows the existing station semantics. The pilot does not show a crisis-level BP flow; R3 must design that state with the existing classification and confirmation rules.

---

## 8. Checkpoint decisions (answered 2026-11-07)

| ID  | Decision                                                           | Outcome                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | `01-current-ui/` showed real patient records in `apps/web/public/` | **Done.** All three folders moved to `docs/design-system/ui-refresh/references/`; 01 and 02 git-ignored (02 is a third-party product). Shareable "before" shots will come from the route audit harness on synthetic data |
| D2  | Dashboard shift action                                             | **Reuse the existing shift action** from Stations. Button label: **"Start shift"**                                                                                                                                       |
| D3  | Queue count badge in nav                                           | **Omit.** It would add a request to every page                                                                                                                                                                           |
| D4  | Hero illustration                                                  | Owned SVG or a licensed Lottie the owner supplies. Constraints in section 8.1                                                                                                                                            |
| D5  | Workspace typeface                                                 | **IBM Plex Sans** for all workspace text; Source Serif 4 kept for the public site and auth brand moments                                                                                                                 |
| D6  | Breakpoints                                                        | **Add** named screens `compact: 600px`, `tablet: 840px`, `desktop: 1200px` beside the defaults                                                                                                                           |
| D7  | Nav labels                                                         | **Keep** the `app-nav.ts` labels                                                                                                                                                                                         |
| D8  | Colours                                                            | **Stay on brand.** Palette rebuilt from the logo teal and gold with derived additions (section 4)                                                                                                                        |

### 8.1 Illustration and Lottie constraints (D4)

- Master spec section 9 forbids continuous decorative movement. A Lottie plays **once** on first view (at most about 2 seconds) and then rests on its final frame. It never loops.
- Under `prefers-reduced-motion` it shows the final frame only, so the file must have a good-looking final frame.
- Playing Lottie needs a player library. `lottie-web` is not a dependency today; adding one is a decision for R3.1. An SVG export of the final frame is required either way, as the reduced-motion and fallback image.
- Colours must be recolourable to `--primary`, `--brand`, `--gold` and `--mint` in light and dark. Flat or line style, transparent background, no text, no gradients, no photographic skin textures.
- Licence must allow commercial use without attribution in-app (for example the LottieFiles Free licence or the Lottie Simple License). Keep the source URL and licence with the file.
- Target size: under 150 KB JSON.

**Owner-supplied files (2026-11-07), `apps/web/public/lottie/`.** All five are free LottieFiles downloads with no licence metadata in the JSON. Confirm each licence on its LottieFiles page before shipping; `public/` is deployed.

| File                               | Verdict                                         | Why                                                                                                                                                                                        |
| ---------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Hello.json` (123 KB, 6 s)         | **Chosen for the dashboard band**               | Monochrome line art of a health worker waving with a clipboard; recolours cleanly to ink, surface and gold through CSS on the SVG paths. Pilot plays frames 0 to 60 (2.5 s) once and rests |
| `checklist.json` (25 KB, 3.3 s)    | **Chosen for the "shift started" confirmation** | Small, line style; plays frames 0 to 98 once. Its last frame is an empty clipboard, so it must stop at 98, not play to the end                                                             |
| `Doctor-1.json` (190 KB)           | Rejected                                        | Over budget; saturated stock blue with floating icons                                                                                                                                      |
| `doctor.json` (196 KB)             | Rejected                                        | Embeds a raster image; cannot be recoloured                                                                                                                                                |
| `Corona Doctor tweak.json` (84 KB) | Rejected                                        | COVID mask theme, off-brand colours                                                                                                                                                        |

Shipping note for R3.1: the pilot loads `lottie_light` 5.12.2 from cdnjs. The app must instead add a dependency (or lazy-load it) and export a static SVG of the rest frame for reduced motion and as a fallback. Delete the three rejected files before release.

### 8.2 Revised visual direction (owner feedback, 2026-11-07)

**Round 3 (owner, 2026-11-07).**

- Collapsed sidebar shows icons only (64 px, 44 px targets). The label stays in the accessibility tree and appears as a tooltip after 300 ms on hover or keyboard focus. The 600 to 1199 px rail keeps its labels, because tablets are touch-first and touch has no hover to reveal a tooltip.
- Welcome band: flowing contour lines drawn once on arrival (stroke-dash reveal, 1.4 s, staggered 80 ms) and a wave edge with a gold line that hands the band over to the sheet. Static after arrival; reduced motion shows the finished drawing. Every role's dashboard gets it.
- Doctor and clinic-manager dashboards added to the pilot (account menu, "View as"). Content mirrors today's `DoctorDashboard`, `NeedsYouNow` and `StationFlowDashboard`: no new data. Director and system-admin dashboards are not designed yet.
- Chart colours: BP categories use success, gold, warning (`#D9822B`, new) and danger; flagged diabetes uses gold. New tokens `--warning` and `--danger` as fills.

**Round 4 (owner, 2026-11-07).** Built with the `impeccable` delight playbook and craft floor, then checked with `web-design-guidelines` and axe.

- Greeting follows the device clock: morning 05:00 to 11:59 (rising sun on a horizon), afternoon 12:00 to 16:59 (full sun), evening 17:00 to 20:59 (setting sun in `--warning`), night (moon and two stars, still "Good evening"). Drawn SVG, one arrival animation, static under reduced motion. Date line uses `Intl.DateTimeFormat` in the device locale. The ✳ glyph and the date eyebrow above the heading are gone.
- Welcome band: five generated sea swells, stretched to the band so they keep about two crests at 390 px and roll gently at 1440 px; strokes stay 1.5 px (`vector-effect`). Revealed once by a left-to-right clip mask. A two-layer wave edge takes the time-of-day accent (gold by day, warning at evening, brand teal at night).
- New patient shows in the collapsed sidebar and the tablet rail.
- Seven additions: swipe left to check in on phone (row follows the finger, resists past 112 px, button alternative kept); undo toasts instead of confirmations (check in, end shift); a back-online summary of what changed while offline; shortcut hints (`/` focuses patient search, `[` on the collapse tooltip); an "All caught up" queues empty state using `checklist.json`; a patient header that hands over to a slim sticky bar on scroll; director and system-admin dashboards mirroring `DirectorDashboard` and `SystemAdminDashboard`.
- Lottie: the three rejected files are deleted; owner cleared the licences for `Hello.json` and `checklist.json`.

The sidebar stays collapsible at 1200 px and up (owner, 2026-11-07), with the same contract as `AppLayout`: header toggle, `[` shortcut ignored while typing, `nkwapa.sidebar.collapsed` in localStorage. Collapsed it becomes the 76 px rail used at 600 to 1199 px. Width eases with `--ease-drawer` over 200 ms, as `Sidebar.tsx` does today.

The owner judged pilot v1 "generic and AI-generated". Pilot v2 changes the direction:

- **One sheet, no card stacks.** Navigation sits on the tinted canvas; the work sits on a single white sheet inset at 600 px and above. Inside the sheet, sections are separated by hairlines and whitespace, not by white boxes. Only real objects get a boundary: the queue ticket, the BP readout, tables, sheets.
- **No squircles.** Radii drop to 4 / 6 / 8 / 12 px (control, button, object, sheet). Circles only for avatars, status dots and station stops.
- **Domain shapes instead of generic widgets.** The station flow is drawn as "The line", a route with a stop per station and its waiting count; your own station is the gold stop. The next patient is a queue ticket with a deep-teal stub and a perforation. BP entry is a large readout (`128 / 84 mmHg`) with the last recorded value beside it.
- **Type does more work.** Large page titles on the sheet, inline divided stat row instead of four cards, IBM Plex Mono for patient codes, queue numbers and eyebrows. Plex Mono is not in the app fonts yet (R1.1).
- **Colour stays D8.** Mint band for the dashboard greeting, deep teal only on the ticket stub, gold only for the logo, your station, and the illustration accent.

## 9. Implementation dependency plan

Each unit is a small branch from `release/dev` and one PR. Before any unit that changes visible text, grep `apps/web/e2e/` for the strings it touches (the route and dark-mode specs assert on them).

```text
R1  Foundation
 ├─ R1.1 Token values: brand-derived palette, dark set, named screens (D6, D8)  globals.css, tailwind.config.js
 ├─ R1.2 Button, Input, Select, Textarea: secondary fill, 48px touch, radii      components/ui/*
 ├─ R1.3 Panel surface + StatusLabel/Badge unification (A8 severity scale)       card, badge, status-label
 ├─ R1.4 SegmentedControl + Tabs: raised segment, stretch and mask motion        app-shell/SegmentedControl, ui/tabs
 ├─ R1.5 Popover/Dropdown/Select motion from trigger, exits 20% shorter          ui/dropdown-menu, select, tooltip
 └─ R1.6 DataTable header and row surfaces; card-render slot for narrow widths    ui/data-table
R2  Shell (needs R1.1 to R1.3)
 ├─ R2.1 Sidebar restyle + rail mode 600 to 1199                                  Sidebar, AppNavList
 ├─ R2.2 BottomNav (derived from getAccessibleNavItems) + More sheet              new app-shell/BottomNav, Header
 ├─ R2.3 Header: compact phone bar, sync pill icon crossfade                      Header, sync/SyncStatusBar
 ├─ R2.4 Sheet: drag to dismiss, no tween while held, rubber band                 ui/sheet
 └─ R2.5 Portal shell: same bottom nav pattern with portal destinations           PortalLayout
R3  Volunteer and clinical (needs R2)
 ├─ R3.1 Volunteer dashboard: "Start shift" via the existing shift action (D2), illustration (D4)
 ├─ R3.2 Stations: shift-first, station sheet, next patient, sticky take action
 ├─ R3.3 Patient registry: toolbar, filter sheet, cards on phone
 ├─ R3.4 Queues, R3.5 Registration, R3.6 Profile, R3.7 Vitals, R3.8 Encounters
R4 to R8 as in the master spec, unchanged in order.
```

**Next unit:** R1.1, token values only (section 4 palette and D6 screens), with before/after screenshots from the existing route audit harness (`docs/design-system/route-audit/`).

---

## 10. Limits of this review

- The pilot is static HTML with synthetic data. It shows presentation and motion values, not real data loading, permission filtering or offline behaviour.
- Only the volunteer role was captured in `01-Current UI/`. Doctor, manager, director, admin and portal screens were reviewed in code, not in screenshots.
- No browser zoom, virtual keyboard, installed-PWA or foldable testing was done in R0.
- Contrast values are computed, not checked with axe on the running app; R1 does that.
