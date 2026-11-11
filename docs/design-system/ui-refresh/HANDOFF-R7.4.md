# Handoff: R7.4 Responsive edge cases

Continue the frontend-only Layered Clinical Workspace refresh on `ui-refresh/r1-1-tokens`. Learning
guardrails stay suspended (direct mode, no teach-back). Implement **R7.4 only**, validate, review,
update docs and commit locally. Do not push.

R7.3 (forms and modal refinements) is complete. Read `R7.3-REVIEW.md` and MASTER sections 9.1 and
10.1 before starting.

## Scope

Master spec Phase R7, fourth bullet: **responsive edge cases** across the workspace, portal and
public pages, against MASTER section 6 (breakpoints, phone PWA, foldables) and 10 (text zoom and
reflow, orientation, virtual keyboard).

- Long dialogs on phones (R7.3 P2): the Create clinic dialog and other long forms are centred
  scrolling cards at 390. MASTER 5.4 prefers a bottom sheet or full-screen form there. Decide per
  dialog, without turning small confirmations into full-screen views.
- Widths the route audit does not cover: 320, 599/600, 767/768, 1199/1200, and 200% zoom (640).
- Landscape phones and the virtual keyboard over the sticky action rows (`FormActions`, vitals
  save row, chat composer).
- Long content: very long patient names, clinic names and medication strings in headers, tables
  and dialogs.

Out of scope: clinical saves, validation rules, permissions, flags, sync semantics, Keycloak
behaviour, new product features.

## Skills

Load `impeccable` (context, adapt, polish, detector), `accessibility`, and `emil-design-eng` and
`apple-design` for any sheet or dialog presentation change.

## Carried

- Pre-existing spec failures, reproduced on HEAD in R7.3: `patient-redesign` expects a 44px tab
  (the R3.8 token is 40px on a mouse), and `vitals` cannot find the BMI text `24.2`.
- Cross-browser (R7.3 follow-up): Playwright Firefox passes every R7.3 behaviour; its
  `sheet-drag` and paused-frame reversal checks are Chromium-specific. Playwright WebKit cannot sign
  in against local http Keycloak, so real Safari needs staging (HTTPS) or a device.
- Transient sync states, backend Crisis acknowledgement (`TASK-crisis-acknowledgement.md`), the
  Sunday appointment lifecycle, Safari/Firefox, screen readers, real devices.
- The portal's "Next appointment" did not show an appointment inserted directly into a throwaway
  database (R6.1). `public/og-image.png` (7 MB) still shows the pre-"Log in" header.
- R7.1 P2: removing the sheet's `transition-transform` breaks handle drag; not root-caused. Sheets
  stay on keyframes for this reason (R7.3).

## Validation

Recreate `S/audit-env.sh` and `S/env.sh` from `HANDOFF-R2.1.md` (the BAD-DB guard must pass).
Audit-flag build, standalone TypeScript, changed-file ESLint and Prettier, detector, focused
Chromium over every spec that names a changed class, label or behaviour (`responsive-components`,
`responsive-migration`, `shell-responsive`, `bottom-navigation`, `overlay-motion`, `sheet-drag`,
`form-errors` and the screen specs you touch at minimum) in one invocation with one worker, and the
six-role route audit as regression (baseline in `R7.3-REVIEW.md`). Scratch specs inside
`docs/design-system/route-audit/` named `*route-audit.spec.js` are swept into the audit; name them
otherwise and delete them before committing. Write `R7.4-REVIEW.md`, a `PROGRESS.md` entry and the
next handoff.
