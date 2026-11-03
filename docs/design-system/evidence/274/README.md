# #274: administration and governance evidence

Captured 2026-11-03 with the CI E2E environment and station flags off.
Before: unchanged `release/dev` at `f57a71a6734edbd6925a1b7254d92bbd928b02c4`.

| Surface                     | Before                                 | After                                               |
| --------------------------- | -------------------------------------- | --------------------------------------------------- |
| Staff and clinic registries | Filter and result cards                | Ruled groups and named keyboard-accessible tables   |
| Duplicate review            | Card panels and phone cards            | Ruled filters, results and compact phone rows       |
| Data requests               | Bordered list card                     | Ruled request list, shared status words             |
| Audit and message delivery  | Cards on the page and in phone results | Ruled filters and history, hairline phone rows      |
| Clinic settings             | Research settings card                 | Ruled policy section                                |
| Consequential actions       | Mixed button treatments                | Warning outline and shield at the point of decision |

The capture visits eight routes as seeded E2E staff, at 1440px (full page)
and 390px (first screen) in light and dark. See `before/axe.json` for the
32 baseline scans, all clear of serious or critical findings.

The duplicate queue records a review decision. The actual merge stays in its
existing destructive confirmation on the patient chart. Closing a data request
records the response; it does not itself delete records. No API, permission,
route guard, flag, validation or save behavior changed.

## Screenshots and accessibility

All 32 after scans were also clear of serious or critical findings.
The responsive screenshots use the same widths and themes for both builds.
These are light-mode document heights in CSS pixels; the shared synthetic
database gained staff and clinic records during the test runs. Those mobile
heights reflect the larger lists.

| View             | 1440 before | 1440 after | 390 before | 390 after |
| ---------------- | ----------: | ---------: | ---------: | --------: |
| audit            |       1,720 |      1,672 |     10,829 |     8,414 |
| clinic-settings  |         960 |        960 |      1,361 |     1,273 |
| clinics          |       1,411 |      1,387 |     30,345 |    34,131 |
| cross-clinic     |       1,633 |      1,577 |      3,744 |     3,510 |
| data-requests    |         960 |        960 |        844 |       844 |
| duplicates       |       1,375 |      1,351 |      5,240 |     5,122 |
| message-delivery |       1,741 |      1,693 |     10,406 |     9,703 |
| users            |       2,142 |      2,094 |     29,399 |    31,615 |

## Verification

- Capped Jest: web 938, API 2,842, and DB 837 tests passed.
- Security scan, realm validation, Prisma generation, lint, typecheck,
  chart palette, token contrast, 20 script tests, and DB/API/web builds passed.
- Full Playwright on one station-OFF build and one worker had 387 passed,
  49 skipped, and one failure. Clinic creation returned HTTP 201, but the
  floating chat button blocked the registry pager during saved-row readback.
  The isolated spec reproduced the overlap. The registry now reserves space
  for its pager beside the floating button.
- After the pager fix, the rebuilt station-OFF app passed all 54 targeted
  Playwright checks across clinic metadata, governance, accessibility and
  responsive migration, including the saved-row readback. The screenshots
  and axe results above come from that build.
