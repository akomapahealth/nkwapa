# Phase 00 audit: Nkwapa 2.0 baseline

For #261 (epic #229). Captured 2026-11-01 on branch `design/229-phase-00` against seeded E2E data only. Labels: **Confirmed** (measured or read in code), **Strong inference**, **Hypothesis**, **Unknown**.

Companion docs: [ROUTE-INVENTORY.md](ROUTE-INVENTORY.md), [DESIGN-DIRECTION.md](DESIGN-DIRECTION.md), [REDESIGN-ROADMAP.md](REDESIGN-ROADMAP.md). Design tokens and component rules stay in [MASTER.md](MASTER.md); this file does not repeat them.

## 1. How the baseline was captured

- Spec: `apps/web/e2e/design-baseline.spec.js`. It skips unless `DESIGN_BASELINE=1`, writes to `DESIGN_BASELINE_DIR` (default: the OS temp dir), never into the repo.
- Production build (`next build && next start`) with the CI e2e env from `.github/workflows/ci.yml` (feature flags, rate limits, mail).
- 21 role-route pairs × 3 widths (1440, 768, 390) × 2 themes = **126 full-page screenshots**. Axe (WCAG 2 A/AA, 2.1 A/AA, 2.2 AA) at desktop and mobile in both themes = **84 scans**. 26 tests passed in 3.9 minutes.
- Re-run:

```bash
cd apps/web && DESIGN_BASELINE=1 DESIGN_BASELINE_DIR=/tmp/nkwapa-baseline npx playwright test e2e/design-baseline.spec.js --workers=1
```

The screenshots are not committed (23 MB). Re-run the spec to regenerate them; later phases compare against a fresh run on `release/dev`.

## 2. Accessibility baseline (Confirmed)

| Finding                                                    | Where                                                         | Scans   |
| ---------------------------------------------------------- | ------------------------------------------------------------- | ------- |
| `button-name` (critical): a button with no accessible name | volunteer `/patients/new`, light and dark, desktop and mobile | 4 of 84 |
| Horizontal overflow                                        | none at any width                                             | 0 of 84 |

Everything else passed. **Hypothesis:** the unnamed button is a Radix `SelectTrigger` (or an icon-only button) on the registration form with no label association. Fix belongs in #270 or as a standalone bug before it.

Axe does not cover focus order, screen-reader announcements or target size in every case; the manual VoiceOver pass stays in #282.

## 3. Design findings (Confirmed from screenshots unless marked)

1. **Hierarchy.** The staff `/dashboard` is 7,342px tall at 1440px. The volunteer mobile dashboard is 4,687px, and "Your work today" sits below clinical averages and a smoking-status chart.
2. **Raw enums reach the UI.** `IN_REVIEW`, `DRAFT`, `FINALIZED`, `STAGE2`, `UNKNOWN` appear in charts and tables.
3. **Charts invent data.** Monotone splines draw values between days. Several large chart containers render empty.
4. **Header noise.** Up to three gold role badges, a clinic switcher plus a duplicated clinic pill, a sync chip, a header refresh and the page's own Refresh.
5. **Sidebar.** One 21-item list per role, Notifications and Clinic settings mixed into Oversight. Collapsed mode puts each icon in a white tile and swaps the logo for a different mark. The mint background stops short of the page on long routes (`/queues`).
6. **Queues.** The same counts appear three times (metric row, tabs, "Active lane" box). BP and DM Flag columns are empty in seed data.
7. **Portal.** Cards within cards, four label boxes, two CTAs for the same intent ("Request an appointment", "Request a visit").
8. **`/today`.** Station cards leave large empty areas at desktop width.

## 4. Role-task matrix

| Role              | Device (on a screening day)                                 | First thing they need                             | Main routes                                                    |
| ----------------- | ----------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------- |
| Volunteer / nurse | Shared clinic laptop (confirmed 2026-11-01), phone fallback | Next patient at my station, my unsent work        | `/stations`, `/my/assigned`, `/patients/new`, `/dashboard`     |
| Doctor            | Laptop                                                      | Visits awaiting review and cosign                 | `/queues`, `/encounters/[id]`, `/dashboard`                    |
| Manager           | Laptop                                                      | Who waits too long, which station is unstaffed    | `/today`, `/stations/setup`, `/queues`, `/appointments`        |
| Director          | Laptop                                                      | Clinic coverage, follow-up, documentation quality | `/dashboard`, `/metrics`, `/audit`, `/staff-activity`, exports |
| System Admin      | Laptop                                                      | Cross-clinic health, users, duplicates            | `/admin/*`, `/reports/organization`                            |
| Patient           | Phone                                                       | Next appointment, own readings                    | `/portal/*`                                                    |

One person can hold several roles; the shell shows the active one only.

## 5. Component inventory (Confirmed)

- `components/ui` (shadcn new-york on Radix): avatar, badge, button, card, checkbox, combobox, confirm-dialog, data-table, dialog, dropdown-menu, field, info-hint, input, label, progressive-help, select, sheet, tabs, textarea, toast.
- `components/app-shell`: AppPageHeader, AppMetricCard, AppMetricGroup, FormSectionCard, AppNavList, SegmentedControl, ActiveFilterSummary, NavigationProgress.
- Dashboards: `components/dashboard/*` (one component per role plus TrendChart, DashboardChartCard, DashboardKpiCard).
- Shells: `Sidebar.tsx`, `Header.tsx`, `AppLayout.tsx`, `PortalLayout.tsx`.
- **Not installed yet:** shadcn sidebar, chart, breadcrumb, command, skeleton, tooltip, toggle-group, calendar, separator, navigation-menu.

## 6. Technical compatibility (Phase 00 open item, #263)

Confirmed installed: next 16.3.0-canary.104, react 18.3.1, tailwindcss 3.4.19, recharts 3.10.1, framer-motion 12.43.0, sonner 2.0.8, @tanstack/react-table 9.2.6, lucide-react 0.575.0, gsap and @gsap/react, @axe-core/playwright, Playwright 1.60.

| Library                                      | Status                                                       | Next step                                         |
| -------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| shadcn `sidebar`, `chart` and the rest above | **Unknown** on Tailwind 3.4 with the current CLI             | Spike in #263; the CLI may emit v4 syntax         |
| Bklit UI, Kokonut UI                         | **Unknown**; several registries target Tailwind 4 / React 19 | Spike in #263, adopt per named workflow only      |
| Sileo                                        | **Unknown**                                                  | Evaluate in #280 against the `showToast` contract |
| Fonts                                        | **Confirmed** render-blocking `@import` in `globals.css`     | Move to `next/font` in #263 or #264               |

No dependency was added in Phase 00.

## 7. QA matrix gap (Confirmed)

`apps/web/playwright/roles.js` defines staff (System Admin plus all clinic roles), doctor, volunteer, patient and claimant. **There is no Manager-only or Director-only identity**, so those dashboards and nav sets cannot be captured on their own. Adding them changes the seed, outside the epic's guardrail; the owner approved it on 2026-11-01.

## 8. Privacy

All screenshots and the concept prototypes use seeded or synthetic patients. Production screenshots shared during review (including the patient registry) are not reused anywhere.
