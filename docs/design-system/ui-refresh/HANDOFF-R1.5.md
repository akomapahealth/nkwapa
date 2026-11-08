Continue the Nkwapa "Layered Clinical Workspace" UI refresh. Direct mode (no learning gates). Frontend only.

## If you are not Claude Code (e.g. Codex)

- Skip the steps that need Claude's tooling, and write in the PROGRESS entry what you did instead:
  - `/critique`, `/polish`, web-design-guidelines and accessibility are Claude skills. Do a written self-review instead: hierarchy, consistency, touch targets, focus, motion rules, a11y semantics, dark mode, edge cases. Ranked P0 to P3, each fixed or deferred with a reason.
  - The "isolated sub-agent" critique is Claude-only.
  - The impeccable detector is a plain Node script and works anywhere it exists: `node ~/.claude/skills/impeccable/scripts/detect.mjs <files>`. Silent with exit 0 means no findings. If the path is missing, say so.
- "Memory" in older handoffs means Claude's private notes. Everything needed from them is in the "Low-memory e2e recipe" and "Reset the appointment fixtures" sections below.
- The pilot artifact link is claude.ai-only. The same pilot is in the repo at `ui-refresh/r0-pilot/index.html`.
- Read `apps/web/AGENTS.md` first: this Next.js version differs from older training data (docs in `node_modules/next/dist/docs/`).
- Work on branch `ui-refresh/r1-1-tokens`. Commit per unit with a message that names the unit. Never push unless the owner asks.

## Where things stand (2026-11-08)

