# Handoff: R7.7 Performance checks

Continue the frontend-only Layered Clinical Workspace refresh on `ui-refresh/r1-1-tokens`. Learning
guardrails stay suspended (direct mode, no teach-back). Implement **R7.7 only**, validate, review,
update docs and commit locally. Do not push.

R7.6 (dark-mode pass) is complete. Read `R7.6-REVIEW.md` and MASTER sections 4.3, 8.1, 9.1 and 10.1
before starting.

## Scope

Master spec Phase R7, seventh bullet: **performance checks** across the workspace, portal and
public pages, on the low-end phones and slow connections the clinics use.

- Bundle weight per route (the build's route table), and what the refresh added: fonts (two faces
  per family), Lottie (`Hello.json`, `checklist.json`), landing photography and `public/product/`.
- Runtime: long tasks and layout shift on the busiest workspace routes (today board, stations,
  patient record, registry) under CPU and network throttling; animations stay on transform and
  opacity (MASTER 9.1 rule 10).
- The theme crossfade (R7.6) and dialog transitions on a throttled CPU: they must not delay input.
- `public/og-image.png` is 7 MB with the old header.

Out of scope: clinical saves, validation rules, permissions, flags, sync semantics, Keycloak
behaviour, API performance.

## Skills

Load `impeccable` (context, audit, optimize) and `accessibility` for regressions.

## Carried

- **R7.6 dark rules (MASTER 4.3).** Measure every dark pairing on all nine grounds; charts sit on
  the card; `design:check-charts` must pass; theme switch crossfades only on a user pick.
- **R7.6 open:** wordmark teal reads dim on the dark canvas (logo, brand decision); the landing
  release banner is a bright band on a dark page; `transition-colors` controls tween inside the
  crossfade; `PageSkeleton` not seen in dark.
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
behaviour in one invocation with one worker, and the six-role route audit in both themes as
regression (baseline in `R7.6-REVIEW.md`: 228 rows, 0 violations). Scratch specs go in `apps/web/e2e`
under a `zz-` name, never in `route-audit/` as `*route-audit.spec.js`; delete them before
committing. Write `R7.7-REVIEW.md`, a `PROGRESS.md` entry and the next handoff.
