# W3 review: Patients and Queues to the pilot tables (2026-11-12)

Phase W, unit 3 (`PHASE-W.md`). Pilot authority: `r0-pilot/index.html` `#s-patients`, `#s-queues`,
`evidence/r0/patients-*`, `evidence/r0/queues-*`. Owner asked that every role's tabs read the same,
so the pilot's list language went into the shared `DataTable`, `AppPageHeader` and `Button`, and
reaches every list tab, not only these two. Rules: MASTER "Lists (W3)".

## Before → after

| Before                                                                                                                                                                           | After (W3)                                                                                                                               | Why                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Every `DataTable` header: sans 14px ink labels                                                                                                                                   | Plex Mono 11.5px capitals, muted, on `--surface-2`; sort buttons inherit it                                                              | Pilot `thead th`: the rows lead, the labels index them      |
| Pager chevrons outlined                                                                                                                                                          | Ghost chevrons                                                                                                                           | Pilot `.pager`                                              |
| Tables boxed inside the page padding                                                                                                                                             | `bleed`: Patients, Queues, Volunteers and Screening days run edge to edge, first/last cell on the sheet gutter                           | Pilot tables; only for lists directly in `<main>`           |
| Patients: header with hairline, labelled search with a help line, Filter button, chips, "Browsing the full clinic registry", a "Patient results" h2 and sentence, then the table | Title with the total beside it, full-width search with a `/` hint, dashed Filter chip + removable chips in one row, table                | Pilot `#s-patients`; one result count, no second header     |
| Columns Patient code, Name, Phone, ID last 4, two buttons (outline View, filled Check in)                                                                                        | Patient (name over code), Phone (masked), ID last 4, quiet View + teal-outline Check in                                                  | Pilot columns; one filled button per row was a wall of teal |
| Phone card: name, code, full phone, ID, outline "View record" + filled Check in                                                                                                  | Name as the record link, code · masked phone · ID on one line, outline Check in on the right; swipe kept                                 | Pilot `.plist`; phone no longer shown unmasked              |
| Patients h1 in sans (`[&_h1]:font-body`), every other tab serif                                                                                                                  | Serif like every other tab                                                                                                               | Consistency (MASTER 4: serif page titles)                   |
| Queues tabs: Needs Review, Ready to Finalize, Pending HAP Cosign                                                                                                                 | Drafts, Review, Sign-off, Cosign (order unchanged: pipeline)                                                                             | Pilot tab names; the lane sentence says what each holds     |
| Queues columns: Patient, Code, Created (`toLocaleString`, browser zone), BP, Glucose, outline "Open encounter"                                                                   | Patient (name over code), Created/Submitted in Accra (`formatOpsDateTime`), Flags (BP + High glucose, "Nothing flagged"), quiet "Open ›" | Pilot list; times in Accra like the rest of the product     |
| Queues phone card: name, code, status badge, created line, BP line, outline Open encounter                                                                                       | Name, code · time, flags, quiet Open on the right                                                                                        | Same row as Patients                                        |
| Refresh queues outline                                                                                                                                                           | Ghost                                                                                                                                    | Matches the dashboard's ghost Refresh (W2)                  |
| My Assigned headers "Checked In", "My Role", "Care Team"                                                                                                                         | Sentence case                                                                                                                            | Every other header is sentence case                         |

## Follow-up (same unit, owner review of the first pass)

| Before (first W3 pass)                                                                                                                                       | After                                                                                                                                                                                                                    | Why                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Patients kept ID last 4 in place of the pilot's Last visit and Location (no API fields)                                                                      | API `PatientRegistryItem` adds `lastVisitAt` (latest encounter at the clinic, one `groupBy` per page) and the residential fields (not the address note); columns Last visit and Location; ID last 4 moves under the name | Pilot columns; same last-visit definition as the chart  |
| Sort by code gone; phone sort a separate "Sort by" block                                                                                                     | `sortBy=lastVisitAt` on the API (ranked in memory, never-seen last both ways, no cursor); one plain-language Sort select pinned right of the chips, the phone's only sort; code sort back as "Newest/Oldest registered"  | Owner asked for sorting back                            |
| Phone row meta: code · masked phone · ID                                                                                                                     | code · last visit · ID                                                                                                                                                                                                   | What the desk needs before opening a record             |
| Audit, Message delivery: boxed Filters section (6 fields, Apply/Clear, summary chips, tips accordion), then a second ruled section with a "Loaded rows" tile | Search (Audit: person), dashed Filter chip + Sheet, removable chips, one loaded line, bled table; help below the list                                                                                                    | Same toolbar as Patients; filters already applied live  |
| Six 230px KPI tiles above Message delivery, four above Clinics, Duplicates, Cross-clinic, My Assigned, Staff                                                 | `AppMetricGroup variant="strip"`: label + figure, detail in the help                                                                                                                                                     | The list starts in the first screen                     |
| Duplicate review / Cross-clinic: 320px filter rail squeezing a pair table so chart codes wrapped                                                             | Search + three inline selects above a full-width bled table                                                                                                                                                              | Rows readable at 1440                                   |
| Clinics: segmented view, labelled Zone block, summary chips, outline Edit per row                                                                            | One toolbar row (view, Zone, Organization, "Showing x of y"), removable chips, ghost Edit, title count                                                                                                                   | Wall of outline buttons; three statements of one filter |
| Staff: filter rail beside the roster, two summary lines, outline Manage                                                                                      | Inline selects over a bled roster, ghost Manage                                                                                                                                                                          | Same                                                    |
| Message delivery: browser-zone times, "EMAIL", empty Rows select (page size not in options)                                                                  | Accra times, "Email", Rows 25                                                                                                                                                                                            | Bugs                                                    |
| My Assigned: shift card first, worklist second                                                                                                               | Worklist leads, shift and notes on the right                                                                                                                                                                             | The worklist is the job                                 |