- R0 is Completed. The owner approved pilot v5: docs/design-system/ui-refresh/r0-pilot/index.html (artifact https://claude.ai/artifact/ESPAMmNxLt1caa2owyjSX5).
- Branch `ui-refresh/r1-1-tokens` has R1.1, R1.1b, R1.2, R1.2b, R1.3, R1.3b, R1.4 and R1.4b, committed together on 2026-11-08 and in review. Not pushed. Do not push unless I ask.
- PROGRESS.md Unit Log has one entry per unit with files, tests and evidence. The Decision Log has the owner's 2026-11-08 decisions. R0-AUDIT §4 is the source of truth for token values. MASTER.md §3 to §8 mirrors it.
- R1.4 (done, in review):
  - `SegmentedControl` (view and filter) is the pilot `.seg`: a `--surface-2` track, a raised `--card` knob and the active label in `--primary`. It stays toggle buttons with `aria-pressed`.
    - The knob is a shared Motion `layoutId` (`layoutDependency` = value). It moves in 220ms `--ease-in-out` and stretches to 1.12 on x mid-move.
    - The label colour is wiped in by `clip-path`.
    - Only the change a pointer press made animates.
    - Four options sit 2x2 on a phone.
  - `Tabs` (record sections) is the pilot `.tabs`: rule, ink label and a 2px primary underline.
    - The underline is a shared `layoutId` that snaps on arrow keys.
    - Weight stays 500.
    - `TabsList` brings its own `overflow-x-auto` `layoutScroll` wrapper and never wraps.
    - Focus rings are inset on both.
  - Trends "30/90/180 days" and the My assigned status filter moved onto SegmentedControl.
  - MASTER §8 has the "Segmented controls and tabs (R1.4)" contract.
- R1.4b (done, in review), owner decisions:
  - "High glucose" stays filled destructive. No change.
  - The station setup kind tag moved out of the "Name" label into the row header. The first grid column is fixed at 19rem from `lg`.
  - A Crisis BP reading (180/120 or higher, classifier unchanged) interrupts staff vitals entry.
    - After `VitalsForm` saves, `confirmAction({ acknowledgeOnly: true })` opens an `alertdialog` with one button, and Escape is ignored.
    - It is awaited inside `handleSave`, so the page's next step waits. The reading is always saved first.
    - The patient portal is excluded (the owner wants a clinician to write the wording).
  - Recording the acknowledgement is NOT built. It needs an API endpoint plus sync ordering: `ui-refresh/TASK-crisis-acknowledgement.md`. That is a separate backend branch, not this one.
- Impeccable: sub-commands are standalone skills in ~/.claude/skills (`/audit`, `/critique`, `/polish`, `/harden`, `/adapt`, `/layout`, `/typeset`; `/animate` is the separate animate skill). The detector is `node ~/.claude/skills/impeccable/scripts/detect.mjs <files>` (silent with exit 0 = no findings).
- Evidence: after sets in r1-1/, r1-2/, r1-3/ and r1-4/ under ui-refresh/evidence/. The r1-4/after set (114 shots) is the "before" for R1.5.

## Task: R1.5 Popover, Dropdown and Select motion

Scope from R0-AUDIT §9: "Popover/Dropdown/Select motion from trigger, exits 20% shorter". Files are `components/ui/dropdown-menu.tsx`, `select.tsx`, `tooltip.tsx` and `combobox.tsx`. There is no `ui/popover.tsx`; check whether combobox or others use Radix Popover directly.

Rules (R0-AUDIT §6 rules 1, 2, 10, 11, 12, 15, 21, 23, 24, 26; master §9.1):

- Enter 200ms `--ease-out` from `scale(.95)` + opacity 0. Exit 160ms (20% shorter), back to the trigger.
- `transform-origin` is Radix's `--radix-{dropdown-menu,select,popover,tooltip}-content-transform-origin`, so menus grow out of their button and collapse back into it.
- Tooltips: 150 in, ~120 out, and `skipDelayDuration` so scanning icons is not slowed once one is open (rule 26).
- Transform and opacity only, never `ease-in`, interruptible. Reduced motion keeps opacity only. The global clamp in globals.css is 0.01ms for everything, so check it does not also kill the opacity fade if that matters.
- Nothing animates on actions repeated many times a day. Decide whether keyboard-opened menus should animate, and say why.
- The pilot's values are at r0-pilot/index.html lines ~469 to 490 (`.pop`, `dialog.sheet`, `--d-exit`, `--d-base`).

Known starting point:

- dropdown-menu and tooltip use tailwindcss-animate (`animate-in`, `zoom-in-95`, `fade-in-0`).
- Tooltip already sets the transform origin and runs 150/100.
- Select content (`select.tsx:71`) needs checking for origin and exit.
- Prefer tokens (`duration-base`, `ease-out-strong`) over raw values. Add an exit-duration token only if more than one primitive needs it.

Before editing:

- Read R0-AUDIT §6, master §9.1, MASTER §7 (motion) and §8, and the pilot's popover CSS.
- List every consumer of each primitive (grep imports) and any call site that overrides its animation classes.
- Grep apps/web/e2e for anything that waits on these menus (`getByRole('menu')`, `option`, `listbox`, tooltip text). A longer exit can make "toHaveCount(0)" assertions race.

Run the impeccable detector, `/critique` (isolated sub-agent), `/polish`, web-design-guidelines and accessibility skills, and say which ran.

Motion cannot be proven by static shots. Verify it in a browser:

- the open and close origin of a header menu, a row action menu and a Select,
- reduced motion,
- a keyboard-opened menu.

Take after shots with the route audit harness into ui-refresh/evidence/r1-5/after/. Add the PROGRESS entry.

## Still open (not R1.5 unless noted)

- Crisis acknowledgement recording: backend task, see TASK-crisis-acknowledgement.md. The offline design is still open.
- R1.4b e2e "no second alert on re-save" check is weak: the same status text shows on both saves. Tighten it if you touch station-redesign.spec.js.
- Motion from R1.4 has not been checked by hand in a browser: the knob stretch, the mask wipe, and the underline in a scrolled tab row at 390.
- The encounter Vitals tab and the new-encounter page have not been seen with the Crisis dialog in a browser (same component, but untested there).
- Real-device check of the 48px touch height (emulation only so far).
- Small inline triggers (help icons) at 20 to 24px with 44px pseudo-targets (MASTER §8): R1.5 touches tooltips, so re-check them now.
- The route-audit seed never renders BP tags or a populated queue at 1440, so the A8 colours have no screenshot evidence. Seeding one encounter per stage in nkwapa_audit would fix that (local throwaway DB only).
- Login page and Keycloak form on a sheet: R5 layout.
- Floating chat launcher covers the last row's action. Fix candidate for R2: bottom padding on the main scroll area.
- After R1.5: R1.6 DataTable header and row surfaces plus the card-render slot for narrow widths, then R2 shell.

## Known red (not caused by the refresh)

- e2e/appointments.spec.js "lifecycle actions" (reschedule, cancel) fail locally on a Sunday. Playwright says the fixed chat launcher (`data-testid="chat-toggle"`) intercepts the click on the last row's actions button. Re-run on a weekday to confirm the date dependence.
- Jest test count moves between runs on unchanged code (1002, 1012 and 1013 seen; suites stay green). Not from the refresh. Worth finding which suite generates a variable number of cases.

## Rules that still apply

- Don't touch APIs, the database schema, auth, permissions, clinical logic, validation or offline sync semantics. Don't add product features (R1.4b's Crisis dialog was an explicit owner exception). Don't create GitHub issues.
- docs/design-system/ui-refresh/references/01-current-ui and 02-design-references are git-ignored (real patient data / third-party). Never commit, crop, upload or cite them. Use synthetic shots only.
- Never print env values or route credentials through the session.
- Jest: max 2 workers (a bare full jest run froze the Mac). Don't run a bare full e2e; use the low-memory recipe below. Station specs: exclude the #197 offline tests with `--grep-invert "#197"`.
- I'm working in the main checkout, so the local Keycloak serves this checkout's theme directly.
- Radix components do not render under jest here (root-hoisted React). Mock the primitives as `confirm-dialog.test.tsx` and `toast.test.tsx` do.

## Route audit harness (throwaway DB nkwapa_audit exists and is seeded)

The new session has a different scratchpad, so recreate two files there (S = the scratchpad path).

S/audit-env.sh:

    for n in CLINICAL_NOTES GUIDED_CHRONIC_TABS MEDICAL_HISTORY MEDICATION_RECONCILIATION STATION_WORKFLOW; do
      export FEATURE_${n}_ENABLED=true NEXT_PUBLIC_FEATURE_${n}_ENABLED=true
    done
    export NEXT_PUBLIC_FEATURE_PWA_INSTALL_ENABLED=true
    for n in AUTH_ME AUTH_WHOAMI DEFAULT SYNC_PULL SYNC_PUSH; do export RATE_LIMIT_${n}_LIMIT=100000; done
    export EMAIL_PROVIDER=nodemailer SMTP_HOST=localhost SMTP_PORT=1025 EMAIL_FROM=info@akomapa.org EMAIL_DELIVERABILITY_ALLOWED_DOMAINS=nkwapa.local MAILPIT_BASE_URL=http://localhost:8025
    export APP_DATABASE_URL="${APP_DATABASE_URL%/nkwapa}/nkwapa_audit"

(The DB user is nkwapa_app, so a `%/nkwapa*` pattern corrupts the URL. Never print it.)

S/env.sh (source it; `return`, not `exit`, on the guard):

    cd /Users/nanaagyei/Documents/Codes/Projects/nkwapa; set -a; . ./.env 2>/dev/null; set +a; . S/audit-env.sh
    export DATABASE_URL=postgresql://nkwapa:nkwapa@localhost:5433/nkwapa_audit
    case "$APP_DATABASE_URL$DATABASE_URL" in *nkwapa_audit*nkwapa_audit) ;; *) echo BAD-DB; return 1;; esac
    cd apps/web

