# Handoff: R2.4 draggable Sheet

Continue the frontend-only Layered Clinical Workspace refresh on
`ui-refresh/r1-1-tokens`. The owner explicitly said to ignore learning guardrails
and focus on building for this sequence. Implement one unit, R2.4, validate,
review, update documentation and commit locally. Do not push. Inspect status and
history first and preserve unrelated work.

## Authority and starting point

Read `apps/web/AGENTS.md` and relevant installed Next docs before editing.
Read `R0-AUDIT.md` sections 4–6, 8–9, `../MASTER.md` staff shell/navigation and
motion contracts, the latest `../PROGRESS.md` entry and `R2.3-REVIEW.md`.
The approved visual authority is https://claude.ai/artifact/ESPAMmNxLt1caa2owyjSX5
and the checked-in `r0-pilot/index.html`. Inspect the embedded claudeusercontent
frame when the reader cannot access the artifact. Use synthetic evidence only.

R2.1 geometry remains 232px expanded / 64px icon-only desktop from 1200px,
76px labelled rail at 600–1199, BottomNav below 600px. Tablet labels are deliberate.
R2.2 owns permission-derived primary destinations and More, sequential More-to-sync
focus handoff, sync-close focus restoration, and chat/bottom clearance. Preserve
these behaviors and the one mounted table state through shell changes.

R2.3 adds stacked staff clinic/role context, independent truncation, explicit
selected clinic text and bounded wrapping options. Phone gutters and a minimum
context width allow the action group to wrap when enlarged text needs more room.
The Header may grow; do not force a fixed height. The clinic switcher's loading,
success and failure feedback remain. Message delivery remains visible from 600px;
desktop collapse state and account actions retain their existing contracts.

Sync uses a 6.75rem phone footprint (108px at default text, capped at 180px) and a
192px wider footprint, short phone state labels and
full accessible status. Count capping is visual only. The existing seven-state
priority, ownership, providers, retry logic and recovery access are unchanged.
Persistent decorative icons transition over 150ms with shared ease-out tokens;
reduced motion removes the transition and spinner rotation. Do not replace this
with timers, deferred status, or mount/unmount animation queues.

Exact validation results, failures and coverage limits are recorded in
`R2.3-REVIEW.md` and PROGRESS. Local ignored `evidence/r2-3/after/` is the next
before baseline when present. Do not claim absent images were inspected.

## Task: R2.4 only

R0 task: “Sheet: drag to dismiss, no tween while held, rubber band.” Main shared
entry point: `apps/web/components/ui/sheet.tsx`; inspect every actual consumer
before choosing which sides and presentations should support dragging.

Use relevant installed motion/Apple interaction guidance and the approved
project tokens. Preserve Radix dialog semantics, title/description, Escape,
explicit close buttons, focus containment and return focus. Every drag action
must retain an equivalent button/keyboard action. Dragging must follow the finger
without interpolation while held, resist inappropriate movement and either
settle back or dismiss clearly. Handle cancellation, interruption, scroll-vs-drag
ownership, reduced motion, viewport resize and browser navigation. Avoid adding
side effects to clinical saves or changing any queue action.

R2.2 More already uses a bottom Sheet with an 85dvh scrolling body. Sync uses the
shared Sheet and remembers its actual entry point. Do not break the two-stage
More-to-sync focus handoff or restore focus to a now-hidden trigger. Do not
silently alter shared modal/focus-trap semantics to make axe pass.

Do not implement R2.5 Portal shell, R3 dashboard/content work, backend crisis
acknowledgement, or unrelated fixes. A shared primitive change can affect portal
consumers, so inspect their behavior without redesigning their shell.

## Validation and operations

Use an isolated audit database and the flags in `HANDOFF-R2.1.md` under “Route
audit harness” and “Low-memory e2e recipe.” Recreate scratch scripts as necessary.
Never print environment or credential values. Apply the exact
`${APP_DATABASE_URL%/nkwapa}/nkwapa_audit` replacement and guard each database URL.
Approved outside-sandbox builds work; escalate restrictions rather than changing
product code. Build once per final source/flag state, not for spec-only changes.

Search changed labels/roles/classes and shared Sheet consumers before choosing
focused specs. Never run the full e2e suite. Use one worker, at most three failures
and redirected API output. Jest uses at most two workers. Run TypeScript,
changed-file lint/formatting, detector, appropriate focused tests and the six-role
normal-route audit. Record exact counts, failures and limitations.

Check 320/390/599/600/744/767/768/1024/1199/1200/1440, both themes, long content,
scrolling to final actions, enlarged text, keyboard, reduced motion, rapid open/
close, drag reversal/cancellation and sync handoff. Real gesture feel, screen
readers, Safari/Firefox, physical devices, installed PWA and virtual keyboard/
safe areas remain separate manual checks unless actually performed.

Update MASTER, PROGRESS and a ranked P0–P3 review. Save synthetic evidence under
ignored `evidence/r2-4/after/`. Do not force-add evidence or create GitHub issues.
Prior P1 open-Select/menu `aria-hidden-focus` and heading/region findings remain
open. Earlier short dropdown rows, R1.4 feel checks, Vitals/Crisis checks, backend
acknowledgement work and Sunday appointment lifecycle findings remain separate.
Never inspect real-patient or third-party reference directories (`01-current-ui`,
`02-design-references`).
