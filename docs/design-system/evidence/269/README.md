# #269 manager, director and system admin dashboards: evidence

Captured 2026-11-02 on seeded E2E data only (synthetic patients, the `e2e.*` identities). Never point the capture at a database holding real patients.

## Before and after

`before/` is `release/dev` at `cf393e7`; `after/` is this branch. Both builds use the CI E2E environment, the same database state and `reducedMotion: 'reduce'`. The rail is expanded at 1440.

`<role>-dashboard--<width>--<theme>.jpg` for `manager`, `director` and `staff`, light and dark. 1440 images are the full page; 390 images are the first screen. `staff` holds SYSTEM_ADMIN plus every clinic role, which is the long page this issue shrinks.

| Page height (px)          | Before | After |
| ------------------------- | ------ | ----- |
| staff, 1440               | 8,178  | 2,986 |
| staff, 390                | 15,899 | 5,535 |
| manager or director, 1440 | 2,660  | 2,734 |
| manager or director, 390  | 4,885  | 5,079 |

The #229 baseline for the staff page was 7,342px; at `cf393e7` (after #268) it measured 8,178px on this database. Manager and director pages grow slightly because "Needs you now" now leads them.

## Station line

The CI E2E build has the station workflow off, so `station/before/` and `station/after/` hold a separate pair built with `NEXT_PUBLIC_FEATURE_STATION_WORKFLOW_ENABLED=true` and the API flag on, after `station-workflow.spec.js` had queued patients (`station-capture.spec.js`, manager, 1440 light, full page). Before, the station section had no lanes; after, "Station line now" leads it.

In this seed no wait has passed 20 minutes, so the warning state ("Over 20 minutes", warning bar) does not appear in the images. The metrics also report `staffNow` as 0 for every station (with 2 staff on shift clinic-wide), so every lane says "No one staffing".

The lanes use each station's aggregate `longestCurrentWaitMinutes` and `staffNow` from the station metrics the dashboard already fetches. There is no per-patient queue data on the dashboard, so no patient is named.

## Accessibility

`axe-before.json` and `axe-after.json`: 12 axe scans each (3 identities x 2 widths x 2 themes), full page, serious and critical only, taken after entrance animations finish. No findings before or after. Each entry also records the page height.

## Reproduce

`capture.spec.js` is the capture used here. Run it with a Playwright config whose `setup` project is `apps/web/e2e/auth.setup.js`, with `WEB_DIR` set to `apps/web` and `EVIDENCE_DIR` set to an output folder. For the before images, run it against a `release/dev` build.
