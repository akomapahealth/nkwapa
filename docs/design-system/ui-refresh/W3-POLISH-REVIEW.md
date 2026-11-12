# W3 polish review

Branch: `ui-refresh/r1-1-tokens`. Baseline: `e453a18b`. Local commits only.

## Evidence and measurement

Before editing, captured 456 seeded screenshots: six identities, 57 role/route combinations,
four widths (1440, 744, 390, 320), light and dark. Capture run: 12/12 passed in 7.4 minutes.
This capture run did not run axe. Evidence: `/private/tmp/nkwapa-w3-polish/before`.
No real-patient reference directory was opened.

## Unit 6: sync

| Before                                                | After                                                                 | Why                                                        |
| ----------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------- |
| Synced / All synced occupies a full tinted status bar | A compact success check; full accessible status and tooltip remain    | Calm success needs less attention than failures.           |
| All states share a reserved control width             | Reserved outer width retained; attention states keep words and counts | State changes cannot displace the clinic/account controls. |

The accessible name retains the existing full status, including saved changes in other clinics.
Recovery, priority and ownership logic are unchanged. Keyboard focus opens the same Radix tooltip
used by the shell. This applies Hick's law by reducing routine visual information without hiding
recovery.

Validation: TypeScript, changed-file ESLint/Prettier and production build passed. Jest:
98 suites, 1,060 tests passed. Initial focused Chromium: 29 passed, 1 failed, 1 not run
(including six auth setups). The failure was the fixture helper rejecting the existing
`route-break.module.css`; reproduced with the sync source from `e453a18b`. Added a scoped
CSS-module loader to the fixture helper, retaining the actual CSS. Both previously blocked
fixture cases then passed. The additional keyboard-tooltip check then failed focus return in both themes: the tooltip's
exiting layer consumed Escape while the sync sheet was opening. The tooltip now unmounts when
the sync sheet opens so Escape belongs to the sheet. Final rebuild, TypeScript, lint, format and Jest passed; all 31 focused Chromium tests passed
(25 browser cases plus six auth setups).

The extended version of the existing six-role route harness retains its 228 axe rows and
captures all five widths in both themes: 12/12 passed, 228 rows, 0 violations, 0 minor,
0 overflow, 0 errors, one h1 throughout; 570 screenshots. Axe runs at 1440/390 as in the
original harness; 1024/744/320 are additional screenshot/bounds checks. This scan preceded the
modal-only tooltip unmount fix; that fix was rebuilt and all 31 focused checks reran, including
keyboard-tooltip activation, one Escape and focus return. Closed-page presentation is unchanged. Evidence:
`/private/tmp/nkwapa-w3-polish/unit6`. Inspected phone and desktop, light and dark samples.

First-screen word counts will use Tesseract word boxes from the light screenshots, excluding
header, sidebar and phone bar, consistently before and after. These are measured OCR tokens,
not editorial estimates. Baseline measurements cover 72 screen/width pairs. Browser specs
create synthetic records, so row-content changes can affect counts independently of copy.

## Remaining units

4/8, 2/7 and 9 remain pending, in the owner's requested order.

## Unit 1: phone labels

| Before                                              | After                                                                 | Why                                                                     |
| --------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Dashboard / Today Board wrap at narrow phone widths | Home / Today; Assigned and Visits where those occupy a primary slot   | One word per destination preserves glanceable navigation.               |
| Portal labels use wider top-navigation wording      | Home / Health / Visits below 600px                                    | Same short-label system in both shells.                                 |
| Visible text supplies the link name                 | Explicit full `aria-label`; sidebar, More and 600px+ labels unchanged | Existing screen-reader and role-based link locators retain their names. |

Fitts: existing 60px rows and 44px target widths remain. Jakob: short phone tabs, full drawer
navigation. Accessibility exception: at 200% text, labels may wrap rather than overflow or
shrink. Default-size labels must fit one line at 320px. String search:
`/private/tmp/nkwapa-w3-polish/unit1-string-search.txt`.

