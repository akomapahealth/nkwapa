# Handoff: W4 Volunteer home

Continue the frontend-only refresh on `ui-refresh/r1-1-tokens`. Direct mode (no learning
guardrails, no teach-back). Implement **W4 only**, validate, write `W4-REVIEW.md`, a `PROGRESS.md`
entry, update `PHASE-W.md` progress, fill the `PROGRESS.md` screen matrix rows for every screen
Phase W touched (W1 to W4), and hand to R8.1 (`HANDOFF-R8.1.md`). Commit locally. Do not push.

Read first: `PHASE-W.md` (W4 row), `W3-REVIEW.md`, `W2-REVIEW.md` and `W1-REVIEW.md` (the pattern),
the pilot screen `r0-pilot/index.html` `#s-dashboard` and `evidence/r0/dashboard-*` (1440, 1024,
744, 390, 360, dark), MASTER sections 8.1, 10.1, 11.1, "Role homes (W2)" and "Lists (W3)", and
`apps/web/AGENTS.md`.

## Target (pilot)

- `/dashboard` for a person whose main role is `VOLUNTEER` (`pickMainRole`, W2). Today it renders
  `VolunteerWelcome` followed by the shared "Today at a glance" grid and clinic-wide charts.
- Greeting band (keep `VolunteerWelcome`: Accra greeting and date, sun/moon, Start shift via the
  existing shift action), then **the line** (the W1 station line, compact) and the **"Your clinic
  day" checklist** (pilot `#st1`..: start shift, take a patient, continue drafts with the real
  count, and so on; only steps backed by existing data or actions).
- Clinic-wide charts and the "Today at a glance" grid move below the volunteer's own work, or off
  the volunteer home if nothing there is theirs to act on. Do not invent data.
- Keep `DASHBOARD.READ`, refresh, error/empty/offline states, "Also on your plate" for a volunteer
  who holds no higher role (it is empty for them), and the W2 multi-role rule.

## Tests that name today's strings

Grep `e2e/` for every UI string, role or class you change (memory: "Fast low-memory e2e recipe").
Likely: `volunteer-dashboard-refresh`, `dashboard-work-first`, `workspace-smoke`,
`bootstrap-resilience`, `station-workflow` (exclude `#197` locally), `stale-refresh`, `dark-mode`.

## Validation

As `HANDOFF-R8.1.md` "Validation": recreate `S/audit-env.sh` and `S/env.sh` from `HANDOFF-R2.1.md`,
audit-flag build, tsc, changed-file lint/format, Jest `--maxWorkers=2`, focused Chromium in one
invocation with one worker, six-role route audit both themes (baseline W3 in `PROGRESS.md`).
Visual evidence at 1440 / 1024 / 744 / 390 / 320 in both themes beside the pilot. Keycloak only
redirects to `localhost:3000`; nothing else may hold the port. `SHOTS_NOW` must be near real time
and captures that show the greeting belong in Accra daytime (W2 finding).

## Carried from W3

- Lists elsewhere (Audit, Message delivery, Staff, Clinics, Duplicate review, Cross-clinic, My
  Assigned) have the W3 labels and pager inside their `RecordSection` frames; R8.1 decides whether
  any should bleed (MASTER "Lists (W3)" says only lists directly in `<main>`).
- Patients "Last visit" and "Location" columns need API fields (`W3-REVIEW.md`).
