# #268 volunteer and doctor dashboards: evidence

Captured 2026-11-02 on seeded E2E data only (synthetic patients, the `e2e.*` identities). Never point the capture at a database holding real patients.

## Before and after

`before/` is `release/dev` at `9a11c70`; `after/` is this branch. Both builds use the CI E2E environment, the same database state and `reducedMotion: 'reduce'`. The rail is expanded at 1440.

`<role>-dashboard--<width>--<theme>.jpg` for `volunteer` and `doctor`, light and dark. 1440 images are the full page; 390 images are the first screen, which is what the acceptance criterion ("volunteer mobile dashboard shows own work in the first screen") is about. Before, the volunteer's first phone screen held only clinic-wide totals; after, it holds their counts today, their worklist row and their draft visits.

## Accessibility

`axe-before.json` and `axe-after.json`: 8 axe scans each (2 roles x 2 widths x 2 themes), full page, serious and critical only, taken after entrance animations finish. No findings before or after. Each entry also records the page height.

## Reproduce

`capture.spec.js` is the capture used here. Run it with a Playwright config whose `setup` project is `apps/web/e2e/auth.setup.js`, with `WEB_DIR` set to `apps/web` and `EVIDENCE_DIR` set to an output folder. For the before images, run it against a `release/dev` build.
