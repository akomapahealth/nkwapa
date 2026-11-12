# W2 review: one home per main role (2026-11-12)

Phase W, unit 2 (`PHASE-W.md`). Pilot authority: `r0-pilot/index.html` `#s-dash-doctor`,
`#s-dash-manager`, `#s-dash-director`, `#s-dash-admin`, `evidence/r0/*-dashboard-*`.

## Before → after

| Before (R3.1 / #269)                                                                                                             | After (W2)                                                                                                                                                                                               | Why                                                      |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `AppPageHeader` with the clinic name as `h1`, for every role but a volunteer-only one                                            | Greeting band (`VolunteerWelcome solo`): "Good morning, Afia", date, one sentence of what is waiting, primary + outline action, ghost Refresh. Greeting and date in Africa/Accra                         | Pilot band. The clinic is already in the header switcher |
| "Today at a glance": the same five KPI tiles on every staff home                                                                 | Four-figure `FigureStrip` per role, a ruled `ul`, number first; the grid stays only on the volunteer's home (W4)                                                                                         | MASTER 7.1: identical KPI tiles should not lead          |
| Role sections stacked, or a "Dashboard view" tab set with a stored tab (#315)                                                    | One home for the main role (`pickMainRole`: admin > director > manager > doctor > volunteer); `dashboard-tab-storage` deleted                                                                            | Owner decision                                           |
| Other roles' full sections                                                                                                       | "Also on your plate": a count sentence and one link each, under the strip                                                                                                                                | Owner decision; waiting work before trends               |
| Doctor: "Doctor queue" header, three KPI cards, trend, two charts, table, then "Review queue" with two KPIs, two charts, a table | Needs you now + finalizations (wide) beside BP levels + diabetes (narrow), then recently finalized and recent reviews                                                                                    | Pilot `#s-dash-doctor`                                   |
| Manager: shared grid, then station flow with five KPI cards, then the director's "Clinic trends"                                 | Station figures in the strip and greeting ("12 patients checked in so far, 12 still in clinic. <station> has the longest wait right now."), **Needs attention**, then station flow without its KPI group | Pilot `#s-dash-manager`                                  |
| Station flow: "Median wait by station" bar chart                                                                                 | **Wait and service time at each station**: ruled list, wait then service bars on one scale, minutes written, "Longest wait" tag; above the "By station" table                                            | Pilot `.flow`; time as length (MASTER 12)                |
| Director: four charts in a row, follow-up as a card                                                                              | Needs attention and the two 30-day trends (wide) beside queue status, screening coverage and BP levels (narrow, ordered and toned like the doctor's), then station flow and staff activity               | Pilot `#s-dash-director`                                 |
| Admin: "Network overview" header, five KPI cards, trend, comparison                                                              | Strip (clinics, zones, staff accounts, patients across clinics); visits across clinics in the greeting; trend and clinic comparison; the active clinic's station flow after                              | Pilot `#s-dash-admin`; admins run the line too (#24)     |

## Figures that differ from the pilot

- **"follow-ups kept"** (pilot) is labelled **"care plans with a follow-up"**: `followUpComplianceRate`
  counts care plans with a follow-up date, not kept follow-ups. Same on the doctor's strip when
  the clinical-notes flag is off.
- **"screening coverage"** (pilot, one figure) is **"visits with a BP screen"**: the API has two
  rates per visit (hypertension, diabetes), no patient coverage. Both rates stay in the director's
  "Screening coverage (% of visits)" chart. The pilot's "101 of 142" and "29 of 50 kept" are not
  in the API and are left out.
- Pilot "Clinic day" after the date is left out (nothing says whether today is one).
- Pilot admin "By zone" table: the existing clinic comparison with its zone filter stays instead.

## Figures that left a home (no other home on the dashboard)

- Doctor: reviewed today / this week, reviews trend, BP levels in your reviews (the review queue is a
  Needs you now row; recent reviews stay as a table). Follow-up share when cosigns are shown.
- Manager: the director data the API also sends managers (trends, queue status, staff activity,
  clinical measurement coverage). `/staff-activity` and `/metrics` keep their pages.
- Admin: "Visits across clinics" figure (now the greeting sentence).
- The volunteer shift panel is a volunteer's home only; a multi-role person starts a shift with a
  role on Stations (W1 strip).

## Kept unchanged

`DASHBOARD.READ` guard, Refresh with fixed label + live region, refresh toast, inline error with
retry ("Dashboard refresh is affected" over the last data), loading skeleton, select-clinic state,
every permission gate (band actions show only with their route's permission), zone filter, chart
table toggles, offline stale notice in station flow, volunteer home (W4).

## Files

`lib/main-role.ts` (+ tests), `components/dashboard/RoleHome.tsx`, `FigureStrip.tsx`,
`NeedsYouNow.tsx` (`workRows`, `AlsoOnYourPlate`, `title`), `VolunteerWelcome.tsx` (`solo`,
`summary`, Accra time), `DoctorDashboard`, `ReviewDashboard`, `DirectorDashboard`,
`SystemAdminDashboard`, `StationFlowDashboard` (`useStationFlow`, `stationFlowFigures`,
`showFigures`, times list), `DistributionChart` (`titleAs`), `app/(workspace)/dashboard/page.tsx`,
`globals.css` (`.station-time-bar`), `lib/dashboard-tab-storage*` deleted, five e2e specs and the
product-shots settle heading.

## Open

- **Landing `manager-dashboard` not re-captured.** The shots session ran at 02:15 UTC; the API
  measures live waits from its own clock, so a fixed "clinic morning" `SHOTS_NOW` gave negative
  waits, and an honest capture would read "Good evening" with 1-2 AM arrivals. Re-capture during
  Accra daytime (`capture.spec.js` already settles on the greeting) under a new name, then update
  `CareTeamSection.tsx` src and alt. The current image still shows the pre-W2 dashboard.
- Seeded data leaves doctor charts empty, so the doctor home was checked with empty states.

## Validation

See `PROGRESS.md` W2 entry.
