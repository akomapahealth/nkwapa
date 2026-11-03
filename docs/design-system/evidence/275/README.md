# #275: analytics and reporting evidence

Captured 2026-11-03 on the station-OFF CI build (`ci.yml` E2E env, station flags off).
Before: unchanged `release/dev` at `f57a71a6734edbd6925a1b7254d92bbd928b02c4`.
After: this branch, web rebuilt with the same environment.

Presentation only. No API, permission, guard, flag or export content change.
No new dependency.

| Surface                    | Before                                                                 | After                                                                                           |
| -------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Metrics conversions        | Five cards with rounded teal bars; no table                            | Each in `ChartFrame`: ruled, conversion figure first, `--chart-1` bars, "Show table" toggle     |
| Metrics workflow tables    | Five cards                                                             | Ruled sections with hairline rows; table names unchanged                                        |
| Metrics section headings   | Small bold text                                                        | `type-section-title`                                                                            |
| Staff activity             | Range as a small card title, table in a card                           | Range is the section title, clinic zone beneath; 44px name and Open targets; total under a rule |
| Staff activity, one person | Two cards                                                              | Two ruled sections                                                                              |
| Organization report        | Care quality and By clinic cards                                       | Ruled sections; care quality as hairline rows with tabular figures                              |
| Cohort analytics           | Cohort filter card, By clinic card                                     | Ruled sections                                                                                  |
| Research exports           | Cards; decisions, runs and schedules as boxes inside cards; teal icons | Ruled sections; decisions, runs and schedules as hairline rows; muted icons                     |

Every chart on these routes now has a table toggle: the trend and distribution
charts already did, and the three conversions gained one (Step, Count, Share of
first step). Charts do not animate and keep straight segments.

## Screenshots and accessibility

Each view at 1440 (full page) and 390 (first screen), light and dark, using
seeded E2E identities and synthetic local records: `metrics-director` and
`research-exports` (director), `metrics-manager`, `staff-activity` and
`staff-activity-person` (manager; the first listed person, who has no records
in the range), `organization-report` and `organization-analytics` (system
admin, the only role with `ORGANIZATION.REPORT.READ`).

The before capture ran against the unchanged build; source edits began after
that build and do not affect the `.next` output `next start` serves.

`before/axe.json` and `after/axe.json`: 28 scans each, zero serious or critical.

Document heights (px), light; dark matches.

| View                   | 1440 before | 1440 after | 390 before | 390 after |
| ---------------------- | ----------: | ---------: | ---------: | --------: |
| metrics-director       |       2,385 |      2,307 |      4,592 |     4,312 |
| metrics-manager        |       2,385 |      2,307 |      4,592 |     4,312 |
| staff-activity         |       3,971 |      5,837 |      4,203 |     6,061 |
| organization-report    |       1,658 |      1,634 |      2,365 |     2,300 |
| organization-analytics |       2,356 |      2,320 |      3,955 |     3,899 |
| research-exports       |      15,926 |     15,071 |     30,370 |    26,390 |

Staff activity grows because each name is now a 44px target: the local
database holds about 70 synthetic staff from earlier E2E runs, so roughly 26px
per row adds up. A clinic's real roster is far shorter. Research exports is
long because earlier E2E runs left many export runs; the after run was
captured later and holds at least as many.

## Verification

- Full OFF Playwright (one worker, CI env): 387 passed, 49 skipped, 0 failed.
- Jest (`--maxWorkers=2`): web 938, API 2,842, db 837 passed.
- Security scan, realm validation, Prisma generate, lint, typecheck, chart
  palette, token contrast, script tests, Prettier and the db/API/web builds
  passed.
- No station code changed, so no ON build was run.

## Known limitations

- No shadcn `chart` adoption: the existing `ChartFrame` charts already meet
  the MASTER.md section 13 adaptations, so it would add code without a
  visible change. No chart animation was added.
- Staff activity has no chart; it is a table by design ("listed by name, not
  ranked"), so no chart was invented for it.
- The capture's person view shows an empty person, because the first listed
  name has no records in the default range.
