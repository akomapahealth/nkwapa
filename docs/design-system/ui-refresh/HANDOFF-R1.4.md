Continue the Nkwapa "Layered Clinical Workspace" UI refresh. Direct mode (no learning gates). Frontend only.

## Where things stand (2026-11-08)

- R0 is Completed. The owner approved pilot v5: docs/design-system/ui-refresh/r0-pilot/index.html (artifact https://claude.ai/artifact/ESPAMmNxLt1caa2owyjSX5).
- Branch `ui-refresh/r1-1-tokens` has R1.1, R1.1b, R1.2, R1.2b and R1.3. All uncommitted, all in review. Do not commit or push unless I ask.
- PROGRESS.md Unit Log has one entry per unit with files, tests and evidence. R0-AUDIT §4 is the source of truth for token values. MASTER.md §3 to §8 mirrors it.
- R1.1 to R1.2b: see PROGRESS.md (tokens, Keycloak and email retint, flat buttons, 48px touch controls, hover only where hover exists).
- R1.3 (done, in review):
  - Badge is the pilot `.tag`: min 24px, 4px radius, 12.5px semibold, no shadow or hover, wraps rather than overflows.
  - `secondary` is neutral (was gold). New `info` (selected or suggested), `gold` ("new" highlights only, unused so far) and `severe`.
  - A8 severity scale, one map `HYPERTENSION_BADGE_VARIANTS` in lib/hypertension.ts: Normal and Elevated neutral, Stage 1 warning, Stage 2 severe, Crisis filled destructive. It feeds `statusVariant()` (queue BP column, dashboards), the hypertension history panel and the station results summary.
  - The dashboard chart `HYPERTENSION_TONES` follows it for the stages (new `--severe` bar fill). Classifier untouched.
  - New tokens `--severe`, `--severe-ink`, `--severe-surface`.
  - Card is the 8px bordered panel with no shadow. Never nest a Card in a Card.
  - Every `rounded-full` tag stripped: 24 Badge call sites, then 4 more on `AppointmentStatusBadge` and `AppointmentRequestStatusBadge` that critique found.
  - `AppPageHeader` puts badges in their own wrapping row, so a tag no longer stretches to a full-width bar on phones.
  - Landing: CareTeamSection deck now shows each role's own dashboard (public/dashboards/{volunteer,doctor,manager}.png, 3840x2160, dark, synthetic demo clinic). public/mobile.png is the volunteer dashboard at 808x1744. desktop.png unchanged (ProductShowcase markers are measured from it).
- Verified for R1.3:
  - design:check-tokens 38/38 and unit 4/4; check-chart-palette passes; tsc, ESLint and Prettier clean; jest 2 workers green.
  - Route audit 12/12, 228 rows, 0 axe violations, 0 overflow.
  - e2e: shared-components, accessibility, dark-mode, design-foundations, responsive-components, hypertension-assessment, research-schedules and landing all pass.
  - appointments: 40/42. See "Known red" below.
- Impeccable: all sub-commands are pinned as standalone skills in ~/.claude/skills (`/audit`, `/critique`, `/polish`, `/harden`, `/adapt`, `/layout`, `/typeset`, `/animate` is the separate animate skill, ...). R1.3 ran audit (detector), critique (two isolated sub-agents), polish and harden.
- Evidence: before r0/before/. After r1-1/after/, r1-2/after/, r1-3/after/. The R1.3 after set is the "before" for R1.4.

## Task: R1.4 SegmentedControl + Tabs

Scope from R0-AUDIT §9 (`app-shell/SegmentedControl`, `ui/tabs`) and §2.3:

- Today there are three looks for one job: "Day/Week" is a filled teal segment (appointments page), time windows ("30/90/180 days") are separate outlined buttons, and the patient profile uses underline tabs inside a bordered box. Unify to the pilot's segmented control: a raised white active segment on a `--surface-2` track.
- Gold must not be a selected state (the old yellow "Trends" pill is gone since R1.3; check nothing else uses gold for selection).
- Motion (master §9.1, R0-AUDIT §6 rules 5, 9, 16, 17, 20, 21, 23, 24):
  - The indicator moves with ease-in-out and may stretch up to 12% in the travel direction mid-move.
  - The active label colour is revealed with a `clip-path` mask, not per-letter colour tweens.
  - Shared layout via Motion `layoutId` (framer-motion is installed, used only in WelcomeTour.tsx).
  - Transform and opacity only. Interruptible. Nothing animates on keyboard repeat. Reduced motion keeps opacity only.
- Tabs keep their Radix semantics (roles, arrow keys, `aria-selected`). 44px target floor, 48px under `pointer: coarse` like the other controls.
- 9 files use SegmentedControl, 5 import ui/tabs. Grep apps/web/e2e for every label, role and class you change.

Before editing:

- Read R0-AUDIT §2.3, §6, master §9.1, the pilot's segmented control and tab styles, and MASTER §8 (touch targets).
- Read components/app-shell/SegmentedControl.tsx and components/ui/tabs.tsx and list every call site with its current look.

Run the impeccable craft floor + detector, `/critique` (isolated sub-agents), `/polish`, web-design-guidelines and accessibility skills, and say which ran. Take after shots with the route audit harness into ui-refresh/evidence/r1-4/after/. Add the PROGRESS entry.

## Decisions waiting for the owner (raise them, don't decide)

- "High glucose" in the queue is a filled destructive tag, the same weight as BP Crisis (app/(workspace)/queues/page.tsx `GlucoseFlag`). Critique rated this P1 (the A8 mistake in the next column). Changing it is a clinical-weight call.
- Station setup: the neutral kind tag sits after the "Name" label and reads like a second label (critique P2). Layout fix belongs to R3.2, unless the owner wants it sooner.
- Critique's question: should a Crisis reading also interrupt the flow (banner or required acknowledgement), not only show a tag? That would be a product feature, so it needs the owner's approval.

## Known red (not caused by the refresh)

- e2e/appointments.spec.js "lifecycle actions" (reschedule, cancel) fail locally on 2026-11-08. The fixtures are fresh: the seed itself creates the completed, cancelled and no-show rows. On a Sunday the only actionable row in the week view is the last row on the page, and the fixed chat launcher (`data-testid="chat-toggle"`) intercepts the click on its actions button. Playwright says so verbatim.
  - Real UI issue: the workspace has no bottom space reserved for the floating chat button, so it can cover the last row's action (WCAG 2.4.11 focus-not-obscured too).
  - Fix candidate for R2 (shell): bottom padding equal to the launcher's height plus gap on the main scroll area.
  - Re-run on a weekday to confirm the date dependence.

## Still open (not R1.4)

- Real-device check of the 48px touch height (emulation only so far).
- Login page and Keycloak form on a sheet: R5 layout.
- Small inline triggers (help icons) at 20 to 24px with 44px pseudo-targets (MASTER §8): re-check when R1.5 touches them.
- The route-audit seed never renders BP tags or a populated queue at 1440, so the A8 colours have no screenshot evidence. Seeding one encounter per stage in nkwapa_audit would fix that (local throwaway DB only).

## Rules that still apply

- Don't touch APIs, the database schema, auth, permissions, clinical logic, validation or offline sync semantics. Don't add product features. Don't create GitHub issues.
- docs/design-system/ui-refresh/references/01-current-ui and 02-design-references are git-ignored (real patient data / third-party). Never commit, crop, upload or cite them. Use synthetic shots only.
- Never print env values or route credentials through the session.
- Jest: max 2 workers. Don't run a bare full e2e; use the low-memory recipe from memory.
- I'm working in the main checkout, so the local Keycloak serves this checkout's theme directly.

## Route audit harness (throwaway DB nkwapa_audit exists and is seeded)

The new session has a different scratchpad, so recreate two files there.

S/audit-env.sh:

- the CI FEATURE*\* and NEXT_PUBLIC_FEATURE*\* flags from ci.yml (medical history, medication reconciliation, clinical notes, guided chronic tabs, station workflow; plus NEXT_PUBLIC_FEATURE_PWA_INSTALL_ENABLED)
- RATE*LIMIT*{AUTH_ME,AUTH_WHOAMI,DEFAULT,SYNC_PULL,SYNC_PUSH}\_LIMIT=100000
- EMAIL_PROVIDER=nodemailer SMTP_HOST=localhost SMTP_PORT=1025 EMAIL_FROM=info@akomapa.org EMAIL_DELIVERABILITY_ALLOWED_DOMAINS=nkwapa.local MAILPIT_BASE_URL=http://localhost:8025
- export APP_DATABASE_URL="${APP_DATABASE_URL%/nkwapa}/nkwapa_audit"
  (The DB user is nkwapa_app, so a `%/nkwapa*` pattern corrupts the URL. Never print it.)

S/env.sh (source it; use `return`, not `exit`, on the guard so a bad DB does not kill the shell):
cd <repo>; set -a; . ./.env 2>/dev/null; set +a; . S/audit-env.sh
export DATABASE*URL=postgresql://nkwapa:nkwapa@localhost:5433/nkwapa_audit
case "$APP_DATABASE_URL$DATABASE_URL" in *@\_/nkwapa_audit*/nkwapa_audit) ;; *) echo BAD-DB; return 1;; esac
cd apps/web

