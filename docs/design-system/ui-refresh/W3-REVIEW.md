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

## Columns the pilot has that the API lacks

- **Last visit** and **Location** (Patients): `PatientRegistryItem` (`apps/api/src/patients/patient.service.ts`
  `toRegistryItem`) returns id, code, names, phone, email, ID last 4 only. W3 is frontend only, so
  the table keeps **ID last 4** in their place. Adding them is an API task (the patient row has the
  residential fields; last visit needs an encounter join).

## Behaviour changes to note

- **Sort by code is gone** from Patients: the code now sits under the name in one column, sorted by
  name. An old link with `sortBy=patientCode` loads unsorted rather than sorting invisibly.
  `patient-registry-sort.ts` still maps it (the API supports it); nothing in the UI sends it.
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

- Other list tabs (Audit, Message delivery, Staff, Clinics, Duplicate review, Cross-clinic, My
  Assigned) take the new labels and pager but keep their `RecordSection` frames, so they do not
  bleed. Whether those pages should lose the frame is an R8.1 audit question.
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
