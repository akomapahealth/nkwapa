# #271 stations and screenings evidence

Captured 2026-11-02 with both station-workflow flags ON in API and web.
Before code: unchanged `release/dev` at `13b062960a8e745083507fe4576e5499eee4ba4a`.
Only the required roadmap merge bookkeeping commit preceded the capture.

## Screenshots and accessibility

Five real routes: `/today`, `/stations`, `/stations/setup`, a held synthetic
intake visit, and `/my/assigned`. 1440 images show full pages; 390 images show
the first 844px. Both themes, reduced motion. Every document height is recorded,
including for the cropped phone captures. `before/` has 20 JPGs; `after/` has the 20 matching views plus two scrolled
phone chart captures proving the visible numeric axis in both themes.

Before: 20 axe scans, two serious colour-contrast findings on the screener
Change link in light mode (desktop and phone), zero critical. After: 20 scans,
zero serious or critical. The link now uses the existing info ink token on its
info surface, with a 44px target. No colour token changed.

| Route    | Width | Theme | Before height (px) | After height (px) |
| -------- | ----- | ----- | ------------------ | ----------------- |
| today    | 1440  | light | 1573               | 3283              |
| today    | 390   | light | 2481               | 4726              |
| today    | 1440  | dark  | 1573               | 3283              |
| today    | 390   | dark  | 2481               | 4726              |
| stations | 1440  | light | 1118               | 1563              |
| stations | 390   | light | 2519               | 3441              |
| stations | 1440  | dark  | 1118               | 1563              |
| stations | 390   | dark  | 2519               | 3441              |
| setup    | 1440  | light | 1490               | 1555              |
| setup    | 390   | light | 4158               | 4453              |
| setup    | 1440  | dark  | 1490               | 1555              |
| setup    | 390   | dark  | 4158               | 4453              |
| visit    | 1440  | light | 1235               | 1309              |
| visit    | 390   | light | 1699               | 1789              |
| visit    | 1440  | dark  | 1235               | 1309              |
| visit    | 390   | dark  | 1699               | 1789              |
| assigned | 1440  | light | 1049               | 1105              |
| assigned | 390   | light | 2107               | 2158              |
| assigned | 1440  | dark  | 1049               | 1105              |
| assigned | 390   | dark  | 2107               | 2158              |

## Data limitations

Seeded identities and synthetic local test patients only. One synthetic held
intake visit is reused between passes. The other line entries are synthetic
patients left by station E2Es; queues, shift attribution and elapsed waits change
while those tests run. The after station workbench includes the synthetic BP
error-recovery patient. These are workflow evidence, not a controlled page-height
or performance comparison. The shared time scale truthfully includes long waits
left by earlier test sessions; short bars can clip their decorative text, while
full patient names, states and exact minutes remain alongside them. My Assigned
is empty for this seeded identity. No clinical readings were invented for images.

The new `station-redesign.spec.js` supplies a separate deterministic synthetic
board to verify 7/12/20/26-minute widths, claimed time differing from queue time,
the strict >20 boundary, three labelled states, staffing, review actions, on-shift
attribution, exact table values and widths 1440/1024/768/390 in both themes. It also
verifies the three-oldest summary cap and uses a real synthetic BP visit to check linked errors, keyboard focus, correction
retention and the saved 128/80 values. The existing station journey covers all
station forms, hand-off, skip reasons, offline readings and doctor review.

The flag-independent `assigned-redesign.spec.js` verifies that completed and
cancelled assignments remain in the table without inflating pending work.

## Reproduction

Load `.env` without printing it. Merge the E2E CI feature, public feature,
rate-limit and mail environment from `.github/workflows/ci.yml` over it, retaining
the real local Keycloak subjects per CODEX-HANDOFF.md. Enable both
`FEATURE_STATION_WORKFLOW_ENABLED=true` and
`NEXT_PUBLIC_FEATURE_STATION_WORKFLOW_ENABLED=true`. Build web first, then run:

```sh
WEB_DIR="$PWD/apps/web" EVIDENCE_DIR=/absolute/scratch/capture \
  npx playwright test -c docs/design-system/evidence/271/playwright.config.cjs --workers=1
```

The config uses `apps/web/e2e/auth.setup.js`. The capture creates one local synthetic
patient, checks it in and claims its intake visit once. It reuses the fixture in
`$TMPDIR/nkwapa-271-fixture.json` (override with `EVIDENCE_FIXTURE`). Reuse that
fixture across before/after; remove it only after an owner-approved database reset.
Copy `axe.json` from each output directory to `axe-before.json` / `axe-after.json`.

The default full E2E suite needs a **separate OFF build** with the CI E2E env.
Do not run that suite against this station-enabled evidence build.

## Verification

- Security scan, workspace lint, Prisma generation, typecheck, chart palette,
  measured token contrast and all 20 script tests pass. Both station-enabled and
  separate station-OFF CI-environment web builds pass.
- Normal capped Jest (`--maxWorkers=2`): 933 web, 2,842 API and 837 database tests
  pass. With the E2E CI environment also applied, web/database still pass; API has
  2,840 pass and the two documented rate-limit telemetry failures because the E2E
  rate override is 100,000 while these unit cases expect a limit of 2. The normal
  unit environment passes those cases. API source/tests are unchanged.
- Required station-enabled suite (`station-workflow` plus `patient-registry-screened`,
  with the first two redesign cases included): 22 passed, four failed. All four
  failures are the documented #197 cache-copy cases at lines 798/860; the expected
  station-workspace copy is missing or fails to recover. The clinical journey,
  capacity, attribution, assignment and all #224 registry cases pass. No assertions
  were removed or weakened.
- The existing CI station-ON step now selects `station-redesign.spec.js` too;
  flag values and the default OFF step are unchanged.
- Final new regressions: all five pass after review fixes, including the cancelled
  and completed assignment summary, the three-oldest wait summary, both-theme
  chart/table/scale fidelity and real BP validation/correction/save recovery.
- Final evidence: 20 clean after axe scans, versus two serious and zero critical
  before. Independent finish review: ship, all material fixes closed. Manual
  VoiceOver remains the planned #282 activity.
- Full default E2E on the separate OFF build, one worker, #197 excluded:
  **373 passed, 11 failed, 44 skipped** (17.3 minutes). Nine failures are the
  documented fixtures: seven patient-claim navigation timeouts and two consumed
  appointment-triage seed requests. No database reset was attempted.
- One portal axe contrast failure occurred on `/portal/self-reports/new`; the
  entire portal file then passed all nine tests alone, including that assertion.
  Portal rendering, shared UI primitives and global styles are unchanged here.
- The remaining failure is a newly encountered local clinic-metadata pagination
  assumption. The full-run snapshot had 39 clinics and displayed rows 1–10. The
  test saves a uniquely named clinic and expects it on page one. A standalone
  rerun reproduced only that failure (15 other cases passed). A read-only probe
  then found the original saved clinic on **page two**, confirming persistence
  succeeded. Clinic registry, DataTable and its spec are unchanged from release/dev.
  No assertions were changed to hide it, and no clinic data was deleted.
- Merge-preview and all five staff-chat cases passed in this full run. No #271
  regression was identified. Failure artifacts are preserved locally under
  `/private/tmp/nkwapa-271/full-test-results`; logs and the read-only diagnostic
  remain in that scratch directory. [Recorded totals](verification.json).
