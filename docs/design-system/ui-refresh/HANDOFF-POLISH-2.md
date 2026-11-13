# Handoff: Polish 2 (settings redesign, note previews, critique sweep, then W4)

Continue the frontend refresh of the Nkwapa EMR (`apps/web`) on branch `ui-refresh/r1-1-tokens`.
Direct mode: the owner has suspended the learning guardrails for this project, so build, do not
teach. Commit locally after each unit with a clear message ending in
`Co-Authored-By: <your model> <noreply@...>`. **Never push.**

## 0. Ground rules (read before touching anything)

- Read `apps/web/AGENTS.md` (this Next.js version differs from training data; check
  `node_modules/next/dist/docs/` before using a Next API), `apps/web/PRODUCT.md`,
  `docs/design-system/MASTER.md` (sections 4.3 dark, 5.4 form dialogs, 8.1 states, 9.1 motion,
  10.1 focus, 11.1 performance, "Role homes (W2)", "Lists (W3)"), and `W3-POLISH-REVIEW.md`.
- `references/01-current-ui` holds real patient data. Never open, cite, upload or commit it.
  Screenshots come from seeded or synthetic data only.
- Never print or echo env values or credentials. Load env with
  `set -a && . <env file> >/dev/null 2>&1; set +a`, never `export $(...)`.
- Volunteers are clinicians: never gate plan, classification or prescribing to doctors.
- Do not change offline behaviour, permissions or API contracts unless a unit below says so. The
  owner has approved the API changes in units 2 and 5 only.
- No em dashes in user-facing copy. Sentence case for buttons, headings, tabs and nav.
- Dates: use `formatOpsDay` / `formatOpsDateTime` / `formatOpsTime` from `@/lib/ops`. Date-only
  values (`YYYY-MM-DD`) go through `formatOpsDay(`${d.slice(0, 10)}T12:00:00Z`)` so no zone moves
  the day. Never show raw ISO dates or raw enum values (`TOBACCO`, `PENDING_COSIGN`).
- The record and list style is **ruled**: `RecordSection` (`border-t-2 border-rule-strong`) with
  rows separated by `border-b border-rule`, not boxed `Card`s. One visible action per row; extra
  actions go in a `DropdownMenu`. Header descriptions are one line under about 70 characters.
- Lint rules that bite: no ref writes during render (`react-hooks/refs`); no `Date.now()` in render
  (`react-hooks/purity`; use `useState(Date.now)`).
- Never import the `@nkwapa/db` root in web code; use subpaths.

### Build, run and test

- Web build: `cd apps/web && NODE_OPTIONS=--max-old-space-size=3072 npm run build`.
- API build: `cd apps/api && npm run build`. Prisma client: `npx prisma generate` in
  `packages/db`, then `npm run build` there. Migrations: `npm run db:migrate:deploy` from the repo
  root.
- Jest always with `--maxWorkers=2`. An uncapped run froze the machine.
- Playwright: `SKIP_SETUP=1 npx playwright test <specs> --workers=1 --reporter=line`, one build,
  one invocation, one worker. Before changing any visible string, `grep -rn` it in `apps/web/e2e`
  and update the specs in the same commit.
- Known local noise: a full run flakes about one spec (rerun the file alone);
  `portal-shell` "held changes" flips between themes; the `#197` offline-copy tests fail locally
  (exclude with `-g "^(?!.*#197)"`).
- `git push` would run the whole suite; you are not pushing anyway.

## 1. Settings redesign (`/settings` and `/settings/clinic`)

Files: `apps/web/app/(workspace)/settings/page.tsx`,
`apps/web/components/settings/ClinicSettingsScreen.tsx`, `apps/web/app/(workspace)/account/page.tsx`,
`apps/web/components/account/NotificationsCard.tsx`.

Critique findings to fix:

- **Your settings** uses four boxed cards in a 2-column grid while every other screen is ruled.
  Rebuild it as ruled sections in one readable column (max width like the account page), in this
  order: Appearance, Notifications (alerts on this device), Install the app, This device, Account.
- Phone alerts (push) live only on `/account` (`NotificationsCard`, anchored `#notifications`).
  Settings is where people look for them. Either render `NotificationsCard` in Your settings and
  keep `/account` for profile details, or link to it clearly. Do not duplicate the push logic.
- "Install the app" always shows install instructions, even when Nkwapa is already installed
  (`useInstallAction` knows). Show the installed state instead.
