# #265 shared components: evidence

Captured 2026-11-01 on seeded E2E data only (synthetic patients, the `e2e.doctor` and `e2e.staff` identities). Never point the capture at a database holding real patients.

## Before and after

`before/` is `release/dev` at `b5f76de`; `after/` is this branch. Both builds use the CI E2E environment, the same database state and `reducedMotion: 'reduce'`. Every after image differs from its before image.

| Route                                    | Identity | Why it is here                                                                                     |
| ---------------------------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `/dashboard` (`doctor-dashboard`)        | doctor   | Ruled metric groups, section headers, `DataTable` and `StatusLabel` in the recent-encounter tables |
| `/queues` (`doctor-queues`)              | doctor   | `StatusLabel` for queue status and BP stage, page header, table                                    |
| a patient chart (`staff-patient-chart`)  | staff    | Plain-language sex and allergy severity, chart status badges, metric groups                        |
| `/notifications` (`staff-notifications`) | staff    | `StatusLabel` for delivery status in the table and the mobile rows                                 |

Each route at 1440 and 390, light and dark: `<route>--<width>--<theme>.jpg`.

`fixture/` is the browser-only component fixture (`apps/web/e2e/component-fixtures/`) rendered by `shared-components.spec.js` with `DESIGN_COMPONENTS_DIR` set. It did not exist before this change, so it has no before image.

## Accessibility

`axe-before.json` and `axe-after.json`: 16 full-page axe scans each (4 routes x 2 widths x 2 themes). Both record zero serious or critical findings.

## Raw enums

`enum-source-audit.txt` is the sweep from SESSION-HANDOFF.md section 2. All 59 hits are comparisons, keys, defaults, option values or comments.

## Reproduce

`capture.spec.js` is the capture used here. Run it with a Playwright config whose `setup` project is `apps/web/e2e/auth.setup.js`, with `WEB_DIR` set to `apps/web` and `EVIDENCE_DIR` set to an output folder. For the before images, point `PLAYWRIGHT_WEB_COMMAND` at a `release/dev` build.
