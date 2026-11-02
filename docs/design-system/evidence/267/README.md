# #267 navigation utilities: evidence

Captured 2026-11-02 on seeded E2E data only (synthetic patients, the `e2e.*` identities). Never point the capture at a database holding real patients.

## Before and after

`before/` is `release/dev` at `db91415`; `after/` is this branch. Both builds use the CI E2E environment, the same database state, `reducedMotion: 'reduce'` and the rail expanded. All images are the first screen of `/dashboard`.

| Name                                 | Shows                                 |
| ------------------------------------ | ------------------------------------- |
| `<role>--1440--<theme>`              | Rail and header                       |
| `<role>-account-menu--1440--<theme>` | The account menu open                 |
| `<role>--390--<theme>`               | Phone header                          |
| `<role>-sheet--390--<theme>`         | Phone menu sheet, scrolled to its end |

Roles: `director` (holds both `REMINDER.READ` and `RESEARCH.SETTINGS.UPDATE`) and `volunteer` (`REMINDER.READ` only). Light and dark.

The four `<role>--390--<theme>` images are byte-identical before and after, as intended: on a phone the header has no room for the message delivery icon, so both items moved to the end of the menu sheet (the `-sheet--390--` images).

## Accessibility

`axe-before.json` and `axe-after.json`: 16 axe scans each, serious and critical only, each taken after entrance animations finish. Both have the same single finding, `aria-hidden-focus` on the four open-account-menu scans: Radix's modal dropdown hides the rest of the page with `aria-hidden` while it is open, and axe flags the focusable controls inside. It is present on `release/dev` and unchanged here. Every other scan is clean before and after.

## Reproduce

`capture.spec.js` is the capture used here. Run it with a Playwright config whose `setup` project is `apps/web/e2e/auth.setup.js`, with `WEB_DIR` set to `apps/web` and `EVIDENCE_DIR` set to an output folder. For the before images, run it against a `release/dev` build.
