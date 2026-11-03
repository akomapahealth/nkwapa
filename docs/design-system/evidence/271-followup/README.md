# #271 follow-up: `/today` station board evidence

Captured 2026-11-03 with both station-workflow flags ON in API and web.
Before: unchanged `release/dev` at `eeb0cc4e0ded6df50666de97b19bd543acda92d5`.
After: this branch, rebuilt with the same environment.

The owner's review of `evidence/271/after/today--1440--light.jpg` against the
station line in `concepts/nkwapa-2-directions.src.html` (section `id="a"`) named four
gaps. This PR changes presentation only, in `components/stations/StationLineBoard.tsx`.

| Gap                                | Before                                                          | After                                                                                                    |
| ---------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| One row per patient                | Each patient had its own full row with a repeated scale         | One lane per station; its patients sit side by side and wrap inside the lane                             |
| Scale stretched by long waits      | 0 to 480 min on the real board, normal waits became slivers     | Fixed 0 to 40 min, gridlines every 10, dashed 20 min guide; longer waits fill the lane with real minutes |
| Clipped labels                     | Short bars cut their names                                      | Short names ("Ama O. 7 min"); bars under 20 min carry the label beside them                              |
| Heavy rows, serif names, 4 buttons | Serif two-line names; Assign, Move, Release, Left, Open per row | Body sans; each bar opens a menu with the patient, status, who they are with and the same actions        |

"Needs you now" now acts: for a manager on today's board, the long-wait row's
**Move a patient** opens the existing Move dialog for the longest wait, and the
unstaffed row's **Assign staff** opens the existing Assign dialog for a patient
waiting at an unstaffed station. Without permission, or with no waiting patient
there, the previous links remain. Every dialog, reason requirement, offline
disablement and permission check is unchanged. No API, flag, clinical field or
data change. The legend, `LONG_WAIT_MINUTES`, warning tokens, `bg-primary
text-primary-foreground` filled bars, 44px bar targets and the data table remain.

## Screenshots and accessibility

Two views, each at 1440 (full page) and 390 (first screen), light and dark, plus
a 390 capture scrolled to the line:

- `today`: the real local board. Its patients are synthetic E2E patients left by
  station specs; two had waited about 480 minutes, which is what stretched the
  before scale. Waits change between passes.
- `today-synthetic`: a fixed synthetic board served through a Playwright route
  (a 444-minute wait, 1, 2, 5 and 7-minute bars, two unstaffed stations).

`before/axe.json` and `after/axe.json`: 8 scans each, zero serious or critical.
Document heights (px):

| View            | Width | Before | After |
| --------------- | ----- | ------ | ----- |
| today           | 1440  | 2069   | 1315  |
| today           | 390   | 2852   | 2084  |
| today-synthetic | 1440  | 2002   | 1182  |
| today-synthetic | 390   | 3106   | 1910  |

Heights match in both themes. They are evidence of density, not a controlled
comparison: the real board's queue differed between passes.

## Tests

`station-redesign.spec.js` now asserts one lane per station with its four BP
patients on one line, bar width against the 40-minute scale, unclipped labels,
the bar menu's actions (no Assign for a patient with staff), both "Needs you now"
dialogs, and a new case where a 444-minute wait fills the lane and keeps its
label. `station-workflow.spec.js` opens the bar's menu to read "Assigned by".

## Known limitations

A 0-minute bar has no width; its label still shows beside it. When a lane's
bars add past the scale they wrap onto another line in that lane, so only each
bar's length, not its left edge, reads against the minute scale (as in the
mockup).

## Reproduce

Use the CI E2E environment from `.github/workflows/ci.yml` merged over the local
environment without printing secrets, with both station-workflow flags ON, and
build API and web. Set absolute `WEB_DIR` and `EVIDENCE_DIR`, then run the
`capture` project in `playwright.config.cjs` with one worker.
