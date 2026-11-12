# Handoff: W2 One home per main role (dashboard)

Continue the frontend-only refresh on `ui-refresh/r1-1-tokens`. Direct mode (no learning
guardrails, no teach-back). Implement **W2 only**, validate, write `W2-REVIEW.md`, a `PROGRESS.md`
entry, update `PHASE-W.md` progress and write `HANDOFF-W3.md`, commit locally. Do not push.

Read first: `PHASE-W.md` (why, owner decisions), `W1-REVIEW.md` (the pattern W1 followed), the
pilot screens `r0-pilot/index.html` `#s-dash-doctor`, `#s-dash-manager`, `#s-dash-director`,
`#s-dash-admin` and `evidence/r0/{doctor,manager,director,admin}-dashboard-*` (1440, 1024, 744,
390, 360, dark), MASTER sections 8.1, 10.1, 11.1, and `apps/web/AGENTS.md`.

## Owner decision (binding)

One home for the person's **main role** in the active clinic. Precedence:
`SYSTEM_ADMIN` > `DIRECTOR` > `MANAGER` > `DOCTOR` > `VOLUNTEER`. Other roles they hold become a
short **"Also on your plate"** list (counts + one link each, e.g. "3 visits waiting for your
sign-off · Open queues"), never their full sections. This **replaces** today's role `Tabs`
("Dashboard view" tablist, stored tab in `writeDashboardTab`), so retire that and its storage.

## Where things are

- `app/(workspace)/dashboard/page.tsx`: fetch, `DashboardData` (`summary`, `doctor`, `review`,
  `director`, `volunteer`, `systemAdmin`), `volunteerOnly`, `showStationFlow`
  (`OPS.STATION.MANAGE` or `*`; managers have no data key of their own: their home is the
  station flow plus `summary`), `NeedsYouNow`, `SummaryCards` ("Today at a glance"),
  `roleSections` + `Tabs`, `ClinicalMeasurementsDashboard`.
- `components/dashboard/`: `VolunteerWelcome` (greeting band + illustration, the frame to reuse),
  `DoctorDashboard`, `ReviewDashboard`, `DirectorDashboard`, `SystemAdminDashboard`,
  `StationFlowDashboard`, `NeedsYouNow`, `SummaryCards`, `DashboardKpiCard`.
- Main role: derive from `bootstrap.effectiveRolesForActiveClinic` (fall back to which data keys
  are present). Put the precedence in one small tested function in `lib/` (with Jest cases for
  each role, multi-role and none).

## Target per main role (pilot)

- Greeting band for every role (reuse `VolunteerWelcome`'s frame; time-of-day greeting, date in
  Accra, one sentence of what is waiting) with the role's primary + secondary action.
- A **four-figure strip** under the band, role-specific, from existing data only:
  doctor (in your queue = `awaitingFinalization`, finalized today/week = `patientsSeen`, cosigns),
  manager (checked in, sessions completed, left before finishing, median time in clinic: from
  station flow), director (registered patients, visits, screening coverage, follow-ups kept =
  `followUpComplianceRate`), admin (network figures from `systemAdmin`).
- Then the role's own work: doctor = sign-off and cosign lists + BP levels; manager = wait and
  service per station + needs attention; director = trends and coverage; admin = network.
- "Today at a glance" five-KPI grid stops leading (MASTER 7.1: avoid identical KPI tiles as the
  dominant feature). Keep any figure that has no other home inside the role strip or drop it.
- Do not invent counts (MASTER 7.1). If the pilot shows a figure the API lacks, leave it out and
  note it in the review.

## Tests that name today's strings

`e2e/dashboard-work-first.spec.js`, `volunteer-dashboard-refresh.spec.js` (clicks the
"Doctor queue" tab), `workspace-smoke.spec.js`, `responsive-offline.spec.js`,
`bootstrap-resilience.spec.js`. Update them to the new structure; do not weaken what they check
(work first, offline truthfulness, refresh, error states).

## Validation

As `HANDOFF-R8.1.md` "Validation" (audit-flag build, tsc, changed-file lint/format, Jest
`--maxWorkers=2`, focused Chromium one worker, six-role route audit both themes). Visual evidence:
synthetic screening-day database per MASTER section 12 (`seed-screening-day.ts`, `nkwapa_shots`),
each role's home at 1440 / 1024 / 744 / 390 / 320 in both themes, compared side by side with the
pilot. Keycloak only redirects to `localhost:3000`, so nothing else may hold port 3000 (ask the
owner to stop `next dev`). Re-capture `manager-dashboard` for the landing under a new file name.
Drop `nkwapa_shots` afterwards.
