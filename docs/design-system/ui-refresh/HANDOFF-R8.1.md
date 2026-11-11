# Handoff: R8.1 Full route audit

Continue the frontend-only Layered Clinical Workspace refresh on `ui-refresh/r1-1-tokens`. Learning
guardrails stay suspended (direct mode, no teach-back). Implement **R8.1 only**, validate, review,
update docs and commit locally. Do not push.

Phase R7 is complete (R7.7 performance checks). Read `R7.7-REVIEW.md` and MASTER sections 4.3, 8.1,
9.1, 10.1 and 11.1 before starting.

## Scope

Master spec Phase R8, first bullet: **full route audit**. Walk every route the app serves, not only
the six-role audit plan: every workspace route for each role that reaches it, the portal, the public
site (landing, legal, cookies, status), the auth screens and Keycloak theme, the 404, and the
whole-page states (`FullscreenStatus`, `PageSkeleton`, error boundaries), in light and dark at 1440
and 390. Record what each role sees, axe results, overflow and one `h1`, and fix in-scope defects.

- Diff the six-role plan in `docs/design-system/route-audit/route-audit.spec.js` against the build's
  route table and `lib/app-nav.ts`; add missing routes to the plan rather than to a scratch spec.
- The R7.7 rules (MASTER 11.1) apply to anything touched: no `@nkwapa/db` root imports, hidden
  labels last under `space-y-*`, no `priority` on `BrandWordmark`.

Out of scope: clinical saves, validation rules, permissions, flags, sync semantics, Keycloak
behaviour, API performance.

## Skills

Load `impeccable` (context, audit, critique) and `accessibility`.

## Carried

- **R7.7 open:** shared critical JS about 456 KB gzipped (Keycloak adapter in root providers); a
  465 ms long task on `/dashboard` at 4× CPU; no real-device or field measurements.
- **R7.6:** `transition-colors` controls tween inside the theme crossfade (P3); `PageSkeleton` not
  seen in dark; `shell-responsive` "pointer collapse interrupts" flakes under load (passes alone).
- **R7.5 state rules (MASTER 8.1)** and open items: "Record no known medications" offline against
  an empty device copy (product decision); audit and notifications "0 events loaded" above a failed
  first load; `global-error.tsx` may render without the app's fonts and tokens.
- **Stale spec:** `patient-chart` "staff trends retain exact values" expects `10/1`; the table
  renders `1 Oct`.
- **R7.4 form dialogs:** `DialogContent variant="form"` with a pinned `DialogFooter`.
- Keyboard inset unverified on devices. Pre-existing failures: `patient-redesign` 44px tab and
  `staff-invite` "the profile page edits the name and phone". WebKit cannot sign in against local
  http Keycloak. Transient sync states, backend Crisis acknowledgement
  (`TASK-crisis-acknowledgement.md`), the Sunday appointment lifecycle, screen readers, real
  devices, R7.1 P2 sheet `transition-transform`.

## Validation

Recreate `S/audit-env.sh` and `S/env.sh` from `HANDOFF-R2.1.md` (the BAD-DB guard must pass).
Audit-flag build, standalone TypeScript, changed-file ESLint and Prettier, Jest with
`--maxWorkers=2`, detector, focused Chromium over every spec that names a changed string, class or
behaviour in one invocation with one worker, and the six-role route audit in both themes (baseline
in `R7.7-REVIEW.md`). Scratch specs go in `apps/web/e2e` under a `zz-` name, never in
`route-audit/` as `*route-audit.spec.js`; delete them before committing. Write `R8.1-REVIEW.md`, a
`PROGRESS.md` entry and the next handoff.
