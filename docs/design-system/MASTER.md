# Nkwapa Design System

**Status:** approved 2026-08-26 · **Issue:** [#61](https://github.com/akomapahealth/nkwapa/issues/69) · **Implements:** the token and component contract half of #61

This is the source of truth for Nkwapa's visual tokens and component contracts. It is the file [#66](https://github.com/akomapahealth/nkwapa/issues/66), [#65](https://github.com/akomapahealth/nkwapa/issues/65), [#22](https://github.com/akomapahealth/nkwapa/issues/22), and [#26](https://github.com/akomapahealth/nkwapa/issues/26) build against. Where this document and an issue body disagree, this document wins, and the issue should be amended.

Every contrast figure here is measured with the WCAG 2.1 relative luminance formula. Perceptual distances are CIEDE2000. Do not change a token value without re-measuring the pairings it appears in.

---

## 1. Design principles

Nkwapa is used by volunteers, nurses, and doctors in high-throughput clinics on unreliable connections. The interface is a clinical instrument, not a consumer product.

1. **Clinical, not consumer.** Dense, calm, legible. Information hierarchy over decoration. No marketing gradients, no decorative shadows, no emoji as icons.
2. **Legible to non-technical staff.** Plain-language labels. No system vocabulary in the UI. Units always visible on clinical values.
3. **Irreversible actions look different from routine ones.** Merge, finalize, consent, and delete never share a treatment with Save.
4. **Never blank the screen.** Clinic wifi is the assumed environment. Preserve last-known-good data while refetching.
5. **No layout shift.** Hover, help, loading, and navigation must not move content under a user mid-entry.

---

## 2. Brand colours

The Nkwapa wordmark is exactly two colours, sampled from `apps/web/public/images/nkwapa-logo.png`:

| Role      | Value               | Hex       |
| --------- | ------------------- | --------- |
| Logo teal | `hsl(188 100% 32%)` | `#008BA1` |
| Logo gold | `hsl(47 100% 55%)`  | `#FFCD1A` |

**The logo teal is not directly usable as a fill.** White text on it measures **3.91:1**, below the 4.5:1 AA floor for normal text.

### The derivation rule

> When a brand colour must move for accessibility, **keep its hue and saturation exactly and change only lightness**, by the minimum needed to clear the threshold.

This is why `--primary` is `188 100% 27%`. It is the logo teal darkened five points, not a different teal. Applying the rule keeps the relationship documentable and auditable.

The logo gold requires no compromise. Dark ink on it measures **9.90:1**, so `--secondary` is the exact logo value.

### Known drift

The Keycloak login theme carries a **parallel 14-variable token system** (`--nkwapa-bg`, `--nkwapa-primary`, and so on) whose values match nothing here, and it uses the landing-page typefaces rather than the application's. Tracked in [#83](https://github.com/akomapahealth/nkwapa/issues/83); out of scope for #61.

The mark itself is fine: `template.ftl` serves `img/nkwapa-logo.png`, byte-identical to the app's. But `resources/img/nkwapa-logo.svg` in the same directory is a different mark entirely (navy square, `N` monogram, `#0C4A5B` / `#22C7B9`), unreferenced by any template or stylesheet. It is dead weight to delete, not a logo to fix.

---

## 3. Colour tokens — light

Defined in `apps/web/app/globals.css` under `:root`. Consume via Tailwind utilities, never as raw hex.

### Surfaces

| Token                        | Value         | Hex       | Used for                     | Contrast                    |
| ---------------------------- | ------------- | --------- | ---------------------------- | --------------------------- |
| `--background`               | `54 63% 97%`  | `#FCFBF3` | Page canvas                  | 14.30:1 with `--foreground` |
| `--card`                     | `50 33% 98%`  | `#FCFBF8` | Cards, panels, popovers      | 14.31:1                     |
| `--sidebar`                  | `148 32% 88%` | `#D7EAE0` | Nav rail                     | 11.82:1                     |
| `--sidebar-border`           | `148 24% 70%` | `#A0C5B1` | Sidebar edge, group dividers | decorative                  |
| `--sidebar-muted-foreground` | `200 14% 32%` | `#46555D` | Sidebar group labels         | 6.13:1                      |
| `--muted`                    | `45 30% 93%`  | `#F3F0E8` | Table headers, inert fills   | 4.94:1                      |
| `--accent`                   | `47 60% 92%`  | `#F7F2DE` | Row hover, subtle emphasis   | 13.16:1                     |

**The canvas is warm cream, not white.** #61's original wording says "white canvas"; that wording is superseded. The warm neutral family (`background`, `card`, `muted`, `accent`) is coherent and already measured, and switching to pure white would require re-deriving all four.

**The sidebar is deliberately at 88% lightness.** That is the shallowest tint that still reads as a separate panel against the cream canvas (1.21:1). At 91% the separation drops to 1.14:1 and the two surfaces merge, which fails #66's requirement that the sidebar be visually distinct.

**The sidebar has its own foreground tokens.** At 88%, the standard `--muted-foreground` lands on the sidebar at 4.49:1, failing by 0.01. Rather than lighten the sidebar and lose panel separation, sidebar text uses `--foreground` for nav items (11.82:1) and `--sidebar-muted-foreground` for group labels (6.13:1).

### Ink

| Token                | Value         | Hex       | Used for                        | On canvas |
| -------------------- | ------------- | --------- | ------------------------------- | --------- |
| `--foreground`       | `200 25% 15%` | `#1D2930` | Body, headings, clinical values | 14.30:1   |
| `--muted-foreground` | `200 10% 40%` | `#5C6970` | Labels, units, secondary text   | 5.44:1    |

### Brand and action

| Token         | Value          | Hex       | Used for                           | Contrast           |
| ------------- | -------------- | --------- | ---------------------------------- | ------------------ |
| `--primary`   | `188 100% 27%` | `#00778A` | Primary buttons, active nav, links | 5.22:1 white on    |
| `--secondary` | `47 100% 55%`  | `#FFCD1A` | Brand accent, highlights           | 9.90:1 dark ink on |
| `--ring`      | `188 100% 27%` | `#00778A` | Focus ring                         | 5.04:1 on canvas   |

`--primary` also passes as _text_: 5.04:1 on canvas, **4.58:1 on `--muted`**. That second pairing matters because the MUI DataGrid override sets column headers to `--muted`, so teal header links land there.

### Status

| Token           | Value         | Hex       | Used for                         | Contrast           |
| --------------- | ------------- | --------- | -------------------------------- | ------------------ |
| `--success`     | `152 65% 30%` | `#1B7E50` | In range, synced, cosigned       | 5.05:1 white on    |
| `--warning`     | `32 90% 48%`  | `#E9820C` | Out of range, expiring, unsynced | 5.39:1 dark ink on |
| `--destructive` | `0 72% 51%`   | `#DC2828` | Critical values, delete, merge   | 4.80:1 white on    |

**Warning is orange, not amber, because the brand accent is gold.** If warning shared hue 47 with `--secondary`, a warning badge would be indistinguishable from decorative brand furniture. At hue 32 the separation is **ΔE 24.2**, 23° apart in Lab hue.

Status colour is never the only signal. Pair every status fill with a label or icon.

**Migration debt: 105 raw-palette status colours already exist.** Before these tokens, status was expressed with Tailwind's raw palette: **62 uses of `emerald-*`** and **43 of `amber-*`**, plus smaller counts of `rose-`, `green-`, `red-`, and `yellow-`. `components/ui/badge.tsx` already ships `success` and `warning` variants built on `bg-emerald-100` and `bg-amber-100`.

The semantic intent is already there throughout the app; it is simply bound to the wrong values. Until these call sites are swept, Nkwapa has **two parallel status colour systems**, which is exactly the mixed old/new state #65 forbids.

Sweep them in this order, because the first two propagate:

1. `components/ui/badge.tsx` — retarget the existing `success` / `warning` variants at the tokens.
2. `app/SyncStatusBar.tsx` — offline and online state, visible on every route.
3. `components/patients/AllergySummaryBanner.tsx` — clinical safety surface.
4. The remaining call sites, largest first: `research/exports` (9), `AppointmentsPortalScreen` (6), `AppointmentRequestScreen` (5), `landing/DashboardPreviewSection` (5), `admin/users` (4).

### Lines

| Token      | Value         | Hex       | Used for                        | On canvas       |
| ---------- | ------------- | --------- | ------------------------------- | --------------- |
| `--border` | `45 20% 87%`  | `#E4E1D7` | Decorative dividers, card edges | 1.26:1 — exempt |
| `--input`  | `200 15% 52%` | `#728B97` | **Every form control boundary** | 3.47:1          |

**`--input` is split from `--border` and must stay split.** WCAG 1.4.11 requires 3:1 for boundaries needed to identify a control. Form fields qualify; card edges and decorative dividers do not. Before this split both were `45 20% 87%` at 1.26:1, meaning every text input, select, and textarea in the product had an effectively invisible boundary.

Do not "fix" `--border` or `--sidebar-border` to reach 3:1. They are correctly exempt, and hardening them would add visual noise for no accessibility benefit.

### Charts

| Token       | Value          | Note                 |
| ----------- | -------------- | -------------------- |
| `--chart-1` | `188 100% 27%` | Tracks `--primary`   |
| `--chart-2` | `47 100% 55%`  | Tracks `--secondary` |
| `--chart-3` | `191 60% 25%`  | Unchanged            |
| `--chart-4` | `43 60% 70%`   | Unchanged            |
| `--chart-5` | `200 25% 45%`  | Unchanged            |

**Known limitation.** Series 1 and 3 are one hue at two lightnesses, and 2 and 4 likewise. That is legible on a line chart where position separates the series, but it fails on pie and stacked bar, and it is not deuteranopia-safe. Out of scope for #61; needs its own issue before any new chart type ships.

---

## 4. Colour tokens — dark

Defined under `.dark`. Dark mode inverts which side carries the ink: fills stay bright and take dark text.

| Token                        | Value         | Hex       | Contrast            |
| ---------------------------- | ------------- | --------- | ------------------- |
| `--sidebar`                  | `155 20% 14%` | `#1D2B25` | 12.68:1             |
| `--sidebar-border`           | `155 18% 26%` | `#364E44` | decorative          |
| `--sidebar-muted-foreground` | `155 8% 66%`  | `#A1AFA9` | 6.51:1              |
| `--primary`                  | `188 80% 47%` | `#18BED8` | 7.77:1 dark ink on  |
| `--secondary`                | `47 85% 52%`  | `#EDC01D` | 10.00:1 dark ink on |
| `--success`                  | `152 55% 50%` | `#39C684` | 7.89:1 dark ink on  |
| `--warning`                  | `35 90% 58%`  | `#F4A434` | 8.43:1 dark ink on  |
| `--input`                    | `200 14% 50%` | `#6E8591` | 4.74:1              |

All other `.dark` values are unchanged and already correct.

### How dark mode is wired

Until 2026-08-26 the `.dark` block never rendered. `tailwind.config.js` sets `darkMode: ['class']`, which requires a `.dark` class on an ancestor, and nothing applied it: `app/layout.tsx` rendered a bare `<html lang="en">`, and there was no theme provider anywhere. The block and its 27 `dark:` utility usages were dead code.

It is now wired, across three files:

| File                    | Role                                                                                                                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/theme-context.tsx` | `ThemeProvider` + `useTheme()`. Tracks a `light \| dark \| system` preference, resolves it, persists to `localStorage` under `nkwapa-theme`, and follows the OS while the preference is `system`.                                |
| `app/layout.tsx`        | An inline boot script in `<head>` that applies the class **before first paint**, so there is no flash of the wrong theme. `<html>` carries `suppressHydrationWarning` because that script mutates the DOM before React hydrates. |
| `components/Header.tsx` | An "Appearance" radio group in the existing user menu, built on `DropdownMenuRadioGroup`.                                                                                                                                        |

Two rules for anyone touching this:

1. **The boot script deliberately duplicates the resolve logic in `theme-context.tsx`.** It has to, because it runs before any module loads. If you change the class name, the storage key, or the resolution order in one, change it in the other.
2. **Every `localStorage` access is wrapped in `try`/`catch`.** It throws outright in some privacy modes, and a clinical app must not fail to render because a preference could not be read.

### Known risk: 27 previously-dead `dark:` utilities are now live

Turning dark mode on activated code paths that have never rendered for a user:

| File                                                    | Count |
| ------------------------------------------------------- | ----- |
| `components/portal/AppointmentsPortalScreen.tsx`        | 6     |
| `components/portal/AppointmentRequestScreen.tsx`        | 5     |
| `components/ui/badge.tsx`                               | 4     |
| `components/patients/AllergySummaryBanner.tsx`          | 4     |
| `components/patients/MedicationReconciliationPanel.tsx` | 2     |

Several of these are bound to raw palette values (`dark:bg-amber-900/30`, `dark:text-emerald-300`) rather than tokens, so they will not track the token system. Fold them into the status-colour sweep in section 3 rather than fixing them separately.

**Dark mode is still not verified per group during demo week.** The wiring is correct and the values are measured, but walking every migrated route in dark roughly doubles the QA cost of each #65 group. Book a dedicated dark-mode pass after the demo, and start it with the five files above.

---

## 5. Radius

`--radius` is `0.625rem` (10px).

| Step | Value | Used for                 |
| ---- | ----- | ------------------------ |
| `sm` | 6px   | Badges, chips, pills     |
| `md` | 8px   | Buttons, inputs, selects |
| `lg` | 10px  | Cards, panels            |
| `xl` | 14px  | Dialogs, sheets          |

**Nothing rounder than 14px.** `rounded-[28px]` is hard-coded in 20 files, bypassing the token entirely, and it is what carries the legacy gradient hero. 28px on a dense clinical table reads as a consumer app and costs vertical space the Today board does not have.

### Legacy pattern to delete

```
rounded-[28px]
bg-gradient-to-br from-primary/15 via-card to-secondary/15
shadow-xl shadow-primary/5
```

Present in exactly three files: `app/(workspace)/today/page.tsx`, `app/(workspace)/admin/users/page.tsx`, `app/(workspace)/my/assigned/page.tsx`. Replace with `AppPageHeader`. This pattern violates principle 1 above and #61's own non-goal on generic gradients.

The `landing-hero-mesh`, `landing-gradient-mesh-alt`, and `landing-glass` utilities in `globals.css` are **scoped to `app/(marketing)` only** and are exempt. They must not appear on any workspace route.

---

## 6. Typography

| Role          | Family         | Token            |
| ------------- | -------------- | ---------------- |
| Headings      | Source Serif 4 | `font-heading`   |
| Body and data | IBM Plex Sans  | `font-body`      |
| Landing only  | Poppins        | `font-landing-*` |

The serif heading is deliberate. It separates headings from data at a glance, which a single-family system does not, and it is the most distinctive element of the current identity.

**Apply `font-variant-numeric: tabular-nums` on every numeric column.** Currently it is not applied anywhere, and vitals columns do not align.

**Known performance issue.** Fonts load via `@import` at the top of `globals.css`, which is render-blocking and serialized. On clinic wifi this delays first paint of any text. Migrating to `next/font` would self-host and remove the blocking request. Its own issue, not #61.

---

## 7. Motion

- **150ms** for colour and opacity.
- **200ms** for position.
- Nothing longer in a clinical view.
- **No transform-based hover.** Scale and translate on hover cause layout shift, which #63 and #66 both prohibit. Use colour or opacity.
- `prefers-reduced-motion` is already handled globally in `globals.css` and is correct. Do not duplicate it per component.

---

## 8. Density, targets, breakpoints

| Rule                       | Value                   |
| -------------------------- | ----------------------- |
| Table row height, desktop  | 44px                    |
| Table row height, touch    | 52px                    |
| Minimum interactive target | 44px                    |
| Breakpoints                | 375 / 768 / 1024 / 1440 |

The 52px touch row already exists in the MUI DataGrid override. The `.touch-target` utility already exists in `globals.css`; it is simply not applied consistently.

---

## 9. Component contract

Shared primitives live in `apps/web/components/app-shell/` and `apps/web/components/ui/`. **Do not build a second family of any of these.**

| Need                                | Use                                        | Do not                            |
| ----------------------------------- | ------------------------------------------ | --------------------------------- |
| Page title, actions, context        | `AppPageHeader`                            | Hand-rolled `<h1>` + hero section |
| KPI / metric                        | `AppMetricCard`                            | Bespoke stat card                 |
| Form grouping                       | `FormSectionCard`                          | Bare `<Card>` with a heading      |
| Loading / empty / error / no-access | `AppState` (`components/feedback/`)        | Per-page spinner or blank div     |
| Contextual help                     | `InfoHint` (`components/ui/info-hint.tsx`) | A second tooltip system           |
| Filter summary                      | `ActiveFilterSummary`                      | Inline filter chips               |
| View switching                      | `SegmentedControl`                         | Bare button group                 |

`components/ui/progressive-help.tsx` overlaps with `InfoHint`. Resolve the overlap in #63 rather than extending both.

### Button hierarchy

| Level       | Treatment                                       | Use for                              |
| ----------- | ----------------------------------------------- | ------------------------------------ |
| Primary     | `--primary` fill, white text                    | The one main action per view         |
| Secondary   | Transparent, `--input` border, `--primary` text | Supporting actions                   |
| Ghost       | Transparent, no border, `--foreground` text     | Tertiary, in-table actions           |
| Destructive | `--destructive` fill, white text                | Delete, merge, anything irreversible |

One primary per view. Destructive actions require a confirmation step naming what will change.

---

## 10. Deliberately not settled here

These are the remaining half of #61 and are **not** blockers for #66, #22, or #65.

- **Clinical form rules.** Units, validation timing, required and optional markers, error recovery, locked-record and addendum display. These are interaction contracts, not tokens, and need a pass over the real encounter forms.
- **Wireframes.** #61 asks for approved wireframes for key workflows on desktop and mobile. Not attempted, and not achievable inside demo week.
- **Chart palette rework.** See the limitation in section 3.
- **Keycloak brand alignment.** See section 2.

---

## 11. Verification

Run after any change to this file or to `globals.css`:

```bash
cd apps/web
npm run typecheck
npm run lint
npm run e2e
```

`role-access.spec.js`, `workspace-smoke.spec.js`, and `accessibility.spec.js` are the specs that catch a visual change silently breaking a role or tenant boundary.

Then a manual pass at 375 / 768 / 1024 / 1440 and 200% zoom, plus keyboard-only on any changed route.

**Never change a token value without re-measuring every pairing it appears in.** The contrast comments in `globals.css` record why each value is what it is; keep them accurate.