Validation: TypeScript, ESLint, Prettier and build passed; Jest 98 suites / 1,060 tests passed.
Focused browser run: 29/31 passed initially. Updated a stale "Today at a glance" assertion to
wait for the existing role-home figures (the mismatch is present in `e453a18b` and the before
screenshots). The other failure was a portal queue expecting `held` but receiving `failed`;
its cause is unknown. Isolated rerun of the two portal themes and the rail-height case: 3/3
passed, with the held-state assertion unchanged. All distinct targeted cases have passed.
Route/capture run: 12/12, 228 rows, 0 violations, 0 minor, 0 overflow, 0 errors, one h1
throughout; 570 screenshots. This also rechecks unit 6's final code on all normal routes.
Inspected staff 320px and portal 320px, both themes and larger matrix samples. Evidence:
`/private/tmp/nkwapa-w3-polish/unit1`.

## Unit 5: rail and tablet drawer

| Before                                              | After                                                          | Why                                                   |
| --------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------- |
| Tablet icons over wrapping labels and section rules | Icons, full accessible names, tooltips; space between groups   | A quiet rail leaves room for work.                    |
| No full tablet navigation overlay                   | Header menu opens the existing left Sheet with full labels     | Discoverability without permanent text in the rail.   |
| Desktop collapse and `[` preference                 | Preserved, including 232/64px geometry and guarded persistence | Resizing must not overwrite someone's desktop choice. |

