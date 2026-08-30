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

### Resolved: the Keycloak login theme is on these values

The login theme used to carry a **parallel 14-variable token system** (`--nkwapa-bg`,
`--nkwapa-primary`, and so on) whose values matched nothing here, and to use the landing-page
typefaces rather than the application's. Closed by [#83](https://github.com/akomapahealth/nkwapa/issues/83).

A Keycloak theme cannot import `globals.css` -- different origin, different process -- so
`infra/nkwapa/keycloak/themes/nkwapa/login/resources/css/styles.css` still declares its own
variables. They now mirror this document token for token, each one annotated with the token it
mirrors, under a header saying the two files must move together. **Changing a value in section 3
means changing it there too.** `apps/web/e2e/login-theme.spec.js` is what notices if they part
company again: it asserts the typeface, the primary fill, the radius ceiling and the absence of
any third-party font request.

Two things worth carrying forward from that work:

- The theme **self-hosts** IBM Plex Sans and Source Serif 4 as `latin`-subset variable woff2
  (~91 KB together, with their OFL licences). It previously blocked first paint on two serialized
  `@import`s to `fonts.googleapis.com` and `fonts.cdnfonts.com`. The application still loads its
  own fonts the old way; see section 6.
- The theme is **deliberately light-only**. The app's theme choice lives in `localStorage` on the
  web origin, which Keycloak cannot read, so honouring `prefers-color-scheme` there would give a
  dark-OS user a dark login followed by a light workspace -- worse drift than staying light.

The mark was never the problem: `template.ftl` serves `img/nkwapa-logo.png`, byte-identical to the
app's. The stale `nkwapa-logo.svg` beside it (navy square, `N` monogram, `#0C4A5B` / `#22C7B9`),
`nkwapa-logo-2.png`, and `nkwapa-clinic-illustration.svg` were unreferenced by any template or
stylesheet and are deleted -- about 820 KB.

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

### Tinted status: use the ink tokens, never the fill token

| Token               | Value         | Hex       | On its own 12% tint        |
| ------------------- | ------------- | --------- | -------------------------- |
| `--info`            | `200 60% 40%` | `#297AA3` | workflow "awaiting review" |
| `--success-ink`     | `152 65% 26%` | `#176D45` | 5.20:1                     |
| `--warning-ink`     | `32 90% 28%`  | `#884C07` | 5.94:1                     |
| `--info-ink`        | `200 60% 26%` | `#1B506A` | 7.52:1                     |
| `--destructive-ink` | `0 72% 38%`   | `#A71B1B` | 6.20:1                     |

The tinted badge pattern is `bg-<token>/12` plus `text-<token>-ink`.

**All four statuses have an ink token.** Destructive did not until #94, and it was the one status
still using its fill as text on its own tint, on nine surfaces including
`AllergySummaryBanner` -- the banner a clinician reads before prescribing. `--destructive` is fine
as text on a neutral surface (4.64:1 on the card) and fails on every tint of itself: 4.29:1 at
`/5`, 3.99:1 at `/10`, 3.13:1 at `/25`, 2.66:1 at `/35`. Use `text-destructive` on a plain
surface and for icons, which need 3:1 rather than 4.5:1; use `text-destructive-ink` the moment
there is a destructive tint underneath.

That gap survived a token contract, a full migration and a dedicated dark-mode pass because
**nothing in the suite ran axe over a page that was reporting an error**.
`e2e/route-fallbacks.spec.js` now does, on a deliberately invalid date range.

**Reusing the fill token as text on its own tint fails AA.** Measured: `text-success` on `bg-success/12` is **4.28:1**, and `text-warning` on `bg-warning/12` is **2.42:1**. The tint lightens the ground while the ink stays put, so contrast falls below the solid-on-white baseline. The ink tokens are the same hue and saturation, darkened until they clear with headroom.

`--info` exists because the clinical note workflow has a **draft → review → finalized** progression, and "awaiting review" is neither success, warning, nor destructive. It is not a brand colour and must not be used for actions.

