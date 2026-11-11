# Handoff: R7.6 Dark-mode pass

Continue the frontend-only Layered Clinical Workspace refresh on `ui-refresh/r1-1-tokens`. Learning
guardrails stay suspended (direct mode, no teach-back). Implement **R7.6 only**, validate, review,
update docs and commit locally. Do not push.

R7.5 (error and empty states) is complete. Read `R7.5-REVIEW.md` and MASTER sections 4.3, 8.1, 9.1
and 10.1 before starting.

## Scope

Master spec Phase R7, sixth bullet: **dark-mode pass** across the workspace, portal and public
pages, against MASTER 4.3 and the accessibility commitment that light and dark are both designed and
measured.

- Measure text, icon and control contrast in dark on every route the six-role audit visits, plus the
  states R7.5 touched (`FullscreenStatus`, `PageSkeleton`, error and offline notices, chart-section
  states) and the eight avatar tones (`--avatar-N` in the `.dark` block; measured 6.29 to 7.89:1 for
  initials, fills not yet seen against every surface).
- Tinted status surfaces (destructive, warning, success, selected) on the dark sheet, chart series
  (`--chart-1..5` dark values), focus rings, the sheet scrim, and photographic bands.
- Theme switch: no flash of the wrong theme on load, and no abrupt brightness jump (MASTER 9.1).

Out of scope: clinical saves, validation rules, permissions, flags, sync semantics, Keycloak
behaviour.

## Skills

Load `impeccable` (context, audit, polish, detector) and `accessibility`. Load `emil-design-eng` and
`apple-design` for the theme transition.

## Carried

- **R7.5 state rules (MASTER 8.1).** A failed read is never an empty list; an empty device copy says
  "saved on this device"; error toasts stay until dismissed; boundaries never print
  `error.message`; avatars use `avatarToneProps(name)`.
- **R7.5 open:** "Record no known medications" stays available offline against an empty device copy
  (needs a product decision); audit and notifications still say "0 events loaded" above a failed
  first load; `global-error.tsx` may render without the app's fonts and tokens.
- **Stale spec:** `patient-chart` "staff trends retain exact values" expects row headers `10/1`; the
  table renders `1 Oct`. No R7.5 file touches it; not reproduced on a HEAD build.
- **R7.4 form dialogs.** `DialogContent variant="form"` with a pinned `DialogFooter` for any
  multi-field form dialog.
- **Keyboard inset is unverified on devices** (iPhone and Android on staging).
- Pre-existing spec failures: `patient-redesign` 44px tab (the token is 40px on a mouse) and
  `staff-invite` "the profile page edits the name and phone" (its five serial followers do not run).
- Cross-browser: WebKit cannot sign in against local http Keycloak; real Safari needs staging.
- Transient sync states, backend Crisis acknowledgement (`TASK-crisis-acknowledgement.md`), the
  Sunday appointment lifecycle, screen readers, real devices, `public/og-image.png` (7 MB, old
  header), R7.1 P2 sheet `transition-transform`.

## Validation

Recreate `S/audit-env.sh` and `S/env.sh` from `HANDOFF-R2.1.md` (the BAD-DB guard must pass).
Audit-flag build, standalone TypeScript, changed-file ESLint and Prettier, Jest with
`--maxWorkers=2`, detector, focused Chromium over every spec that names a changed string, class or
behaviour in one invocation with one worker, and the six-role route audit in both themes as
regression (baseline in `R7.5-REVIEW.md`). Scratch specs inside `docs/design-system/route-audit/`
named `*route-audit.spec.js` are swept into the audit; name them otherwise and delete them before
committing. Write `R7.6-REVIEW.md`, a `PROGRESS.md` entry and the next handoff.