Jakob: rail plus modal navigation drawer, following the distinction in
[Material navigation](https://m3.material.io/components/navigation-drawer/overview) and
[shadcn's icon sidebar](https://ui.shadcn.com/docs/components/radix/sidebar).
[Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog) supplies focus
containment, Escape and outside dismissal. The existing Sheet's leftward drag handle provides
swipe dismissal without intercepting scrolling or navigation-link gestures. Fitts: 44px rail
and menu controls. Hick: full labels appear on request. The drawer is tablet-only; phones keep
More. Route changes and crossing either tablet boundary close it.

Validation: TypeScript, changed-file lint/format and build passed; Jest 98 suites / 1,060 tests
passed. Focused Chromium: 61/62 passed initially. The desktop width-interruption sample returned
null once (no active transition available to pause); unchanged isolated rerun passed 1/1.
All distinct targeted checks passed, including both drawer themes, 24 successive trapped Tabs,
Escape/focus return, scrim, leftward handle drag, route changes and resize/persistence. The
boundary spec's stale dashboard heading assertion was updated to the existing role-home figures.
Route/capture: 12/12, 228 rows, 0 violations, 0 minor, 0 overflow, 0 errors, one h1 throughout;
570 screenshots, plus drawer-open and shell-state captures. Inspected the 744px rail and both
open-drawer themes. Evidence: `/private/tmp/nkwapa-w3-polish/unit5`.

## Unit 3: separate summary figures

| Before                                                    | After                                                                     | Why                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Panel/strip cells share hairlines; phones show 2×N blocks | Separate stat chips, 12px gaps, a horizontal scroll-snap row on phones    | Values read as breathing elements rather than a second table. |
| Every zero has the same emphasis as an action count       | Zeroes are smaller and muted without tint                                 | Zero work should recede.                                      |
| Attention figures buried among totals                     | Very likely, Failed, Needs attention, Ready for intake and Open work lead | The first figure answers what needs attention.                |
| Counts explain themselves in repeated paragraphs          | Definitions/detail stay in help beside each figure                        | Facts remain reachable without crowding the list.             |
| Loading summary counts can look like zero                 | Known-resource guards show an ellipsis until data arrives                 | Unknown is not an empty queue.                                |

Chosen over a sentence system because these pages mix counts, rates, durations and time-of-day
values. The same chip system handles them without long grammatical sentences. Role-home figures
also adopt it; their richer greeting/work sections remain. Gold is attention, destructive tint
is failed delivery, mint is the next visit, and neutral figures use surface-2. Existing tint/ink
pairs remain unchanged. Raised depth uses a soft shadow in light and a lighter inner edge in dark.
Counts retain accessible descriptions on filter shortcuts. No API, permission, URL or mutation
handler changed. My Assigned and Appointments shortcuts use their existing status filters;
research keeps its existing decision list. Hick, chunking and proximity guide this choice.
Validation: TypeScript, changed-file ESLint/Prettier and build passed; Jest 98 suites / 1,060
tests passed. The design-token checker passed 40 pair checks. Initial focused Chromium: 92
passed, 3 failed, 5 not run (100 total, including six auth setups). The appointments Patient
locator also matched the explicit navigation aria-labels added in unit 5; scoped it to the
Patient searchbox and reran the entire appointments file: 19/19 passed. The time-zone Escape
failure reproduces with the actual Dialog/Combobox sources from `e453a18b` in a controlled
browser fixture (1/1 reproduction passed); it remains for unit 9. The owner-listed staff-profile
failure also reproduced and is not chased here. No validation assertion was removed.

Route/capture: 12/12, 228 rows, 0 violations, 0 minor, 0 overflow, 0 errors, one h1 throughout;
570 screenshots. Inspected 1440px figures, 320px horizontal figures and dark delivery history.
Evidence: `/private/tmp/nkwapa-w3-polish/unit3`; scheduling rerun under `unit3-appointments-rerun`;
baseline reproduction in `/private/tmp/nkwapa-w3-polish/baseline-escape.log`.

## Units 4 and 8: tablet toolbars

| Before                                                               | After                                                            | Why                                                                                   |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Three duplicate label/select pairs wrap raggedly at 744px            | One Filter chip, one Sheet form, removable selections            | Consistent disclosure at every width; no duplicate ids or breakpoint-dependent focus. |
| Staff status segments squeeze beside a 256px search                  | Status choices own a scrollable row; search fills the next row   | The controls remain usable at 600/744/840/1024px.                                     |
| Staff invitations repeats an access paragraph above boxed phone rows | Invitations with nearby help; bled table and hairline phone rows | Group by proximity, keep the access fact reachable.                                   |

The all-width duplicate Sheet is a deliberate choice: the Patients pattern is familiar and keeps
one control tree, even where three inline selects could fit. Below 840px it opens from the
bottom; larger widths use the existing right Sheet. Decision / Match strength / Why it matched
and their ids stay unchanged. Specs open the Sheet before using those fields. Hick and Tesler:
keep sensible defaults and reveal the rest on request. Fitts: full-width phone invite action.
The invitation password/acceptance fact moved into help; the dialog's safety wording remains.
Validation: TypeScript, build, Prettier and Jest (98 suites / 1,060 tests) passed; changed-file ESLint passed after fixing a stale `openStaff` helper in the new spec. Focused Chromium: 98 passed, 3 failed, 5 not run of 106. Two duplicate-review failures were the specs selecting in the Sheet before it closed; after `toBeHidden` waits, duplicate-review reran 8/8. The third is the owner-listed staff-profile failure. Route/capture: 12/12, 228 rows, 0 violations, 0 minor, 0 overflow, one h1 throughout. Evidence: `/private/tmp/nkwapa-w3-polish/unit48`, `unit48-duplicate-rerun`, `unit48-tablets`.

## Takeover (Claude): audit of the paused run, then units A and B

**Audit of the paused run.** Units 6, 1, 5 and 3 were committed and their evidence is consistent.
Units 4/8 were complete but uncommitted with "Validation pending"; their logs showed TypeScript,
format, Jest and build passing, a lint error already fixed in the working tree, duplicate-review
failures that pass 8/8 after the Sheet-close waits, the owner-listed staff-profile failure, and a
clean 228-row route/capture. Recorded and committed as `00f3d0d3`. Units 2/7 and 9 had not started.

### Unit A: figure chips and the sync check (owner feedback)

| Before                                                                                                     | After                                                                                                                                          | Why                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A 24px numeral stacked over its label, beside a 16px icon and a 14px help glyph                            | One line: icon, figure, label and help all at a 16px optical size; the figure is 16px/600                                                      | The owner saw the icons as too small; matching optical size makes the chip one unit, and weight (not size) carries the emphasis.                                                               |
| Counts and readings both stacked value-first                                                               | Counts read number-first ("47 Needs review"); readings read label-first ("Blood pressure 128/82 mmHg")                                         | Each reads as a phrase; a reading's label is what the eye searches for first.                                                                                                                  |
| Zero figures were bare text floating among chips                                                           | A hairline-ringed chip without tint or shadow                                                                                                  | Zero still recedes, but keeps the row's rhythm.                                                                                                                                                |
| The phone row stopped 16px short of the screen edge                                                        | The row bleeds to the screen edge and scroll-snaps with a 16px inset                                                                           | A cut chip at the screen edge reads as "scroll"; one cut inside the gutter reads as a bug (Apple's scroll-edge convention).                                                                    |
| The synced check sat centred in an empty 108–192px slot, alone in the middle of the header                 | The check sits at the right edge of the reserved slot, beside Sync now, the header icons and the account menu; the button shrinks to the check | The owner saw it as isolated. Grouping by proximity. (A first try that released the phone slot moved the adjacent control 44px on a state change; `header-sync` caught it, so the slot stays.) |
| "Total clinics" beside the header's 63; "Visible messages" beside "50 messages loaded"; "Showing 63 of 63" | Removed; "Showing x of y" only when a filter narrows the list                                                                                  | One fact, one place.                                                                                                                                                                           |

### Unit B: header voice, density, one row of actions

| Before                                                                                       | After                                                                                                                     | Why                                                                                                 |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Descriptions up to 160 characters, three lines on a phone                                    | One line under ~70 characters; reasons, policies and type lists moved to `hint` beside the title                          | Hick and Tesler: what changes the next action stays; the rest is one tap away.                      |
| Phone actions stacked into full-width bars (segmented control, then a full-width Refresh)    | One row: the segmented control flexes, Refresh and Export become 44px icon buttons below 600px with full accessible names | Fitts and less chrome: fewer full-width bars above the work on phones.                              |
| A "Times in Africa/Accra" paragraph as a third item in the action row                        | Joined to the description ("Times in Africa/Accra.")                                                                      | Context, not a control.                                                                             |
| A hairline under every header, then a 2px ink rule 24px below it                             | No header hairline; space separates header from work                                                                      | Two lines doing one job. Proximity over borders.                                                    |
| `--rule-strong` was full ink (14:1), the loudest element on most pages                       | A calm teal-grey: 3.36:1 / 3.63:1 light, 3.75:1 / 3.45:1 dark (all >= 3:1 non-text)                                       | Keeps the ruled grouping identity while letting content lead; `npm run design:check-tokens` passes. |
| Cross-clinic said "read-only" three times (badge, notice, description)                       | The notice remains; the badge and the description clause are gone                                                         | Redundancy is noise.                                                                                |
| Volunteer greeting wrapped to three lines at 44px on a phone; its Refresh sat alone on a row | 34px on phones (44px from a laptop); Refresh shares the shift row, level with End shift                                   | The dashboard is the bar; it should hold on a phone too.                                            |
| "Shift Status", "On Duty", "Checked In As"                                                   | Sentence case, as everywhere else                                                                                         | Consistency (item 9).                                                                               |
| Appointment requests: a full-width "Refresh requests" bar and a two-line description         | An icon button beside the title on phones; one line that keeps "a reason the patient sees"                                | Same facts, half the height.                                                                        |

References: Apple HIG scroll-edge and grouping guidance; Linear's single-line stat pills; Stripe
dashboard summary chips (number then label); Vercel's one-line page subtitles.

Consciously not changed: the floating chat launcher. `main` already reserves 10rem (phones) and
6rem (600px+) below the content, more than the launcher's footprint, so nothing is unreachable at
the end of a page; the overlap mid-scroll is inherent to any floating button.