- The Account card is mostly empty space with three equal buttons. "Log out" is the destructive
  action; keep it visually separate from "Manage profile" and "Take the tour".
- **Clinic settings** (owner decision: add clinic facts): the summary chips (Research mode,
  Approval policy, Last updated) repeat the two checkboxes directly below. Keep one source of
  truth. Add a "Clinic" section above the research rules with the clinic's name, time zone and
  measurement units (read from bootstrap / `useClinicUnits`), each with a link to where it is
  edited (`/admin/clinics` or the clinic metadata dialog) for people with that permission, and
  read-only text for everyone else. Do not add new write endpoints; reuse the existing ones.
- When "Research enabled" is off, the director-approval checkbox should be disabled with a reason.
- The disabled "Save settings" button gives no hint why. Show "No changes" or enable on change only
  with a visible reason.
- Check both pages at 1440, 1024, 744, 390 and 320, in light and dark mode.

E2E to update: `settings.spec.js`, plus anything a grep finds for changed strings.

## 2. Clinical note previews (approved API change)

Today the Notes tab (`components/clinical-notes/PatientClinicalNotesPanel.tsx`) lists notes with
date, status, author and cosign facts, but no content, so a doctor must open every note.

- API: the patient note list endpoint
  (`GET /clinics/:clinicId/patients/:patientId/clinical-notes`, in
  `apps/api/src/clinical-notes/`) returns `ClinicalNoteSummary`. Add a short `preview` field: the
  first ~160 characters of the **assessment** (owner approved showing it to every role that can
  read notes) (fall back to history), whitespace-collapsed, cut at
  a word boundary. Use the same permission and RLS checks the list already uses. Never include
  addenda text. Add a unit test in the service spec for the truncation and for a role without
  note-read access getting no preview.
- Web: update `lib/clinical-notes.ts` `ClinicalNoteSummary` and show the preview as one or two
  muted lines under each row's title (`line-clamp-2`).
- Notes are never cached offline (`ChartSectionOffline` says so). Keep it that way: do not write
  previews into IndexedDB.
- E2E: `clinical-notes.spec.js` should assert a preview appears for a submitted note.

## 3. Critique sweep of everything not yet improved

Run a heuristic critique (Nielsen's 10, 0 to 4 each, total out of 40, with persona checks for a
volunteer on a phone, a doctor between patients and a director at a laptop). Capture screenshots
from seeded data at 1440 and 390, in light and dark mode. Write the scores and findings to
`docs/design-system/ui-refresh/POLISH-2-CRITIQUE.md`, fix the findings, then rescore.

Already polished in the last pass (don't redo; only regressions): patient record tabs (Vitals,
Medications, Medical history, Notes, Visits, Consent), chat panel, `/notifications`, research
exports, `/audit` width.

Not yet critiqued; sweep these:

- **Patient record:** the Overview, Hypertension and Diabetes tabs, the Patient-reported tab
  (its empty-state body text is larger than the section description), and the profile header (the
  name, "Sex not recorded", and the badge row on phones).
- **Encounter screens:** `/encounters/[id]` tabs, the clinical note editor and the cosign flow,
  the care plan and prescription forms.
- **Data entry:** new patient, check-in, vitals form, the read-aloud interview (`InterviewFlow`),
  the HTN and DM screening forms, and the counselling form.
- **Lists not converted in W3:** Staff invitations, Appointments and appointment requests, Data
  requests. Convert them to `ListToolbar` plus the metric strip (MASTER "Lists (W3)").
- **Admin:** users, clinics, duplicates, cross-clinic investigation, staff activity, metrics,
  organization report and analytics.
- **Portal (patient role):** home, health, appointments, self-report entry.
- **Shell:**
  - The notifications bell on phones.
  - The More sheet.
  - The sync center sheet.
  - 320px header truncation, an open item from W3 polish.
- **Chat leftovers:**
  - On phones the panel floats above page content, and the close button overlaps the page. Try
    a full-height sheet below `compact`, keeping focus handling and Escape.
  - Group names and member lists need checking.
  - The conversation list rows show "2 members" where a last message would go.

Specific known items to include:

- **Medications tab:** "Not yet reconciled" on every row is noise when the whole list is
  unreconciled. Say it once at the list level.
- **Medical history tab:** every active row shows a green "Active" badge plus a category badge.
  Consider dropping the badge for the default status, or grouping rows under category subheads.
- **Research runs:** each run card is very tall (table chips, artifact path, details, rerun,
  download). Compact it to one summary row with the rest in "Run details".