## Behaviour changes to note

- Sorting by code is offered as "Newest / Oldest registered" in the Sort select; old
  `sortBy=patientCode` links sort again.
- Last-visit sort ranks every matching id in memory and refuses a cursor
  (`CURSOR_UNSUPPORTED_FOR_SORT`); fine at clinic scale, upgrade past ~20k patients (comment in
  `patient.service.ts`).
- Strip metrics move their detail sentence into the help (`duplicate-review` spec now asserts the
  help button); `clinic-metadata` asserts the pressed view and the Zone chip instead of
  "View: …" / "Zone: …" summary text; `assigned-redesign` heading is "Assigned patients".
- Queue phone cards no longer show the encounter status badge (the lane already says it).
- The registry's "Patient results" heading is now a labelled region; phone cards are `h2`, and the
  card's record link is named by the patient (inside an `article` named the same).
- The page-level screened-date alert hides while the filter sheet is open (the sheet shows it
  beside the dates); two identical alerts were announced before.
- A coarse pointer on a phone shows "Swipe a patient left to check them in" above the list, which
  moves the rows down by one line (the swipe spec now measures after switching to touch).

## Kept unchanged

URL state and debounce, clinic scope, `/` and Escape shortcuts, phone masking (table rule, now on
phones too), check-in behaviour and its single-flight guard, swipe-to-check-in and its click
suppression, every permission gate, read-only registry, screened filter and its column/errors,
filter Sheet (right on wide, bottom on phones), empty and refused states, sorting and server
pagination. Queues: tab deep links (`?tab=drafts|review|finalize|cosign`), default lane priority,
counts and "loaded" fallback, Show more, offline and stale states, cosign gate, empty Lottie.

## Files

`components/ui/data-table.tsx` (`bleed`, `SHEET_GUTTER`, labels, pager), `components/ui/button.tsx`
(`primaryOutline`), `components/app-shell/AppPageHeader.tsx` (`count`),
`components/patients/PatientRegistryScreen.tsx`, `PatientRegistryCard.tsx` (`PatientIdentity`,
`maskPhone`), `app/(workspace)/queues/page.tsx`, `volunteers/page.tsx`, `volunteers/events/page.tsx`,
`my/assigned/page.tsx`, three e2e specs (`queue-workspace`, `patient-registry-workspace`,
`shell-consumers`).

## Open

- Staff invitations (`StaffInvitesCard`) keeps its ruled frame and own tabs above the roster;
  Appointments and Data requests were looked at and left as they are (a scheduling page and an
  empty queue). R8.1.
- My Assigned "Shift Status" / "On Duty" title case lives in the shared `ShiftControlCard`.
- At 320px the search placeholder truncates ("…ID las"); the sr-only label carries the full text.
- The landing `manager-dashboard-20261112.png` predates the new column labels in its "By station"
  table. Small drift; re-capture with W4 if that shot is retaken anyway.
- Two specs fail on screens W3 did not change: `patient-residential-location` (the record no longer
  prints "Osu, Accra Metropolitan, Greater Accra" where line 36 looks) and `keyboard-focus` portal
  `/portal/self-reports/new` at 390 (`main h1` not visible). Neither imports a W3 file beyond the
  optional `AppPageHeader count`. Not compared against a HEAD build; treat as pre-existing until
  R8.1 checks them.
- Visual check used the `nkwapa_audit` database (e2e names), not a fresh `nkwapa_shots`: no landing
  shot shows these lists, so no synthetic capture was needed.

## Validation

See `PROGRESS.md` W3 entry.
