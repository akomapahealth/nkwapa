# #277: authentication and onboarding evidence

Captured 2026-11-03 on the station-OFF CI build (`ci.yml` E2E env, station flags off).
Before: unchanged `release/dev` at `cfb9495`. After: this branch, web rebuilt with the same
environment.

Presentation only. No change to Keycloak flows, required actions, redirects, API calls,
validation, permissions, guards or flags. The welcome tour keeps its completion semantics,
storage and `CompleteWelcomeTourDto` at version 1. No new dependency.

## The journeys, as mapped

| Journey | Steps (unchanged)                                                                                                                                                            | Where each step now says where you are                                                    |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Staff   | Invitation email → Keycloak "Choose a password" (and confirm email) → "Your account is ready" → sign in → `/accept-invite` → `/account/name` if no name → workspace and tour | Keycloak "Setting up your account" list; app "Joining your clinic team" list, Step n of m |
| Patient | Invitation email → Keycloak "Choose a password" → "Your account is ready" → sign in → `/claim-record` → `/portal`                                                            | Keycloak "Setting up your account" list; app "Opening your patient record" list           |
| Sign in | `/login` → Keycloak login → back to the app                                                                                                                                  | `/login` "What happens next"; Keycloak "Signing in" list                                  |
| Reset   | Keycloak "Forgot password?" → email → new password                                                                                                                           | Keycloak "Resetting your password" list                                                   |

