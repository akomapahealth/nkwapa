Continue the Nkwapa "Layered Clinical Workspace" UI refresh. Direct mode (no learning gates). Frontend only.

## Where things stand (2026-11-08)

- R0 is Completed. The owner approved pilot v5: docs/design-system/ui-refresh/r0-pilot/index.html (artifact https://claude.ai/artifact/ESPAMmNxLt1caa2owyjSX5).
- Branch `ui-refresh/r1-1-tokens` has R1.1, R1.1b, R1.2 and R1.2b. All uncommitted, all in review. Do not commit or push unless I ask.
- PROGRESS.md Unit Log has one entry per unit with files, tests and evidence. R0-AUDIT §4 is the source of truth for token values. MASTER.md §3 to §8 mirrors it.
- Done so far:
  - R1.1 tokens:
    - Teal-tinted canvas #F2F7F7 with one white sheet, ink #19282E, muted #55666D, border #DBE4E6.
    - selected #E1F2F4, mint #E6F4F2, gold-surface, deep, faint. Dark canvas #0C1416, card #141D20.
    - Radius 4/6/8/12. Named screens 600/840/1200. Plex Mono.
  - R1.1b:
    - The Keycloak login theme mirrors the tokens. The landing hero colours were retinted.
    - Docs updated: MASTER.md, apps/web/PRODUCT.md, docs/design/landing-page-redesign.md.
  - R1.2 controls:
    - Buttons are flat with semibold labels. Primary hovers to the new `--primary-hover` (188 100% 24% light, 188 80% 56% dark).
    - `outline` and `secondary` are the white-fill + `--input` border secondary action (audit A4). Gold only via the `gold` variant.
    - Input and SelectTrigger are 48px under `pointer: coarse`, 44px otherwise. The Select menu radius is 8px.
  - R1.2b:
    - The API email layout (apps/api/src/notifications/templates/layout.ts, colour constants only, owner approved) and the Keycloak email .ftl were retinted together.
    - Tailwind `future.hoverOnlyWhenSupported` is on.
    - Dark `*-foreground` on fills is the dark canvas 192 29.4% 6.7%.
    - The popup axe helper in e2e/accessibility.spec.js now waits for finite animations. It used to race the Select fade-in.
- Verified:
  - design:check-tokens 28/28 (new primary label pairs) and its unit test 4/4. tsc clean, Prettier clean.
  - API notifications jest 195/195.
  - Route audit 12/12 with 0 axe violations and 0 overflow (228 rows).
  - e2e passing: login-theme, landing, public-routes, accessibility (x3), dark-mode, design-foundations, responsive-components, stale-refresh, info-hint.
  - Emulated touch: inputs and selects measure 48px.
- Evidence: before ui-refresh/evidence/r0/before/. After r1-1/after/ and r1-2/after/. The R1.2 after set is the "before" for R1.3.

## Task: R1.3 Panel surface + StatusLabel/Badge unification

Scope from R0-AUDIT §9 (`card, badge, status-label`) and the audit findings:

- A8: the queue BP column uses the same red badge for Stage 1 and Stage 2.
  - Build a severity scale with separate tokens: normal neutral, Stage 1 warning, Stage 2 stronger warning, crisis destructive.
  - Classification logic must stay unchanged. Only the presentation mapping changes.
- Gold is an accent, never a state.
  - Badge `secondary` is gold today. It is used on station-setup name chips, "Suggested match", "Closed" and portal chips.
  - Move state uses to neutral or selected tags (pilot `.tag-info`, `.tag-neutral`). Keep gold only for "new" highlights (`--gold-surface` / `--gold-ink`).
- Panel surface: the pilot's one white sheet with bordered panels (A1, A2).
  - Define the Card/panel primitive only, at 8px radius with `--border`, no card stacks.
  - Do not restyle page layouts yet (that is R2/R3).
- Tags: 24px tall, 4px radius, 12.5px semibold (pilot `.tag`).
  - `rounded-full` badges at call sites are circles-for-pills, which the radius rule forbids. List them first, then decide with me whether to strip them in this unit.

Before editing:

- Read R0-AUDIT §4 to §6, master §9.1 (motion), and the pilot's `.tag`, `.ticket`, `.readout` and panel styles.
- Read components/ui/{badge,card,status-label}.tsx and components/patients/chart/ChartStatusBadge.tsx.
- Find the BP badge mapping in the queue code; do not touch its classifier.
- Grep apps/web/e2e for every badge text, class or colour you change.

Run the impeccable craft floor + detector, web-design-guidelines and accessibility skills, and say which ran. Take after shots with the route audit harness into ui-refresh/evidence/r1-3/after/. Add the PROGRESS entry.

## Still open (not R1.3)

- Real-device check of the 48px touch height (emulation only so far).
- Login page and Keycloak form on a sheet: R5 layout.
- Some small inline triggers (help icons) are 20 to 24px with pseudo-element 44px targets (MASTER §8). Fine, but re-check when R1.4/R1.5 touch them.

## Rules that still apply

- Don't touch APIs, the database, auth, permissions, clinical logic, validation or offline sync semantics. The email colour constants were a one-off approval. Don't add product features. Don't create GitHub issues.
- docs/design-system/ui-refresh/references/01-current-ui and 02-design-references are git-ignored (real patient data / third-party). Never commit, crop, upload or cite them. Use synthetic shots only.
- Never print env values or route credentials through the session.
- Jest: max 2 workers. Don't run a bare full e2e; use the low-memory recipe from memory.
- I'm working in the main checkout, so the local Keycloak serves this checkout's theme directly.

## Route audit harness (throwaway DB nkwapa_audit exists and is seeded)

The new session has a different scratchpad, so recreate two files there.

S/audit-env.sh:

- the CI FEATURE*\* and NEXT_PUBLIC_FEATURE*\* flags from ci.yml (medical history, medication reconciliation, clinical notes, guided chronic tabs, PWA install, station workflow)
- RATE*LIMIT*{AUTH_ME,AUTH_WHOAMI,DEFAULT,SYNC_PULL,SYNC_PUSH}\_LIMIT=100000
- EMAIL_PROVIDER=nodemailer SMTP_HOST=localhost SMTP_PORT=1025 EMAIL_FROM=info@akomapa.org EMAIL_DELIVERABILITY_ALLOWED_DOMAINS=nkwapa.local MAILPIT_BASE_URL=http://localhost:8025
- export APP_DATABASE_URL="${APP_DATABASE_URL%/nkwapa}/nkwapa_audit"
  (The DB user is nkwapa_app, so a `%/nkwapa*` pattern corrupts the URL. Never print it.)

S/env.sh:
cd <repo>; set -a; . ./.env 2>/dev/null; set +a; . S/audit-env.sh
export DATABASE_URL=postgresql://nkwapa:nkwapa@localhost:5433/nkwapa_audit
case "$APP_DATABASE_URL$DATABASE_URL" in _@_/nkwapa_audit*/nkwapa_audit) ;; *) echo BAD-DB; exit 1;; esac
cd apps/web

Then:
. S/env.sh && NODE_OPTIONS=--max-old-space-size=3072 npm run build
. S/env.sh && WEB_DIR=$PWD EVIDENCE_DIR=S/audit SHOTS_DIR=<abs evidence dir> npx playwright test -c ../../docs/design-system/route-audit/route-audit.config.cjs --workers=1 --reporter=line

Notes:

- Any targeted e2e runs the same way: `. S/env.sh && npx playwright test e2e/<spec> ... --workers=1`.
- A scratch spec must live inside the repo to resolve @playwright/test. Delete it afterwards.
- If nkwapa*audit is missing: createdb, db:migrate:deploy, then seed with SEED_ENVIRONMENT=local and SEED_SAMPLE*{APPOINTMENTS,DUPLICATES,IDENTITY,PATIENT,CROSS_CLINIC}=true.
