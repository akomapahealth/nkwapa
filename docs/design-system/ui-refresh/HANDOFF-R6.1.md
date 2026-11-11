# Handoff: R6.1 Public site (landing and supporting pages)

Continue the frontend-only Layered Clinical Workspace refresh on `ui-refresh/r1-1-tokens`. Learning
guardrails stay suspended (direct mode, no teach-back). Implement **R6.1 only**, validate, review,
update docs and commit locally. Do not push.

R5 is complete: patient portal (R5.1, `bcc2d77e`) and authentication screens (R5.2). Read
`R5.2-REVIEW.md` before starting.

## Scope

Master spec Phase R6 and section 7.12: visual consistency for the public site, kept independent of
staff workflows. Mode is **Persuade** for the landing page and **Read** for the legal pages.

- Routes: `app/(marketing)/page.tsx` (landing), `/privacy`, `/terms`, `/cookies`.
- Components: `components/landing/*` (header, hero, product frames and showcase, sections,
  `LandingFooter`, `LegalPage`, `LegalContents`, `ReleaseBanner`, `CookieSettingsButton`).
- Navigation and footer consistency between the landing page, legal pages and `/login`: `/login`
  now sits on the inset sheet (R5.2); decide whether the public pages share that frame or stay
  full-bleed, and record the decision in MASTER.
- Product visual storytelling where it earns its place. Product screenshots must come from seeded
  synthetic data; production data never appears.

Out of scope: `/login` behaviour, Keycloak, any workspace route, analytics and consent logic.

## Rules that already bind this unit

- MASTER section 12 "Public navigation and supporting pages (#279)", "Sign-in entry", "Public
  landing page (#278)" and "Route QA and landing restraint (#282)". Read them first.
- PRODUCT.md "Evidence on hand": no testimonials, customer counts, screening totals or outcome
  figures without a source. Do not add any.
- Nothing public offers sign-up (`registrationAllowed: false`).
- Landing motion may exceed 200 ms only where nothing waits on it (section 9.1 and "Sign-in entry").
- Real Akomapa photographs live in `apps/web/public/`. Never put reference or evidence images there.

## Skills

Load `impeccable` (context, critique, polish, detector; record the detector result). Persuade mode
allows more expression than R3 to R5 did. Load `typeset` or `layout` only if the critique points
there.

## Known before you start

- Specs that reach this unit: `landing`, `legal`, `public-routes`, `public-supporting-pages`,
  `accessibility`, `pwa`, `login-theme` (it also opens the landing page). Grep `e2e/` and
  `playwright/` for every string you change.
- Validation env: recreate `S/audit-env.sh` and `S/env.sh` from `HANDOFF-R2.1.md`; the BAD-DB guard
  must pass. The R5.2 run left `nkwapa_audit` migrated and the `patient-claim` fixture restored.
- The six-role route audit does not cover public pages; use a scratch evidence spec (copy of
  `route-audit/route-audit.spec.js` with an empty storage state) for `/`, `/privacy`, `/terms` and
  `/cookies` at 1440/768/390/320 in both themes, plus a `hasTouch` pass listing controls under 44px.
  Delete it after.
- Carried, still out of scope: open-overlay accessibility, transient sync, backend Crisis
  acknowledgement, Sunday appointment lifecycle, Safari/Firefox, screen readers, page eyebrows (R7).

## Validation

Audit-flag build, standalone TypeScript, changed-file ESLint and Prettier, detector, focused
Chromium over the specs above in one invocation (one worker), six-role normal-route audit as a
regression check (R5.2 baseline: 12/12, 228 rows, 0 violations, 0 overflow), scratch evidence into
ignored `evidence/r6-1/after/`. Write `R6.1-REVIEW.md`, a `PROGRESS.md` entry and the next handoff.