**`draft` is deliberately neutral** (`bg-muted` + `--muted-foreground`, 4.94:1). A draft note is not a warning; colouring it amber put it in the same visual class as an out-of-range clinical value.

**The raw-palette migration is complete.** Before Phase 6 the product expressed status with
Tailwind's raw palette -- 108 occurrences across 18 files -- so it ran two status colour systems at
once. That is now zero, verified by scan across `apps/web/app` and `apps/web/components`. The
landing page is excluded from the scan and keeps its own treatment; it is a Persuade surface, not a
clinical one.

Three files were worth naming while it was happening, and are worth naming now that it is done:
`components/ui/badge.tsx` (broadest reach), `app/SyncStatusBar.tsx` (deleted -- it had no importers
and duplicated the header's sync pill), and `components/patients/AllergySummaryBanner.tsx`, the one
a clinician reads before prescribing.

### Lines

| Token      | Value         | Hex       | Used for                        | On canvas       |
| ---------- | ------------- | --------- | ------------------------------- | --------------- |
| `--border` | `45 20% 87%`  | `#E4E1D7` | Decorative dividers, card edges | 1.26:1 — exempt |
| `--input`  | `200 15% 52%` | `#728B97` | **Every form control boundary** | 3.47:1          |

**`--input` is split from `--border` and must stay split.** WCAG 1.4.11 requires 3:1 for boundaries needed to identify a control. Form fields qualify; card edges and decorative dividers do not. Before this split both were `45 20% 87%` at 1.26:1, meaning every text input, select, and textarea in the product had an effectively invisible boundary.

Do not "fix" `--border` or `--sidebar-border` to reach 3:1. They are correctly exempt, and hardening them would add visual noise for no accessibility benefit.

### Charts

Series identity. Verified in CI by `scripts/check-chart-palette.mjs`; **do not hand-edit these
without re-running it.**

| Token       | Light         | Hex       | Dark           | Hex       | On its card     |
| ----------- | ------------- | --------- | -------------- | --------- | --------------- |
| `--chart-1` | `188 99% 33%` | `#0191A7` | `188 100% 37%` | `#00A4BD` | 3.62:1 / 5.67:1 |
| `--chart-2` | `48 97% 43%`  | `#D8AD03` | `48 99% 35%`   | `#B28E01` | 2.05:1 / 5.44:1 |
| `--chart-3` | `321 97% 29%` | `#92025F` | `326 55% 46%`  | `#B6357E` | 8.47:1 / 3.06:1 |
| `--chart-4` | `246 99% 75%` | `#8D80FE` | `246 96% 74%`  | `#8A7DFC` | 3.05:1 / 5.17:1 |
| `--chart-5` | `20 99% 36%`  | `#B73E01` | `20 96% 41%`   | `#CD4704` | 5.48:1 / 3.62:1 |

Separation, as ΔE in OKLab ×100, worst pair, under normal vision and under protanopia,
deuteranopia and tritanopia simulated with Machado 2009 at severity 1:

| Mode  | Pairs    | Worst CVD | Worst normal |
| ----- | -------- | --------- | ------------ |
| light | adjacent | 22.2      | 28.2         |
| light | all      | 7.9       | 17.5         |
| dark  | adjacent | 16.3      | 22.0         |
| dark  | all      | 6.5       | 15.6         |

**Slots 1 and 2 are derived from the brand, not equal to it.** They hold the logo hues exactly --
teal 188, gold 48 -- and move only lightness and saturation, per the derivation rule in section 2.
`--primary` at 27% lightness has chroma 0.092, under the 0.10 floor below which a hue stops
carrying identity in a chart mark, and `--secondary` at 55% is too light to be a reliable mark.

**`--chart-2` is the one slot below 3:1 on the card**, and that is not fixable: no yellow reaches
3:1 on a near-white ground while still reading as yellow. Any chart using it must name its series
in a legend and label its marks directly, so colour is never the only channel. The same obligation
applies to the two all-pairs figures in the 6-8 band.

**Resolved: the old ramp was worse than this document claimed.** It recorded series 1/3 and 2/4 as
one hue at two lightnesses, legible on a line chart and failing on pie. Measuring found
`--chart-1` and `--chart-5` at ΔE 6.1 across all pairs under _normal_ vision -- two series a
full-colour reader cannot reliably separate -- and eight of the ten slots outside the lightness
band or under the chroma floor.

**There is no pie chart in this product, deliberately.** A pie is the one form where any two marks
can touch, which caps a colourblind-safe categorical palette at roughly three series; past that no
palette can rescue it. The hypertension donut that used to ship drew six classifications from five
colours with `COLORS[i % COLORS.length]`, so `NORMAL` and `UNKNOWN` were the same teal. It is a
horizontal bar chart ordered by clinical severity now. Bars put the category on an axis, so colour
never has to carry identity.

**Charts do not animate.** Recharts' 1500ms draw-in is driven from JavaScript and the global
`prefers-reduced-motion` rule cannot switch it off, so every chart passes
`isAnimationActive={false}`. Axis ticks set `fontVariantNumeric: 'tabular-nums'` inline, because
Recharts renders them as SVG text where the utility class cannot reach.

**`--landing-accent`** (`191 60% 25%` light, `191 50% 35%` dark) exists so the landing page stops
borrowing `--chart-3` for brand furniture. It is a Persuade surface with its own treatment; do not
use this token on a clinical view.

## 4. Colour tokens — dark

Defined under `.dark`. Dark mode inverts which side carries the ink: fills stay bright and take dark text. The tinted badge inverts too, becoming a dark tint of the hue carrying light ink.

| Token                        | Value         | Hex       | Contrast               |
| ---------------------------- | ------------- | --------- | ---------------------- |
| `--sidebar`                  | `155 20% 14%` | `#1D2B25` | 12.68:1                |
| `--sidebar-border`           | `155 18% 26%` | `#364E44` | decorative             |
| `--sidebar-muted-foreground` | `155 8% 66%`  | `#A1AFA9` | 6.51:1                 |
| `--primary`                  | `188 80% 47%` | `#18BED8` | 7.77:1 dark ink on     |
| `--secondary`                | `47 85% 52%`  | `#EDC01D` | 10.00:1 dark ink on    |
| `--success`                  | `152 55% 50%` | `#39C684` | 7.89:1 dark ink on     |
| `--warning`                  | `35 90% 58%`  | `#F4A434` | 8.43:1 dark ink on     |
| `--input`                    | `200 14% 50%` | `#6E8591` | 4.74:1                 |
| `--info`                     | `200 60% 58%` | `#54A9D4` | workflow state         |
| `--success-ink`              | `152 40% 74%` | `#A2D7BE` | 6.82:1 on its tint     |
| `--warning-ink`              | `35 75% 74%`  | `#EEC58B` | 6.74:1 on its tint     |
| `--info-ink`                 | `200 45% 74%` | `#9FC7DB` | 6.49:1 on its tint     |
| `--destructive-ink`          | `0 50% 80%`   | `#E6B3B3` | 8.06:1 on its tint     |
| `--destructive`              | `0 62% 66%`   | `#DE7373` | 5.48:1 as text on card |

All other `.dark` values are unchanged and already correct.

**`--destructive` is lighter in dark mode than in light, and carries dark ink.** That inversion is
forced, not stylistic. `text-destructive` is how every field error, error notice and destructive
menu item colours itself -- 32 call sites -- and at the previous `0 62% 45%` it measured **3.02:1**
on the dark canvas, so every destructive word in the product failed AA in dark mode. One token
cannot serve both uses at that lightness: text on the card needs L >= 60 and white on the fill
needs L <= 54, and those windows do not overlap. Flipping `--destructive-foreground` to dark ink
is the usual dark-theme answer and clears all four pairings at 66% -- 5.92:1 on the canvas, 5.48:1
on the card, 4.67:1 on its own 12% tint, and 5.60:1 for the ink on the fill.

It was found by `e2e/dark-mode.spec.js`, on `/appointments`, where the "Decline" action is the
first thing axe reaches. Nothing had looked before, which is the whole argument for that spec.

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

### Resolved: the previously-dead `dark:` utilities are gone

Turning dark mode on activated code paths that had never rendered for a user. Rather than audit
them, Phase 6 deleted all of them: **every `dark:` utility in the product existed only to patch a
raw palette colour that broke under a theme it was never tested in.** Moving the base colour onto a
token removes the need for the patch, because tokens resolve in both modes -- which is the whole
reason to have them.

The count is now zero and should stay there. **Do not add a `dark:` utility.** If a colour needs
one, the colour is wrong: reach for a token, or add one and record its measured contrast here.

------------------------------------------------------- | ----- |
| `components/portal/AppointmentsPortalScreen.tsx` | 6 |
| `components/portal/AppointmentRequestScreen.tsx` | 5 |
| `components/ui/badge.tsx` | 4 |
| `components/patients/AllergySummaryBanner.tsx` | 4 |
| `components/patients/MedicationReconciliationPanel.tsx` | 2 |

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

All four steps are real Tailwind classes. `xl` was added to `tailwind.config.js` during the Phase 6 migration because Tailwind's stock `rounded-xl` is 12px, not the 14px this table specifies.

**Nothing rounder than 14px.** That rules out `rounded-2xl` (16px) and `rounded-3xl` (24px) as well as the arbitrary values. On a dense clinical table a 28px corner reads as a consumer app and costs vertical space the Today board does not have.

Measured before the Phase 6 migration: `rounded-[28px]` in 32 files (78 occurrences), plus `[24px]`, `[26px]`, `[30px]` and `[32px]` — five arbitrary radii inside one product, three of them inside the fallback components alone.

### Resolved: the legacy hero is gone

```
rounded-[28px]
bg-gradient-to-br from-primary/15 via-card to-secondary/15
shadow-xl shadow-primary/5
```

It lived in `today`, `admin/users` and `my/assigned`, and all three are `AppPageHeader` now, with
their metrics as a sibling grid rather than nested inside the hero.

Counted across `apps/web/app` and `apps/web/components`, excluding the landing page: arbitrary or
oversized radii went 35 to 0, gradients on clinical surfaces 3 to 0, and uppercase tracking values
7 to 0. `e2e/responsive-migration.spec.js` holds the line on layout; a grep holds the line on the
rest.

The `landing-hero-mesh`, `landing-gradient-mesh-alt` and `landing-glass` utilities in `globals.css`
are **scoped to `app/(marketing)` only** and are exempt. They must not appear on a workspace route.

**Shadow above `shadow-sm` is for things that genuinely float** -- a dialog, a sheet, a popover, the
chat panel, a help bubble. That is depth doing a job, not decoration, and it is the one exception
to the flatness rule.

---

## 6. Typography

| Role          | Family         | Token            |
| ------------- | -------------- | ---------------- |
| Headings      | Source Serif 4 | `font-heading`   |
| Body and data | IBM Plex Sans  | `font-body`      |
| Landing only  | Poppins        | `font-landing-*` |

The serif heading is deliberate. It separates headings from data at a glance, which a single-family system does not, and it is the most distinctive element of the current identity.

**One uppercase micro-label treatment: `.text-eyebrow`.** Eight tracking values (0.14em through 0.3em) were in use on what is visually the same element — the small caps label above a heading, a metric, or a section. Eight is noise, not hierarchy. 0.14em is the widest setting that still reads as one word at 12px; 0.3em was splitting labels into letters. Colour is left to the caller, because the same label is `--primary` above a page title and `--muted-foreground` above a metric.

**`tabular-nums` on every numeric column and every clinical value.** It was applied nowhere, so vitals columns did not align. It now ships from `dataGridSx` for every grid cell and from `AppMetricCard` for every metric; individual clinical values in panels take the utility directly.

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

Both row heights are set by `dataGridSx` in `lib/datagrid-theme.ts`, which every grid in the product consumes. It also makes the numerals tabular and sticks the column headers, because a roster that runs past a viewport is unreadable once its headers scroll away.

The 44px floor is enforced in the primitives rather than per call site: `Button`, `Input`, `Select` and its menu rows, `Tabs` triggers, and the two help triggers. Where the glyph must stay small — a help icon, a toast dismiss — the target is a centred pseudo-element rather than a `min-height` on the visible box. `.touch-target` set `min-height`/`min-width` on the element itself, which silently overrode every size a call site asked for and pushed metric-card headers around by 20px.

Focus rings are `ring-2 ring-ring` everywhere. They were `ring-1` on form controls and `ring-2` on everything else.

---

## 9. Component contract

Shared primitives live in `apps/web/components/app-shell/` and `apps/web/components/ui/`. **Do not build a second family of any of these.**

| Need                            | Use                                                 | Do not                                    |
| ------------------------------- | --------------------------------------------------- | ----------------------------------------- |
| Page title, actions, context    | `AppPageHeader`                                     | Hand-rolled `<h1>` + hero section         |
| KPI / metric                    | `AppMetricCard`                                     | Bespoke stat card                         |
| Form grouping                   | `FormSectionCard`                                   | Bare `<Card>` with a heading              |
| A field's error                 | `FieldError` + `fieldErrorProps`                    | A bare `<p className="text-destructive">` |
| A required field                | `RequiredMark` + one `RequiredLegend` per form      | An asterisk baked into the label string   |
| A form-level message            | `InlineNotice`                                      | A `<div>` with no role                    |
| One read's five states          | `ResourceState` + `useAsyncResource`                | A hand-rolled `useState` triple           |
| Loading                         | `SectionSkeleton` / `PageSkeleton`                  | A spinner in the middle of content        |
| Nothing here yet                | `EmptyState`                                        | A dashed div with a paragraph             |
| Failed, can retry               | `InlineErrorState`                                  | A red box with no way forward             |
| Not allowed                     | `NoAccessState`                                     | An error state wearing red                |
| No clinic chosen                | `SelectClinicState`, or `RouteGuard requiresClinic` | "Select a clinic to …" in a `<p>`         |
| Contextual help                 | `InfoHint`                                          | A second tooltip system                   |
| Help that must actually be read | `ProgressiveHelp`                                   | Hiding it in a bubble                     |
| Filter summary                  | `ActiveFilterSummary`                               | Inline filter chips                       |
| View switching                  | `SegmentedControl`                                  | Bare button group                         |
| Uppercase micro-label           | `.text-eyebrow`                                     | Another `tracking-[0.Nem]` value          |
| Data table                      | `dataGridSx` from `lib/datagrid-theme`              | Restyling the grid at the call site       |

### The two help affordances

They are not duplicates and neither replaces the other. They used to share the `CircleHelp` glyph, so two components that behave completely differently were indistinguishable until you clicked one; `ProgressiveHelp` now uses a book.

|                        | `InfoHint`                                         | `ProgressiveHelp`                             |
| ---------------------- | -------------------------------------------------- | --------------------------------------------- |
| Shape                  | Floating bubble in a portal                        | Inline `<details>` disclosure                 |
| Layout                 | Never moves the page                               | Pushes content down when opened               |
| Visible before opening | A question mark only                               | Its own title                                 |
| Carries                | One sentence that helps you read what is on screen | Content the user is expected to actually read |
| Never carries          | Anything required                                  | —                                             |

Safety rules, consent wording, what stays protected on a record, and de-identification terms belong in `ProgressiveHelp`. #63 forbids moving them into a bubble, and that rule is the reason both components exist.

`InfoHint` enforces single-open across the whole page through a module-level registry: opening one closes any other. It returns focus to its trigger on Escape, and on an outside click when focus was inside the bubble. Its 44px target is a centred pseudo-element, so a call site's size override actually applies.

### The five states, in order

`ResourceState` renders them so no page has to remember the sequence: **offline → skeleton → error with retry → empty → content**.

The case that matters is the last one. `useAsyncResource` keeps the last value that loaded successfully across a refetch _and across a failed refetch_, so a poll that times out on clinic wifi puts a banner above data that is still on screen rather than replacing a measurement someone is reading with a spinner. That is principle 4, and it is the single loudest way this product used to read as broken.

`EmptyState` has two densities. `comfortable` owns a whole panel; `compact` sits inside a board column, a card, or a dialog, where a centred block would push the real content off the fold. Two is the honest number — an empty queue column and an empty page are not the same message. Six shapes existed before.

An empty state's title is an `<h3>`. An empty region is still a region, and a screen-reader user navigating by heading needs to land on "No visits yet" the same way a sighted user's eye does.

### Button hierarchy

| Level       | Treatment                                       | Use for                              |
| ----------- | ----------------------------------------------- | ------------------------------------ |
| Primary     | `--primary` fill, white text                    | The one main action per view         |
| Secondary   | Transparent, `--input` border, `--primary` text | Supporting actions                   |
| Ghost       | Transparent, no border, `--foreground` text     | Tertiary, in-table actions           |
| Destructive | `--destructive` fill, white text                | Delete, merge, anything irreversible |

One primary per view. Destructive actions require a confirmation step naming what will change.

---

## 10. Clinical form contract

Six encounter forms, roughly 1,900 lines, and until #61 closed they ran three different validation
models, two different locked-record patterns, two different required-field conventions, and one
field-error component that only one of them could see because it was declared privately inside
that file. This is what they agree on now.

There is **no form library** in this product -- no react-hook-form, no zod, no formik -- and
adding one is out of scope under #82's "no new global library" rule. The contract is held by small
shared primitives in `components/ui/field.tsx` instead.

### Units

Units live **in the label**, in parentheses, and are repeated on the read-only view.

`Systolic BP (mmHg)`, `Weight (kg)`, `HbA1c (%)`, `Dosage (with unit, e.g. mg)`. Never units in a
placeholder alone: a placeholder disappears on the first keystroke, so the one moment a prescriber
is typing a number is the one moment the unit is not on screen. `PrescriptionForm` did exactly
that with `e.g. 10mg`, and its Quantity field carried no unit at all.

The dynamic case is `VitalsForm`'s temperature, whose label recomputes from the unit `Select`
beside it. Derived read-only values state their unit too: `BMI (kg/m²)`.

### Validation timing

**On submit, then per field as it is corrected.** Not on blur.

Validating on blur scolds a clinician for a field they have not finished with -- tabbing through a
form to see it is enough to trigger it. Validating only on submit and then never again leaves an
error on screen after it has been fixed. The two together are the accessible default:

- submit runs the whole validator and renders every field's message at once;
- changing a field that currently has an error clears just that message;
- nothing validates before the first submit.

Rules live outside the component where they are testable: `lib/clinical-measurements.ts` holds the
cross-field clinical rules (systolic above diastolic, a temperature that converts into 25-45 °C, a
blood-pressure context that requires a reading), and `validateClinicalMeasurements` is unit-tested.

### Required and optional

**Mark what is required. Do not mark what is optional.** On these forms most fields are optional,
so annotating the majority is noise.

- `<RequiredMark />` after the label text, and `required` on the control.
- One `<RequiredLegend />` per form, because an asterisk with nothing explaining it is a
  convention the reader has to already know.
- The asterisk is `aria-hidden`. The control's own `required` is what a screen reader announces;
  leaving the asterisk in the accessible name made it read "First name star required".
- Requiredness is never expressed as a disabled submit button alone. `PrescriptionForm` disabled
  Save on four conditions at once, so a prescriber faced a button that would not press and nothing
  saying which of the four was unmet.

The codebase previously ran both conventions inside the same submitted form: `*` in
`RegisterPatientScreen` and `(optional)` in `ResidentialLocationFields`.

### Error recovery

- The message renders **beside the field**, through `FieldError`, which carries `role="alert"`.
- The control gets `aria-invalid` and `aria-describedby` via `fieldErrorProps(id, message)`, and
  **looks** invalid: `Input` and `Textarea` carry an `aria-[invalid=true]` border. Before this
  `VitalsForm` was setting `aria-invalid` and nothing changed on screen.
- A failed submit **moves focus to the first invalid field**, via `focusFirstInvalid(errors,
order)`. Pass the on-screen order; the error object's own key order is whatever order the
  validator happened to run in. No form did this before.
- Form-level messages use `InlineNotice`, which is `role="alert"` when the tone is error and a
  polite `role="status"` otherwise. It had neither, so a failed save on a dozen forms was
  completely silent to a screen reader.
- The message names the problem and the recovery. Never a raw response body: use `readApiError`.
- A failed save never clears what the user typed.

### Locked records

A finalized encounter is read-only, and there are two shapes for that. Pick by how much the
read-only view differs from the editable one:

| Shape                                    | Use when                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| A separate read-only component           | The display genuinely differs -- `VitalsForm` swaps to `ReadOnlyMeasurements`, a `<dl>` that re-attaches every unit |
| `<fieldset disabled>` plus a footer line | The same layout, just not editable -- `DiabetesScreeningForm`, `HypertensionForm`, `CarePlanForm`                   |

Either way: the save control is **removed, not disabled**, and a line says why ("This assessment
is read-only."). Radix's `Select` is not a native control and does not inherit `fieldset`
disabling, so it needs its own `disabled`.

**Append-only display.** Where a record is corrected by addendum rather than edit, the original
stays visible and the addendum is shown beneath it with its own author and timestamp. Do not
render an addendum as though it replaced what it corrects.

### Known gap, tracked separately

`HypertensionForm` calls `generateId()` on every save, so each save writes a new row into the local
Dexie table rather than replacing the previous one. The encounter page reads it back with
`.where('encounterId').equals(...).first()`, which orders duplicate index keys by primary key --
random UUIDs -- so a second save can make the encounter redisplay the _older_ classification.

The server is safe: `encounterId` is `@unique` and the sync handler upserts on it, so nothing
duplicates or fails to sync. The damage is confined to what the clinician is shown.

Compare `CarePlanForm`, which looks the existing record up first and reuses its id, and
`DiabetesScreeningForm`, which holds the id in a ref. `HypertensionForm` is the only one of the
four that gets this wrong.

Tracked in [#91](https://github.com/akomapahealth/nkwapa/issues/91). It was left out of #61
because fixing it changes how a clinical record is written, which #82's "no domain changes"
non-goal puts outside that issue.

---

## 11. Still open

- **Wireframes as artwork.** #61 offers "approved wireframes **or** annotated patterns"; sections
  9 and 10 are the annotated patterns, and drawn wireframes were not attempted.
- **The application's own fonts** still load through a render-blocking `@import` in `globals.css`
  plus a second CDN link in `layout.tsx`. The Keycloak theme self-hosts (section 2); the app does
  not. Moving it to `next/font` is its own issue.
- **#23** stale-refresh and optimistic updates. Re-read it against `useAsyncResource`, which
  already preserves last-known-good data across a failed refetch.

---

## 12. Verification

Run after any change to this file or to `globals.css`:

```bash
npm run design:check-charts      # from the repo root
npm run keycloak:validate-realm  # if the login theme moved

cd apps/web
npm run typecheck
npm run lint
npm run e2e
```

`role-access.spec.js`, `workspace-smoke.spec.js`, and `accessibility.spec.js` are the specs that
catch a visual change silently breaking a role or tenant boundary.
`responsive-migration.spec.js` performs the breakpoint pass on ten routes at five widths, and
`login-theme.spec.js` guards the Keycloak theme, which no build step in this repo can see.

Then a manual pass at 375 / 768 / 1024 / 1440 and 200% zoom, plus keyboard-only on any changed
route.

**Never change a token value without re-measuring every pairing it appears in.** The contrast
comments in `globals.css` record why each value is what it is; keep them accurate. For the chart
ramp that measurement is `scripts/check-chart-palette.mjs` and it runs in CI -- the ramp it
replaced sat wrong for as long as it existed precisely because nothing measured it.

A local full-suite run is only trustworthy against a fresh database. The two `patient request
triage` specs in `appointments.spec.js` consume the pending requests they act on, and
`npm run db:seed` will not put them back: it guards on presence, not state, and reports "Sample
appointments already exist; skipping". Reset Postgres, or expect exactly those two to fail on a
second run.
