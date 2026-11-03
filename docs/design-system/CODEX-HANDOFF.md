# Nkwapa 2.0: implementation handoff

Instructions for the agent continuing epic #229 from Phase 01. Work one phase at a time, one GitHub issue per PR. Phase 00 is complete and its decisions are final.

## 1. Read first, in this order

1. `apps/web/AGENTS.md`: this Next.js (16.3 canary) has breaking changes. Read the matching guide in `apps/web/node_modules/next/dist/docs/` before writing any Next code.
2. `docs/design-system/NKWAPA-2-REDESIGN-MASTER.md`: the full spec. Phases 01 to 09 and the PR contract (section 45) are binding.
3. `docs/design-system/MASTER.md`: tokens, component contract, clinical form contract. **Section 12 is the approved direction (A, Ruled Chart).** Where MASTER.md and an issue disagree, MASTER.md wins.
4. `docs/design-system/DESIGN-DIRECTION.md`: owner decisions and the rejected directions (do not reintroduce B or C ideas, except where section 12 already took them).
5. `docs/design-system/PHASE-00-AUDIT.md`, `ROUTE-INVENTORY.md`: findings and the route-to-issue map.
6. `docs/design-system/concepts/nkwapa-2-directions.src.html`: the static prototype of direction A (section `id="a"`). Use it as the visual reference for the shell, "Needs you now", the station line and ruled metric groups. It is reference HTML, not code to copy.
7. GitHub epic #229 (dependency map, checklist) and the sub-issue you are working on.

## 2. Owner decisions already made (do not ask again)

