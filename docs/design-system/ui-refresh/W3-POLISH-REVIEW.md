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

5, 3, 4/8, 2/7 and 9 remain pending, in the owner's requested order.

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
