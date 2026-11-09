# Handoff: R2.5 patient portal shell

Continue the frontend-only Layered Clinical Workspace refresh on
`ui-refresh/r1-1-tokens`. The owner explicitly suspended learning guardrails for
this sequence. Implement one unit, R2.5, validate, review, update documentation and
commit locally. Do not push. Inspect status/history first and preserve unrelated
work.

## Authority and starting point

Read `apps/web/AGENTS.md` and relevant installed Next docs before editing. Read
`R0-AUDIT.md` sections 4–6, 8–9, `../MASTER.md` motion, staff shell and patient portal
contracts, the latest `../PROGRESS.md` entry and `R2.4-REVIEW.md`. The approved
visual authority is https://claude.ai/artifact/ESPAMmNxLt1caa2owyjSX5 and checked-in
`r0-pilot/index.html`. Use synthetic evidence only. Never inspect the real-patient
or third-party reference directories `01-current-ui` and `02-design-references`.

Staff R2.1–R2.3 remain intact: 232/64px desktop from 1200px, 76px labelled rail at
600–1199, phone BottomNav below 600px, permission-derived destinations and More,
sequential More-to-sync focus handoff, independent Header clinic/role truncation,
existing clinic feedback and stable sync footprints. Preserve one mounted table
state through layout changes and the growing Header under enlarged text.

R2.4 adds a handle to the shared Radix Sheet on every configured edge. It owns
only handle gestures, leaving bodies and clinical controls scrollable. Direct
tracking, inward rubber-band resistance, outward distance/flick dismissal,
interruptible physical spring restoration, cancellation and reduced motion are
covered in `sheet-drag.spec.js`. The handle is also a click/keyboard close button.
Do not replace Radix semantics or suppress accessibility rules. The shared focus
fallback remembers the actual opening control; custom More/sync callbacks take
precedence. Resize resets a drag; navigation closes it. Keep these contracts.

R2.4 inspected all six Sheet call sites. The existing portal Header passes no
mobile-open state from `PortalLayout`; its left menu is therefore dormant under
the default controlled props. Treat that as existing R2.5 shell context, not a
completed patient navigation implementation. A patient without sync permissions
or pending/held changes has no sync pill; do not add permissions to expose it.

## Task: R2.5 only

R0 task: “Portal shell: same bottom nav pattern with portal destinations.” Inspect
`components/PortalLayout.tsx`, `components/Header.tsx`, existing portal routes,
bootstrap/permission helpers, staff BottomNav integration and every actual portal
layout caller. R0 proposes Home, Health, Appointments and More derived from the
existing portal destinations. Preserve route labels, permissions, clinic scope,
account/settings access, truthful sync recovery access and existing patient data
contracts. Resolve the existing controlled Header/menu integration within this
unit rather than leaving a nonfunctional navigation trigger.

Use the approved tokens and existing shared primitives. Maintain 44px targets,
visible focus, safe-area and chat clearance, responsive layouts, keyboard access,
scrolling to final actions, both themes and enlarged text. Preserve mounted state
when changing the shell. No clinical copy, clinical actions, backend/database,
authentication, permission or queue changes. Do not implement R3 content work or
backend Crisis acknowledgement.

## Validation and operations

Use the isolated audit database and exact flags/guards under “Route audit harness”
and “Low-memory e2e recipe” in `HANDOFF-R2.1.md`. Recreate scratch scripts as
needed; never print credentials. Apply the exact
`${APP_DATABASE_URL%/nkwapa}/nkwapa_audit` replacement and guard each database URL.
Escalate sandbox build/binding restrictions instead of changing product code.
Build once per final source/flag state, not for spec-only changes.

Search changed labels, roles, classes and shared consumers before choosing focused
specs. Never run the full e2e suite. One worker, at most three failures, redirected
API output; Jest at most two workers. Run TypeScript, changed-file lint/formatting,
detector, focused regressions and the six-role normal-route audit. Record exact
counts, failures and coverage limits in a ranked P0–P3 review and PROGRESS.

Check 320/390/599/600/744/767/768/1024/1199/1200/1440, both themes, keyboard,
reduced motion, long content, final-action reachability, enlarged text, rapid
open/close, route/history transitions, sync recovery/focus and retained state.
Physical devices, Safari/Firefox, installed PWA, screen readers, virtual keyboard,
safe areas and subjective gesture feel remain separate manual checks unless
actually performed.

Update MASTER, PROGRESS and a ranked review. Save synthetic evidence under ignored
`evidence/r2-5/after/`; do not force-add it or create GitHub issues. R2.4 evidence
and exact results are in `R2.4-REVIEW.md`; do not claim missing images were inspected.
Prior P1 open-Select/menu background accessibility findings, short dropdown rows,
R1.4 feel checks, Vitals/Crisis checks, backend acknowledgement and Sunday
appointment lifecycle findings remain separate.
