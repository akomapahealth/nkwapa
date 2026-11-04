# #279: public navigation and supporting pages evidence

Captured 2026-11-04 on the station-OFF CI build (`ci.yml` E2E env, station flags off).
Before: unchanged `release/dev` at `179171e`. After: this branch, rebuilt with the same
environment. One Playwright worker throughout; Jest capped at two workers.

Presentation only. No change to consent defaults, consent keys/version, analytics gating,
API responses, permissions, RLS, guards, flags, fields, validation or save semantics.
No new product dependency. Lighthouse 13.6.0 was installed with npm 10.9.9 in a temporary
tools directory, outside the repository; the lockfile is unchanged.

## The journeys, as mapped

| Route                          | Signed out                           | Authorized view captured                 | Unchanged boundary                                                |
| ------------------------------ | ------------------------------------ | ---------------------------------------- | ----------------------------------------------------------------- |
| `/privacy`                     | Public                               | Reading page                             | Marketing group                                                   |
| `/terms`                       | Public                               | Reading page                             | Marketing group                                                   |
| `/cookies`                     | Public                               | Reading page and existing settings entry | Marketing group                                                   |
| `/status`                      | Redirects to `/login?next=%2Fstatus` | Seeded System Admin                      | Workspace provider; detailed status API remains System Admin only |
| `/research`                    | Redirects to login with `next`       | Seeded staff with research permission    | Workspace provider, `RESEARCH.EXPORT.REQUEST`, clinic             |
| `/volunteers`                  | Redirects to login with `next`       | Seeded manager-capable staff             | Workspace provider, `VOLUNTEER.ROSTER.MANAGE`, clinic             |
| `/volunteers/events`           | Redirects to login with `next`       | Same role                                | Same guard                                                        |
| `/volunteers/events/[eventId]` | Redirects to login with `next`       | Same role, synthetic event               | Same guard                                                        |

The signed-out branch inside the status page was already unreachable under
`KeycloakProvider` / `SyncWithAuth`. No route was moved or made public. The public footer
keeps its existing status dialog, with the sign-in link inside that dialog.

| Surface              | Before                                                                               | After                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Header               | Muted links, small icon targets and small sheet close target                         | Same links/CTA/exports/props, real mark, token inks, 44px controls, ruled menu, focus trapping and Escape retained                    |
| Footer               | Product and contact columns; legal links crowded into the status row                 | Brand statement, distinct product/legal/contact groups, status and copyright below a hairline                                         |
| Legal pages          | Tinted title band, pill tabs, serif section headings and decorative progress line    | Canvas, page/section type roles, 2px ink section rules, 68ch text, sticky desktop contents; every legal word and section ID preserved |
| Status details       | Cards and a nested `main`                                                            | Ruled list in the existing workspace, one main landmark, same fetch and messages                                                      |
| Research exports     | #275 ruled sections plus residual destination/artifact boxes and smaller copy target | #275 layout retained, residual boxes replaced by hairline groups, 44px copy/link targets                                              |
| Volunteer directory  | Legacy groups and small duplicate-record action                                      | Ruled form/table grouping, larger action targets, wrapping phone actions                                                              |
| Screening days       | Phone row without an actionable event link                                           | Existing title links to the existing detail route on phones                                                                           |
| Screening-day detail | Site card, unruled roster heading, small checkbox hit areas                          | Ruled site/roster sections, section type role, larger checkbox labels and scrollable dialogs                                          |

## Screenshots and accessibility

Each of the eight pages is captured at 1440 (full page) and 390 (first screen), light
and dark. Separate full-footer captures and the header's open mobile menu bring each side
to 38 screenshot/axe views. Normal-motion screenshots are used; axe runs after settling.

Only seeded E2E identities authenticate. `fixtures.cjs` intercepts browser GET responses
for the volunteer directory, screening days, detail, research overview, export activity
and schedules. People, events, cohort counts and research runs in these views are
explicit synthetic fixtures. No fixture is written to the database. System-health data
comes from the local status API and contains no patient data. An initial exploratory
research capture using the shared database was replaced by the synthetic capture.

`before/axe.json` and `after/axe.json` retain full violations, not just severity totals.
`before/lighthouse.json` and `after/lighthouse.json` summarize the Lighthouse accessibility
scores; the per-view category, audits, version and gather mode are in each `lighthouse/`
subdirectory. Lighthouse uses snapshot mode on the authenticated, fixture-backed page so
it measures the intended screen rather than a sign-in redirect. These are accessibility
scores; no navigation performance score is claimed.

Axe: 38 scans per side. Before: zero serious/critical findings and 12 moderate
landmark findings on `/status` (three rules repeated across four views). After: **zero
violations at any severity**. Maximum measured horizontal overflow: **0px** before and after.

