# Nkwapa Design System

**Status:** approved 2026-08-26, updated 2026-11-04 for the Nkwapa 2.0 redesign (epic [#229](https://github.com/akomapahealth/nkwapa/issues/229)) · **Issue:** [#61](https://github.com/akomapahealth/nkwapa/issues/61) · **Implements:** the token and component contract half of #61

This is the source of truth for Nkwapa's visual tokens and component contracts, and the one design reference for the product as shipped. Each area's section names the pull request that built it; the before and after screenshots, axe results and verification for that work are in the pull request on GitHub. It is the file [#66](https://github.com/akomapahealth/nkwapa/issues/66), [#65](https://github.com/akomapahealth/nkwapa/issues/65), [#22](https://github.com/akomapahealth/nkwapa/issues/22), and [#26](https://github.com/akomapahealth/nkwapa/issues/26) build against. Where this document and an issue body disagree, this document wins, and the issue should be amended.

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
variables. They now mirror this document (and `ui-refresh/R0-AUDIT.md` section 4) token for token, each one annotated with the token it
mirrors, under a header saying the two files must move together. **Changing a value in section 3
means changing it there too.** `apps/web/e2e/login-theme.spec.js` is what notices if they part
company again: it asserts the typeface, the primary fill, the radius ceiling and the absence of
any third-party font request.

Two things worth carrying forward from that work:

- The theme **self-hosts** IBM Plex Sans and Source Serif 4 as `latin`-subset variable woff2
  (~91 KB together, with their OFL licences). It previously blocked first paint on two serialized
  `@import`s to `fonts.googleapis.com` and `fonts.cdnfonts.com`. The application now self-hosts
  its fonts through `next/font` as well; see section 6.
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

Layered Clinical Workspace (UI refresh R1.1). The values below mirror the as-built tables in `docs/design-system/ui-refresh/R0-AUDIT.md` section 4, which is the source of truth when the two disagree. Every neutral is tinted from the logo teal (hue 180 to 198).

| Token                        | Value               | Hex       | Used for                         | Contrast                    |
| ---------------------------- | ------------------- | --------- | -------------------------------- | --------------------------- |
| `--background`               | `180 23.8% 95.9%`   | `#F2F7F7` | Page canvas                      | 14.04:1 with `--foreground` |
| `--card` / `--popover`       | `0 0% 100%`         | `#FFFFFF` | The one sheet, panels, popovers  | 15.18:1                     |
| `--sidebar`                  | `180 23.8% 95.9%`   | `#F2F7F7` | Nav rail (the canvas itself)     | 14.04:1                     |
| `--sidebar-border`           | `190.9 18% 88%`     | `#DBE4E6` | Sidebar edge, group dividers     | decorative                  |
| `--sidebar-muted-foreground` | `197.5 12.4% 38%`   | `#55666D` | Sidebar group labels             | 5.55:1                      |
| `--muted` / `--surface-2`    | `180 23.1% 97.5%`   | `#F7FAFA` | Table headers, recessed fills    | 5.72:1 muted text on        |
| `--accent` / `--selected`    | `186.3 46.3% 92%`   | `#E1F2F4` | Row hover, selected row          | 4.53:1 action teal on       |
| `--mint` / `--mint-line`     | `171.4 38.9% 92.9%` | `#E6F4F2` | Next-action hero                 | 5.30:1 muted text on        |
| `--gold-surface`             | `46.7 100% 92.9%`   | `#FFF7DB` | Highlight such as a "new" marker | 6.31:1 with `--gold-ink`    |
| `--deep`                     | `190.2 74.7% 17.1%` | `#0B414C` | One high-emphasis brand surface  | 11.18:1 white on            |

**One white sheet on a teal-tinted canvas.** The cream canvas and the separate mint sidebar are retired. The rail sits on the canvas and the white sheet beside it is what separates the panels, which keeps #66's requirement that the sidebar read as distinct without a tinted panel. Sidebar text can use the standard foreground tokens again; `--sidebar-muted-foreground` stays as an alias so call sites need not change.

### Ink

| Token                | Value               | Hex       | Used for                        | On canvas |
| -------------------- | ------------------- | --------- | ------------------------------- | --------- |
| `--foreground`       | `197.1 29.6% 13.9%` | `#19282E` | Body, headings, clinical values | 14.04:1   |
| `--muted-foreground` | `197.5 12.4% 38%`   | `#55666D` | Labels, units, secondary text   | 5.55:1    |
| `--faint`            | `195.7 10.9% 58.6%` | `#8A9BA1` | Placeholder and disabled only   | 2.89:1    |

### Brand and action

| Token         | Value            | Hex       | Used for                           | Contrast                    |
| ------------- | ---------------- | --------- | ---------------------------------- | --------------------------- |
| `--primary`   | `188 100% 27%`   | `#00778A` | Primary buttons, active nav, links | 5.22:1 white on             |
| `--secondary` | `47 100% 55%`    | `#FFCD1A` | Brand accent, highlights           | 9.90:1 dark ink on          |
| `--ring`      | `188 100% 27%`   | `#00778A` | Focus ring                         | 4.83:1 on canvas            |
| `--brand`     | `188.1 100% 32%` | `#008DA3` | Logo teal, decoration only         | 3.93:1 on white: never text |

`--primary` also passes as _text_: 4.83:1 on canvas, **4.98:1 on `--muted`** and 4.53:1 on `--selected`. That second pairing matters because `DataTable` sets column headers on `--muted`, so teal header links land there.

### Status

| Token           | Value         | Hex       | Used for                         | Contrast                                  |
| --------------- | ------------- | --------- | -------------------------------- | ----------------------------------------- |
| `--success`     | `152 65% 30%` | `#1B7E50` | In range, synced, cosigned       | 5.05:1 white on                           |
| `--warning`     | `32 90% 48%`  | `#E9820C` | Out of range, expiring, unsynced | 5.39:1 dark ink on                        |
| `--destructive` | `0 72% 49%`   | `#D72323` | Critical values, delete, merge   | 5.06:1 white on, 4.68:1 as text on canvas |

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

**Tags (R1.3).** `Badge` is the pilot `.tag`: 24px minimum height (it wraps rather than overflow), 4px radius, 12.5px semibold, no shadow, no hover. No call site may round it into a pill. Variants: `secondary` neutral (`--surface-2` fill, `--border` edge, muted ink, 5.72:1); `info` for selected or suggested (`--selected` with `--primary`, 4.53:1); `gold` for "new" highlights only (6.31:1), never a state; `draft`, `review`, `finalized`, `warning` as before; `severe`; `destructive` filled.

**Blood-pressure severity (R1.3, audit A8).** One map, `HYPERTENSION_BADGE_VARIANTS` in `lib/hypertension.ts`, feeds `statusVariant()` and the hypertension history panel: Normal and Elevated neutral, Stage 1 `warning`, Stage 2 `severe` (`--severe-surface` / `--severe-ink`, hue 20, 5.67:1 light, 6.72:1 dark), Crisis filled `destructive`. The text label always names the stage, so the scale never relies on colour alone. The classifier and saved values are unchanged. The dashboard distribution chart (`HYPERTENSION_TONES`) follows the same ladder for the stages: Stage 1 `warning`, Stage 2 `severe` (bar fill `--severe`, 4.34:1 on the card), Crisis `destructive`; Normal stays success green and Elevated warning there, because a chart needs Normal to differ from Not classified. The station results summary shows the stage as the same tag.

**Panels (R1.3).** `Card` is the bordered panel on the one white sheet: 8px radius, 1px `--border`, `--card` fill, no shadow. Panels sit side by side or in sequence. Never nest a `Card` in a `Card`.

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
and duplicated the header's sync pill; the pill itself now lives in
`components/sync/SyncStatusBar.tsx` with the sync center it opens), and `components/patients/AllergySummaryBanner.tsx`, the one
a clinician reads before prescribing.

### Lines

| Token      | Value           | Hex       | Used for                        | On canvas                         |
| ---------- | --------------- | --------- | ------------------------------- | --------------------------------- |
| `--border` | `190.9 18% 88%` | `#DBE4E6` | Decorative dividers, card edges | 1.29:1 on white — exempt          |
| `--input`  | `200 15% 52%`   | `#728B97` | **Every form control boundary** | 3.59:1 on white, 3.33:1 on canvas |

**`--input` is split from `--border` and must stay split.** WCAG 1.4.11 requires 3:1 for boundaries needed to identify a control. Form fields qualify; card edges and decorative dividers do not. Before this split both were `45 20% 87%` at 1.26:1, meaning every text input, select, and textarea in the product had an effectively invisible boundary.

Do not "fix" `--border` or `--sidebar-border` to reach 3:1. They are correctly exempt, and hardening them would add visual noise for no accessibility benefit.

### Ruled Chart rules and status surfaces (#264)

These are additive foundation tokens. Existing action, text, input-boundary and
chart-series values stay unchanged. `--rule` aliases `--border` for decorative
1px dividers; `--rule-strong` aliases `--foreground` for the direction's 2px group
rule. Neither replaces `--input` on form controls.

Opaque status surfaces have explicit light and dark values, so their measured
contrast does not depend on which parent surface happens to sit behind them.
They were derived from a 12% status fill over the light card and a 22% fill over
the dark card, then rounded to 0.1 HSL units and measured again. Future consumers
use `bg-success-surface text-success-ink` (and the corresponding other tones),
with a plain-language label and an icon where helpful. Existing alpha-tint
consumers remain unchanged in this foundation PR; #265 applies shared contracts.

| Surface token           | Light HSL           | Dark HSL            | Paired ink          | Light contrast | Dark contrast |
| ----------------------- | ------------------- | ------------------- | ------------------- | -------------: | ------------: |
| `--success-surface`     | `137.8 23.2% 90.3%` | `161.2 37.8% 19.0%` | `--success-ink`     |         5.20:1 |        6.83:1 |
| `--warning-surface`     | `33.8 72.1% 92.0%`  | `38.9 30.9% 21.3%`  | `--warning-ink`     |         5.90:1 |        6.75:1 |
| `--info-surface`        | `192.4 25.7% 91.0%` | `200.0 34.0% 21.3%` | `--info-ink`        |         7.29:1 |        6.37:1 |
| `--destructive-surface` | `6.0 63.0% 92.4%`   | `350.2 15.5% 22.5%` | `--destructive-ink` |         6.02:1 |        6.66:1 |

All four text pairings exceed the 4.5:1 normal-text floor in both modes. Draft
continues to use `--muted` / `--muted-foreground`; this issue does not reclassify
workflow or clinical states.

| Rule token      | Background     | Light contrast | Dark contrast | Requirement        |
| --------------- | -------------- | -------------: | ------------: | ------------------ |
| `--rule-strong` | `--background` |        14.30:1 |       15.66:1 | >= 3:1 non-text    |
| `--rule-strong` | `--card`       |        14.31:1 |       14.50:1 | >= 3:1 non-text    |
| `--rule`        | `--background` |         1.26:1 |        1.47:1 | Decorative, exempt |
| `--rule`        | `--card`       |         1.26:1 |        1.36:1 | Decorative, exempt |

`npm run design:check-tokens` measures these and the neutral primary/supporting
text pairings at full precision, resolving aliases and requiring every new token
in both theme blocks. CI runs it alongside the existing chart palette check.
Only the report is rounded; thresholds never use rounded ratios. Regression
checks deliberately break a dark ink and remove a dark surface, and verify that
both failures are caught. All 24 pair measurements and the rendered specimen are
in [PR #288](https://github.com/akomapahealth/nkwapa/pull/288).

The five chart series are confirmed unchanged by `scripts/check-chart-palette.mjs`.
Section 3's existing chart-2 contrast exception and redundant-label requirements
still apply. The owner's chart-animation decision is unchanged by these tokens.

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

**Chart animation is permitted by owner decision (2026-11-01).** Use short,
purposeful reveals or transitions when they improve reading the chart. Honour
`prefers-reduced-motion` in the JavaScript animation settings too; a CSS override
does not disable Recharts' draw-in. Keep final values, labels and the table
alternative available without waiting for animation. Do not replay animation on
routine background refresh or morph readings into invented intermediate data.
The existing charts still use `isAnimationActive={false}`; enabling motion belongs
to their implementation phase, with reduced-motion and data-fidelity checks.
Straight segments between real readings remain required. Axis ticks keep
`fontVariantNumeric: 'tabular-nums'` inline because they render as SVG text.

**The landing page has no tokens of its own.** It is built from the tokens above: `--accent` and
`--primary` bands, plus a section scoped with `.dark` for the product screenshots. `--landing-accent`
was removed with the 2026-10 redesign (`docs/design/landing-page-redesign.md`).

## 4. Colour tokens — dark

Defined under `.dark`. Dark mode inverts which side carries the ink: fills stay bright and take dark text. The tinted badge inverts too, becoming a dark tint of the hue carrying light ink.

| Token                           | Value               | Hex       | Contrast               |
| ------------------------------- | ------------------- | --------- | ---------------------- |
| `--background` / `--sidebar`    | `192 29.4% 6.7%`    | `#0C1416` | 15.74:1 with ink       |
| `--card`                        | `195 23.1% 10.2%`   | `#141D20` | 14.48:1                |
| `--muted` / `--surface-2`       | `192.9 21.9% 12.5%` | `#192427` | 6.54:1 muted text on   |
| `--accent` / `--selected`       | `188.1 42.5% 17.1%` | `#19393E` | 5.54:1 action teal on  |
| `--border` / `--sidebar-border` | `198 20.8% 18.8%`   | `#26343A` | decorative             |
| `--sidebar-muted-foreground`    | `190 9.8% 63.9%`    | `#9AA9AC` | 7.66:1 on canvas       |
| `--primary`                     | `188 80% 47%`       | `#18BED8` | 8.34:1 dark ink on     |
| `--secondary`                   | `47 85% 52%`        | `#EDC01D` | 10.73:1 dark ink on    |
| `--success`                     | `152 55% 50%`       | `#39C684` | 8.47:1 dark ink on     |
| `--warning`                     | `35 90% 58%`        | `#F4A434` | 9.05:1 dark ink on     |
| `--input`                       | `192.4 11.8% 48%`   | `#6C8389` | 4.27:1 on card         |
| `--info`                        | `200 60% 58%`       | `#54A9D4` | workflow state         |
| `--success-ink`                 | `152 40% 74%`       | `#A2D7BE` | 6.82:1 on its tint     |
| `--warning-ink`                 | `35 75% 74%`        | `#EEC58B` | 6.74:1 on its tint     |
| `--info-ink`                    | `200 45% 74%`       | `#9FC7DB` | 6.49:1 on its tint     |
| `--destructive-ink`             | `0 50% 80%`         | `#E6B3B3` | 8.06:1 on its tint     |
| `--destructive`                 | `0 62% 66%`         | `#DE7373` | 5.48:1 as text on card |

"Dark ink" on a dark-mode fill is the dark canvas, `192 29.4% 6.7%` (`#0C1416`), for every `*-foreground` that sits on a bright fill (R1.2 follow-up; was `200 25% 10%`). Light `--warning-foreground` is the ink `#19282E` (5.52:1 on warning).

**`--destructive` is lighter in dark mode than in light, and carries dark ink.** That inversion is
forced, not stylistic. `text-destructive` is how every field error, error notice and destructive
menu item colours itself -- 32 call sites -- and at the previous `0 62% 45%` it measured **3.02:1**
on the dark canvas, so every destructive word in the product failed AA in dark mode. One token
cannot serve both uses at that lightness: text on the card needs L >= 60 and white on the fill
needs L <= 54, and those windows do not overlap. Flipping `--destructive-foreground` to dark ink
is the usual dark-theme answer and clears all four pairings at 66% -- 5.92:1 on the canvas, 5.48:1
on the card, 4.67:1 on its own 12% tint, and 5.60:1 for the ink on the fill (6.01:1 since R1.2 moved the dark ink to the canvas).

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

`--radius` is `0.5rem` (8px), so the scale is 4 / 6 / 8 / 12 (UI refresh R1.1, R0-AUDIT section 4).

| Step | Value | Used for                                                                  |
| ---- | ----- | ------------------------------------------------------------------------- |
| `sm` | 4px   | Buttons, inputs, selects, textareas, badges, tags, tooltips, focus (R3.8) |
| `md` | 6px   | Tab tops, menu items                                                      |
| `lg` | 8px   | Panels, popovers, menus                                                   |
| `xl` | 12px  | The sheet, dialogs, side sheets                                           |

All four steps are real Tailwind classes, derived from `--radius` in `tailwind.config.js`.

**Nothing rounder than 12px, and no squircles.** That rules out `rounded-2xl` (16px) and `rounded-3xl` (24px) as well as arbitrary values. Circles stay for avatars, status dots and route stops only. The one exception is the landing page's phone mock-up bezel in `components/landing/ProductFrames.tsx`, which depicts hardware rather than interface.

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

The landing page's gradient-mesh and glass utilities are gone. Its one utility, `.landing-container`,
is a content width and must not appear on a workspace route.

**Shadow above `shadow-sm` is for things that genuinely float** -- a dialog, a sheet, a popover, the
chat panel, a help bubble. That is depth doing a job, not decoration, and it is the one exception
to the flatness rule.

---

## 6. Typography

| Role          | Family         | Token          |
| ------------- | -------------- | -------------- |
| Headings      | Source Serif 4 | `font-heading` |
| Body and data | IBM Plex Sans  | `font-body`    |

The public landing page uses the same two families, with Source Serif 4 at display sizes. Poppins and Circular Std are no longer loaded anywhere.

The serif heading is deliberate. It separates headings from data at a glance, which a single-family system does not, and it is the most distinctive element of the current identity.

**One uppercase micro-label treatment: `.text-eyebrow`.** Eight tracking values (0.14em through 0.3em) were in use on what is visually the same element — the small caps label above a heading, a metric, or a section. Eight is noise, not hierarchy. 0.14em is the widest setting that still reads as one word at 12px; 0.3em was splitting labels into letters. Colour is left to the caller, because the same label is `--primary` above a page title and `--muted-foreground` above a metric.

**`tabular-nums` on every numeric column and every clinical value.** It was applied nowhere, so vitals columns did not align. It now ships from `DataTable` for every table cell and from `AppMetricCard` for every metric; individual clinical values in panels take the utility directly.

**Self-hosted through `next/font` (#263).** `app/layout.tsx` loads the variable
IBM Plex Sans (100 to 700) and Source Serif 4 (200 to 900) faces with
`next/font/google`, `display: 'swap'`, and the existing `--font-body` /
`--font-heading` variables. The loader downloads fonts at build time and emits
first-party WOFF2 assets. There is no runtime Google Fonts stylesheet import or
font-host request. Builds need access to Google Fonts; deployed pages do not.
Latin is preloaded for the English interface; the other supplied subsets remain
available for names without falling back merely because the UI is English.
The measured build emits 12 subset files (318,328 bytes total), of which the two
Latin files total 91,192 bytes and are preloaded. Runtime tests block external
font hosts and verify both applied, loaded faces and first-party preload URLs.
The four registration screenshot pairs are pixel-identical. No colour tokens or
type scale values changed. Shipped in [PR #287](https://github.com/akomapahealth/nkwapa/pull/287).

**Committed font files (#316).** The build no longer downloads fonts. The
latin and latin-ext WOFF2 subsets of both families live in `apps/web/app/fonts/`
(byte-identical to what `next/font/google` emitted) and load through
`next/font/local`. Each family is two faces: latin is preloaded and carries the
fallback metrics; latin-ext declares the Google Fonts `unicode-range`, so it is
fetched only when a page shows a character such as Ɛ, Ɔ or Ŋ. `globals.css`
composes `--font-body` and `--font-heading` with the latin-ext face first. The
cyrillic, greek and vietnamese subsets were dropped (about 105 KB of files no
clinic name has needed) and fall back to the system font.

---

### Semantic type roles (#264)

These opt-in utilities are the shared type contract for #265 and later page
work. They introduce no new font family and do not globally replace the current
page/component classes. Existing routes retain their layout while consumers
migrate one issue at a time. #265 consumes most roles and colour utilities directly; only
`type-record-title` and `type-meta` stay safelisted, because the foundations
specimen injects them before any component uses them.

| Utility              | Family         | Size / line height, below 640px | Size / line height, from 640px | Weight | Figures      |
| -------------------- | -------------- | ------------------------------- | ------------------------------ | ------ | ------------ |
| `type-page-title`    | Source Serif 4 | 30 / 36px                       | 36 / 40px                      | 600    | Proportional |
| `type-record-title`  | Source Serif 4 | 24 / 32px                       | 30 / 36px                      | 600    | Proportional |
| `type-section-title` | IBM Plex Sans  | 18 / 28px                       | 18 / 28px                      | 600    | Proportional |
| `type-body`          | IBM Plex Sans  | 16 / 24px                       | 16 / 24px                      | 400    | Proportional |
| `type-label`         | IBM Plex Sans  | 14 / 20px                       | 14 / 20px                      | 500    | Proportional |
| `type-meta`          | IBM Plex Sans  | 12 / 16px                       | 12 / 16px                      | 400    | Proportional |
| `type-metric`        | IBM Plex Sans  | 32 / 36px                       | 32 / 36px                      | 600    | Tabular      |
| `type-data`          | IBM Plex Sans  | 14 / 20px                       | 14 / 20px                      | 400    | Tabular      |

Sizes and line heights are stored in rem in `tailwind.config.js`; the table
assumes the browser's default 16px root. Browser text scaling remains enabled.
Page and record titles wrap long words when needed; prose containers should
remain roughly 45 to 75 characters wide (the specimen uses 65ch). Use the serif
roles for page titles and patient names; use Plex roles for operational section
headings, body, labels and measurements. Units must accompany clinical values.
Choose one role rather than layering conflicting font/size utilities on it.

The existing `font-heading` / `font-body` family utilities, `text-eyebrow`, and
tabular figures in DataTable and AppMetricCard remain supported. A test-only
synthetic specimen verifies the shipped role styles, equal-width digits,
opaque status backgrounds, contrast, both themes, 1440/390px and 200% root text
scaling. It is not a new public route or a claim that every legacy page has
already migrated to these roles. Shipped in [PR #288](https://github.com/akomapahealth/nkwapa/pull/288).

## 7. Motion

**The owner's 20 motion principles and the seven added rules are in `NKWAPA-UI-REFRESH-MASTER.md` section 9.1 and mapped to Nkwapa in `ui-refresh/R0-AUDIT.md` section 6. They supersede anything below that disagrees.** The pilot values: enter 200ms and exit 160ms, sheets 240ms in and 190ms out, popovers from `scale(.95)` at the trigger, 30ms row stagger capped at 6 rows.

- **150ms** for colour and opacity.
- **200ms** for position.
- Nothing longer in a clinical view.
- **No transform-based hover.** Scale and translate on hover cause layout shift, which #63 and #66 both prohibit. Use colour or opacity.
- `prefers-reduced-motion` is handled globally in `globals.css`. R1.5 anchored overlays override the global 0.01ms clamp only to preserve opacity fades, with all scaling removed. Keep that exception shared rather than per component.
- **Curves and durations are tokens.** `--ease-out`, `--ease-in-out`, `--ease-drawer`, `--duration-fast` (150ms) and `--duration-base` (200ms) in `globals.css`, exposed as `ease-out-strong`, `ease-in-out-strong`, `ease-drawer`, `duration-fast` and `duration-base`. Enter with `ease-out-strong`; never `ease-in`, which delays the moment the user is watching.
- **Press feedback is allowed.** `Button` scales to 0.97 on `:active`. That answers a press, not a hover, and scale does not change the box, so nothing moves.
- **Busy buttons keep their width.** `Button loading` hides the label under a spinner rather than swapping text (section 11).
- **Toasts are Sonner**, through `useToast()` in `components/ui/toast.tsx`. Pass the id a loading toast returned to settle it in place as success or error, or use `toastPromise`. Error toasts are announced assertively through a visually hidden `role="alert"` copy; every other tone stays in Sonner's polite region (#280, section 13).

### Draggable Sheets (R2.4)

The shared Radix Sheet retains its dialog, title/description, focus trap, Escape,
outside dismissal and explicit close control. A separate handle, 64 by 44px at default text size, closes
on click or keyboard activation and supports an outward drag on each configured
edge: down for bottom, up for top, left for left and right for right. Only the
handle owns pointer capture and disables native touch panning and text selection;
the body keeps normal scrolling, selection and form interactions. No clinical or
queue action is attached to the gesture.

While held, CSS `translate` follows the pointer directly without a transition.
Movement towards the attached edge meets increasing rubber-band resistance.
Release dismisses after 30% of the Sheet's dimension (capped at 160px), or an
outward flick above 0.5px/ms after at least 24px. A release moving inward restores
the Sheet. Restoration uses the installed Motion physical spring, with response
0.3s and damping ratio 0.8 mapped to mass/stiffness/damping, carrying release
velocity. Duration-based Motion springs intentionally discard velocity and are
not used. Regrabbing stops the spring at its current position. Reduced motion
retains direct manipulation but restores immediately without a release spring;
existing reduced-motion entrance/exit rules remain.

Cancellation and lost capture restore without dismissal. Resize, visual-viewport
resize, window blur and page hiding release capture and reset displacement.
Browser history and pathname changes close through the existing Radix close
control. External closes stop a held gesture or spring, and cleanup cancels it on
unmount. A trailing pointer click after a moved/cancelled gesture is suppressed.

Custom focus-return callbacks still take precedence, preserving the sequential
More-to-sync handoff. Without a custom override, the Sheet remembers the actual
opening control, including selection-controlled panels with no Radix Trigger,
and returns focus there if still connected and visible, otherwise to main content.
This does not change modal or focus-trap semantics. All current consumers retain
their existing side, data, action and save contracts. R2.5 portal More uses the
same bottom Sheet and focus handoff as staff More.

### Anchored overlays (R1.5)

Dropdown menus (including submenus), Select and InfoHint use `.anchored-overlay`:
200ms in (`--duration-base`), 160ms out (`--duration-exit`), `--ease-out`, opacity
and scale 0.95 to 1. Each uses its Radix content transform origin on both paths.
Select uses Radix's 4px side offset for static placement, leaving the content
transform free for scaling.

CSS `@starting-style` supplies the entrance; transitions reverse from the current
frame. A nonvisual `anchored-presence` animation keeps Radix Presence mounted
through the exit, because Presence listens for animationend rather than
transitionend. Do not replace the transitions with enter/exit keyframes. Browsers
without `@starting-style` show the open content immediately.

Tooltip uses 150/120ms (`--duration-fast` / `--duration-fast-exit`). Its provider
keeps a 300ms skip-delay window, overridable through the existing prop, and
`instant-open` skips the entrance transition too. The custom filtering Combobox
stays instant: focus and typing are routine operations, and it is not a Radix
Popover. InfoHint is the only direct Radix Popover consumer.

`useOverlayInput` shares one set of capture listeners across mounted overlay
roots. Pointer activity enables motion; keyboard activity disables both enter
and exit immediately, including Escape on a pointer-opened popup. Native
`:focus-visible` is insufficient here: Radix's focus handoff can match it even
after a pointer press. Reduced motion keeps the opacity fade and removes scaling;
keyboard and tooltip scanning remain instant under that preference too.

---

## 8. Density, targets, breakpoints

| Rule                       | Value                                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Table row height, desktop  | 44px                                                                                                                                           |
| Table row height, touch    | 52px                                                                                                                                           |
| Minimum interactive target | 44px under `pointer: coarse`; 44px hit area for small and icon buttons on a mouse                                                              |
| Button height              | 44px touch, 36px mouse (`--button-height`); small 44 / 32; large 48 / 40 (R3.8)                                                                |
| Form control height        | 44px touch, 40px mouse (`--field-height`: `Input`, `SelectTrigger`, `Combobox`) (R3.8)                                                         |
| Tabs and menu rows         | Tabs 48px touch, 40px mouse (`--tab-height`); Select, dropdown and combobox rows 44px touch, 36px mouse (`--menu-row-height`) (R3.8 follow-up) |
| Breakpoints                | 375 / 768 / 1024 / 1440 (audit widths); named screens `compact` 600, `tablet` 840, `desktop` 1200                                              |

Both row heights are set by `DataTable` (`components/ui/data-table.tsx`, TanStack Table v9). Row actions are real buttons in a right-aligned final column, one primary at most, so they line up down the column. It also makes the numerals tabular and sticks the column headers, because a roster that runs past a viewport is unreadable once its headers scroll away.

**Pointer-aware sizing (R3.8, owner decision 2026-11-10).** Staff work mostly on shared laptops with a mouse, where 44px controls read as oversized. The height tokens in `globals.css` switch under `@media (pointer: fine)`; touch keeps 44px. Call sites never set `h-11`/`min-h-11` on `Button`, `Input` or `SelectTrigger`; that would pin 44px on a mouse. Use `h-auto` when a label must wrap; the variant's `min-height` keeps the floor. Playwright's Desktop Chrome reports `pointer: fine` even at 390px, so a phone-target assertion must run in a touch context (`devices['Pixel 7']` or `hasTouch`).

**Action placement (R3.8).** A form ends in `FormActions` (`components/ui/form-actions.tsx`): from 600px right-aligned, primary last, Cancel immediately before it; `split` pins the first child (a wizard's Back, or a status note) to the start edge. Phones stack full width with the primary on top; measured sticky rows (Vitals) keep the primary at the thumb. Dialog footers already follow the same order. Screens adopt it in their own unit.

The 44px touch floor is enforced in the primitives rather than per call site: `Button`, `Input`, `Select` and its menu rows, `Tabs` triggers, and the two help triggers. Where the glyph must stay small — a help icon, a toast dismiss — the target is a centred pseudo-element rather than a `min-height` on the visible box. `.touch-target` set `min-height`/`min-width` on the element itself, which silently overrode every size a call site asked for and pushed metric-card headers around by 20px.

**Buttons (R1.2, radius R3.8).** Flat fills, semibold labels, 4px radius, no shadow. Primary hovers to `--primary-hover` (`#006A7A`, darker, 6.27:1 with white). `outline` and `secondary` are the same secondary action: white `--card` fill with the 3:1 `--input` boundary, hovering to `--muted` (R0-AUDIT A4). Gold is only the explicit `gold` variant. Destructive keeps `/95` on hover; `/90` falls to 4.51:1. Controls drop their shadow; placeholders stay `--muted-foreground` (5.99:1), not `--faint`.

Focus rings are `ring-2 ring-ring` everywhere. They were `ring-1` on form controls and `ring-2` on everything else.

**Segmented controls and tabs (R1.4).** Two looks, one job each (master §5.3):

- `SegmentedControl` is for a mutually exclusive view or filter that reshapes one list (Day/Week, time windows, status filters). It is the pilot `.seg`: a `--surface-2` track with a 1px `--border` inset, and a raised `--card` knob that holds the active label in `--primary` (5.22:1 light, 7.67:1 dark). It stays toggle buttons with `aria-pressed`, not tabs. The knob is one shared Motion element (`layoutId`, re-measured only when the value changes) that moves in 220ms `--ease-in-out` and stretches to 1.12 on x mid-move. The active label colour is wiped in by `clip-path`, never by tweening text colour. Only the change a pointer press made animates. A keyboard press, the first render and a change made elsewhere (a reset, back navigation) snap into place. Four options sit 2x2 on a phone and 1x4 from `sm`. Other counts auto-fit at 7rem or wider. The focus ring is inset. Reduced motion removes all of it. Targets are 42px inside the 3px track (48px total), and 48px under `pointer: coarse`.
- `Tabs` is for substantial record sections with real panels. It is the pilot `.tabs`: muted labels on a `--rule`, the active label in ink with a 2px `--primary` underline. The underline is a shared `layoutId` element that moves in 200ms `--ease-in-out` after a pointer press and snaps for the arrow keys and for changes made elsewhere. The label weight stays 500 in both states, so the active tab never widens and pushes its neighbours. Tabs never wrap. `TabsList` brings its own `overflow-x-auto` wrapper (a Motion `layoutScroll` element, so the underline measures correctly after a press scrolls a tab into view), so call sites add none. The focus ring is inset, because that wrapper clips anything outside the tab. Radix keeps the roles, `aria-selected` and the arrow keys. Targets are 40px on a mouse, 44px by default and 48px under `pointer: coarse` (`--tab-height`).
- Gold is never a selected state. Neither control has a filled teal segment or a bordered box any more.

---

## 9. Component contract

Shared primitives live in `apps/web/components/app-shell/` and `apps/web/components/ui/`. **Do not build a second family of any of these.**

| Need                            | Use                                                 | Do not                                              |
| ------------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| Page title, actions, context    | `AppPageHeader` (on the canvas, hairline below)     | Hand-rolled `<h1>` + hero section, or a boxed title |
| KPI / metric                    | `AppMetricCard`, several in one `AppMetricGroup`    | A grid of separately bordered stat cards            |
| Form grouping                   | `FormSectionCard`                                   | Bare `<Card>` with a heading                        |
| A field's error                 | `FieldError` + `fieldErrorProps`                    | A bare `<p className="text-destructive">`           |
| A required field                | `RequiredMark` + one `RequiredLegend` per form      | An asterisk baked into the label string             |
| A form-level message            | `InlineNotice`                                      | A `<div>` with no role                              |
| Refresh in progress             | `ResourceState`'s own indicator                     | A control that resizes when it goes busy            |
| One read's five states          | `ResourceState` + `useAsyncResource`                | A hand-rolled `useState` triple                     |
| Loading                         | `SectionSkeleton` / `PageSkeleton`                  | A spinner in the middle of content                  |
| Nothing here yet                | `EmptyState`                                        | A dashed div with a paragraph                       |
| Failed, can retry               | `InlineErrorState`                                  | A red box with no way forward                       |
| Not allowed                     | `NoAccessState`                                     | An error state wearing red                          |
| No clinic chosen                | `SelectClinicState`, or `RouteGuard requiresClinic` | "Select a clinic to …" in a `<p>`                   |
| Contextual help                 | `InfoHint`                                          | A second tooltip system                             |
| Help that must actually be read | `ProgressiveHelp`                                   | Hiding it in a bubble                               |
| Filter summary                  | `ActiveFilterSummary`                               | Inline filter chips                                 |
| View switching                  | `SegmentedControl`                                  | Bare button group                                   |
| Uppercase micro-label           | `.text-eyebrow`                                     | Another `tracking-[0.Nem]` value                    |
| Data table                      | `DataTable` from `components/ui/data-table`         | A hand-rolled `<table>` or a restyled grid          |
| Choosing from a very long list  | `Combobox`                                          | A `Select` with hundreds of options                 |

### Metrics and page headers

Related metrics share one `AppMetricGroup` panel divided by hairlines; a metric is a quiet label with a 16px icon, then the figure. A grid of separately bordered cards, each with a 48px tinted icon tile, made the tiles the loudest thing on a dashboard and every page read as a template. A phrase standing in for a figure ("No reading yet") uses `type-section-title` so an empty state is not the largest text on screen.

`AppPageHeader` sits on the canvas with a hairline under it, not inside a card: the title is the page's heading, not one more panel among the panels below it. Workspace pages fade in over 150ms (`app/(workspace)/template.tsx`, opacity only), and a 2px bar crosses the top while an in-app link loads (`NavigationProgress`).

### Shared foundations (#265)

`AppPageHeader` uses `type-page-title` and `type-body`, with an optional `breadcrumbs`
slot above the title. `AppMetricGroup` is an unfilled ledger with a strong top rule,
hairlines between cells, `type-label` labels and tabular `type-metric` figures.
`FormSectionCard` keeps its existing API while drawing a ruled section on the canvas;
its default heading is `h2`, with `titleAs="h3"` for nested sections.
`DashboardSectionHeader` uses the Plex section role.

`DataTable` retains its sorting, pagination, filtering, server/client modes and
mobile renderer. Its optional `toolbar` slot holds caller-owned filters; it does
not fetch or change filter state. R1.6 replaces the strong top rule with 1px
`--border` edges and quiet row dividers, a `--card` body, sticky `--surface-2`
headers, and `--surface-2` hover/focus-within rows. Numeric data remains tabular;
column metadata retains right alignment and cell classes. Sorting controls remain
44px; cells retain their 44px desktop / 52px coarse-pointer floors.

`renderMobileRow(row.original)` is the existing card slot. Its presence makes the
root an inline-size container: below **60rem available width** it shows cards;
from 60rem it shows the table. This is a local content threshold, independent of
viewport width or shell mode. Patient contact/identifier columns and two record
actions need more space than the pilot's reduced phone table; 60rem reserves that
space without changing the rendering API. Both current consumers, patient registry
and staff invitations, inherit it. Cards include a wrapping "Sort by" fieldset
using the same headers and sorting handlers, with accessible direction text.
Caller filters and shared pagination remain outside the presentation switch.

There is one TanStack row model and one sort/filter/page state in client and
controlled-server modes. CSS changes visibility without mounting a new table,
resetting state or requesting data. Inactive presentations use `display: none`,
removing their controls from the accessibility tree. Renderers retain ownership
of record content and actions; `onRowClick`, when used, also supports Enter in
cards and must not be combined with nested actions. Row IDs identify both
presentations. Refresh feedback sits above either presentation, out of flow;
empty cards and tables share the supplied empty state or "Nothing to show."
fallback. No row arrival animation is added.

Without a card renderer, the table always retains its named keyboard-focusable
horizontal/vertical scroll area, caption, sticky header and `aria-sort`. Browsers
without container queries also retain that complete scrollable table. Existing
`hideOnMobile` column metadata continues to mean the viewport `md` breakpoint;
this unit does not change independent responsive layouts in other routes.

`StatusLabel` is the shared badge for system states. `statusLabel` in
`lib/status-presentation.ts` owns plain-language labels, reuses the hypertension
vocabulary and preserves already-written copy. Examples: `IN_REVIEW` → In review,
`DRAFT` → Draft, `FINALIZED` → Finalized, `STAGE2` → Stage 2, `UNKNOWN` → Unknown.
The clinical hypertension helper retains its contextual "Not classified" label.
Unknown future codes receive a readable fallback. Use the helper only at the
render boundary: API payloads, stored values, transitions, filters, sort accessors
and permissions retain their original codes. Existing domain-specific tone mappings
remain supported through the `variant` prop. Review, finalized and warning badges
use the measured opaque status surfaces from #264.

The `--rule` hairline (1.26:1 in light) is a decorative separator only: #265 uses
`border-rule` between sections, rows and states, never as the only visible edge of
an input, select, button or other control. Controls keep `--input`.

`AppActionRow` supplies one ruled list item with a title, optional detail, icon and
one caller-provided action. Render it inside a `ul`. `DashboardActionRow` can render
these under "Needs you now" with `presentation="rows"`; its existing button mode
is unchanged. Dashboard prioritization and counts belong to #268/#269.

Breadcrumb and Skeleton source was retrieved with shadcn CLI 4.23.0 (`view
breadcrumb skeleton`) and adapted to the existing Tailwind 3/React 18 stack.
Breadcrumb navigation is named, current-page semantics are retained, and links
have 44px targets and visible focus. Skeletons are neutral, decorative, and stop
pulsing with reduced motion. `ResourceState` supplies the named loading live
region. No new dependency is needed; the existing Radix Slot and Lucide suffice.
Separator adoption remains deferred: the new rules use ordinary CSS borders.

`ResourceState` keeps the existing five-state order and stale-data branch logic.
Offline and error messages use measured warning/destructive surfaces, empty states
use quiet rules, and `SectionSkeleton` uses the shared Skeleton. A failed refresh
still leaves loaded records visible. `InfoHint` retains its single-open registry,
keyboard dismissal and focus return, and now explicitly connects its open trigger
to the tooltip through `aria-describedby` and `aria-controls`.

The browser-only fixture in `e2e/component-fixtures/SharedComponents.tsx` renders
these actual primitives with synthetic data, including all five states, stale data,
saved copies and refreshing. It is bundled with the installed webpack/TypeScript
for Playwright and creates no public route or production dependency.

### Staff shell (#266)

R2.1 uses the approved pilot's shipped geometry: 232px expanded and 64px
icon-only from 1200px; a distinct 76px labelled rail from 600 to 1199px.
The earlier R0 prose says 248/88px and elsewhere 76px desktop collapse. These
conflict with the pilot and round-3 feedback; 232/76/64 is the implementation
baseline, not a new owner approval. Under 600px R2.2 supplies the phone BottomNav
and More sheet. New Patient and all permission-filtered destinations remain available.

The rail sits on `--background`, beside one `--card` workspace sheet inset 8px
from 600px, with a quiet border and 12px corners. Main keeps its existing overflow
behavior and the document remains the vertical scroll owner. The aside stretches
with the document; its contents stick at the top in a dynamic-viewport-height
column with an independently scrolling navigation area. Main has 10rem plus safe-area
bottom clearance on phones and 6rem from 600px, so a final action can clear the
fixed chat launcher and phone navigation. Chat sits above the phone bar; its panel
height accounts for that space without changing chat behavior.

`AppNavList` keeps `app-nav.ts` as its sole permissions/flag/placement filter.
Desktop groups retain their names; compact modes separate groups with quiet
hairlines, with tablet group names retained for assistive technology. Tablet icons
sit over visible 11.5px wrapping labels, including long administration names. Desktop
labels also wrap instead of clipping. Controls keep a 44px floor. Current links use
`--selected`, semibold `--primary`, and `aria-current="page"`; unselected labels use
muted ink with `--surface-2` hover and a visible 2px focus ring. Disabled clinic
controls remain native disabled buttons, without a contrast-reducing opacity.

Desktop starts expanded with no saved preference. Guarded localStorage reads happen
before the first shell paint, after KeycloakProvider's client session check.
Forced rail/phone presentation never overwrites the desktop preference. The header
toggle and `[` work only from 1200px; typing, editable content and modifier guards
remain. Keyboard toggles, including keyboard activation of the header button, are
instant. Pointer toggles transition width for 200ms with the shared drawer curve,
reverse from the current frame, and crossfade the logo; reduced motion removes
movement. The shared R1.5 Tooltip provides desktop collapsed labels with a 300ms
first hover delay, instant keyboard access and the shared 300ms scanning window.

The header retains the clinic picker, sync and account controls at every width.
Message delivery becomes visible from 600px in the staff shell so hiding the phone
trigger cannot conceal it at 600 to 767px. Clinic settings remains in the account
menu. R2.5 shares the compact clinic context with the portal. R2.2 replaces the staff hamburger
with a small brand mark and a persistent bottom bar below 600px. R2.3 stacks the
staff clinic name above the active role at every width, with independent single-line
truncation and the complete context in the switcher's accessible name. Explicit
selected text prevents the option's wrapping styles from expanding the header.
The row may grow with enlarged text; phone pixel gutters and a 6rem minimum
context width retain room for touch targets and visible context at 320px. When
space runs short, the action group wraps below the clinic instead of squeezing
its text out. The existing clinic-switch success/failure feedback remains.
No new navigation counts or routes.

The sync control precedes Message delivery and the account menu. Its quiet inner
status surface is at least 32px tall inside a target of at least 44px. It reserves
6.75rem on phones (108px at default text, capped at 180px for enlarged text) and
192px from 600px, so state changes do not shift adjacent
controls. Phones show short state labels and the active-clinic count (visually
capped at 99+); the accessible name retains the full status and other-clinic
count. Full labels and the existing Sync now action appear from 600px. Offline,
syncing, attention, failed, queued, held and synced retain their existing priority,
ownership, recovery actions and sheet. Stable icon layers crossfade opacity,
small scale and blur over the shared 150ms ease-out; CSS transitions reverse from
their current value. Reduced motion switches icons immediately and stops the
sync spinner. Text and accessible status update immediately in both modes.

`getMobileNavigation` partitions existing authorized sidebar items using R0-AUDIT
section 5's fixed priority: Dashboard, Stations, Today Board, My Assigned, Queues,
Patients, Appointments. Up to four become primary links, followed by More; the
remaining sidebar items retain their groups in More. Header/profile destinations,
Manage profile, Your settings and Saved changes and sync remain available there.
No second permissions filter, renamed labels or counts. The static pilot's four
sample tabs are a visual reference; the production bar follows the documented
role/flag-driven contract and may contain five controls.

The bar uses the pilot's 60px minimum rows, 11.5px labels, semantic card background,
muted ink, primary current state and a single moving 2px top indicator. Labels wrap
and scale in rem. Safe-area padding covers the home indicator and horizontal
cutouts; keyboard focus is inset. More is a real button with dialog expansion
state, and marks the current section for overflow routes. Clinic-dependent links
remain native disabled controls when no clinic is selected.

More reuses the shared Radix Sheet, opening from the bottom with a 12px top radius,
a titled header and a scrolling body within 85dvh. Escape/close returns focus to
More. Resizing across 600px closes it and focuses main, avoiding a hidden trigger.
Navigation/history closes it without remounting page content. Opening the existing
sync center waits for More to release its focus trap. The provider-controlled
sync sheet remembers its actual entry point and restores focus on close, falling
back to main if that control is gone or hidden. Its focus trap and queue behavior
are unchanged. R2.4 adds the shared drag handle and interruption contract described
in section 7, retaining these custom focus handlers and existing modal semantics.
R2.5 reuses this phone bar and More behavior for the patient portal, as specified
below. The known open-overlay accessibility findings remain unresolved.

### Navigation utilities (#267)

`app-nav.ts` items carry `placement: 'sidebar' | 'header' | 'profile'`
(default `'sidebar'`), and `getAccessibleNavSections(bootstrap, placement)` keeps
one filter for all three, so a permission or flag gates an item the same way
wherever it is drawn. Two items left the rail:

- **Message delivery** (`/notifications`, `REMINDER.READ`, formerly
  "Notifications") is a 44px ghost icon button in the header from `md`, lucide
  `Send`, named by its `aria-label` and the shared tooltip. No badge: the ledger is
  outbound delivery, so nothing is unread. It takes the selected tint and
  `aria-current="page"` on its own page. The page heading is unchanged.
- **Clinic settings** (`/settings/clinic`, `RESEARCH.SETTINGS.UPDATE`) is an
  account menu item after "Your settings".

On phones the header has no room for the icon, so both appear at the end of the
menu sheet in an "Account" list (its own `nav` landmark), drawn by `AppNavList`.
Without a clinic selected each shows disabled, as the rail does.

### Volunteer and doctor dashboards (#268, R3.1)

A volunteer-only dashboard now opens with the approved mint welcome band,
device-clock greeting/date, five contour swells and a two-layer wave edge.
The greeting uses IBM Plex Sans through `font-body`; gold is the existing
`--secondary` token. A long first-name token truncates visually while retaining
its full accessible text. At very narrow available measures, including enlarged
text, decorative artwork yields its column to the greeting. Controls and state
remain mounted across width changes.

The band mounts `DashboardShiftControls` only with the station-workflow flag,
an active clinic and `OPS.SHIFT.READ`. It reads `fetchActiveShifts`, independently
of station-board permissions, through `useOpsView` and a separate
`dashboard-shifts` device-cache key. This adds no IndexedDB schema version or
backend endpoint. Queued changes use `usePendingOpsWrites`,
`overlayPendingShifts` and the existing `useShiftControls` operation.
`OPS.SHIFT.WRITE` gates actions; eligible roles retain the existing effective-role
and membership union. One eligible role is stated inline; several use the existing
Select. Start shift and End shift preserve the existing applied/queued/error copy.
Missing or failed first reads are unknown, never Off Duty. Saved/offline data is
labelled; refresh errors retain known data and offer retry. A submission lock lasts
until the read/overlay reconciles, then releases for later server-side changes.
The shared hook also guards concurrent calls before React disables the button.

**Needs you now** remains before **Today at a glance**, role trends and
clinic-wide measurements. Its existing worklist/draft rows get numbered markers
only in the volunteer-only presentation. Worklist destinations remain derived by
`getOpsDestination`; no station counts, completed steps or queue patients are
invented. Personal intake counts live once in the existing sentence. HAP totals
and draft/cosign breakdown remain in the volunteer section, alongside the existing
HAP draft links, quick actions, two trend charts and three distribution charts.
Clinic-wide summary totals remain separate in their existing divided metric group.
Existing patient descriptions supplied by authorized work-item reads are preserved.

Mixed-role dashboards keep Needs you now, clinic summaries, station-flow access,
permission-derived composition and persisted view tabs. The welcome/shift band
appears inside their volunteer view; doctor, review, clinic and network sections
retain their existing presentation. With the station flag off, the volunteer
content and existing worklist remain available and no dashboard shift component
mounts. The flag-off gate has component coverage; it is not a separate browser build.

`DashboardIllustration` lazy-loads pinned local `lottie-web` 5.13.0 and same-origin
JSON. Hello plays 0–60 once (2.5s); checklist plays 0–98 once (about 1.63s), only
after a server-applied start. Queued starts say saved on this device and receive
no server-confirmation illustration. Reduced motion loads no player/JSON; static
SVG rest frames render immediately and survive load/player failure. Colours use
theme tokens; fallback SVG IDs are isolated per instance. Source downloads were
structurally matched to the supplied JSON, and both source pages specify the
Lottie Simple License, permitting commercial use without in-app attribution.
Sources, terms and SVG derivatives live in `public/lottie/`; regenerate the
rest-frame files with `scripts/export-dashboard-illustrations.cjs`.

Every dashboard chart (`TrendChart`, `DistributionChart`) retains `ChartFrame`:
a ruled heading and a 44px Show table toggle (`aria-pressed`) swapping the SVG
for a table of the same values. Line interpolation, chart data and clinical
measurement coverage are unchanged. Detailed verification and limits:
`ui-refresh/R3.1-REVIEW.md`.

### Manager, director and admin dashboards (#269)

**Needs you now** also leads for a manager, director or system administrator. Their
rows are the clinic's held-up queues, from `DashboardData.summary`: visits nobody
has reviewed, reviewed visits no doctor has finalized, and (director data only) HAP
notes waiting for a cosign. A clinic row is left out when the person's own doctor
or review rows already say it. The cosign row has no action, because a manager has
no page of their own for it; `AppActionRow`'s `action` is optional for that case
only.

- **Station line now** (`StationLineLanes.tsx`, station workflow only): one lane
  per open station. The bar is the longest current wait, minutes since that
  patient's `queuedAt`, on a labelled minute scale with a dashed 20-minute marker.
  Past 20 minutes the bar takes `bg-warning` and the lane says "Over 20 minutes";
  a station with no one on it says "No one staffing". Words carry both readings,
  so neither depends on colour. These are aggregates; the dashboard has no
  per-patient queue data.
- Both station charts (median wait, hourly flow) are in `ChartFrame`, and the
  "By station" table, staff activity and clinic comparison lose their cards for
  the same 2px ruled section heading.
- **One role section at a time.** An account with more than one of the clinic,
  network, doctor and volunteer sections sees them as a "Dashboard view" tab set,
  oversight first (Clinic trends, Network overview, then the person's own queues).
  A single-role account sees no tabs. Doctor and review stay one view.

### Patient registry and records (#270)

The registry starts with search and the existing location and completed-screening
filters (#224), followed by one result count and the shared sortable, paginated
DataTable. Patient identities use the serif record role on phones; row actions
have 44px targets. URL state, clinic scope, masking and check-in behavior stay as
implemented before this phase.

Patient records use local `RecordSection` groups on the canvas, with plain
label/value rows for demographics and longitudinal readings. Overview starts with
**Needs you now** using the existing pending actions and destinations. Chart tabs
remain role-filtered, lazy and addressable through `?tab=`; their targets are 44px.
Staff measurement trends opt into the existing `ChartFrame` table alternative and
straight line segments. Portal chart defaults are unchanged.

Registration and Change ID surface browser constraint failures in a linked error
summary and the shared `FieldError`, with `aria-invalid` / `aria-describedby`.
Native required, email, date and length constraints still decide submission.
Error messages revalidate from the form's bubbling change event, after the
control's own handler; values are captured before functional state updates so
correcting an invalid field cannot restore an older value. Registry results
reserve bottom clearance for pagination beside the fixed chat launcher.
Inline error space is reserved after the first failed submit; changing the ID type
removes only the obsolete ID error. Request errors use the existing `readApiError`
formatter so recovery instructions are readable rather than raw JSON. Edit retains its existing
button save and offline outbox behavior, with an announced save-error summary;
it gains no new client constraints. Consent retains its exact text, attestation
requirement and disabled submit behavior, with an outlined warning action to
separate consent recording from routine saves. Ghana phone input styling now uses
tokens and 44px controls; parsing and its accessible name are unchanged.

Shipped in [PR #294](https://github.com/akomapahealth/nkwapa/pull/294); before and after screenshots and verification are in the pull request.

### Stations and screenings (#271)

The station-enabled Today board leads with ruled **Needs you now** rows for waits
over 20 minutes, open stations with no staff, and patients queued at the review
station. These use the existing `StationBoard` response; review counts refer to
patients queued at that station. Long-wait detail names the three oldest waits and counts any
remainder. The **On shift** roster retains screener attribution.

Each patient has a separate station-line bar. Its width is minutes since
`queuedAt`, including for a claimed visit, on a shared scale rounded up to ten
minutes (minimum 30). Gridlines are every ten minutes; long scales thin only the
numeric labels. Numeric axes remain visible on mobile, alongside the scale and
20-minute guide description. The 20-minute guide, warning text, three-state legend,
exact name/time labels and table alternative keep the reading available without colour.
With-staff bars use primary/primary-foreground; waiting uses neutral tokens;
queued waits strictly over 20 minutes use warning-surface/warning-ink. Narrow
bars can clip their decorative label; the full patient name, state and exact
minutes remain beside every bar. Staffing is shown as Staffed N of capacity,
separately from places in use. Manager controls retain their permission, day,
connection and reason gates.

### Stations workspace refresh (R3.2)

The Stations overview leads with a compact shift strip. Off duty, it offers the
existing shift start and eligible role choice without displaying disabled station
lists or empty queue columns. A missing or refused first read stays unknown.
Retained data remains visible after refresh failures with an explicit retry.
Pending starts/ends retain their existing outbox overlays and recovery badges;
station changes and claims require a server-confirmed active shift. Start/end
use the shared `useShiftControls` operation with a page reconciliation lock.
Today, My Assigned and the dashboard retain their own shift presentations.

On duty, a labelled station trigger opens the existing draggable Sheet: bottom
below 600px, right-side from 600px. The same content and open state survive width
changes. Choices come from the active station board, including actual waiting
counts and the current station. Selecting the current station clears it using
the existing operation. Closure notices and screener attribution remain visible.

The oldest queued patient becomes a ticket with a deep-teal, dashed queue stub,
patient code, exact wait, check-in time and existing handoff/performer details.
Other patients retain claim/Continue actions and the account's actual screener.
The phone's fixed Take action uses the short visible label Take patient, retains
the full patient name in its accessible label, and leaves space for chat, the
BottomNav and the safe area. At wider sizes Take remains on the ticket.
Station capacity and places in use remain explicit and informational, matching
the existing server contract. Claim and Continue actions remain available.
Claims and station changes have synchronous duplicate guards; successful claims stay busy through navigation.
The whole line uses one route stop per actual station, gold for the user's stop,
with actual waiting/being-seen counts and staffing. It reflows by available width.
No workflow completion badges, new APIs or undo behavior are inferred from the pilot.

Station setup, the station visit workbench, visit history/hand-off and My Assigned
use `RecordSection` rules. Shared history, eye, counselling, results and shift panels
opt into that treatment only on these routes; VitalsForm uses its existing
station `sections` boundary. Existing clinical fields, units, validation,
defaults, correction history, offline outbox, held states and save payloads stay
unchanged. Station BP/anthropometry saves add a linked summary from the existing
validation errors. The screener Change link now uses the measured info ink on its
info surface, fixing the two light-mode before axe findings without token changes.
My Assigned's follow-through summary excludes completed and cancelled check-ins;
its assignment table retains the full list and existing filters.

Shipped in [PR #295](https://github.com/akomapahealth/nkwapa/pull/295); before and after screenshots and verification are in the pull request.

### Patient registry workspace refresh (R3.3)

Both registry routes retain the shared `PatientRegistryScreen`, existing clinic
scope, debounced search, URL filters, server sort and pagination. The toolbar sits
on the workspace sheet, with a visible search label and a Filter action. `/`
focuses search unless typing or an overlay owns focus; Escape clears search.
New Patient uses `PATIENT.CREATE`, and check-in uses `OPS.CHECKIN.CREATE`.

Location and completed-screening controls live in one draggable Sheet: bottom
below 600px, right-side from 600px. Filters update immediately; Show results only
closes the Sheet. Selection, custom-range mode and open state survive resizing,
and filter values survive dismissal. Every active filter has a wrapping removal
button with a 44px floor. Removing a region also clears its district; removing
screened dates clears their now-invalid sort. Clear all retains unrelated sorts.
Invalid or refused dates remain reachable through Edit screened dates after
closing the Sheet. No result count is fabricated for its final action.

The shared DataTable still switches by its available 60rem container width;
other table consumers retain their existing presentation. Registry cards use
IBM Plex Sans for names, Plex Mono for patient codes and actual phone/ID data.
They keep View record and permission-gated Check in. A touch swipe to the left
uses the same check-in operation and synchronous submission guard as the button.
Vertical movement, pointer cancellation, resizing and blur cancel a held swipe.
The row remains after success, queued writes and refusal. No undo, queue state,
last-visit field or optimistic row removal is inferred from pilot data.

Existing resource states and offline check-in/replay semantics remain. The
registry still requires a connection for a cold read and retains loaded results
with the existing stale/offline notices. Validation scope and manual limits are
recorded in `ui-refresh/R3.3-REVIEW.md`.

### Patient registration workspace refresh (R3.5)

Both new-patient routes keep `RegisterPatientScreen`, their existing permission
guards, clinic scoping, registry links and successful chart destination. The
screen sits directly on the workspace sheet with its existing safety help and
four ruled sections: Identity, Contact details, Residential location and National
ID. Paired fields use two columns from 600px; from 1200px each section's heading
and explanation sit beside its controls. All styling is registration-local;
shared section/location/phone/error components and edit forms keep their contracts.

Below 600px, Create patient and Cancel remain visible above the phone navigation.
Registration measures the rendered Primary navigation and chat launcher so text
enlargement cannot turn nominal shell dimensions into covered actions. Both
buttons wrap when needed and keep 44px targets. The duplicate dialog keeps the
existing Review details/Open existing patient operations, with a bounded grid and
wrapping actions for long identity fields and enlarged text.

Required markers, native constraints, field errors/summary links, all field
labels, options, defaults and payload omission rules are unchanged. In particular,
No ID document omits the ID number; switching back retains the entered value.
Unknown/not-recorded residential states keep their existing clearing rules. The
same synchronous submission guard covers repeated submits, permits retry after
refusal and stays held while successful navigation leaves the form. The API's
idempotency contract remains unchanged. Offline copy asks for a connection;
registration does not invent an outbox, local save or automatic replay. Values
remain in the mounted form after an unsuccessful request.

Validation, candidate failures and limits are recorded in `ui-refresh/R3.5-REVIEW.md`.

### Patient profile workspace refresh (R3.6)

The canonical clinic-scoped chart keeps its data lifecycle, role/flag gates,
legacy and merged-record redirects, URL tabs and lazy longitudinal reads. Its
profile header now puts patient name, patient code, existing sex label and
recorded research-consent badge together. An initials marker is decorative.
Back to Patient Search remains a real clinic-scoped link; existing Edit and
Check In Patient operations remain permission-gated, with their original
handlers and pending/refusal/offline behavior. No encounter or registration
workflow is invented from the visual pilot.

On scroll, a compact identity strip keeps the actual name and patient code in
view below the measured workspace header. It follows shell resizing/collapse,
adds no duplicate focus stops or announcements, and yields if it would cover a
keyboard-focused control. It updates without entrance motion, including under
reduced motion. Opaque semantic surfaces preserve legibility in both themes.
The strip is portaled outside the scrolling page to avoid inherited spacing and
clipping. Measurements are chart-local; the shell and shared primitives are unchanged.

Needs you now still leads the overview. Clinical summaries use one column below
840px and two above; demographics/location and existing portal/admin/next-step
sections use one column below 1200px and a 2:1 split above. Long identity values
wrap; header, portal and merge actions wrap and retain 44px targets. Clinical values, labels,
units, empty/error states, consent, merge refusal, portal access and new-encounter
access remain on their existing implementations. The separate Vitals and
Encounters redesigns remain R3.7 and R3.8.

Validation and limits are recorded in `ui-refresh/R3.6-REVIEW.md`. The shared
normal-route audit now explicitly waits for the sync pill's settled synced
state before measuring contrast; transient sync states remain a separate finding.

### Vitals workspace refresh (R3.7)

One `VitalsForm` still serves encounter Vitals, the new-encounter wizard and
section-limited station measurements. Ruled `RecordSection` groups replace
nested panels and tinted icon tiles. The systolic/diastolic pair is visually
distinct without changing its labels, units, input behavior or validation.
Container-width grids use one column by default, two from 30rem available width,
and three from 48rem for ordinary fields (four for chart history measurements).
The read-only summary uses the same local grouping and explicit saved units.
No form subtree is remounted on resize. Save and tobacco-review actions wrap with text size and retain 44px targets.
On phones their row sticks within the form above the measured bottom navigation,
with clearance for the actual chat launcher. At narrow available text widths,
that clearance moves below the full-width actions so their labels stay readable. The navigation, launcher and action
row are observed for resizing; focused fields have matching scroll clearance.
The row stays bounded by the form, leaving subsequent station handoff controls
in their original flow.

The local stylesheet permits wrapping selected values, notes and actions.
Shared Input/Select/Button, shell and station workflow are unchanged. A small
`min-width`/word-wrap correction to the existing prescription allergy label
prevents its long words from overflowing the encounter around Vitals at enlarged
text. The encounter container also permits long words to wrap; no prescribing
or encounter workflow behavior changed. `FieldError`
receives the field id, not an already-suffixed error id; temperature, Notes,
Select and Other context fields now link to their actual error messages.
Select items are grouped through the existing Radix primitive.

Chart history keeps its chronological reads, provenance, visit links, locked and
status badges and cursor pagination, while its measurement grid follows actual
available width. The shared ChartFrame receives only an inert `data-chart-frame`
marker; Vitals-local CSS wraps its header. Explicit single-column grid tracks
and `min-width: 0` prevent the blood-pressure chart from sizing the page to its
minimum content at enlarged text. Other chart consumers retain their layout.
Trends keeps its range/selected-measurement state, requests,
exact values, units, graph/table alternatives and source descriptions. The
measurement selector uses semantic selected surfaces, a quiet value hierarchy,
visible focus and instant repeated selection. Clinical numbers never animate.

No clinical fields, defaults, validation ranges, classifier, permission,
finalization, offline/outbox/replay or save handlers changed. Crisis still saves
first and waits for its existing one-button acknowledgement dialog; recording
the acknowledgement remains separate backend work. R3.8 owns Encounters.
Validation and limits are recorded in `ui-refresh/R3.7-REVIEW.md`.

### Persistent BP reading signals (R3.7 follow-up)

Vitals entry now keeps a reading-level signal beneath the BP pair: the exact
number/unit, existing category badge, and a five-band strip with a visible check
and `aria-current` on the selected category. Saved history and finalized views
show compact tags beside their readings. Stage 1 uses warning, Stage 2 severe,
and Crisis destructive, from the existing hypertension presentation map. Nothing
animates. Text and the check preserve meaning without color.

The signal reuses the shared classifier and low-BP predicate. A presentation
guard with the existing shared plausible bounds and systolic/diastolic ordering
withholds staging for incomplete/invalid pairs. Low BP is shown separately;
a low reading is not given a Normal/Elevated badge or a selected hypertension
band. Mixed high-systolic/low-diastolic readings retain both existing signals.
No clinical rule, save, escalation, permission, outbox or acknowledgement behavior
changes. The Crisis dialog remains.

Entry labels distinguish unsaved BP from BP matching the locally saved reading;
they make no claim about whether other fields are saved or the bundle is synced.
Category changes announce politely without announcing numeric keystrokes. These
are BP categories, not low/medium/high overall patient risk. A broader risk model
remains later work and needs a specified clinical objective, inputs and approval.
Review and evidence: `ui-refresh/R3.7-SIGNALS-REVIEW.md`.

### Queues and encounters (#272)

`/queues` keeps one count on each permission-gated lane tab. R3.4 puts the
tabs directly on the workspace sheet, with one sentence explaining the selected
lane and an explicit Refresh queues action. Existing labels, doctor cosign /
finalize / review / drafts default priority and clinic-role cosign gate remain.
The URL owns lane selection, including Back/Forward; invalid or inaccessible
lane parameters fall back to the role's default. Only allowed lanes render.

Each lane uses one DataTable with its existing 60rem container switch to ruled
cards. Sort, pagination and loaded rows survive shell resizing and lane switches.
Cards include actual patient identity, chart code, created/submitted time, BP
classification and the existing fasting 126 / random 200 mg/dL High glucose flag.
Both layouts expose a keyboard-accessible Open encounter link. Cosign rows keep
the note ID as their row key, show the actual author and submitted time, and link
to the encounter ID, so two notes for one encounter stay distinct.

An unavailable count is unknown until a successful read. If totals fail while
rows load, tabs say "loaded" and a warning explains the limit. A full API page
still offers Show more without a total. Server offsets advance by received rows,
independent of deduplication; retained rows survive refused paging and retry.
Requests use the existing resource lifecycle with abort/supersession protection;
a clinic or permission change remounts the queue workspace. Failed refreshes and
offline reads retain a visibly qualified snapshot. The all-lane read remains
atomic: one refused lane prevents replacing the prior snapshot.

Only a successfully read, online, current empty lane with no contradictory
nonzero total may show the approved licensed checklist and dashboard action.
Drafts say "No draft visits"; review/sign-off/cosign say "All caught up" for
that lane only. No claim is made that other work is complete. The illustration
starts when first viewed, rests at frame 98 and stays mounted through refresh
and lane changes; reduced motion and player failure use the existing static SVG.
A stale/offline empty snapshot says it is the last loaded version instead.
There is no polling promise, fabricated completion count, undo or new mutation.
Validation and limits are recorded in `ui-refresh/R3.4-REVIEW.md`.

The encounter workspace drops the three metric cards and the second patient
heading. A ruled progress line names the stage in words (Draft, Pending review,
Awaiting sign-off, Finalized) with `aria-current="step"`, derived from the
existing status and preceptor review. Submit for Review stays a routine header
action; Mark Reviewed moved to its own band in R4.2 (below). Sign-off actions (encounter Finalize, HAP Sign note and
Cosign note) use the consent precedent: outlined warning ink with `ShieldCheck`.
Finalize sits in its own "Ready for your sign-off" row saying it locks every
tab. A finalized care plan reads back as a ruled `<dl>`.

R4.1 (doctor review): Finalize now asks once, in the shared confirm dialog ("Finalize this
visit?", Not yet / Finalize visit, focus on the safe choice), because it locks the record.
The HAP note is no longer a card: one ruled section with the title and status, a provenance
`<dl>` (written by and role, care team at submission, submitted, signed or cosigned by whom)
and History, Assessment and Plan as ruled blocks. Read-only text is plain reading text at a
70ch measure, not boxed. A note waiting on this doctor leads with the same warning band as
encounter sign-off ("Waiting for your cosign") holding the only Cosign note action; the
dialog names the author. Draft actions end in `FormActions` (split: save state at the start,
Sign note or Submit for cosign last). Addenda and prescriptions are ruled lists; the
Prescriptions panel and its Add prescription form drop their card and box. Note, encounter
and dashboard times use `formatOpsDateTime` (Africa/Accra). The doctor and review dashboard
tables share `recent-visit-columns.tsx`: Patient (a link to the visit), Code, Status, Visit
started. Do not give the note wrapper an accessible name containing "History": tests and
assistive technology find the History field by that label.

R4.2 (preceptor and manager oversight): Mark Reviewed leaves the header. A visit waiting on the
reviewer opens with a "Ready for your review" band in the place sign-off takes next: the sign-off
band's shape with a teal rule, `ClipboardCheck` and a primary Mark Reviewed, because review locks
nothing. Warning ink and `ShieldCheck` stay reserved for Finalize, Sign and Cosign. After Mark
Reviewed, focus moves to the "Ready for your sign-off" heading that replaces the band. There is no
preceptor role: only doctors (and system administrators) hold `ENCOUNTER.REVIEW`, and the API sends
the review dashboard block only beside the doctor block.

The flag-off Today Board puts patient flow first: one ruled list grouped by what the manager does
next (Waiting for a pair, Assigned, In intake, then Completed and Cancelled as closed disclosures),
one hairline `article` per check-in with the pair as a `<dl>` and actions right-aligned. Row columns
follow the list's own width (container query at 44rem), not the window. The shift control and
Staff on duty sit in a 20rem column from 1200px; the role filter is a `SegmentedControl` whose
labels carry the counts, replacing pill buttons and three count tiles. "Needs you now" appears only
when someone is waiting and the viewer can assign. With the station flag on, `/today` is the
station line board and is unchanged.

Staff activity shows ranges and days through `formatOpsDate` and record times through
`formatOpsDateTime`; the name column stays in view while the counts scroll sideways; opening a
person moves focus to their name and All staff returns it to the row they left. The manager
dashboard's staff table says Visits started and Visits finalized, shows role names, and links to
Staff activity. Station flow's longest-wait note is a ruled warning band, not a tinted box.
Volunteer Deactivate is a plain outline button: Reactivate undoes it.

The Station session route uses `RecordSection` rows. A cancelled stop's station
name is struck through beside "Cancelled by", the name, the time and the reason;
skipped and completed stops keep who and when without the strike. Performer
corrections still show the corrected name only: the prior name is in the audit
trail, not the timeline response, so showing it struck through needs an API
change (out of scope). The new-encounter wizard names its five steps instead of
unlabelled bars. The clinic encounters hub replaces placeholder metric values
with three ruled links, including the real queues.

Shipped in [PR #298](https://github.com/akomapahealth/nkwapa/pull/298); before and after screenshots and verification are in the pull request.

### Appointments (#273)

`/appointments` leads with patient requests: a ruled section whose title
carries the awaiting count, one hairline row per request with its type and
status as text, the patient's reason set off by a rule, and the same Confirm
request and Decline actions. The schedule follows as one ruled section: the
range itself is the title, with "Times in Africa/Accra" (the zone the API
returns) beneath it, previous, Today, next and Day/Week beside it. Week view
adds a seven-day strip with each day's count; choosing a day opens it in Day
view (`aria-current="date"` marks today). Filters, the ledger counts and the
day lists sit under the same rule. Completed's detail line now also states the
range's cancelled and no-show counts from the existing summary.

Day lists are hairline rows on phones and a ruled table from 1280px. A
cancelled visit's time is struck through beside its "Cancelled" label; the
schedule response carries no who or when for a cancellation, so those are not
shown (API change, deferred). Statuses still come from
`lib/appointment-status.ts`.

Reschedule and Confirm request put the error summary first (`role="alert"`,
fields `aria-invalid` and `aria-describedby` it), show the booked visit or the
request as ruled context, and group fields under "New time" / "Visit time" and
"Care team" legends. `datetime-local` reads the device clock, so the time
fields say which zone they use: the clinic zone, or the device zone beside the
clinic zone when they differ. Converting typed times to the clinic zone would
change saved instants, so it is left for the deferred API and data work.
Validation, lifecycle and triage calls, permissions and reminders are
unchanged.

Shipped in [PR #299](https://github.com/akomapahealth/nkwapa/pull/299); before and after screenshots and verification are in the pull request.

### Administration and oversight (#274)

Staff and access, clinics, duplicate review, data requests, audit, message
delivery and clinic settings group filters, records and policy with
`RecordSection`. Audit and delivery use hairline rows on phones. The
administration tables opt into a named, focusable scroll area so a keyboard
user can reach and scroll the results before moving into their controls.

Actions that deactivate access, remove a role, take a clinic offline, close a
deletion request or relax a research safeguard use the outlined warning
treatment from consent: warning ink and `ShieldCheck`. Confirming a duplicate
uses the same treatment when it queues the pair for merge. The review decision
does not merge charts; the patient chart retains the existing merge flow.
Data request status words are rendered through `lib/status-presentation.ts`.

Shipped in [PR #301](https://github.com/akomapahealth/nkwapa/pull/301); before and after screenshots and verification are in the pull request.

R4.3 (director and system administrator oversight) narrows the warning rule above. Warning ink and
`ShieldCheck` are for what cannot be undone from this screen: merge, erasure (closing a deletion
request) and queueing a confirmed duplicate for merge. Deactivating an account, removing a role and
taking a clinic offline are undone by Reactivate, Add role and reactivating, so they are plain
outline buttons and a routine Save, and Inactive and Deactivated badges are the neutral `secondary`
badge, not destructive red. Confirmation dialogs and their copy are unchanged.

- **Counts are words, not tiles.** The boxed "Showing N" and "Loaded rows" tiles beside section
  titles are gone; the count closes the section description ("Showing 10 of 13."). Metric groups
  hold counts only: the audit log's "Has more results: Yes" and "Audit scope: Clinic" and Staff &
  Access's "Scope" and "15 / 0" cells were not figures. Staff shows Active accounts and
  Deactivated separately; the audit log says how many events are loaded and whether older history
  remains in its description.
- **One table at every width for counts.** The network clinic comparison drops its boxed phone
  card list for the same `DataTable` with a sticky clinic column
  (`sticky left-0 z-[1] bg-card [thead_&]:bg-surface-2` through the column `meta.className`) and
  right-aligned counts. Director staff activity and both organization tables use the same sticky
  name and right-aligned counts. Record lists that carry actions (clinic registry, roster) keep
  their phone rows, now hairline `article`s instead of rounded boxes.
- **Sheets hold ruled sections, not cards.** The access sheet's sections are `RecordSection`s with
  `h3` titles, identity facts are hairline rows, and role rows are hairlines. The duplicate
  comparison sheet's decision block and the cross-clinic clinic-pair rows are ruled; a chosen pair
  fills with `--selected`.
- **Times.** The audit log uses `formatOpsTimestamp` (Accra, with year and seconds, because audit
  entries are compared to the second); duplicate rows, cards and the phone audit list use
  `formatOpsDateTime`; `formatInviteDate` (invites and data requests) now reads in Accra too.
- Audit filters sit in two rows of four and end in `FormActions` (Clear, Apply filters). The audit
  table opens on 25 rows; its Rows select was blank because 10 was not one of its options. The
  audit log and data requests use `SelectClinicState` when no clinic is chosen (data requests used
  to show a skeleton forever). Metrics' failure-reason chart is one neutral series.

### Analytics and reporting (#275)

`/metrics`, `/staff-activity`, `/reports/organization` (Report and Cohort
analytics) and `/clinics/[clinicId]/research/exports` drop their cards for the
ruled sections of section 12: a 2px top rule, a `type-section-title` heading,
a quiet description and hairline rows. The patient chart's `RecordSection`
primitives are reused rather than adding a second set. Tables keep their
captions, names and test ids; status badges and actions are unchanged.

- **Every chart is a `ChartFrame`.** The trend and distribution charts already
  were. The three metrics conversions now are too, so each gains "Show table"
  with Step, Count and Share of first step. `ChartFrame` takes
  `height="auto"` for HTML bars and an optional `summary` line, which carries
  the conversion figure and description above the bars. Conversion bars use
  `--chart-1`, not the teal reserved for what can be pressed, and lose their
  rounded ends and width transition.
- **No shadcn `chart` and no new dependency.** The existing Recharts 3.10.1
  charts in `ChartFrame` already meet the section 13 adaptations (straight
  segments, a table on every chart, the HSL palette, tabular ticks), so
  wrapping them again would add code without changing what a reader sees.
- **No chart animation.** The owner allows it, and the issue asks for none;
  the charts keep `isAnimationActive={false}`, so readings never pass through
  invented intermediate values. No reduced-motion code was needed.
- Staff activity: the date range is the section title with the clinic zone
  beneath it; names and the Open links are 44px targets; the clinic total sits
  under a strong rule.
- Research exports: Needs a decision, export runs and schedules are hairline
  rows instead of boxes inside a card. "Request export pack" takes the strong
  rule; the icons beside section titles are muted, not teal.

Shipped in [PR #300](https://github.com/akomapahealth/nkwapa/pull/300); before and after screenshots and verification are in the pull request.

### Patient portal (#276)

R2.5 keeps the existing Overview, My Health and Appointments labels and routes.
Below 600px they appear in the shared fixed BottomNav followed by More, with the
same moving indicator, wrapping labels, safe-area padding and 44px target floor
as the staff bar. At 600px and above a wrapping top navigation strip replaces the
phone bar. Health owns self-report routes; Appointments owns request routes.
Account and settings routes mark More as current. CSS selects the presentation;
page content stays mounted across widths.

More reuses the shared draggable bottom Sheet, preserving keyboard access,
Escape, focus containment, scrolling and sequential More-to-sync focus handoff.
It contains Manage profile, Your settings and existing permission-filtered
header/profile utilities. It does not add staff sidebar destinations. Saved
changes and sync appears only with an active clinic and the same eligibility as
the existing sync pill: sync permissions, this account's saved changes or held
changes, including other clinics. An empty patient queue without sync permissions
exposes neither an inert recovery entry nor an invented synced status. Queue,
ownership, authentication and permission behavior remain unchanged.

The portal Header uses a phone brand mark and stacked, independently truncating
clinic/role context. Its former dormant left-menu trigger is absent; phone
navigation is owned by BottomNav. Existing clinic switching, account menu,
appearance, tour and install access remain. Authorized Header utilities appear
from 600px, so hiding phone More cannot conceal them at 600–767px. The portal is
one card surface on the
canvas, inset 8px from 600px, with quiet borders and 12px corners. Main has 6rem
plus bottom safe-area clearance below 600px and 1.5rem above; the inherited bottom
navigation height variable is available to floating consumers. Chat remains a
staff-only mount. Request an appointment remains available from Overview and
Appointments; past readings remain under My Health.

The six portal routes use the existing `RecordSection` top rule, serif
headings and hairlines between records. The reading and request forms keep
their fields, defaults, validation and save behavior. The portal keeps the
same saved-copy notices and connection requirements.

Shipped in [PR #302](https://github.com/akomapahealth/nkwapa/pull/302); before and after screenshots and verification are in the pull request.

### Authentication and onboarding (#277)

Account setup crosses two systems: the password is chosen on Keycloak's pages,
everything else happens in the app. Each side now shows the whole path in the
same words, so leaving Nkwapa for sign-in and coming back reads as one journey.
The flows, redirects, required actions, API calls and validation are unchanged.

- **One frame for every account step.** `/accept-invite`, `/claim-record` and
  the required `/account/name` step render in `OnboardingFrame`
  (`components/onboarding/`): a hairline header with the mark, who is signed in
  and Sign out, a "Step n of m" line, the serif title, ruled sections on the
  canvas, and the journey beside them (below on phones). Journeys and their
  steps live in `lib/onboarding-journey.ts`: staff (choose a password, accept,
  add your name when needed, start work) and patient (choose a password,
  confirm your details, open your record). Each step says in words whether it
  is done, current or still to do; the marker colour only repeats it.
- **No invitation is three causes, each with its fix.** `InvitationNotFound`
  replaces the single paragraph: email not confirmed, invitation expired,
  already used or withdrawn.
- **`/login`** drops the teal card for the same canvas frame: the action first,
  then "What happens next" as three numbered hairline rows, and "First time
  here?" explaining that accounts start with an invitation.
- **Keycloak theme.** `template.ftl` takes `journey`, `step`, `eyebrow` and
  `description`, and renders the matching step list (signing in, setting up
  your account, resetting your password) or, on `error.ftl` and
  `login-page-expired.ftl`, "When a link stops working". The form sits under
  the 2px ink rule; the clinic photo stays on desktop only, lazy loaded.
  Lower-case page titles are sentence case. Expired, used and invalid link
  messages are rewritten in `messages_en.properties` to say what happened and
  what to do; the failed sign-in message is unchanged, so it still does not
  reveal whether an account exists. The theme stays light only (see its header
  comment) and fonts stay self-hosted.
- **Welcome tour, by role.** Same dialog, completion and storage
  (`CompleteWelcomeTourDto`, version 1). The step count is written out above a
  segmented bar; the welcome names the role and clinic; staff get "What you
  can do as {role}" with up to four places chosen by permission, then "Finding
  your way" and offline work, each as a short ruled list of what and where.
  The version was not bumped, so nobody is shown the tour again uninvited.
  Motion is unchanged: framer-motion reads reduced motion in JavaScript and
  falls back to a cross-fade.

Shipped in [PR #303](https://github.com/akomapahealth/nkwapa/pull/303); before and after screenshots and verification are in the pull request.

**R5.2 (2026-11-11).** `/login`, every `OnboardingFrame` step and the Keycloak pages now sit on
the same inset sheet as the portal and staff shells: full-bleed white under 600px, then 8px inside
the canvas with a 12px radius and a hairline (`.nkwapa-auth-sheet` in the theme). The "I am signing
in as" control is the pilot `.seg` (surface-2 track, raised card knob, primary label), still a
native radio group; the filled teal segment is gone. Keycloak fields carry `autocomplete="username"`
(it was `off` on sign-in, which blocked password managers) and point at their error with
`aria-describedby`. Keycloak controls stay 48px on every pointer: the 44px password toggle sits
inside the field, so a 40px mouse field would clip it. `/account` and `/account/name` use ruled
`RecordSection`s, hairline role rows and `FormActions` (the name form ends in it everywhere it is
used, including the admin user sheet); the permission split is unchanged.

### Public landing page (#278)

The landing page leads with the clinic, then the product. Copy is unchanged
apart from section names, photo captions and the scroll link, so every claim is
still one the product makes; there are no counts, quotes, logos or outcomes.

- **Photograph first.** Akomapa-17 fills the hero on wide screens with the copy
  on a dark scrim at its foot, so the hero reads the same in both themes; on
  phones the photograph sits above the copy, framed on the volunteer. It is the
  LCP: eager, high fetch priority, visible from the first frame, and moved only
  by transform once the reader scrolls. Each of the eight Akomapa photographs
  appears once. `nkwapa_animate.mp4` is not used (watermark, letterbox, audio,
  morphing artefacts).
- **Ruled sections.** `SectionRule` (`components/landing/`) is the 2px ink rule
  with the section's name, replacing the three tracked eyebrows. Photographs
  are square; the offline block is no longer a card.
- **Motion.** Everything stays in `LandingMotion`, behind GSAP `matchMedia`
  with no reduced-motion preference. Text fades by opacity, never visibility,
  so headings stay in the accessibility tree before they scroll in. The word
  scrub on the problem heading is gone (it left words at 18% opacity). New:
  the hero photograph drifts as it leaves, and the about photograph opens from
  the content width to the window edges (clip-path, wide screens).
- **Lenis 1.3.27** (MIT, 5.4 KB gzip) smooths wheel and trackpad scrolling on
  wide screens with a fine pointer, driven by GSAP's ticker so the pinned
  scenes scrub without stepping. It writes the native scroll position, so
  keyboard, scrollbar, anchor links and find-in-page stay native; its own
  anchor handling is off so a followed link still moves focus. It ignores
  wheel events inside a dialog and while Radix has locked the page.
- **Not adopted.** React Bits, Kokonut and Bklit were reviewed for this page.
  Their scroll-text and stack components duplicate what GSAP already does here;
  marquees need a pause control for a gain the photographs already give; a
  Bklit chart would need invented readings. None earned a copied component.

Shipped in [PR #304](https://github.com/akomapahealth/nkwapa/pull/304); before and after screenshots and verification are in the pull request.

### Motion and feedback (#280)

Polish on the contracts above, not a new motion language. Every change respects the global
reduced-motion rule and the section 7 tokens, and none touches a clinical save, validation,
permission, route guard, feature flag or analytics consent.

- **Toasts stay on Sonner.** Errors now reach a screen reader assertively: the visible words of
  an error toast are hidden from assistive technology and a visually hidden `role="alert"` copy
  speaks them for as long as the toast is shown, which is how Base UI handles a high-priority
  toast. `toastPromise` settles through `showToast`, so its failures get the same treatment. The
  dismiss button keeps its 24px glyph with a centred 44px target. Comparison in section 13.
- **Loading in the final shape.** `DashboardLoadingState` is drawn as the ruled "Needs you now"
  rows and the five-figure metric group that replace it, inside one named status region; the old
  carded version also failed colour contrast on its loading badge. `PageSkeleton` and
  `ResourceState`'s loading region are named status regions too.
- **Shortcut hints where shortcuts already exist.** The header's rail toggle shows `[` in its
  tooltip and carries `aria-keyshortcuts`; "Save draft" names Ctrl+S / ⌘S. No new shortcuts.
- **Landing photographs** get a 16px blurred WebP as their `next/image` placeholder, generated by
  `apps/web/scripts/generate-landing-blur.mjs` with the `sharp` Next already ships. No new dependency.
- **Type.** Headings balance their lines and paragraphs, list items and captions use
  `text-wrap: pretty`, both globally in `globals.css`. Live character counters and the unread
  badge use tabular figures.
- **No `transition: all`.** Tab triggers transition colour, background and shadow only.

Shipped in [PR #306](https://github.com/akomapahealth/nkwapa/pull/306); before and after screenshots and verification are in the pull request.

### Route QA and landing restraint (#282)

UX-22 is the route-wide QA pass, plus an owner-requested restraint pass on the landing page and
the What's New dialog. Same section order, motion, photographs and blur placeholders as #278 and
#280; no API, permission, guard, flag, consent or clinical change.

- **No eyebrows on the landing page.** `SectionRule` is now the bare 2px ink rule with no label
  (`aria-hidden`); the hero's kicker line and the release banner's uppercase "New" chip are gone.
  Section names live in the navigation and the headings. `.text-eyebrow` stays a workspace utility
  (section 6); do not bring it back to public pages.
- **Copy rules for public pages.** A headline under ten words, one supporting sentence, short
  section heads, and no list that repeats another section (the problem list and the "each role
  sees what it needs" safeguard were cut for that reason). Every claim is one the product makes
  today: no counts, quotes, logos or outcomes. The page went from 1,151 to 540 words.
- **One picture per hero, no captions.** The phone was removed from the hero so Akomapa-17 is the
  only image there and still the LCP; the product screens start in the next sections. No
  photograph or screenshot on the page has a caption; alt text carries the description.
- **The accent.** The logo gold (`--secondary`, exact brand value, section 2) as a 64 × 2px rule
  above the hero headline. It sits only on the hero's fixed dark ground, where it measures 12.2:1
  (light theme value) and 10.5:1 with the dark-theme gold. It is brand, not status: the
  warning tokens are a different hue (section 3), and the gold already marks the primary CTA. Use
  it once per screen at most; it is not a fill for text.
- **What's New copes with a long release.** A compact title band (version, date, counts per
  group), one scrolling region named "Changes in this release", and a fixed footer with the
  contact and GitHub links, so the title and Close stay in view. A release of more than 8 changes
  opens with 3 per group and a `Show all N <group>` toggle (`aria-expanded`, `aria-controls`);
  collapsing scrolls the toggle back into view. The per-item stagger is gone (39 items took 2.8s
  to arrive). The data still comes from `lib/release-notes.ts` unchanged.

Shipped in [PR #309](https://github.com/akomapahealth/nkwapa/pull/309); before and after screenshots and verification are in the pull request.

### The combobox, and when it is not the answer

`Select` is still the default. `Combobox` exists for one case: a list long enough that scrolling
it is not a real option, where the value is a known token rather than free text. Time zones are
the first -- roughly 420 entries, and a Radix `Select` cannot carry a filter because its own
typeahead consumes the keystrokes.

It follows the ARIA combobox-with-listbox pattern: the input owns `role="combobox"` and
`aria-activedescendant`, so the active option is announced without focus ever leaving the text
field. The popup is named "Suggestions" rather than repeating the field's label, which would
give one accessible name to two elements.

Typing filters; it never commits. A value that matches nothing leaves the previous selection
intact, so a control backed by a fixed vocabulary cannot emit a value outside it. That is why
the clinic dialog cannot submit an invalid time zone at all, and why the API's timezone
validator is a backstop for API clients rather than for this form.

Matches are capped at 50 with a "keep typing to narrow" line instead of virtualising. A list
nobody can see the end of is a prompt, not a scrolling problem.

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

**A page header never expands in place.** `AppPageHeader`'s `hint` and `helpText` both render as an `InfoHint` beside the title (with `helpTitle` as the bubble's heading), so no header pushes the page down. Help that is required reading is therefore not header help: it goes in a `ProgressiveHelp` directly under the header, in the page body, as on consent, research exports and the two duplicate screens.

`InfoHint` is built on Radix Popover: collision handling, an arrow that stays on its trigger, an exit animation, and scaling from the trigger (`--radix-popover-content-transform-origin`). It keeps `role="tooltip"` and leaves focus on the trigger. Sizes are `sm` and `md`; call sites do not offset it with margins. Next to text it is inline and `align-middle`, so it sits on the text's last line however that wraps.

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

Primary-button hover uses `bg-primary/95` (#270). The previous 90% fill
measured 4.39:1 under the hovered registration submit button in a light-theme
error-state axe scan. At 95%, opaque foreground contrast measures 4.78:1 on the
light canvas/card and 7.10:1 / 7.13:1 on the dark canvas/card. Muted, accent and
secondary grounds also pass (minimum 4.81:1 light, 7.20:1 dark). Values are
computed by compositing the existing HSL tokens in sRGB, then applying WCAG
relative luminance. Tokens and non-primary variants are unchanged.

One primary per view. Destructive actions require a confirmation step naming what will change.

### Removing things: confirm, or undo

Removals split by what a mistake costs.

| Cost                                          | Treatment                                                                                                    | Where                                                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Costly, irreversible, or felt by someone else | `confirmAction()` dialog naming what changes; focus starts on the safe choice; never a row action in a table | Deactivate, remove a role, cancel an appointment, revoke consent, remove a prescription, leave a group, replace a typed note |
| Cheap and reversible                          | Acts at once; `removeWithUndo()` shows it done, commits after 5 seconds, and offers Undo in the toast        | Cancel a staff invitation (re-invitable), remove a closed one from the list, cancel a queued reminder                        |

`window.confirm` is not used: it cannot mark the dangerous button, reads as the browser rather than the product, and blocks the tab. A pending undoable removal is committed, not dropped, when the page is left.

---

### Responsive and offline (#281)

The route regression derives its inventory from all workspace App Router pages and
starts at 390px before checking 768, 1024, 1280 and 1440. It measures both the document
and `#main-content`, because the shell can conceal page overflow inside its own scroll
area. Dynamic patient and encounter routes use fresh synthetic records. Redirects and
flag-disabled routes are recorded explicitly in PR #308's route findings.

Button enforces a 44px minimum height and width even when a call site asks for a smaller
visible size. Tables scroll inside named, keyboard-focusable regions, including DataTable by default,
chart alternatives, staff activity, appointments, station flow, visual acuity, comparisons
and metrics. Sheet close controls have 44px targets. Sheets retain vertical safe-area
borders and gain horizontal protection; dialogs subtract top/bottom safe insets from the
available height. Sheet entrances/exits use the 200ms token and `--ease-out`; the existing
global reduced-motion override applies. No clinical fields or interaction payloads change.

Missing network data never becomes an empty clinical list. Queues, audit, delivery,
clinical notes, prescriptions, self-reports, staff-role lists, patient-link searches, portal appointment summaries and chat
now distinguish failed/unavailable
reads from genuinely empty results. Mounted offline manual lists show a stale notice.
Today, My Assigned and Stations suppress empty lists without a saved copy while keeping
shift controls and pending-write overlays available. Loaded records remain visible.

The sync center names the local account/clinic scope, waits for the device queue to load
and withholds its success empty state while offline or failed. Held-account and
other-clinic changes remain visible; the header pill says “Review saved changes” rather
than “All synced” when those rows exist. Long record/account/clinic names wrap, including
clinic-switch actions, without removing actions. Storage details keep a 44px disclosure
and flexible columns. Discard/claim confirmations and all outbox ownership rules are
unchanged.

Destructive button hover uses 95% of its token rather than 90%: the latter failed the
white-text contrast threshold. Chat creation controls retain 44px targets. The portal
context is a named section landmark. The browser-only responsive fixture
renders real components against synthetic rows, without a public demo route or real
outbox writes. Main-list regressions cover both a mounted connection drop and an
interrupted first read. #207 still owns cold-start offline authentication; no Keycloak,
grant, token, route-guard, cache-ownership or outbox-ownership change is included here.

Shipped in [PR #308](https://github.com/akomapahealth/nkwapa/pull/308); before and after screenshots and verification are in the pull request.

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
- On a long form, pass `reserveSpace` to `FieldError` — bound to the form's _has been submitted
  once_ flag, never to `true`. Principle 5 forbids moving content under a user mid-entry, and the
  shift that matters here is not the one at submit: that happens once and focus follows it. It is
  the one afterwards, because each field revalidates as it is corrected, so fixing one field
  removes its message and pulls every field below it upwards — including the one the user was
  reaching for. Reserving unconditionally is the opposite mistake: a blank line under every field
  of every form, which on the hypertension interview is roughly a screen and a half of dead space
  before any error exists. Gating on submitted-once costs nothing until the first failed submit,
  then holds the layout still for the whole correction pass. One line is reserved; a message that
  wraps to two still shifts.
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

## 11. Refresh and optimistic updates

The contract for what happens between asking for data again and getting it. #23 exists because
this was implemented four different ways.

### Refreshing must not take the page away

`useAsyncResource` keeps the last successful result across a refetch and across a _failed_
refetch. `ResourceState` renders that: the content stays, with a stale banner above it if the
refresh failed. Nothing may clear a screen someone is reading because a request is in flight.

**Blanking is correct in exactly one case: when the subject changes.** Refreshing today's board is
a refresh; switching to another date is a different question, and showing yesterday's patients
under today's heading would be worse than a skeleton. The Today board draws that line correctly —
its explicit refreshes preserve, and a date change re-skeletons.

### Indicating a refresh

- One indicator, in `ResourceState`: a 2px bar, **absolutely positioned** so it is out of flow and
  cannot move the content beneath it. It holds still under `prefers-reduced-motion`.
- A control that triggers a refresh **keeps its label**. Swapping "Refresh" for "Refreshing" grew
  the dashboard button by 19px, measured, and moved everything beside it in the header. Spin the
  icon, and put the state in an `aria-live` `sr-only` span.
- The same applies to "Apply filters" and "Load more". "Loading…" also breaks section 9's rule that
  a control names its action.

`e2e/stale-refresh.spec.js` holds all three.

### Optimistic updates

An optimistic update shows a result before the server has confirmed it, and must roll back visibly
if the server disagrees.

**Where it is used:** chat message send, which carries `deliveryState: 'pending' | 'failed'` and
reconciles against the delivered message.

**Where it must never be used**, per #23: patient merge, consent, encounter finalization, role
changes, and research export approval. Anything where a wrongly-shown success could be acted on
clinically, or where rollback would leave the reader unsure what is true, is not a candidate.

**Why there is not more of it.** The surfaces that would benefit are the ones with a rendered state
a mutation flips, and in this product those are almost exactly the forbidden list. The reversible
ones — patient check-in, shift check-in and check-out — render no list state to flip: their result
is a notice, not a row that changes. Adding optimism there would mean inventing UI to be optimistic
about. That is a finding, not an omission; revisit it if a surface gains a status a mutation
toggles.

---

## 12. Nkwapa 2.0 direction: Ruled Chart

**Approved 2026-11-01** for epic [#229](https://github.com/akomapahealth/nkwapa/issues/229) ([#262](https://github.com/akomapahealth/nkwapa/issues/262)). It was chosen over two other directions (a station "folder" metaphor and a margin-review layout) because it puts what needs each role first using data the API already returns, suits laptop stations and dense ruled tables, extends the existing component contract rather than replacing it, and works as well on admin and analytics screens as on clinical ones. These rules sit on top of sections 1 to 11; token values do not change because of them.

Every screen reads like a well-kept observation chart: ruled, time-ordered, numbers first. Chrome drops to hairlines so readings, waits and decisions carry the hierarchy.

- **Surfaces.** Group with a 2px ink top rule and 1px `--border` hairlines between rows, on the canvas. Cards only for things that float: dialogs, sheets, popovers, toasts. No cards inside cards.
- **Order.** Each staff page leads with "Needs you now": ruled action rows, each with a status icon, a plain sentence, a detail line and one action. Trends come after.
- **Figures.** The number is set first and large (tabular figures), its label second and quiet. Units always shown.
- **Accent.** Teal only on what can be pressed or what is selected. Status keeps its own tokens (success, warning, destructive, info) and always carries a text label, never colour alone.
- **Time as length.** Waits and durations on the station line are bars whose length is minutes since `queuedAt`, on a labelled scale. Past 20 minutes a bar takes the warning tokens and the row says it in words.
- **Corrections stay visible.** A corrected or cancelled value is struck through next to its replacement, with who and when. Nothing silently disappears.
- **Charts.** Straight segments between real readings (no monotone or spline smoothing), direct labels instead of legends where possible, a table toggle on every chart. Section 3's palette check still applies.
- **Labels.** System values (`IN_REVIEW`, `DRAFT`, `UNKNOWN`) never reach the UI; map them to plain language in one shared place.
- **Shell.** A labelled 232px sidebar on the canvas, collapsing to 64px icons with tooltips. The header holds the clinic switcher with the active role as text, sync state with the only refresh, the Message delivery icon and the account menu.
- **Type.** Source Serif 4 for page titles and a patient's name; IBM Plex Sans for everything else.
- **Motion.** Focusing or hovering a row in a dense list may dim its siblings (150 ms opacity, off under reduced motion). Owner-approved chart animation follows section 3; other motion follows section 7.

### Public navigation and supporting pages (#279)

Public navigation inherits the workspace's Ruled Chart vocabulary: the real Nkwapa
mark, Source Serif display type, `type-page-title` / `type-section-title`, 2px ink
top rules (`border-t-2 border-rule-strong`) and decorative hairlines (`border-rule`).
The footer groups product links, legal links and contact details separately, with
the existing status trigger and optional release version below the hairline.
`LandingHeader` and `LandingFooter` retain their exports, props and section-link
behavior for #278. No shared token, primitive, Tailwind or dependency change.

- Legal pages keep every word and section ID. A 68ch reading column, sticky desktop
  contents with a current-location marker, plain legal-page tabs and static body
  text replace the tinted title band, pills and decorative reading-progress line.
- The Radix mobile menu retains focus trapping, Escape and focus restoration.
  Navigation targets and the close button are at least 44px. Motion stays in short
  interaction feedback and honors the existing reduced-motion override.
- Cookie settings still dispatches the same consent event to the same dialog.
  Defaults, storage keys, consent version and analytics gating are unchanged. The entry
  button restores focus when that existing dialog closes, including Escape.
- `/status`, `/research` and all three `/volunteers*` pages remain in `(workspace)`.
  **All five require sign-in through `KeycloakProvider`**, including `/status`, whose
  local signed-out message is unreachable under that wrapper. Research and volunteer
  guards and permissions are unchanged. The footer does not expose a new sign-in CTA.
- Status details become a ruled list without a nested main landmark. Research keeps
  #275's sections and readiness model; residual destination/artifact boxes become
  hairline groups and copy/link targets grow. Volunteer screens use ruled site and
  roster sections, accessible action groups, scrollable dialogs and larger checkbox
  targets. A screening-day title is now a working mobile link to the existing route.

References studied: [Footer Design](https://www.footer.design/) for grouped footer
wayfinding, [60fps](https://60fps.design/) for restrained interaction feedback, and
[Heidi Health](https://www.heidihealth.com/en-us) for clinical editorial pacing. These
are qualitative design references; no copy, layout, branding or measured values were
imported. Impeccable and Taste review used the existing Nkwapa identity as authority.

Shipped in [PR #305](https://github.com/akomapahealth/nkwapa/pull/305), which holds the access mapping and verification.

---

### Sign-in entry

- **The landing header has a quiet "Log in"** (outline button) beside "Contact the team", tagged
  "Invite only" from `md` up and named that way to screen readers below it. Under 360px it moves
  into the menu, with the line "For people invited by their clinic. There is no sign-up."
  Nothing public offers sign-up: Keycloak keeps `registrationAllowed: false`.
- **`/login` asks "I am signing in as": Patient or Clinic staff.** A native radio group styled
  as a segmented control; the filled indicator slides (200 ms, `ease-out-strong`). The choice
  tailors the help and the last step only. **The account's roles still decide where sign-in
  lands**, so a wrong pick costs nothing. `?as=patient|staff` selects it from a link; otherwise
  the device remembers the last choice; otherwise Patient.
- **Entrance:** blocks rise 8 px and fade in (`animate-rise-in`, 200 ms) 40 ms apart; changed
  guidance cross-fades with `animate-page-in`. The global reduced-motion rule flattens both.
- **Photograph:** Akomapa-19 (a volunteer taking a patient's blood pressure, no faces) heads the
  help column, after the steps on phones so sign-in stays first. It opens from a smaller rounded
  frame (`animate-photo-reveal`, clip-path, 700 ms) while the picture settles from 1.1 scale
  (`animate-photo-settle`, 1.4 s). Plain CSS, so it plays on first paint with no script; it is
  the one entrance on this page longer than section 7's 200 ms, allowed because it is a
  public page, not a clinical view, and nothing waits on it.

## 13. Library decisions and open items

### #263 library decisions, 2026-11-01

**Owner decision updated 2026-11-01:** chart animation and selective use of
shadcn, Bklit and Kokonut components are allowed where they enhance the product.
Animation alone is not a reason to reject a library. Sileo rejection is approved;
retain Sonner. This supersedes the initial blanket Bklit/Kokonut rejection and
no-chart-animation policy. Each selected component still needs the recorded
compatibility, token, contrast, target-size, data-fidelity and reduced-motion
adaptations before shipping. No wholesale import or framework upgrade is approved.
The #263 PR adds no production dependency or UI library component; actual
adoption belongs to the issue that uses it.

Confirmed production stack: Next 16.3.0-canary.104, **workspace-local React and
React DOM 18.3.1**, Tailwind 3.4.19, Recharts 3.10.1. The root-hoisted React is a
different version; resolving from the web workspace is essential. Experiments
ran in a disposable branch from `release/dev`, using npm 10.9.9.

| Library and version evidence                                                                   | Recommendation                                    | Compatibility, bundle and accessibility evidence                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| shadcn CLI **4.23.0**, existing `new-york` / Radix registry                                    | **Adopt selectively**, with the adaptations below | CLI installation succeeds on React 18 / Tailwind 3 after forcing npm instead of stale pnpm workspace detection. The legacy chart registry requests **Recharts 2.15.4**; keep 3.10.1 and adapt its content types. The combined adapted fixture passes WCAG axe in both themes at 1440/390. Standalone gzip examples: skeleton 8,722 B, tooltip 28,599 B, sidebar 48,573 B, chart 88,095 B; shared dependencies make these non-additive, not production route deltas.                 |
| Bklit `line-chart` registry snapshot, 2026-11-01, SHA-256 in PR #287                           | **Adopt selectively, with adaptations**           | Owner welcomes animated charts. All four adapted axe scans pass. Keep the existing HSL palette rather than the installer's OKLCH replacements, adapt the React 18 ref declaration, use straight clinical segments and JavaScript reduced-motion controls. The 92-file install and D3/Motion overlap are costs to assess for each selected chart, not blanket rejection reasons. Standalone bundle: 82,205 B gzip.                                                                   |
| Kokonut `metric-card` **2.0.0** (source header, 2026-10-17), registry snapshot hash in PR #287 | **Adopt selectively; tested card needs repairs**  | React 18-compatible hooks, no extra package for this candidate. Adapt Tailwind 4 fragments to 3.4 and raw zinc / `dark:` colours to the approved tokens; repair the measured serious contrast failures and targets below 44px. Animation is permitted, but clinical lines must represent actual readings without smoothing/resampling. Extend the shared metric contract rather than adding a parallel system. Standalone bundle: 13,926 B gzip. The raw card is not ready to ship. |
| Sileo **0.1.6**, npm manifest: React / React DOM `>=18`, dependency `motion ^12.34.0`          | **Reject adoption; keep Sonner (owner approved)** | React 18-compatible; four error-toast axe scans pass. Public API lacks `id`-based updates and rendered errors use `aria-live="polite"` instead of the wrapper's assertive-error contract. Standalone bundle: 48,810 B gzip. Rejection is approved; #280 keeps Sonner and focuses on feedback/motion polish unless the owner reopens this decision.                                                                                                                                  |

The bundle experiment used esbuild 0.28.2, browser ESM, production minification,
all exports of each candidate module, React/React DOM external and other
dependencies included. These are measured standalone comparison costs, not an
incremental production-size claim. No experimental package or registry change
is carried into the application's package files.

#### #280 toast library review, 2026-11-04

The owner asked for a fresh look at whether any toast component beats Sonner. Sileo stays
rejected and was not reopened. Bundle figures are esbuild 0.28.2, browser ESM, minified, gzip -9,
React external, each library's public toast surface only; they are standalone costs, not a
production delta. Versions are the npm latest on 2026-11-04.

| Library                    | gzip                  | id update / dismiss  | promise | action              | Errors assertive                                                         | Hotkey to toasts | Swipe | Pause hover / focus / hidden tab | Reduced motion           | Licence, upkeep                             |
| -------------------------- | --------------------- | -------------------- | ------- | ------------------- | ------------------------------------------------------------------------ | ---------------- | ----- | -------------------------------- | ------------------------ | ------------------------------------------- |
| **Sonner 2.0.8** (current) | 9,678 B (CSS in JS)   | yes                  | yes     | action + cancel     | no: one polite region                                                    | Alt+T            | yes   | yes / yes / yes                  | built in                 | MIT, released Aug 2026                      |
| Base UI Toast 1.9.0        | 26,297 B              | yes (`toastManager`) | yes     | yes                 | yes: `priority: 'high'` hides the toast and speaks a `role="alert"` copy | F6               | yes   | yes / yes / yes                  | ours to write (headless) | MIT, released Oct 2026                      |
| Radix Toast 1.3.1 (shadcn) | 12,611 B              | by state only        | no      | yes, with `altText` | yes: `type="foreground"`                                                 | F8               | yes   | yes / yes / no                   | ours to write            | MIT, Oct 2026; shadcn now recommends Sonner |
| react-hot-toast 2.6.1      | 4,761 B               | yes                  | yes     | custom JSX only     | no: `role="status"`, polite                                              | none             | no    | hover only                       | built in                 | MIT, Sep 2026                               |
| react-toastify 11.2.0      | 9,809 B + 2,722 B CSS | yes (`toast.update`) | yes     | custom JSX only     | role per toast, no tone split                                            | none             | drag  | yes / yes / yes                  | partial                  | MIT, Oct 2026                               |
| Ark UI Toast 5.40.0        | 16,266 B              | yes (`toaster`)      | yes     | yes                 | polite region                                                            | Alt+T            | yes   | yes / yes / yes                  | ours to write            | MIT, Oct 2026                               |

**Decision: keep Sonner.** Only Base UI and Radix split errors into an assertive announcement,
and that was the one real gap. Base UI's method is a few lines that sit on top of Sonner, so it
was copied into `components/ui/toast.tsx` rather than swapping libraries: switching would cost
2.7x the bytes, a hand-built stack, enter and exit motion and swipe styling, and a migration of
every call site for no other gain. Radix has no promise toast and shadcn itself now points to
Sonner. react-hot-toast is smaller but has no action button, no swipe and no focus pause.

#### shadcn component decisions

| Candidate                             | Decision and named workflow                                                                   | Required before production adoption                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sidebar`                             | Adopt selectively for #266's collapsible shell                                                | Preserve `app-nav.ts`, role visibility and existing Sheet/Button/Input; map sidebar colours to current HSL tokens, use 232/64px widths, 44px targets and visible focus. Do not accept the CLI's sidebar token replacements.                                                                                                                                |
| `chart`                               | Adopt selectively for #275's existing Recharts analytics                                      | Preserve Recharts 3.10.1; use its `TooltipContentProps` / `LegendPayload` types, handle function-valued `dataKey` safely in React keys, restore visible SVG focus, and require straight lines, labels and a table, with optional owner-approved animation that honours reduced motion. The raw legacy output has ten TypeScript errors against Recharts 3. |
| `breadcrumb`, `skeleton`, `separator` | Adopt selectively for #265's shared foundations where an existing equivalent does not suffice | Breadcrumbs need labelled navigation and 44px link targets. Wrap skeletons in a named status region, rather than putting an ARIA label on a generic div. Separators are structural and should remain decorative unless interactive.                                                                                                                        |
| `tooltip`                             | Adopt selectively for collapsed navigation icons in #266                                      | Keep InfoHint for the help contract it already owns; tooltips name their trigger and work on keyboard focus, with 44px targets.                                                                                                                                                                                                                            |
| `command`                             | Reject adoption for now                                                                       | No approved command-palette workflow requires adding `cmdk`. The embedded command fixture works; that does not establish that its dialog variant meets the app's dialog contract. Existing Combobox remains in use.                                                                                                                                        |
| `toggle-group`                        | Reject adoption for now                                                                       | Existing SegmentedControl covers current needs. The generated default uses smaller targets; a future multi-select workflow needs a named use case and 44px variants.                                                                                                                                                                                       |
| `calendar`                            | Reject this generated variant for now                                                         | CLI resolves react-day-picker 10.0.2 and date-fns 4.4.0. Generated source includes v4-style `shadow-xs`, `has-focus:` and `rtl:**` fragments despite v3 detection, plus 32px cells. Any future picker needs those converted, 44px cells and its own keyboard/form tests. Existing date fields and #224's filter stay intact.                               |

The throwaway fixture's React 18 typecheck and production build pass after the
recorded type adaptations. That proves feasibility, not product adoption. The
fixture also exercises candidates requiring repairs so that their axe results are not
inferred from documentation. Full commands, source hashes, measurements,
screenshots and the distinction between harness corrections and library findings
are in [PR #287](https://github.com/akomapahealth/nkwapa/pull/287).

Primary sources: [shadcn Sidebar](https://ui.shadcn.com/docs/components/radix/sidebar),
[shadcn Chart](https://ui.shadcn.com/docs/components/radix/chart),
[Bklit registry](https://ui.bklit.com/r/line-chart.json),
[Kokonut installation](https://kokonutui.com/docs),
[Kokonut metric registry](https://kokonutui.com/r/metric-card.json),
[Sileo docs](https://sileo.aaryan.design/docs),
[Sileo package manifest](https://registry.npmjs.org/sileo/0.1.6).

### Other open items

- **Wireframes as artwork.** #61 offers "approved wireframes **or** annotated patterns"; sections
  9 and 10 are the annotated patterns, and drawn wireframes were not attempted.
- **More optimistic updates**, if a surface ever gains a status a mutation toggles. Section 11
  records why there is only one today; #280 re-checked and found none.
- **Idempotency keys for online writes.** The offline outbox already sends one and the API
  dedupes it (`SyncMutation`, unique per clinic). Direct online writes through `apiFetch` do not,
  so a retry after a client timeout can apply twice. Tracked in
  [#307](https://github.com/akomapahealth/nkwapa/issues/307); it needs an API change #280 does
  not cover.

---

## 14. Verification

Run after any change to this file or to `globals.css`:

```bash
npm run design:check-charts      # from the repo root
npm run design:check-tokens      # semantic pair contrast, both themes
npm run keycloak:validate-realm  # if the login theme moved

cd apps/web
npm run typecheck
npm run lint
npm run e2e
```

`role-access.spec.js`, `workspace-smoke.spec.js`, and `accessibility.spec.js` are the specs that
catch a visual change silently breaking a role or tenant boundary.
`stale-refresh.spec.js` holds section 11's contract: content survives a refetch, and no refresh
affordance resizes or moves what it sits above.
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
`npm run db:seed:local` will not put them back: it guards on presence, not state, and reports "Sample
appointments already exist; skipping". Reset Postgres, or expect exactly those two to fail on a
second run.
