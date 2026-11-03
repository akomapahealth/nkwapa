# #272: queues and encounters evidence

Captured 2026-11-03 on the station-OFF CI build (`ci.yml` E2E env, station flags off).
Before: unchanged `release/dev` at `e275ff524742af671fa9046f84278d7e73a41360`.
After: this branch, rebuilt with the same environment.

Presentation only. No API, permission, flag, clinical field, validation, save,
finalization or offline change.

| Surface                    | Before                                                                                     | After                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `/queues` counts           | Each lane counted three times: metric row, tabs (no count), Active lane                    | Once, on the lane's tab ("Needs Review 36")                                                                        |
| `/queues` lane             | Card, code first, "Flag" badge, raw "Created"                                              | Ruled list, one sentence per lane, patient first, "High glucose" label (same flag rule), plain BP classification   |
| `/queues` at 390           | Bordered cards                                                                             | Ruled rows with the same "Open encounter" action                                                                   |
| Encounter header           | Three metric cards (state, a fixed "Forms" number, editability) + a second patient heading | Ruled progress line: Draft, Pending review, Awaiting sign-off, Finalized, current step in words and `aria-current` |
| Finalize                   | Primary button beside routine actions                                                      | Own "Ready for your sign-off" row, outlined warning ink with `ShieldCheck`, says it locks every tab                |
| HAP Sign note, Cosign note | Primary buttons                                                                            | Same sign-off style as Finalize; Save draft and Draft from the interviews stay outline                             |
| Finalized care plan        | Card of paragraphs                                                                         | Ruled `<dl>`                                                                                                       |
| Station session route      | Cards; status as lowercase enum; cancelled stops looked like any other                     | Ruled rows; a cancelled stop's station is struck through beside "Cancelled by", who, when and the reason           |
| New encounter              | Five unlabelled progress bars, cards                                                       | Named steps with `aria-current="step"`, ruled sections; button names unchanged                                     |
| Clinic encounters hub      | Placeholder metric values ("Preparing", "Patients", "OPS ready")                           | Three ruled links, including the real `/queues`                                                                    |

## Screenshots and accessibility

Each route at 1440 (full page) and 390 (first screen), light and dark, using seeded
E2E identities and synthetic local records: `queues-doctor` (`?tab=review`),
`queues-manager`, `encounter-draft`, `encounter-review`, `encounter-signoff`
(reviewed, awaiting finalization), `encounter-finalized`, `clinic-encounters`
(doctor) and `encounter-new` (volunteer; opening it creates a synthetic draft,
as the page always has).

`before/axe.json` and `after/axe.json`: 32 scans each, zero serious or critical.

Document heights (px), light; dark matches:

| View                | 1440 before | 1440 after | 390 before | 390 after |
| ------------------- | ----------: | ---------: | ---------: | --------: |
| queues-doctor       |       1,212 |        988 |      7,892 |     5,358 |
| queues-manager      |       1,212 |        988 |      9,479 |     6,934 |
| encounter-draft     |       3,181 |      2,963 |      5,139 |     4,717 |
| encounter-review    |       3,181 |      2,966 |      5,101 |     4,682 |
| encounter-signoff   |       3,181 |      3,070 |      5,101 |     4,806 |
| encounter-finalized |       1,832 |      1,551 |      2,787 |     2,305 |
| clinic-encounters   |         900 |        900 |      1,171 |       844 |
| encounter-new       |         900 |        900 |        844 |       844 |

The Station session tab needs the station flag, so the struck-through cancelled
stop is covered by `describeRouteStop` unit tests and the ON station E2E run,
not by these OFF screenshots.

## Verification

- Full OFF Playwright (one worker, CI env): 386 passed, 49 skipped, 1 failed.
  The failure is the known `pwa.spec.js` offline-launch case ("One of the
  specified object stores was not found" while queuing the synthetic outbox
  write), the same as PR #297; `pwa.spec.js` alone passed 19/19.
- ON station build, `station-workflow.spec.js` and `station-redesign.spec.js`:
  25 passed, including the doctor's Station session tab.
- Jest (`--maxWorkers=2`): web 936, API 2,842, db 837 passed. Three new
  `describeRouteStop` cases in `lib/stations.test.ts`.
- Secret scan, realm validation, Prisma generate, lint, typecheck, chart
  palette, token contrast, script tests (20), whole-repo Prettier, and the db,
  API and web builds (OFF and ON) passed.

## Known limitations

- A performer correction shows only the corrected name. The prior name lives in
  the audit trail, not in the timeline response; striking it through needs an API
  change, which is outside this presentation-only issue.
- Each lane lists at most the API's default 50 encounters, as before, so a
  count reads 50 when more wait (the local Drafts lane holds 538). A true total
  needs an API change; the removed metric cards had the same cap.

## Reproduce

From the repository root, with the CI E2E env applied (`run-ci.cjs`):

```bash
WEB_DIR=$PWD/apps/web EVIDENCE_DIR=$PWD/docs/design-system/evidence/272/after npx playwright test -c docs/design-system/evidence/272/playwright.config.cjs --workers=1
```

The encounter ids in `capture.spec.js` are local synthetic records; pick one per
state from your own database.
