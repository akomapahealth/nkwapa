# Handoff: R7.3 Forms and modal refinements

Continue the frontend-only Layered Clinical Workspace refresh on `ui-refresh/r1-1-tokens`. Learning
guardrails stay suspended (direct mode, no teach-back). Implement **R7.3 only**, validate, review,
update docs and commit locally. Do not push.

R7.2 (keyboard and focus polish) is complete. Read `R7.2-REVIEW.md` and MASTER section 10.1 (focus
rules) before starting.

## Scope

Master spec Phase R7, third bullet: **forms and modal refinements** across the workspace, portal
and public pages, against MASTER sections 5.2 (inputs), 5.4 (dialogs and sheets), 9.1 and 10.

- Dialog presence, carried from R7.1: dialogs still run tailwindcss-animate keyframes, so a dialog
  closed mid-entrance restarts its exit from the end state instead of reversing. Menus and Selects
  already use transitions (R1.5). Decide whether dialogs move to the same transition clock; keep
  the keyboard-instant rule and the reduced-motion fade.
- The welcome tour uses Radix Dialog directly and misses the keyboard-instant rule (R7.1 P2).
- Form errors: on submit, focus the first invalid field and announce the summary (WCAG 3.3.1,
  3.3.3), without changing validation rules or messages' meaning. Check registration, vitals,
  appointments and the portal self-report.
- Field rhythm: label, hint, error spacing and widths on the long forms (registration, vitals,
  encounter, clinic settings) at 390, 744 and 1440 in both themes.
- Date fields: Chromium gives the calendar button its own tab stop with the browser's blue ring
  (R7.2 open finding). Decide whether a house date control is worth it or the native one stays.

Out of scope: clinical saves, validation rules, permissions, flags, sync semantics, Keycloak
behaviour, new product features.

## Skills

Load `impeccable` (context, polish, harden, detector), `accessibility`, `emil-design-eng` and
`apple-design` for the dialog motion decision.

## Carried

- Transient sync states, backend Crisis acknowledgement (`TASK-crisis-acknowledgement.md`), the
  Sunday appointment lifecycle, Safari/Firefox, screen readers, real devices.
- The portal's "Next appointment" did not show an appointment inserted directly into a throwaway
  database (R6.1). Trace it before relying on it in a screenshot.
- `public/og-image.png` (7 MB) still shows the pre-"Log in" header.
- R7.1 P2: removing the sheet's `transition-transform` breaks handle drag; not root-caused.
- R7.2: in-page link glide on phones after the landing header sheet closes is an instant jump
  (the sheet sets `location.href`).

## Validation

Recreate `S/audit-env.sh` and `S/env.sh` from `HANDOFF-R2.1.md` (the BAD-DB guard must pass).
Audit-flag build, standalone TypeScript, changed-file ESLint and Prettier, detector, focused
Chromium over every spec that names a changed class, label or behaviour (`keyboard-focus`,
`accessibility`, `overlay-motion`, `sheet-drag`, `welcome-tour` and the form specs you touch at
minimum) in one invocation with one worker, and the six-role route audit as regression (baseline in
`R7.2-REVIEW.md`). Scratch specs inside `docs/design-system/route-audit/` named
`*route-audit.spec.js` are swept into the audit; name them otherwise and delete them before
committing. Write `R7.3-REVIEW.md`, a `PROGRESS.md` entry and the next handoff.
