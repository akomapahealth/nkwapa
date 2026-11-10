# Handoff: R3.1 volunteer dashboard

Continue the frontend-only Layered Clinical Workspace refresh on
`ui-refresh/r1-1-tokens`. The owner suspended learning guardrails for this sequence.
Implement one unit, R3.1, validate, review, update documentation and commit locally.
Do not push. Inspect status/history and preserve unrelated work.

## Starting point

Read `apps/web/AGENTS.md`, relevant installed Next docs, `R0-AUDIT.md` sections
4–6, 8–9, `../MASTER.md`, the latest `../PROGRESS.md` entry and `R2.5-REVIEW.md`.
Use the approved live artifact and checked-in `r0-pilot/index.html` as visual
authority. Use synthetic data only. Never inspect real-patient or third-party
reference directories `01-current-ui` or `02-design-references`.

R2.1–R2.4 staff geometry, permission-derived navigation, compact Header, sync
states, Sheet gestures and focus contracts remain intact. R2.5 adds patient phone
BottomNav with Overview, My Health, Appointments and More, top tabs from 600px,
compact clinic/role context, and conditional sync recovery access. Patient draft
state stays mounted across widths. Preserve the existing route labels and
permissions; account/settings continue to use the patient's shell.

## Task: R3.1 only

R0 task: Volunteer dashboard, with Start shift through the existing shift action
(D2) and the approved illustration (D4). Inspect the actual dashboard, its role
composition, NeedsYouNow, existing shift read/action, station workflow flag and
all consumers before choosing the implementation. Reuse the existing shift
contract. Do not invent counts, patient names, workflows, endpoints or status.

Read the complete D4 and section 8.1 illustration/Lottie constraints. Round-3
and round-4 decisions supersede the first concept. The pilot's greeting band,
contour/wave treatment, inline divided metrics and next steps are presentational
references; all content and actions must come from existing data and permissions.
Do not implement R3.2 station content or redesign doctor/manager/director/admin
content within this unit. Shared changes must preserve their behavior.

Keep approved tokens, 44px targets, visible focus, both themes, reduced motion,
long-content handling, safe areas, chat clearance and enlarged text. Clinical
copy, validation, queue/auth/permission logic and backend Crisis acknowledgement
remain outside scope.

## Validation and operations

Use the isolated audit database and exact flags/guards under “Route audit
harness” and “Low-memory e2e recipe” in `HANDOFF-R2.1.md`. Recreate scratch scripts
as needed; never print credentials. Apply the exact
`${APP_DATABASE_URL%/nkwapa}/nkwapa_audit` replacement and guard each URL.
Escalate sandbox compilation/binding restrictions instead of changing product
code. Build once per final source/flag state, not for spec-only edits.

Search changed labels/roles/classes and shared consumers before choosing focused
specs. Never run the full e2e suite. Use one worker, at most three failures and
redirected API output. Jest uses at most two workers. Run TypeScript, changed-file
lint/formatting, detector, focused regressions and the six-role normal-route audit.
Record exact counts, failures and coverage limits in a ranked P0–P3 review and
PROGRESS. Check all established boundary widths, keyboard, both themes, enlarged
text, reduced motion, final-action access and retained state.

Update MASTER and PROGRESS and write a ranked review plus the next handoff. Save
synthetic evidence under ignored `evidence/r3-1/after/`; do not force-add it or
create GitHub issues. Prior open-Select/menu accessibility findings, short dropdown
rows, physical gesture checks, Vitals/Crisis/backend acknowledgement and Sunday
appointment lifecycle findings remain separate. Physical devices, screen readers,
Safari/Firefox, installed PWA, virtual keyboard and real safe areas remain manual
unless actually performed.
