# #273: appointments evidence

Captured 2026-11-03 on the station-OFF CI build (`ci.yml` E2E env, station flags off).
Before: unchanged `release/dev` at `d02ca79f0d3dd7e87fe6a44bd74da8be2aec2e52`.
After: this branch, rebuilt with the same environment.

Presentation only. No API, permission, flag, validation, lifecycle, triage,
reminder or save change.

| Surface              | Before                                                                     | After                                                                                                              |
| -------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Patient requests     | Card; "N awaiting" badge; each request a nested card, reason in a grey box | Ruled section, count in the title, hairline rows, type and status as text, reason set off by a rule                |
| Date navigation      | "Schedule controls" card; range only as small description text             | The range is the section title, "Times in Africa/Accra" beneath, previous/Today/next and Day/Week beside it        |
| Week view            | Seven stacked day cards, empty days as full cards                          | Seven-day strip with each day's count; choosing a day opens it in Day view, today marked `aria-current="date"`     |
| Counts               | Four metric cards above the controls, cancelled and no-show not shown      | Same ledger under the controls; Completed's detail states the range's cancelled and no-show counts                 |
| Appointment lists    | Bordered table in a card; phone cards with a nested staff card             | Ruled table from 1280px, hairline rows on phones with a Doctor/Volunteer/Reminders `<dl>`                          |
| Cancelled visit      | Time shown like any other                                                  | Time struck through beside its "Cancelled" label                                                                   |
| Reschedule form      | Fields, then the error at the bottom; no booked time shown                 | Error summary first, booked time and care team as context, "New time" legend, `aria-invalid` on the failing fields |
| Confirm request form | Ungrouped fields, error at the bottom                                      | Error summary first, "Visit time" and "Care team" legends, `aria-invalid`                                          |
| Time entry zone      | Not stated                                                                 | Each time field says which zone it uses: the clinic's, or the device's beside the clinic's when they differ        |

## Screenshots and accessibility

Each view at 1440 (full page; the two forms at the first screen) and 390 (first
screen), light and dark, using seeded E2E identities and synthetic local
records: `appointments-day`, `appointments-week`, `appointments-past-week`
(the seeded completed, cancelled and no-show visits), `reschedule-form` and
`confirm-request-form` (doctor), and `appointments-volunteer-week` (read-only).
`capture.spec.js` creates one synthetic patient request through the API when
none is pending.

`before/axe.json` and `after/axe.json`: 24 scans each, zero serious or critical.

Document heights (px), light; dark matches. The after run shows 3 pending
requests against 1 before (the triage E2E specs left two), which adds about
290px at 1440 and 400px at 390 to every after height.

| View                        | 1440 before | 1440 after | 390 before | 390 after |
| --------------------------- | ----------: | ---------: | ---------: | --------: |
| appointments-day            |       2,124 |      1,997 |      6,042 |     5,421 |
| appointments-week           |       3,186 |      2,914 |      7,564 |     6,693 |
| appointments-past-week      |       2,541 |      2,341 |      4,578 |     4,302 |
| appointments-volunteer-week |       3,160 |      2,888 |      7,152 |     6,225 |

The capture browser runs in America/Chicago, so the after forms show the
device-zone sentence. On a device set to Africa/Accra they read "Times in
Africa/Accra." (unit tested in `lib/appointment-status.test.ts`).

## Verification

- Full OFF Playwright (one worker, CI env): 381 passed, 49 skipped, 6 failed.
  Five were this branch's: the new page description repeated "Patient
  requests" and the requests section's accessible name made
  `getByLabel('Patient')` match two elements (strict mode). Both fixed; on a
  rebuilt OFF build `appointments`, `pwa`, `accessibility`, `dark-mode`,
  `responsive-migration` and `shell-navigation` specs then passed 95/95. The
  sixth was the known `pwa.spec.js` offline-launch outbox timing case, which
  passed in that rerun.
- Jest (`--maxWorkers=2`): web 938, API 2,842, db 837 passed. Two new
  `describeTimeEntryZone` cases.
- Security scan, realm validation, Prisma generate, lint, typecheck, chart
  palette, token contrast, script tests (20), Prettier and the db/API/web
  builds passed.
- No station code changed, so no ON build was run.

## Known limitations (deferred with the API work)

- The schedule response has no cancelled-by, when or reason, so a cancelled
  visit is struck through with its label only.
- `datetime-local` reads and writes the device clock. Converting typed times to
  the clinic zone would change saved instants, so the form states the zone
  instead.