Then:

    . S/env.sh && NODE_OPTIONS=--max-old-space-size=3072 npm run build
    . S/env.sh && WEB_DIR=$PWD EVIDENCE_DIR=S/audit SHOTS_DIR=<abs evidence dir> npx playwright test -c ../../docs/design-system/route-audit/route-audit.config.cjs --workers=1 --reporter=line

- `AUDIT_ROLES=staff,manager` limits the identities. Station setup is a staff route.
- Summarise with: `node -e` over `S/audit/route-audit.json`; rows have `violations` (count) and `overflowX` (bool).
- Targeted e2e: `. S/env.sh && npx playwright test e2e/<spec> --workers=1 --reporter=line`. Pipe through `grep -v WebServer`, because the API logs every request.
- A scratch spec must live inside the repo to resolve @playwright/test. Delete it afterwards.
- Landing screenshots: a scratch spec beside route-audit.spec.js with `storageStateFor(role)`, viewport 1920x1080 (phone 404x872), deviceScaleFactor 2, and before navigating set localStorage `nkwapa-theme=dark` and `nkwapa.sidebar.collapsed=false`.
- Appointment fixtures: see "Reset the appointment fixtures" below.
- If nkwapa*audit is missing: createdb, db:migrate:deploy, then seed with SEED_ENVIRONMENT=local and SEED_SAMPLE*{APPOINTMENTS,DUPLICATES,IDENTITY,PATIENT,CROSS_CLINIC}=true.