- **Vitals trend chart:** the y-axis range clips readings near its edges, so check the domain.

## 4. Phase W4, Volunteer home (not started)

Follow `docs/design-system/ui-refresh/HANDOFF-W4.md` exactly. In short:

- `/dashboard` for a person whose main role is volunteer: keep `VolunteerWelcome` (34px greeting
  on phones, Refresh on the shift row), then the compact W1 station line, then a "Your clinic day"
  checklist backed only by real data and actions (start shift, take a patient, continue drafts
  with the real count).
- Move clinic-wide charts and the "Today at a glance" grid below the volunteer's own work, or off
  the page.
- Keep `DASHBOARD.READ`, refresh, the error, empty and offline states, and the W2 multi-role rule.
- Then write `W4-REVIEW.md` and a `PROGRESS.md` entry, update the `PHASE-W.md` progress, and fill
  the `PROGRESS.md` screen matrix rows for W1 to W4.
- Next comes R8.1 (`HANDOFF-R8.1.md`, full route audit), which was blocked until Phase W is done.
  Start it only if time remains, as its own commit.

Note: the `responsive-migration.spec.js` dashboard entry now waits for the greeting heading
(`/^good (morning|afternoon|evening)/i`), not "Today at a glance". Keep that when W4 changes the
page.

## 5. Version checks on screening saves (owner approved: warn, never silently overwrite)

Today HTN assessment, DM screening and vitals saves are last-write-wins with an audit trail
(`hypertension-assessment.service.ts`, `diabetes-screening.service.ts`,
`sync/clinical-measurements.service.ts`). Notes and counselling already use `expectedVersion`;
copy that pattern.

- API: accept an optional `expectedVersion` (or `expectedUpdatedAt` if the model has no version
  column; add a `version Int @default(1)` column with an idempotent migration if needed). When it
  is sent and does not match, return 409 with the current record and who saved it. When it is
  absent (old clients), keep today's behaviour.
- Online web forms: send the version they loaded. On 409, show a dialog: "<Name> saved this at
  <time> while you were editing", with "Review their version" (reload into the form, your unsaved
  values listed beside it) and "Save mine anyway" (resend without the check). Never drop input.
- Offline outbox replays: **do not block them.** A replay that carries a stale base version still
  applies (offline work must never be lost), but the server records `CONFLICT_OVERWRITTEN` in the
  audit log and sends an inbox notification (`PushService.notify`, new kind or `ASSIGNMENT`-style
  wording) to the person whose save was overwritten: "<Name>'s offline save replaced your
  hypertension assessment for <patient>. Review it." Check the sync telemetry `conflicts` counter
  still counts these.
- Tests: service specs for match, mismatch (409), absent version, and the offline replay path
  (applies plus notifies); one e2e with two browser contexts editing the same screening.
- Update the `InterviewFlow` hide-save path so a 409 there surfaces the same dialog on return.

## 6. Staging auth memory (infra, optional, no deploys)

Prod API and prod Keycloak are on paid instances. `release/dev` staging is still on the free tier,
and `nkwapa-auth-staging` (Keycloak) fails with "memory limit exceeded" (512 MB).
`infra/keycloak/Dockerfile` sets no JVM limits. Propose (as a PR-ready commit, not a deploy):

- `JAVA_OPTS_KC_HEAP="-XX:MaxRAMPercentage=65 -XX:InitialRAMPercentage=30"` (or an explicit
  `-Xmx320m -Xms128m`), `-XX:+UseSerialGC`, `KC_CACHE=local` (single node, no Infinispan
  clustering), and `KC_METRICS_ENABLED=false` / `KC_HEALTH_ENABLED=true` for staging only.
- Keep the prod settings unchanged unless measured. Document how to verify (container RSS after a
  login burst) and the Render env vars to set. Do not touch Render yourself.

## 7. For your review note (no action)

- A local load test of 1,000 requests at 200 concurrency gave no 5xx, p95 624 ms and 217 MB RSS
  on one API instance; prod API is now on a paid instance.
- Notification retention (read after 30 days, any after 90) is owner-approved.

## Order and definition of done

Do units 1, 2, 5, 3, 4, then 6 if time remains, in that order, one or more local commits each. For every unit, all of these
must hold:

- tsc is clean.
- Changed files pass lint and prettier.
- Jest passes (`--maxWorkers=2`).
- The focused Playwright specs pass.
- Screenshots at 1440 and 390, in light and dark mode, are checked by eye.
- A short review note is added to the unit's doc.

Report what you skipped and why.
