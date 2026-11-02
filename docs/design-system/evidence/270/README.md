# #270 patient registry and records evidence

Captured 2026-11-02. Before: `release/dev` at `ab09e95`, after the required roadmap-only commit and before source edits. After: this PR. The same locally created **Synthetic Redesign270** chart is reused in both passes. No production data.

## Coverage and limitations

The multi-role seeded staff identity visits the registry, registration, overview, Vitals, edit and consent, plus the clinic-scoped registry alias. Shared registration and consent components serve both route families; the legacy chart redirects to the canonical clinic chart. 1440 × 900 captures are full-page, 390 × 844 captures show the first screen. Both themes use reduced motion. The sidebar is collapsed consistently in these pairs.

This intentionally sparse synthetic chart has no saved clinical readings, so the empty charts shown here are real empty states. Two new synthetic-response E2Es verify populated chart/table values and units, linear SVG paths, and both motion preferences. These screenshots do not establish performance with a large registry or replace the role/permission regression suite. VoiceOver remains #282.

## Accessibility

28 scans before and 28 after, **zero serious or critical axe violations** in either pass. See [before](axe-before.json) and [after](axe-after.json). Native browser form constraints remain enabled. Registration and Change ID now add a linked summary, shared inline messages, `aria-invalid` and `aria-describedby`. Edit announces existing save errors without introducing client validation. Consent retains its disabled-before-attestation behavior.

## Measured document heights

Light theme, pixels. These are full document heights, including for the cropped phone images. Both themes' exact measurements are in the axe JSON files. Results reflect this one synthetic record, not a clinical throughput claim.

| Surface         | Width | Before | After |
| --------------- | ----- | ------ | ----- |
| registry        | 1440  | 1339   | 1160  |
| registry        | 390   | 2188   | 1664  |
| registration    | 1440  | 1829   | 1673  |
| registration    | 390   | 2789   | 2381  |
| chart           | 1440  | 2489   | 2199  |
| chart           | 390   | 4441   | 3920  |
| vitals          | 1440  | 2131   | 1677  |
| vitals          | 390   | 4275   | 3289  |
| edit            | 1440  | 1781   | 1605  |
| edit            | 390   | 2697   | 2259  |
| consent         | 1440  | 1387   | 1224  |
| consent         | 390   | 2093   | 1525  |
| clinic-registry | 1440  | 1339   | 1160  |
| clinic-registry | 390   | 2188   | 1664  |

## Screenshot pairs

| Surface                      | Before                                           | After                                           |
| ---------------------------- | ------------------------------------------------ | ----------------------------------------------- |
| registry--1440--light        | [image](before/registry--1440--light.jpg)        | [image](after/registry--1440--light.jpg)        |
| registry--390--light         | [image](before/registry--390--light.jpg)         | [image](after/registry--390--light.jpg)         |
| registry--1440--dark         | [image](before/registry--1440--dark.jpg)         | [image](after/registry--1440--dark.jpg)         |
| registry--390--dark          | [image](before/registry--390--dark.jpg)          | [image](after/registry--390--dark.jpg)          |
| registration--1440--light    | [image](before/registration--1440--light.jpg)    | [image](after/registration--1440--light.jpg)    |
| registration--390--light     | [image](before/registration--390--light.jpg)     | [image](after/registration--390--light.jpg)     |
| registration--1440--dark     | [image](before/registration--1440--dark.jpg)     | [image](after/registration--1440--dark.jpg)     |
| registration--390--dark      | [image](before/registration--390--dark.jpg)      | [image](after/registration--390--dark.jpg)      |
| chart--1440--light           | [image](before/chart--1440--light.jpg)           | [image](after/chart--1440--light.jpg)           |
| chart--390--light            | [image](before/chart--390--light.jpg)            | [image](after/chart--390--light.jpg)            |
| chart--1440--dark            | [image](before/chart--1440--dark.jpg)            | [image](after/chart--1440--dark.jpg)            |
| chart--390--dark             | [image](before/chart--390--dark.jpg)             | [image](after/chart--390--dark.jpg)             |
| vitals--1440--light          | [image](before/vitals--1440--light.jpg)          | [image](after/vitals--1440--light.jpg)          |
| vitals--390--light           | [image](before/vitals--390--light.jpg)           | [image](after/vitals--390--light.jpg)           |
| vitals--1440--dark           | [image](before/vitals--1440--dark.jpg)           | [image](after/vitals--1440--dark.jpg)           |
| vitals--390--dark            | [image](before/vitals--390--dark.jpg)            | [image](after/vitals--390--dark.jpg)            |
| edit--1440--light            | [image](before/edit--1440--light.jpg)            | [image](after/edit--1440--light.jpg)            |
| edit--390--light             | [image](before/edit--390--light.jpg)             | [image](after/edit--390--light.jpg)             |
| edit--1440--dark             | [image](before/edit--1440--dark.jpg)             | [image](after/edit--1440--dark.jpg)             |
| edit--390--dark              | [image](before/edit--390--dark.jpg)              | [image](after/edit--390--dark.jpg)              |
| consent--1440--light         | [image](before/consent--1440--light.jpg)         | [image](after/consent--1440--light.jpg)         |
| consent--390--light          | [image](before/consent--390--light.jpg)          | [image](after/consent--390--light.jpg)          |
| consent--1440--dark          | [image](before/consent--1440--dark.jpg)          | [image](after/consent--1440--dark.jpg)          |
| consent--390--dark           | [image](before/consent--390--dark.jpg)           | [image](after/consent--390--dark.jpg)           |
| clinic-registry--1440--light | [image](before/clinic-registry--1440--light.jpg) | [image](after/clinic-registry--1440--light.jpg) |
| clinic-registry--390--light  | [image](before/clinic-registry--390--light.jpg)  | [image](after/clinic-registry--390--light.jpg)  |
| clinic-registry--1440--dark  | [image](before/clinic-registry--1440--dark.jpg)  | [image](after/clinic-registry--1440--dark.jpg)  |
| clinic-registry--390--dark   | [image](before/clinic-registry--390--dark.jpg)   | [image](after/clinic-registry--390--dark.jpg)   |

