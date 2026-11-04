# #282 (UX-22): route QA, landing restraint and What's New

Captured 2026-11-04 from production builds (`next build` with the `ci.yml` web environment).
Before: unchanged `release/dev` at `deb5f80`. After: this branch. The landing and What's New
captures used `next start` on port 3100 with no API. The long release is a temporary harness route
(`/evidence-282`, 16 new, 14 improved and 9 fixed synthetic items) added to both capture builds and
not committed; the live banner showed the real 1.5.1 release from GitHub.

The route audit ran the after build on port 3000 with this worktree's API on port 4000, against
the shared local database and Keycloak, signed in as the six seeded E2E identities. It only
navigates and scans: no form is submitted, nothing is reseeded or migrated.

Presentation only. No change to API responses, permissions, route guards, feature flags,
analytics consent, clinical fields, validation or save semantics. No file in the open UX-21 PR
(#308) is touched except `MASTER.md` and `REDESIGN-ROADMAP.md`, in hunks away from its own.

## What changed

| Area                 | Before                                                                                                                 | After                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Section heads        | `SectionRule`: the 2px ink rule with a bold label ("Before Nkwapa", ...)                                               | The 2px rule alone, `aria-hidden`                                                           |
| Hero kicker          | "Electronic medical records for hypertension and diabetes care"                                                        | Removed; a 64 × 2px logo-gold rule above the headline is the page's one bright accent       |
| Hero                 | Akomapa-17 plus a phone screenshot with a caption, both on the right half                                              | Akomapa-17 alone, still the LCP; the phone's scroll drift removed from `LandingMotion`      |
| Headline             | "Patient records and clinic workflows, in one place." + 33-word paragraph                                              | "One record for every visit, even offline." + one 17-word sentence                          |
| Captions             | 11 rendered `figcaption`s under photographs and screens                                                                | None; alt text carries the description                                                      |
| Copy                 | 1,151 words in `main`                                                                                                  | 540 words; the problem list and the duplicate "each role" safeguard removed                 |
| Release banner       | Uppercase "NEW" chip                                                                                                   | No chip                                                                                     |
| What's New, 39 items | Every item shown; each staggered 70ms (2.8s for the last); whole dialog scrolled, so the title and Close scrolled away | Title band, one named scrolling region, fixed footer; 3 per group with "Show all N" toggles |

Copy rules and the accent token are recorded in MASTER.md, "Phase 09 QA and landing restraint
(#282)". Every remaining claim was already on the page before this change.

## Screenshots and accessibility

`before/` and `after/`, each in light and dark at 1440 and 390:

- `landing-hero--*.jpg`: the first screen.
- `landing--*.jpg`: the full page after one scroll-through (pinned scenes show their end state).
- `whats-new--*.jpg`: the dialog opened on the 39-item harness release.
- `axe.json`: all axe rules on the landing page and on the open dialog, with page height, word
  count, dialog height, list items shown and tab stops.

| View              | Width | Before                       | After                       |
| ----------------- | ----: | ---------------------------- | --------------------------- |
| landing, light    |  1440 | clean, 14,947px, 1,151 words | clean, 13,453px, 540 words  |
| landing, light    |   390 | clean, 16,928px              | clean, 13,431px             |
| landing, dark     |  1440 | clean                        | clean                       |
| landing, dark     |   390 | clean                        | clean                       |
| What's New, light |  1440 | clean, 39 items, 3 tab stops | clean, 9 items, 6 tab stops |
| What's New, light |   390 | clean, 39 items              | clean, 9 items              |
| What's New, dark  |  1440 | clean                        | clean                       |
| What's New, dark  |   390 | clean                        | clean                       |

The six tab stops after are Close, the scrolling region (so a keyboard can scroll it), two
"Show all" toggles (Fixed has nothing hidden), the email link and the GitHub link.

Accent contrast: logo gold `hsl(47 100% 55%)` on the hero ground `hsl(200 25% 8%)` 12.2:1; the
dark-theme gold `hsl(47 85% 52%)` 10.5:1. The banner's gold chip was dropped rather than kept as
a second accent (its dark-theme gold on the dark-theme teal measured 1.3:1).

## Route audit (UX-22 QA matrix)

`route-audit.spec.js` signs in as each seeded identity and visits its routes in light and dark at
1440 and 390, with reduced motion. For each view it records where it landed, the h1, the h1
count, sideways overflow and every axe finding. `route-audit.json` has all 228 rows;
`routes/` holds one 1440 light screenshot per role and route (synthetic seed data only).

| Identity  | Routes | Scans | Serious or critical | Sideways overflow | Redirected |
| --------- | -----: | ----: | ------------------: | ----------------: | ---------: |
| staff     |     26 |   102 |                   0 |                 0 |          0 |
| manager   |      8 |    32 |                   0 |                 0 |          0 |
| director  |      6 |    24 |                   0 |                 0 |          0 |
| patient   |      6 |    24 |                   0 |                 0 |          0 |
| doctor    |      6 |    22 |                   0 |                 0 |          0 |
| volunteer |      5 |    20 |                   0 |                 0 |          0 |
| **Total** |     57 |   224 |               **0** |                 0 |          0 |

The acceptance bar (zero serious or critical axe findings) is met. Four rows did not scan: the
patient record at 1440 for staff and doctor, where the audit's link lookup timed out on the
desktop registry table. The same record scanned clean at 390 in both themes for both roles.

Moderate and best-practice findings, not fixed here (each is owned by another surface or by the
open UX-21 PR):

| Rule                   | Where                                                                                                   | Cause                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page-has-heading-one` | `/stations` (staff, manager, volunteer), `/stations/setup` (staff); director on `/reports/organization` | The station line is off in the `ci.yml` build, and its notice has no h1. `NoAccessState` has no h1 either. The director being refused the organization report is the guard working (system admin only). |
| `region`               | All six portal routes                                                                                   | Content outside a landmark in the portal shell. `PortalLayout.tsx` is in UX-21 (#308), so left to it.                                                                                                   |
| `heading-order`        | `/admin/data-requests`, `/reports/organization`, `/settings` (staff)                                    | A heading level skipped.                                                                                                                                                                                |
| `empty-table-header`   | `/reports/organization` (staff)                                                                         | A table header cell with no text.                                                                                                                                                                       |

Not covered by this pass: keyboard-only and screen-reader walkthroughs of each workflow,
Lighthouse, and the station-flag-on build (CI's second web build runs the station specs with the
flag on). The landing page's keyboard paths are covered by `e2e/landing.spec.js`.

## Verification

- Web lint and typecheck clean. Web Jest (`--maxWorkers=2`): 948 passed, including the new
  `components/landing/ReleaseBanner.test.tsx` (a 32-item release opens with 3 per group, toggles
  carry `aria-expanded` and expand one group; a 6-item release shows everything with no toggle).
- `e2e/landing.spec.js` and `e2e/legal.spec.js`: 34 passed (CI=1, one worker, against the build on
  3100, without the auth setup project). The landing spec now asserts the new h1, one picture in
  the hero, no captions, the What's New dialog opened and closed by keyboard at 390 with focus back
  on the banner, Close in view, and the named scrolling region.
- Route audit: 12 passed (6 sign-ins, 6 identities), 224 scans.
- Every UI string changed was grepped in `apps/web/e2e/`: only `landing.spec.js` used any.
- Not run here: the full signed-in E2E suite. No accessible name it uses changed. CI runs it.

## Known limitations

- The hero headline says "even offline": registration, visits, vital signs, consent and
  prescriptions work offline, but assigning staff and moving patients between stations do not.
  The offline section still says so, as before.
- What's New was measured with a synthetic 39-item release on a harness route, not a real one;
  the real 2.0 notes will vary in length per item.
- The route audit ran before UX-21 (#308) merged, so its findings reflect `release/dev` plus this
  branch. Re-run it after #308 lands.

Run: `BASE_URL=http://localhost:3100 node docs/design-system/evidence/282/capture.cjs after` from
`apps/web`, against a build that includes the harness page. Route audit: see the header of
`route-audit.config.cjs`.
