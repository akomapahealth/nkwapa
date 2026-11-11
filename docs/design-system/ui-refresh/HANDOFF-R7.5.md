# Handoff: R7.5 Error and empty-state improvements

Continue the frontend-only Layered Clinical Workspace refresh on `ui-refresh/r1-1-tokens`. Learning
guardrails stay suspended (direct mode, no teach-back). Implement **R7.5 only**, validate, review,
update docs and commit locally. Do not push.

R7.4 (responsive edge cases) is complete. Read `R7.4-REVIEW.md` and MASTER sections 8, 9.1 and
10.1 before starting.

## Scope

Master spec Phase R7, fifth bullet: **error and empty-state improvements** across the workspace,
portal and public pages, against MASTER section 8 (loading, empty, error, offline) and product
principle 2 (never blank the screen; an empty state is never shown when the real problem is the
network).

- Inventory every `ResourceState`, empty-list and error branch by route. Each empty state names
  what is missing and the next action; each error names the problem and the recovery.
- Offline versus empty: a list that failed to load while offline must not read as "No patients".
- Retry affordances, the shape of inline versus page errors, and toast versus inline for failed
  saves (a failed clinical save never disappears with a toast).
- Copy only where it is unclear (`clarify`); no new product features.

Out of scope: clinical saves, validation rules, permissions, flags, sync semantics, Keycloak
behaviour.

## Skills

Load `impeccable` (context, harden, clarify, polish, detector) and `accessibility`. Load
`emil-design-eng` and `apple-design` for any state transition that animates (MASTER 9.1 rule 7:
crossfade, never blank).

## Carried

- **R7.4 form dialogs.** `DialogContent variant="form"` is the rule for any dialog holding a
  multi-field form: a bottom sheet below 600px and a pinned `DialogFooter` at every width
  (`globals.css` `.dialog-form`). A new form dialog must use it and end with `DialogFooter`.
- **Keyboard inset is unverified on devices.** `KeyboardInset` publishes `--keyboard-inset` and
  `data-keyboard` from `visualViewport`; Playwright cannot raise a virtual keyboard, so only the CSS
  response (forced inset) and the arithmetic (Jest) are tested. Needs an iPhone and an Android
  phone on staging.
- Pre-existing spec failures, reproduced on HEAD in R7.3: `patient-redesign` expects a 44px tab
  (the R3.8 token is 40px on a mouse), and `vitals` cannot find the BMI text `24.2`.
- Cross-browser: Playwright Firefox passes the R7.3 behaviours except Chromium-specific timing
  helpers; WebKit cannot sign in against local http Keycloak. Real Safari needs staging or a device.
- Transient sync states, backend Crisis acknowledgement (`TASK-crisis-acknowledgement.md`), the
  Sunday appointment lifecycle, screen readers, real devices.
- The portal's "Next appointment" did not show an appointment inserted directly into a throwaway
  database (R6.1). `public/og-image.png` (7 MB) still shows the pre-"Log in" header.
- R7.1 P2: removing the sheet's `transition-transform` breaks handle drag; not root-caused.

## Validation

Recreate `S/audit-env.sh` and `S/env.sh` from `HANDOFF-R2.1.md` (the BAD-DB guard must pass).
Audit-flag build, standalone TypeScript, changed-file ESLint and Prettier (zsh does not word-split
`$VAR`; feed file lists through `xargs -0`), detector, focused Chromium over every spec that names a
changed string, class or behaviour in one invocation with one worker, and the six-role route audit
as regression (baseline in `R7.4-REVIEW.md`). Offline states need `context.setOffline(true)` after
the first load. Scratch specs inside `docs/design-system/route-audit/` named
`*route-audit.spec.js` are swept into the audit; name them otherwise and delete them before
committing. Write `R7.5-REVIEW.md`, a `PROGRESS.md` entry and the next handoff.