## Low-memory e2e recipe (8 GB Mac)

Never run the full e2e suite locally. Run only the specs a change can reach, in one Playwright invocation.

1. **Choose specs by text, not by screen.** For every label, placeholder, heading, role or class you changed, run `grep -rn "<old text>" apps/web/e2e apps/web/playwright`. Run every spec that matches. A placeholder change once broke three unrelated specs in CI and stalled the run for 3 hours.
2. **Build once with the flags** (S/env.sh sets them): `NODE_OPTIONS=--max-old-space-size=3072 npm run build` in apps/web. `NEXT_PUBLIC_*` flags are baked in at build time. Rebuild only when web source or flags change. A spec-only edit needs no rebuild.
3. **Run everything in one invocation, in the background:** `npx playwright test <spec> <spec> --workers=1 --reporter=line > log 2>&1`, then grep the log. Add `--max-failures=3` to stop early, and `-g "<title>"` for one test.
4. **Watch for these traps:**
   - macOS has no `timeout`. `timeout 900 npx …` exits instantly and looks like a pass.
   - Station specs skip themselves without the station flag, so a "pass" in a non-station build means nothing.
   - A full local run flakes about 1 spec. Re-run that file alone before blaming a change.
   - Re-runs eat fixtures. See below.

## Reset the appointment fixtures

`npm run db:seed` alone does NOT restore consumed appointment fixtures. `seedSampleAppointments` checks that the demo patient (`firstName: 'Appointment', lastName: 'Demo'`) exists, not the appointments, so it reports "already exist; skipping". Delete that patient (appointments cascade), then re-seed.

- The delete needs the system-admin flag, or row-level security blocks it: `new PrismaPg({ connectionString: process.env.DATABASE_URL, options: '-c app.is_system_admin=true' })`, then `prisma.patient.deleteMany({ where: { firstName: 'Appointment', lastName: 'Demo' } })`.
- Run that script from inside the repo, so Node resolves `@prisma/client`, with S/env.sh sourced so DATABASE_URL is the audit DB.
- Then, from the repo root with S/env.sh sourced: `SEED_ENVIRONMENT=local SEED_SAMPLE_APPOINTMENTS=true npm run db:seed`.
- Seed flags must be the string `true`. `=1` silently skips.
- `patient-claim.spec.js` also consumes its fixture. `SEED_SAMPLE_IDENTITY=true npm run db:seed` restores it.
- The `lifecycle actions` failures are not a fixture problem (see Known red).