Then:
. S/env.sh && NODE_OPTIONS=--max-old-space-size=3072 npm run build
. S/env.sh && WEB_DIR=$PWD EVIDENCE_DIR=S/audit SHOTS_DIR=<abs evidence dir> npx playwright test -c ../../docs/design-system/route-audit/route-audit.config.cjs --workers=1 --reporter=line
AUDIT_ROLES=staff,volunteer limits the identities for a quicker re-check.

Notes:

- Any targeted e2e runs the same way: `. S/env.sh && npx playwright test e2e/<spec> ... --workers=1`.
- A scratch spec must live inside the repo to resolve @playwright/test. Delete it afterwards.
- Landing screenshots: a scratch spec beside route-audit.spec.js with `storageStateFor(role)`, viewport 1920x1080 (phone 404x872), deviceScaleFactor 2, and before navigating set localStorage `nkwapa-theme=dark` and `nkwapa.sidebar.collapsed=false`.
- Appointment fixtures: re-seeding alone skips them. Delete the "Appointment Demo" patient first (see memory), then `SEED_ENVIRONMENT=local SEED_SAMPLE_APPOINTMENTS=true npm run db:seed` from the repo root with S/env.sh sourced.
- If nkwapa*audit is missing: createdb, db:migrate:deploy, then seed with SEED_ENVIRONMENT=local and SEED_SAMPLE*{APPOINTMENTS,DUPLICATES,IDENTITY,PATIENT,CROSS_CLINIC}=true.