## Reproduce

Use only the local synthetic E2E database. Start the four local containers and keep Keycloak subjects aligned as described in `CODEX-HANDOFF.md`. Merge the E2E job's flags, public flags, mail settings and raised test rate limits from `.github/workflows/ci.yml` over the local `.env` without printing it. Keep both station-workflow flags false for this capture, then build:

```sh
npm run build -w @nkwapa/web
WEB_DIR="$PWD/apps/web" EVIDENCE_DIR=/tmp/nkwapa-270-before \
  npx playwright test -c docs/design-system/evidence/270/playwright.config.cjs --workers=1
```

Repeat on the issue branch with `EVIDENCE_DIR=/tmp/nkwapa-270-after`. `capture.spec.js` creates a synthetic chart once and saves its URL in the temporary `nkwapa-270-fixture.json`; `EVIDENCE_FIXTURE` can select another scratch path. Reuse that fixture between passes, or remove it after a test database reset. The config's setup project is `apps/web/e2e/auth.setup.js`. `axe.json` is written alongside the images; copy it to the corresponding `axe-before.json` / `axe-after.json` after capture. Never use a fixture from a production database.

## Automated validation

- Security scan, workspace lint, Prisma generation, typecheck, chart palette, measured token contrast, 20 script tests, whole-repo Prettier and CI-environment web build pass.
- Normal capped Jest: 933 web, 2,842 API and 837 database tests pass. With the E2E environment also applied, web and database still pass; API has 2,840 pass and two existing rate-limit telemetry tests fail because they expect the decorator's limit of 2, while the E2E environment deliberately overrides it to 100,000. No API source or test was changed.
- Full one-worker Playwright, `#197` excluded: **367 passed, 16 failed, 40 skipped**. Four introduced failures were repaired: two registration value-retention cases (errors now update after the control's handler, with cached values) and two stale-refresh cases (chat launcher no longer covers pagination). The targeted rerun passed the stale-refresh suite; final registration/error-state axe/consent regressions pass in both themes.
- Broad post-fix verification: 43 passed, two registration cases failed before the final input-order repair. Final form/evidence run: 15 passed, one hovered-button contrast finding; fixed the shared primary hover from 90% to 95%, measured in MASTER.md. Final regression run: **16 passed**, including all new form cases and the merge-preview file. The two chart/table tests also pass with same-day readings and both motion preferences.
- Remaining full-run local fixtures: seven `patient-claim`, two appointment-triage and one `staff-chat` (duplicate seeded staff names). The merge-preview file passed all six cases in the final regression run; an isolated rerun passed five and timed out again in the responsive candidate-selection case (detached button), consistent with the documented intermittent flake. No assertions were removed or weakened, and no database reset was performed.
- Station-enabled build and specs: **20 passed, four failed**. All three completed-screening registry tests pass. Every failure is in the documented `#197` offline-copy group; no station/outbox code changed. The isolated merge-preview rerun used `--no-deps` after fresh auth setup in the preceding regression run.
