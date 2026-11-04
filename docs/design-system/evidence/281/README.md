# #281: responsive and offline refinements evidence

Generated screenshots, raw axe JSON, route measurements and search dumps were removed from
the current tree at the owner's request. The findings, audit and reproduction scripts remain.
[Original captures and raw results](https://github.com/akomapahealth/nkwapa/tree/e07d818cb263f940d1e4e5180eac1205fa21ecb1/docs/design-system/evidence/281)
are retained in the implementation commit; counts below describe that completed audit.

Captured 2026-11-04 from production builds (`next build` with the `ci.yml` web environment)
served by `next start -p 3100`. Before: unchanged `release/dev` at `deb5f80`. After: this
branch. The original workspace and its local edits were left alone; work used an isolated
worktree. Shared ports 3000/4000 were never occupied or stopped. The existing Keycloak client
only allows the localhost:3000 origin: a browser-only local proxy on 3101 forwarded that
origin to the production build on 3100, without changing Keycloak or app authentication.
The owned API used 4100 with the existing database. No reset, seed or migration ran.

Screenshots contain fresh synthetic patient/encounter fixtures, the seeded E2E patient portal,
or browser-only synthetic component fixtures. The demo clinic also contains mixed records,
so broad live registry/queue screenshots were deliberately excluded from committed evidence.
The route audit measures those real screens without saving their patient content in this folder.

## What changed

| Area                   | Before                                                                                                                                                      | After                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Sync center            | Empty queue implied “Everything is synced” while offline or after a failure                                                                                 | Honest local account/clinic scope; offline/loading/failure never gets success empty state    |
| Held work in header    | “All synced” could coexist with another account/clinic's rows                                                                                               | “Review saved changes”, with a quiet marker; ownership and sends unchanged                   |
| Long sync names        | Account/clinic names and the switch button escaped narrow cards                                                                                             | Flexible wrapping, including the action label; all controls retained                         |
| Device storage         | Small disclosure and intrinsic first column                                                                                                                 | 44px disclosure and two flexible columns                                                     |
| Button targets         | Caller height overrides could reduce targets below 44px                                                                                                     | Shared minimum height/width stay 44px, with a smaller-size regression probe                  |
| Sheet                  | 16px close target; 500ms entry                                                                                                                              | 44px close, 200ms token entry/exit, horizontal safe insets; vertical safe borders retained   |
| Dialog                 | Height ignored device safe insets                                                                                                                           | Available height subtracts top/bottom insets; actions remain scrollable                      |
| Tables                 | Several unnamed/non-focusable horizontal containers                                                                                                         | Named regions with visible keyboard focus; DataTable opts into keyboard scrolling by default |
| Offline/manual lists   | Appointments, audit, delivery and other manual readers could look live after a drop                                                                         | Shared stale notice while retaining the last successful result                               |
| Failed/uncached reads  | Queues, audit, delivery, notes, prescriptions, self-reports, staff roles, patient-link search, portal appointment summary and chat could show false empties | Offline/error/read-success guards; prescription read uses ResourceState                      |
| Ops without saved copy | Missing data defaulted to empty lists                                                                                                                       | No false empty state; shift controls and pending-write overlays stay mounted                 |
| Portal landmark        | Portal title/clinic context outside a landmark                                                                                                              | Named section, preserving layout and navigation                                              |

The render-boundary audit is in [empty-state-audit.md](empty-state-audit.md). The original
search dumps are available with the archived captures linked above.

## Capture plan

Both themes at **390, 768, 1024, 1280 and 1440**, for each of these before and after:

- Registration, fresh synthetic patient chart and encounter workspace, seeded portal health.
- Synthetic DataTable with a locally scrolling wide table, a real measurement chart and
  ResourceState offline branch.
- Real SyncCenterSheet in offline, failed, loading, populated and online-empty states.
- Populated sheet scrolled to held/other-clinic work and expanded device storage.
- Real discard confirmation; capture closes with “Keep it”, never confirms a discard.

`capture.cjs` reproduces route captures. `e2e/responsive-components.spec.js` reproduces the
component captures with `RESPONSIVE_EVIDENCE_DIR`; its optional `RESPONSIVE_BASELINE_WEB`
points at tracked baseline web source materialized outside the worktree. This fixture aliases
only its sync context and device database, so it cannot mutate the real browser outbox.
No public fixture route, production dependency, runtime flag or auth bypass is added.

### Reproduce captures

Build `@nkwapa/db` first, then web with the `ci.yml` web environment. Start the owned API on
4100 and `next start -p 3100`; use existing seeded identities, without seeding/migrating the
shared database. If the Keycloak client only allows localhost:3000, run
`node docs/design-system/evidence/281/local-proxy.cjs` in a separate terminal. It binds only
loopback 3101 and forwards browser traffic for localhost:3000 to the 3100 build.

From the repository root, export `NEXT_PUBLIC_API_BASE_URL=http://localhost:4100`,
`PLAYWRIGHT_BASE_URL=http://localhost:3000`, `LOCAL_BROWSER_PROXY=http://127.0.0.1:3101`
and `CI=1`. Authenticate using the evidence-only config, which starts no servers:

```sh
npx playwright test --config docs/design-system/evidence/281/playwright.config.cjs --project setup
```

Set `RESPONSIVE_EVIDENCE_DIR` to an absolute `before` or `after` evidence directory, then run
`responsive-components.spec.js` with that config. For route captures, set
`CAPTURE_BASE_URL=http://localhost:3000` and run `node docs/design-system/evidence/281/capture.cjs after`.
Before captures require the baseline build and, for components, `RESPONSIVE_BASELINE_WEB`
pointing at baseline web source. Stop only your own server before rebuilding. The station
variant must be a separate build, with both station flags true as in CI. Final station
measurements for all 51 routes are also in [archived station-route-measures](https://github.com/akomapahealth/nkwapa/tree/e07d818cb263f940d1e4e5180eac1205fa21ecb1/docs/design-system/evidence/281/after/station-route-measures).

## Responsive findings

The route-by-width table below is generated from the route audit. The baseline already
fit page/main boundaries on all 51 routes; defects included internal sync-card overflow
and network states presented as empty results. “Fits” means document,
body and `#main-content` each satisfy `scrollWidth <= clientWidth`, after data/state resolution.
Redirect destinations and flag-disabled/unavailable surfaces are identified rather than
counted as coverage of content that did not render. Structural evidence covers mobile
navigation, form stacking, clinical progress/tabs/actions, chart/table alternatives and
scrollable sync/discard dialogs, beyond just resizing the viewport.

| Route                                              | 390  | 768  | 1024 | 1280 | 1440 | Finding                                                                        |
| -------------------------------------------------- | ---- | ---- | ---- | ---- | ---- | ------------------------------------------------------------------------------ |
| `/accept-invite`                                   | Fits | Fits | Fits | Fits | Fits | Existing signed-in redirect to dashboard; auth behavior unchanged              |
| `/account`                                         | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/account/name`                                    | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/admin/clinics`                                   | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/admin/data-requests`                             | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/admin/duplicates`                                | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/admin/duplicates/cross-clinic`                   | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/admin/users`                                     | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/appointments`                                    | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/audit`                                           | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/claim-record`                                    | Fits | Fits | Fits | Fits | Fits | Existing signed-in redirect to dashboard; auth behavior unchanged              |
| `/clinics/[clinicId]/encounters`                   | Fits | Fits | Fits | Fits | Fits | Fresh synthetic route fixture                                                  |
| `/clinics/[clinicId]/encounters/[encounterId]`     | Fits | Fits | Fits | Fits | Fits | Fresh synthetic route fixture                                                  |
| `/clinics/[clinicId]/patients`                     | Fits | Fits | Fits | Fits | Fits | Fresh synthetic route fixture                                                  |
| `/clinics/[clinicId]/patients/[patientId]`         | Fits | Fits | Fits | Fits | Fits | Fresh synthetic route fixture                                                  |
| `/clinics/[clinicId]/patients/[patientId]/consent` | Fits | Fits | Fits | Fits | Fits | Fresh synthetic route fixture                                                  |
| `/clinics/[clinicId]/patients/[patientId]/edit`    | Fits | Fits | Fits | Fits | Fits | Fresh synthetic route fixture                                                  |
| `/clinics/[clinicId]/patients/new`                 | Fits | Fits | Fits | Fits | Fits | Fresh synthetic route fixture                                                  |
| `/clinics/[clinicId]/research/exports`             | Fits | Fits | Fits | Fits | Fits | Fresh synthetic route fixture                                                  |
| `/dashboard`                                       | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/encounters/[encounterId]`                        | Fits | Fits | Fits | Fits | Fits | Existing canonical clinic redirect; fresh synthetic record                     |
| `/login`                                           | Fits | Fits | Fits | Fits | Fits | Existing signed-in redirect to dashboard; auth behavior unchanged              |
| `/metrics`                                         | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/my/assigned`                                     | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/notifications`                                   | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/patients`                                        | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/patients/[patientId]`                            | Fits | Fits | Fits | Fits | Fits | Existing canonical clinic redirect; fresh synthetic record                     |
| `/patients/[patientId]/consent`                    | Fits | Fits | Fits | Fits | Fits | Existing canonical clinic redirect; fresh synthetic record                     |
| `/patients/[patientId]/encounters/new`             | Fits | Fits | Fits | Fits | Fits | Fresh synthetic route fixture                                                  |
| `/patients/new`                                    | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/portal`                                          | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/portal/appointments`                             | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/portal/appointments/request`                     | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/portal/health`                                   | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/portal/self-reports`                             | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/portal/self-reports/new`                         | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/queues`                                          | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/reminders`                                       | Fits | Fits | Fits | Fits | Fits | Existing redirect to message delivery                                          |
| `/reports/organization`                            | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/research`                                        | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/settings`                                        | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/settings/clinic`                                 | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/staff-activity`                                  | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/stations`                                        | Fits | Fits | Fits | Fits | Fits | Default flag-off state; station-enabled run measures actual content separately |
| `/stations/setup`                                  | Fits | Fits | Fits | Fits | Fits | Default flag-off state; station-enabled run measures actual content separately |
| `/stations/visits/[visitId]`                       | Fits | Fits | Fits | Fits | Fits | Default flag-off state; station-enabled run measures actual content separately |
| `/status`                                          | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/today`                                           | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/volunteers`                                      | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/volunteers/events`                               | Fits | Fits | Fits | Fits | Fits | Content/state rendered                                                         |
| `/volunteers/events/[eventId]`                     | Fits | Fits | Fits | Fits | Fits | Fresh synthetic route fixture                                                  |

## Accessibility and automated checks

- `npm run build --workspace=@nkwapa/db`: passed before the fresh-worktree web build.
- `npm run lint` and `npm run typecheck`: all workspaces passed.
- Web Jest: **946 passed / 82 suites**, with `--maxWorkers=2`.
- Default-flag affected E2E: **133 passed** (role setup, outbox ownership/other clinics,
  sync recovery, prescription/offline replay, portal caching, foundations, reduced motion,
  navigation and chat). Final responsive/hover/dashboard/chat pass: **83 passed**.
- Strengthened failed-list/generic-table and interrupted-first-read checks: **8 passed**.
- Station-enabled final run: 121 checks passed in the broad matrix; the remaining screener scenario passed with the complete **19-test station suite** after making its fixture precondition explicit.
- All E2E runs use `CI=1`, one worker and the existing seeded role identities. Production
  builds use CI feature flags; the station variant is a separate build as in `ci.yml`.
- Before: 120 screenshots / 120 axe scans, with 10 `region` findings. After: 120 screenshots / 120 axe scans, with zero violations. Raw axe violations and incomplete checks are
  retained beside the archived captures; the archived `summary.json` aggregates the rules without treating incomplete
  checks as passes. The before portal `region` finding was a best-practice landmark issue.
- Final primary configuration: **74 passed** in the matrix; all **4 role dashboards passed** on rerun after replacing a polling-sensitive network-idle wait with the loaded-data heading assertion. This verifies every case without treating background polling as a page-ready signal.
- The #227 screener scenario now establishes its own seeded shift precondition, so an interrupted run cannot leave a volunteer name selected for the next run. Historical stops and production code are unchanged by this test setup.
- Formatting, secret scan and `git diff --check`: passed. No dependency/lockfile change.

## #207 coordination and limitations

No authentication, KeycloakProvider, offline grant/token storage, route guard, permission,
feature-flag definition, API response, RLS, clinical field/unit, validation, save semantics,
analytics consent or outbox ownership change. Cold-start offline launch and its screen are
untouched; #207 will replace that separate boundary. These offline tests begin with an
online authenticated session and drop its connection, including while a first data read is
pending. They do not claim cold-start session resume.

Browser emulation does not verify physical device safe-area values or assistive technology
behavior on hardware. Normal browser `env()` values are zero; the CSS paths preserve controls
and scrolling when those values are nonzero. Broad full regression remains #282.

## Rollback

Revert the implementation commit and the separate roadmap commit. No migration, data rewrite,
auth setup, dependency change or queued-work cleanup is required. Existing queued rows survive.