Lighthouse accessibility snapshot scores, all four width/theme combinations per page:

| Surface        | Before | After |
| -------------- | -----: | ----: |
| privacy        |    100 |   100 |
| terms          |    100 |   100 |
| cookies        |    100 |   100 |
| status         |    100 |   100 |
| research       |    100 |   100 |
| volunteers     |    100 |   100 |
| screening-days |    100 |   100 |
| screening-day  |    100 |   100 |

Document heights (px), light; these measure the page, not just the captured first screen.

| Surface        | 1440 before | 1440 after | 390 before | 390 after |
| -------------- | ----------: | ---------: | ---------: | --------: |
| privacy        |       9,605 |      8,104 |     14,452 |    13,024 |
| terms          |       4,682 |      3,834 |      7,116 |     6,453 |
| cookies        |       4,060 |      3,434 |      6,317 |     5,854 |
| status         |       1,881 |      1,858 |      1,961 |     1,918 |
| research       |       2,270 |      2,254 |      3,647 |     3,648 |
| volunteers     |         960 |        960 |        844 |       844 |
| screening-days |         960 |        960 |        844 |       844 |
| screening-day  |         960 |        960 |        945 |       928 |

The legal pages are shorter at both widths while retaining every word. The title band
and large serif section headings are replaced by the shared reading hierarchy; the
expanded footer contributes its own space. No legal text was removed.

Screenshot pairs:

| Surface        | 1440 light                                                                                        | 1440 dark                                                                                       | 390 light                                                                                       | 390 dark                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| privacy        | [before](before/privacy--1440--light.jpg) / [after](after/privacy--1440--light.jpg)               | [before](before/privacy--1440--dark.jpg) / [after](after/privacy--1440--dark.jpg)               | [before](before/privacy--390--light.jpg) / [after](after/privacy--390--light.jpg)               | [before](before/privacy--390--dark.jpg) / [after](after/privacy--390--dark.jpg)               |
| terms          | [before](before/terms--1440--light.jpg) / [after](after/terms--1440--light.jpg)                   | [before](before/terms--1440--dark.jpg) / [after](after/terms--1440--dark.jpg)                   | [before](before/terms--390--light.jpg) / [after](after/terms--390--light.jpg)                   | [before](before/terms--390--dark.jpg) / [after](after/terms--390--dark.jpg)                   |
| cookies        | [before](before/cookies--1440--light.jpg) / [after](after/cookies--1440--light.jpg)               | [before](before/cookies--1440--dark.jpg) / [after](after/cookies--1440--dark.jpg)               | [before](before/cookies--390--light.jpg) / [after](after/cookies--390--light.jpg)               | [before](before/cookies--390--dark.jpg) / [after](after/cookies--390--dark.jpg)               |
| status         | [before](before/status--1440--light.jpg) / [after](after/status--1440--light.jpg)                 | [before](before/status--1440--dark.jpg) / [after](after/status--1440--dark.jpg)                 | [before](before/status--390--light.jpg) / [after](after/status--390--light.jpg)                 | [before](before/status--390--dark.jpg) / [after](after/status--390--dark.jpg)                 |
| research       | [before](before/research--1440--light.jpg) / [after](after/research--1440--light.jpg)             | [before](before/research--1440--dark.jpg) / [after](after/research--1440--dark.jpg)             | [before](before/research--390--light.jpg) / [after](after/research--390--light.jpg)             | [before](before/research--390--dark.jpg) / [after](after/research--390--dark.jpg)             |
| volunteers     | [before](before/volunteers--1440--light.jpg) / [after](after/volunteers--1440--light.jpg)         | [before](before/volunteers--1440--dark.jpg) / [after](after/volunteers--1440--dark.jpg)         | [before](before/volunteers--390--light.jpg) / [after](after/volunteers--390--light.jpg)         | [before](before/volunteers--390--dark.jpg) / [after](after/volunteers--390--dark.jpg)         |
| screening-days | [before](before/screening-days--1440--light.jpg) / [after](after/screening-days--1440--light.jpg) | [before](before/screening-days--1440--dark.jpg) / [after](after/screening-days--1440--dark.jpg) | [before](before/screening-days--390--light.jpg) / [after](after/screening-days--390--light.jpg) | [before](before/screening-days--390--dark.jpg) / [after](after/screening-days--390--dark.jpg) |
| screening-day  | [before](before/screening-day--1440--light.jpg) / [after](after/screening-day--1440--light.jpg)   | [before](before/screening-day--1440--dark.jpg) / [after](after/screening-day--1440--dark.jpg)   | [before](before/screening-day--390--light.jpg) / [after](after/screening-day--390--light.jpg)   | [before](before/screening-day--390--dark.jpg) / [after](after/screening-day--390--dark.jpg)   |
| footer         | [before](before/footer--1440--light.jpg) / [after](after/footer--1440--light.jpg)                 | [before](before/footer--1440--dark.jpg) / [after](after/footer--1440--dark.jpg)                 | [before](before/footer--390--light.jpg) / [after](after/footer--390--light.jpg)                 | [before](before/footer--390--dark.jpg) / [after](after/footer--390--dark.jpg)                 |
| mobile-menu    | Not applicable                                                                                    | Not applicable                                                                                  | [before](before/mobile-menu--390--light.jpg) / [after](after/mobile-menu--390--light.jpg)       | [before](before/mobile-menu--390--dark.jpg) / [after](after/mobile-menu--390--dark.jpg)       |