| Surface                    | Before                                                                                      | After                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`                   | Teal marketing card with three feature tiles; failed axe contrast (6 nodes at 1440)         | Canvas frame: the action first, "What happens next" as three numbered rows, "First time here?" explains invitation-only accounts      |
| `/accept-invite`           | Card, `h3` title, role as a gold badge, one paragraph when no invitation                    | `OnboardingFrame`: `h1`, Step 2 of 4, clinic/role/inviter/expiry as a ruled list, what accepting grants, Sign out                     |
| No invitation (both pages) | One paragraph covering every cause                                                          | `InvitationNotFound`: email not confirmed, expired, already used or withdrawn, each with its fix, then Check again                    |
| `/claim-record`            | Card in card, three boxed progress tiles, hidden radios styled by colour                    | Same frame, Step 2 of 3, visible native radios on hairline rows, Verify your record as its own ruled section                          |
| `/account/name` (required) | Card with its own Sign out row                                                              | Same frame, Step 3 of 4                                                                                                               |
| Keycloak theme             | Deep teal showcase card, lower-case titles ("sign-in link needs attention"), stock messages | Hairline header, form under the 2px ink rule, the matching journey list beside it, sentence-case titles, plain-language link messages |
| Welcome tour               | Dots only, one paragraph per step, six steps for everyone                                   | "Step n of m" written out over a segmented bar; welcome names role and clinic; role step lists up to four places by permission        |

## Screenshots and accessibility

Each view at 1440 (full page) and 390 (first screen), light and dark, using seeded E2E
identities (`volunteer`, `doctor`, `patient`), fresh synthetic invitations created through the
real app flows (one staff invitee, one patient claimant per run) and a synthetic Keycloak user.
`accept-invite-none` and `claim-record-none` show the no-invitation state by removing the
invitations from the `whoami` response in the browser; nothing in the database was changed for
them. `login-error` blocks the silent session check so the provider times out into its error.

The Keycloak views (`kc-*`) come from a separate, throwaway Keycloak 26.6.2 on port 8180 that
imports this repository's realm and serves a copy of the theme under test: release/dev's theme
for before, this branch's for after. The shared Keycloak on 8080 serves the main checkout and was
not touched.

`before/axe.json` and `after/axe.json`: 88 scans each. Before: 4 serious or critical
(colour contrast on the old `/login`, 1440 and 390, light). After: zero.

Document heights (px), light; dark matches. 900 at 1440 means the page fits the viewport.

| View                     | 1440 before | 1440 after | 390 before | 390 after |
| ------------------------ | ----------: | ---------: | ---------: | --------: |
| login                    |         900 |        900 |        886 |     1,170 |
| login-error              |         900 |        900 |        886 |     1,396 |
| kc-login                 |         900 |        900 |        993 |       865 |
| kc-login-failed          |         900 |        900 |      1,020 |       893 |
| kc-forgot-password       |         900 |        900 |        943 |       844 |
| kc-update-password       |         900 |        900 |      1,134 |       987 |
| kc-invalid-link          |         900 |        900 |        935 |       844 |
| claim-record             |         960 |        900 |      1,823 |     1,433 |
| claim-record-mismatch    |       1,086 |        921 |      1,969 |     1,539 |
| claim-record-none        |         900 |        900 |      1,529 |     1,206 |
| welcome-tour-volunteer-1 |       2,393 |      2,393 |      4,840 |     4,840 |
| welcome-tour-volunteer-2 |       2,393 |      2,393 |      4,840 |     4,840 |
| welcome-tour-volunteer-3 |       2,393 |      2,393 |      4,840 |     4,840 |
| welcome-tour-doctor-1    |       4,160 |      4,160 |      6,306 |     6,306 |
| welcome-tour-doctor-2    |       4,160 |      4,160 |      6,306 |     6,306 |
| welcome-tour-doctor-3    |       4,160 |      4,160 |      6,306 |     6,306 |
| welcome-tour-patient-1   |       1,518 |      1,518 |      2,917 |     2,917 |
| welcome-tour-patient-2   |       1,518 |      1,518 |      2,917 |     2,917 |
| welcome-tour-patient-3   |       1,518 |      1,518 |      2,917 |     2,917 |
| accept-invite            |         900 |        900 |        844 |     1,208 |
| accept-invite-none       |         900 |        900 |        844 |     1,195 |
| account-name             |         900 |        900 |        852 |     1,122 |

The welcome tour rows measure the page behind the dialog, which does not change.

- `/login` at 390 is taller because the guidance now follows the button; the button and title
  are still in the first screen, and the old page's guidance lived only in a desktop side panel.
- The account steps at 390 grow by the journey list, which sits below the form so the form
  stays first.
- `/claim-record` is shorter at both widths: the boxed progress tiles and nested card are gone.
- Keycloak pages are shorter at 390: no showcase above the form.

## Verification

- Full OFF Playwright (one worker, CI env): 388 passed, 49 skipped, 2 failed. The two failures
  are the new `login-theme` tests, which the local shared Keycloak cannot pass (see Known
  limitations).
- `login-theme.spec.js` run against the evidence Keycloak serving this branch's theme: 9 passed,
  including the two new tests (journey step, broken link).
- Jest (`--maxWorkers=2`): web 944, API 2,842, db 837 passed.
- Lint, typecheck, security scan, realm validation, `design:check-charts`,
  `design:check-tokens` and whole-repo Prettier passed.

## Known limitations

- The local shared Keycloak mounts the theme from the main checkout, so the full local
  Playwright run exercises release/dev's theme. The two new `login-theme` tests fail there by
  design and were verified against this branch's theme on port 8180; CI mounts the branch's
  theme and runs them for real.
- The Keycloak theme stays light only, as before: the app's theme choice lives in the web
  origin's storage, which Keycloak cannot read. The dark Keycloak captures therefore match the
  light ones.
- `kc-invitation-link` and `kc-account-ready` (after only, light, 1440 and 390) come from a
  real execute-actions email sent by the evidence Keycloak to Mailpit for a synthetic user; they
  are not in `axe.json`. The email-confirmation and page-expired screens were not captured (no
  email confirmation is required for the synthetic user, and expiry needs a timed-out session);
  they use the same frame.
- The tour version stays 1, so existing users only see the new tour if they open it from the
  user menu.
