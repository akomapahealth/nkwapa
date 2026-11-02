# #266 staff shell: evidence

Captured 2026-11-02 on seeded E2E data only (synthetic patients, the `e2e.*` identities). Never point the capture at a database holding real patients.

## Before and after

`before/` is `release/dev` at `6d2a7ef`; `after/` is this branch. Both builds use the CI E2E environment, the same database state and `reducedMotion: 'reduce'`. The rail is set expanded at 1440 and collapsed at 1024 in both. No after image is identical to its before image.

| Name                 | Identity  | Route        | Shows                                                        |
| -------------------- | --------- | ------------ | ------------------------------------------------------------ |
| `doctor-dashboard`   | doctor    | `/dashboard` | One clinic, single role, a long page (rail edge full height) |
| `manager-today`      | manager   | `/today`     | The manager's 14-item rail, `aria-current` on Today Board    |
| `staff-queues`       | staff     | `/queues`    | Several clinics (the switcher is a `Select`), three roles    |
| `volunteer-patients` | volunteer | `/patients`  | The volunteer's rail on the registry                         |

Widths 1440, 1024 and 390, light and dark: `<name>--<width>--<theme>.jpg`. Desktop images are full page; 390 images are the first screen, where the header and the menu button are.

## Navigation set

`nav-before-release-dev.json` is each E2E identity's rail (staff, doctor, volunteer, manager, director) as `release/dev` rendered it (label and href, clinic id written as `:clinicId`). `apps/web/e2e/shell-navigation.spec.js` asserts the same list, in order, on the expanded rail, the collapsed rail and the phone sheet.

## Accessibility

`axe-before.json` and `axe-after.json`: 24 full-page axe scans each (4 routes x 3 widths x 2 themes), serious and critical only. Before: 4 serious `color-contrast` findings, the active rail item's description (`text-primary-foreground/80` on the teal fill) at 1440 light on every route. After: none.

## Reproduce

`capture.spec.js` is the capture used here. Run it with a Playwright config whose `setup` project is `apps/web/e2e/auth.setup.js`, with `WEB_DIR` set to `apps/web` and `EVIDENCE_DIR` set to an output folder. For the before images, point `PLAYWRIGHT_WEB_COMMAND` at a `release/dev` build.