## Verification

- Final CI Playwright run: **61 passed, zero failed**, one worker. Six authentication
  setup cases, three evidence cases and 52 regression cases from `landing`, `legal`,
  `public-routes`, `public-supporting-pages` and `volunteer-roster`.
- Web Jest: **81 suites, 944 tests passed**, `--maxWorkers=2`.
- Root `npm run lint` and `npm run typecheck`: all workspaces passed.
- Normal Turbopack production build: passed before and after with the CI environment.
- `npm run security:scan`, token contrast check (24 pairs), chart palette check and
  whole-repository Prettier: passed.
- Impeccable mechanical detector: no findings. Independent source review and a visual
  review of 14 representative after captures: no actionable findings.

- Cookie regression checks cover fresh essential-only defaults, no consent write on
  settings open/Escape, exact preservation of existing analytics true/false choices,
  both settings entry points, focus restoration on close, and the existing essential-only
  storage format.
- Keyboard checks cover the legal skip link, the mobile menu's focus loop and Escape
  restoration in both themes, reduced-motion reading and mobile event navigation.
- `LandingHeader` still accepts `base?: '' | '/'`; `LandingFooter` still accepts that
  plus `releaseVersion?: string`. Section links, CTA data attributes and `StatusPanel`
  are preserved for #278. No file owned by the parallel landing-page session changed.

## Reproduce

Build before and after with the CI E2E environment, preserving the local seeded subjects
and secrets from `.env` without printing them. Do not migrate, reset or reseed. Wait until
ports 3000 and 4000 have both been free for 10 seconds before starting the test-owned
servers. Use the normal Turbopack build. The isolated worktree used cloned installed
`node_modules` because Turbopack rejects dependency symlinks outside its project root.

```sh
# From the repository root, after loading the CI E2E environment and building:
CI=1 EVIDENCE_DIR="$PWD/docs/design-system/evidence/279/after" \
  LIGHTHOUSE_MODULE_DIR=/absolute/path/to/temporary/node_modules \
  PUBLIC_REGRESSION=1 \
  node node_modules/@playwright/test/cli.js test \
  --config=docs/design-system/evidence/279/playwright.config.cjs --workers=1
```

Omit `PUBLIC_REGRESSION` for evidence only. Omit `LIGHTHOUSE_MODULE_DIR` for screenshot/axe
only. `EVIDENCE_VIEWS=research` can recapture one page; the summaries merge by view/width/theme.
The runner disables redundant trace/video artifacts to keep evidence runs small.

## Known limitations

- The research schedule write suite was not rerun: it revokes schedules and writes
  patient consent in the shared database. The changed presentation is covered by a
  synthetic read-only research test, both-theme axe and Lighthouse captures; research
  request/save logic is unchanged.
- Automated accessibility checks do not replace a human VoiceOver pass or physical-device
  testing; neither is claimed here.
- Lighthouse snapshots audit the rendered page, not a navigation performance trace.
- Status state and latency reflect shared local infrastructure at capture time and may differ
  before/after. They are not availability claims or product metrics.
- The separate #278 landing redesign was not merged into this branch. Shared chrome was
  tested with the landing page at `179171e`; its exports and props remain compatible.
- The first complete after run found that the existing cookie dialog did not return
  focus to its external entry point on Escape. The owned entry component now observes
  that dialog's existing essential field through unmount and restores focus; the global
  consent component and its storage/gating logic remain unchanged.
- A failed Webpack attempt on the unchanged base reached the existing client-side
  `node:crypto` import problem. The standard Turbopack builds are the validation builds.
- The first evidence retry hit disk exhaustion. Only this task's generated Next cache was
  removed; no other session's files, processes or database were altered.

Rollback: revert the implementation commit to restore the previous presentation. No data,
consent migration, environment change or dependency removal is required.
