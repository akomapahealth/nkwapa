# Handoff: R7.2 Keyboard and focus polish

Continue the frontend-only Layered Clinical Workspace refresh on `ui-refresh/r1-1-tokens`. Learning
guardrails stay suspended (direct mode, no teach-back). Implement **R7.2 only**, validate, review,
update docs and commit locally. Do not push.

R7.1 (motion review) is complete. Read `R7.1-REVIEW.md` before starting.

## Scope

Master spec Phase R7, second bullet: **keyboard and focus polish** across the workspace, portal and
public pages, against MASTER section 10 and WCAG 2.2 AA (2.4.7 focus visible, 2.4.11 focus not
obscured, 2.1.1 keyboard, 2.4.3 focus order).

- Open-overlay accessibility, carried since R1.5/R1.6: axe reports `aria-hidden-focus` on the
  background `.px-safe` while a menu or Select is open. Find what leaves a focusable element inside
  the hidden background and fix it without changing Radix focus management.
- Focus rings: one visible style on every interactive element in both themes, including inside the
  sheet, the bottom nav, DataTable rows that are links, and the landing page's dark sections.
- Sticky header and bottom nav must not cover the focused element (2.4.11): check `scroll-padding`
  on the workspace and portal.
- Focus return after dialogs, sheets and route actions; skip link reaches `#main-content` on every
  layout.
- Keyboard routes through the station line, queues, registry and the vitals form without a mouse.
- R7.1 made dialogs and sheets instant from the keyboard. Keep that; do not add focus animation.

Out of scope: clinical saves, validation, permissions, flags, sync semantics, Keycloak behaviour,
new product features.

## Skills

Load `impeccable` (context, audit on keyboard and focus, detector), `accessibility` and
`web-design-guidelines`.

## Carried

- Transient sync states, backend Crisis acknowledgement (`TASK-crisis-acknowledgement.md`), the
  Sunday appointment lifecycle, Safari/Firefox, screen readers, real devices.
- The portal's "Next appointment" did not show an appointment inserted directly into a throwaway
  database (R6.1). Trace it before relying on it in a screenshot.
- `public/og-image.png` (7 MB) still shows the pre-"Log in" header. Regenerate and compress it when
  the header next changes.
- R7.1 open findings: dialogs still use keyframes (an exit does not reverse a half-finished
  entrance); the welcome tour does not get the keyboard-instant rule.

## Validation

Recreate `S/audit-env.sh` and `S/env.sh` from `HANDOFF-R2.1.md` (the BAD-DB guard must pass).
Audit-flag build, standalone TypeScript, changed-file ESLint and Prettier, detector, focused
Chromium over every spec that names a changed class, label or focus behaviour (`overlay-motion`,
`sheet-drag`, `accessibility`, `keyboard`-named specs at minimum) in one invocation with one worker,
and the six-role route audit as regression (R7.1 baseline in `R7.1-REVIEW.md`). Scratch specs inside
`docs/design-system/route-audit/` are matched by the audit's `route-audit.spec` filter: name them
otherwise or delete them before the audit runs. Write `R7.2-REVIEW.md`, a `PROGRESS.md` entry and
the next handoff.
