# Handoff: R7.1 Motion review

Continue the frontend-only Layered Clinical Workspace refresh on `ui-refresh/r1-1-tokens`. Learning
guardrails stay suspended (direct mode, no teach-back). Implement **R7.1 only**, validate, review,
update docs and commit locally. Do not push.

R6 is complete with R6.1 (public site). Read `R6.1-REVIEW.md` before starting.

## Scope

Master spec Phase R7, first bullet: **motion review** across the workspace, portal and public
pages, against `NKWAPA-UI-REFRESH-MASTER.md` section 9.1 (the owner's motion principles) and
MASTER section 7.

- Inventory every animation and transition still in the app (CSS keyframes in `globals.css`,
  Tailwind `animate-*`, framer-motion, GSAP on the landing page, Radix data-state transitions).
  For each: how often a person sees it, its purpose, easing, duration, what it animates, and
  whether it can be interrupted.
- Remove motion on anything used many times a day or started from the keyboard; keep enter
  200 ms / exit 160 ms, sheets 240/190, popovers from `scale(.95)` at the trigger.
- No `transition: all`, no `ease-in` on entrances, nothing from `scale(0)`, hover motion behind
  `(hover: hover) and (pointer: fine)`, reduced motion keeps opacity only.
- Page eyebrows (`.text-eyebrow` "CLINIC SNAPSHOT", "SECURE SIGN IN") were carried to R7; decide
  them here or in R7.2 and record the decision in MASTER.

Out of scope: clinical saves, validation, permissions, flags, sync semantics, Keycloak behaviour,
new product features.

## Skills

Load `impeccable` (context, critique on motion, detector), `emil-design-eng` and `apple-design`.
`improve-animations` or `review-animations` if they are listed.

## Carried

- Open-overlay accessibility (R1.5/R1.6 `aria-hidden-focus` on background `.px-safe` with menus
  and Select open). This is R7 "keyboard and focus polish", not R7.1, unless the motion work touches
  overlays.
- Transient sync states, backend Crisis acknowledgement (`TASK-crisis-acknowledgement.md`), the
  Sunday appointment lifecycle, Safari/Firefox, screen readers, real devices.
- The portal shows no appointment that was inserted directly into the throwaway screenshot
  database (R6.1). It was never traced; check that the portal's "Next appointment" reads confirmed
  appointments before relying on it in a future screenshot.
- `public/og-image.png` (7 MB, 2026-11-05) still shows the pre-"Log in" header. It is a photograph
  page, not a product screen, so R6.1 left it; regenerate and compress it when the header next
  changes.

## Validation

Recreate `S/audit-env.sh` and `S/env.sh` from `HANDOFF-R2.1.md` (the BAD-DB guard must pass).
Audit-flag build, standalone TypeScript, changed-file ESLint and Prettier, detector, focused
Chromium over every spec that names a changed class or duration (`overlay-motion`,
`sheet-drag`, `sign-in-timing`, `landing` at minimum) in one invocation with one worker, and the
six-role route audit as regression (R6.1 baseline in `R6.1-REVIEW.md`). Scratch specs inside
`docs/design-system/route-audit/` are matched by the audit's `route-audit.spec` filter: name them
otherwise or delete them before the audit runs. Write `R7.1-REVIEW.md`, a `PROGRESS.md` entry and
the next handoff.