- Direction **A, Ruled Chart**. Rules in MASTER.md section 12.
- Message delivery is a header icon (lucide `Send`, `aria-label="Message delivery"`, tooltip, **no badge**), shown only with `REMINDER.READ`. Clinic settings is a profile-menu item, only with `RESEARCH.SETTINGS.UPDATE`. Mirror both in the mobile sheet.
- Station devices are mostly shared laptops (design for 1024 to 1440 first, 390 must still work).
- English only.
- **Owner update, 2026-11-01:** chart animation is allowed. shadcn, Bklit and Kokonut may be adopted selectively where they improve the UI, after compatibility/accessibility repairs. Sileo rejection is approved; keep Sonner.
- Single-role `manager` and `director` E2E identities exist (PR #285).

## 3. Guardrails (every PR)

- No change to API responses, permissions, RLS, route guards (`RouteGuard`), feature flags, clinical fields, units, validation, defaults or save semantics. Presentation only.
- Nav visibility per role must stay identical apart from the two moves above. `apps/web/lib/app-nav.ts` stays the single source; add a `placement` field rather than a second list.
- No new dependency without a recorded adopt decision in MASTER.md (from #263). No Tailwind 4, React 19 or Next upgrade.
- No `dark:` utilities; theme through the HSL tokens in `globals.css`. Re-measure contrast for any token you change and keep the comments in `globals.css` accurate.
- No pie charts or smoothed clinical lines. Chart animation is allowed under MASTER.md section 3: honour reduced motion in JavaScript, keep values/table access immediate, and avoid invented intermediate readings. `scripts/check-chart-palette.mjs` must pass.
- 44px targets, visible focus, `prefers-reduced-motion` respected, status never carried by colour alone.
- Seeded or synthetic data only in screenshots. Never use production patient data anywhere.
- No em dashes in UI copy.

## 4. Git and PR rules

- Branch every issue from **`release/dev`**: `feat/<issue>-<slug>` (for example `feat/264-tokens-typography`). Never branch from another feature branch, never target a feature branch with a PR: stacked PRs here have orphaned code before (#152 to #155).
- One issue per PR. Merge foundations before starting anything that depends on them (see the dependency map in #229).
- PR body follows spec section 45: summary, linked issue, scope, screenshots (light and dark, 1440 and 390), design changes, accessibility results, responsive testing, automated tests, risks, known limitations, docs updated, rollback.
- After each merge, update the #229 checklist, tick the issue, and add a dated line to the log in `REDESIGN-ROADMAP.md`.

## 5. Local environment (things that will waste your time)

- Stack: `docker ps` should show `nkwapa-postgres`, `nkwapa-keycloak`, `nkwapa-redis`, `nkwapa-mailpit`.
- **E2E needs the CI env.** Export the `env:` block of the E2E job in `.github/workflows/ci.yml` (all `FEATURE_*` and `NEXT_PUBLIC_FEATURE_*`, `RATE_LIMIT_*=100000`, Mailpit/email vars), then rebuild the web app. `NEXT_PUBLIC_*` flags are inlined at build time. Without this, about 12 unrelated specs fail.
- Run Playwright with **one worker**, one build, one invocation. Cap Jest at `--maxWorkers=2`; an uncapped full run has frozen the machine.
- Before a UI string change, `grep -rn "<old string>" apps/web/e2e` and update the specs in the same PR.
- A full local E2E run can have an intermittent failure; investigate the exact assertion and rerun that file alone before attributing it to a change. The `#197` station offline-copy tests now wait for the workspace read to reach IndexedDB before navigating away, so include them in the ON station run. The old heading-only wait aborted an in-flight read.
- Patient-claim and appointment-triage specs now create fresh synthetic invitations and requests through the real app flows on each run. Repeated full runs do not require a database reset for these cases. Other appointment tests still rely on seeded schedule and terminal-state fixtures, so inspect any failure before considering a reset.
- Accumulated synthetic records can change list pagination and duplicate display names. Clinic and volunteer creation specs reload and page to the exact saved record; the staff-chat socket test chooses one matching recipient while retaining its server round-trip assertion. The portal clinic-note contrast case creates a rejected request so the tinted note exists on a fresh CI database.
- The PWA offline test passed alone but failed in complete runs when its synthetic write opened `NkwapaDb` before Dexie created the `outbox` store. The E2E helper waits for schema version 14 or newer, starts the write synchronously, and polls for completion from Node. Keep the offline queued-count and launch assertions. Responsive checks poll the unchanged `<=1px` overflow bound after viewport changes so layout can settle; persistent overflow still fails.
- Other-clinic discard is disabled while sync runs; its keyboard E2E waits for enablement before pressing Enter. Portal axe sweeps wait for the 150ms workspace opacity entrance to finish before measuring settled text. Normal-motion screenshots and selection scans are kept separately. The brief low-contrast entrance is a known motion limitation for #280, not a token change in this reliability PR.
- Merge-preview E2E searches the freshly created duplicate by chart code. Registry search matches one field at a time, so a combined first-and-last-name query can return zero results as the synthetic database grows.
- Offline-prescribing E2E waits for the app's local-save notice before reconnecting. The notice follows the IndexedDB outbox write; checking drain immediately after clicking can falsely see an empty queue before a prescription is queued.
- **Any full reseed** (including dropping Postgres) can desync Keycloak subjects from the `E2E_*_SUB` / `SEED_*_SUB` values in `.env`; symptom is "No clinic selected" on every staff route. Read real ids from Keycloak (`npm run e2e:keycloak-user` prints them) and fix `.env` before reseeding.
- Seed flags need the string `true` (`SEED_SAMPLE_IDENTITY=true`, not `1`).
- Prisma 7 refuses `migrate reset` from an agent without the `PRISMA_USER_CONSENT` variable; ask the owner rather than setting it yourself.
- The lockfile must stay npm 10 compatible; do not run `npm install` with npm 11.
- `git push` runs the full suite in a pre-push hook. Run `npm run security:scan`, lint, typecheck and the affected tests yourself, then `git push --no-verify`. CI also runs `npx prettier --check .` on the whole repo, including HTML, which lint-staged does not format.
- Never print `.env` values or put credentials on a command line.

## 6. Baseline and comparison

`apps/web/e2e/design-baseline.spec.js` captures full-page screenshots and axe per role, route, width (1440, 768, 390) and theme. It skips unless enabled:

```bash
cd apps/web && DESIGN_BASELINE=1 DESIGN_BASELINE_DIR=/tmp/nkwapa-baseline npx playwright test e2e/design-baseline.spec.js --workers=1
```

Run it on `release/dev` before a phase and on your branch after, and attach the relevant before/after pairs to the PR. Add `manager` and `director` entries to its `PLAN` in your first PR that needs them (manager: `/dashboard`, `/today`, `/queues`; director: `/dashboard`, `/metrics`, `/audit`).

## 7. Phase by phase

Each phase: read its spec section (`### PHASE 0N` in the redesign master), the issue body, then build. Exit criteria below are the minimum; the issue's acceptance list also applies.

### Before Phase 01: one small fix

- Fix the critical axe `button-name` finding on `/patients/new` (an unnamed button, likely a Radix `SelectTrigger` or icon button without a label). Own small PR referencing #261. Exit: baseline axe shows zero critical findings.

### Phase 01: Foundations (#263, then #264, then #265)

- **#263 feasibility.** On a throwaway branch, try `npx shadcn@latest add sidebar chart breadcrumb command skeleton tooltip toggle-group calendar separator` against Tailwind 3.4 / React 18.3. Note whether the CLI emits Tailwind 4 syntax and what had to change. Check Bklit UI, Kokonut UI and Sileo for the same stack. Record adopt / adopt selectively / reject per library in MASTER.md (section 13 "Still open" or a new subsection), with version, bundle note and axe result. Move the fonts from the render-blocking `@import` to `next/font` (Source Serif 4, IBM Plex Sans). The PR into `release/dev` contains only the decisions doc and the font change, plus any shadcn components marked adopt.
- **#264 tokens and typography.** Add semantic tokens the direction needs (rule colours, status surfaces, chart series confirmation), light and dark, each pair measured. Define the type scale (serif titles, Plex for everything else, tabular figures for data). Exit: contrast table in MASTER.md updated, palette check passes.
- **#265 components.** Extend, do not replace: AppPageHeader, AppMetricGroup (ruled ledger style), DataTable, ResourceState (five states), InfoHint. Add a shared status label that maps raw enums (`IN_REVIEW`, `DRAFT`, `FINALIZED`, `STAGE2`, `UNKNOWN`) to plain language in one place, and a "Needs you now" action-row component. Exit: unit tests or a demo route, axe clean, no raw enum strings left in the UI (grep for them).

### Phase 02: Shell (#266, then #267)

- **#266.** Labelled 232px sidebar on the canvas, collapsing to 64px icons with tooltips, keyboard collapse, `aria-current="page"`, background spans long pages. Header: clinic switcher with the single active role as text (replace the gold role badges), one sync state carrying the only refresh. Exit: e2e asserts the nav item set per role (staff, doctor, volunteer, manager, director) equals the pre-change set.
- **#267.** The two moves from section 2, through a `placement: 'sidebar' | 'header' | 'profile'` field in `app-nav.ts`. Exit: e2e covers both placements on desktop and mobile per permission.

### Phase 03: Dashboards (#268, #269, can run in parallel after #266)

- Each dashboard leads with "Needs you now", then today's counts, then trends. Use only fields already in `DashboardData` (`apps/web/app/(workspace)/dashboard/page.tsx`).
- **#268** volunteer (next patient and own work in the first screen on mobile) and doctor (awaiting review, pending cosigns).
- **#269** manager (station line: lanes with bar length = minutes since `queuedAt`, warning plus a text label past 20 minutes, unstaffed stations labelled, from the station line data), director, system admin. Target: staff dashboard height far below the 7,342px baseline.
- Exit: API responses unchanged; charts use straight segments and have a table toggle.

### Phase 04: Clinical workflows (#270 to #273, parallel after #265)

- Patients (#270, keep the #224 registry date filter), stations and screenings (#271, keep offline outbox and held states), queues and encounters (#272, one set of counts, corrections struck through with who and when), appointments (#273, Africa/Accra times).
- Exit: form fields, validation and save behaviour unchanged; error summary on submit with `aria-invalid` / `aria-describedby`; all existing clinical e2e specs pass with the CI env.

### Phase 05: Administration and analytics (#274, #275)

- #274: admin users, clinics, duplicates, data requests, audit, message delivery ledger, clinic settings. Irreversible actions (merge, delete, consent) look different from routine ones.
- #275: metrics, staff activity, organization report, research exports on the adopted chart foundation; every chart gets a data-table alternative.

### Phase 06: Portal and auth (#276, #277)

- #276: portal on phones, remove cards within cards and the duplicate "Request an appointment" / "Request a visit" intent.
- #277: login, accept invite, claim record, welcome tour; mirror tokens into the Keycloak login theme (`login-theme.spec.js` guards it). No auth flow change.

### Phase 07: Marketing (#278, #279)

- Landing hero per direction A (serif headline, a synthetic patient's record as the visual, real Akomapa photos from `apps/web/public/`). No invented testimonials, counts or outcomes. Record Lighthouse before and after.

### Phase 08: Motion and responsive (#280, #281)

- #280: retain Sonner under the owner-approved #263 Sileo rejection. Polish feedback and motion through the existing `showToast` contract; callers must not change. Re-evaluate Sileo only if the owner reopens that decision.
- #281: pass at 390, 768, 1024, 1280, 1440 and offline states; coordinate with #207.

### Phase 09: QA and release (#282, #283)

- Full baseline re-run versus Phase 00, role-based e2e, axe zero serious or critical in both themes, VoiceOver pass on shell, a table and a form per role. Release and rollback notes; MASTER.md reflects what shipped.

## 8. Stop and ask the owner when

- A change would alter an API response, permission, flag, clinical field or data.
- An adoption falls outside the owner-approved selective shadcn/Bklit/Kokonut scope, requires a framework upgrade, or revisits the approved Sileo rejection.
- A phase's design needs something MASTER.md section 12 does not cover.
- Any production database or deployment action.
