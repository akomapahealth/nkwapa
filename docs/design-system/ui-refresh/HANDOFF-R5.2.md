# Handoff: R5.2 Authentication screens (and R5.1 carry-overs)

Continue the frontend-only Layered Clinical Workspace refresh on
`ui-refresh/r1-1-tokens`. Learning guardrails stay suspended (direct mode, no teach-back).
Implement **R5.2 only**, validate, review, update docs and commit locally. Do not push.

R5.1 is complete: patient portal (`bcc2d77e`), with its six-role audit and 390/320 evidence
(`96839810`). Read `R5.1-REVIEW.md` before starting.

## Skills to load first

R5.1 did **not** load any design skill. It saved tokens by applying the R4 contracts from memory.
Load these before designing R5.2 and use them as stated:

1. **`impeccable`**: context loader, then the polish and critique passes and the anti-pattern
   detector over the changed files (record the detector result, as R4.3 did: `[]`). If it starts a
   PRODUCT.md interview, skip it: `apps/web/PRODUCT.md` exists.
2. **`emil-design-eng`**: form hierarchy, button states, error presentation, and the "should this
   animate at all" decision. Sign-in is a screen people see daily: keep motion to feedback only.
3. **`apple-design`**: typography (optical size, tracking, leading) for the sign-in hierarchy,
   restraint, and reduced motion.

Load when the step reaches them:

- **`clarify`**: auth and error microcopy (expired link, wrong password, locked account, email not
  verified). Plain language for patients; never reveal whether an account exists.
- **`accessibility`** or **`web-design-guidelines`**: auth forms (labels, `autocomplete`, password
  reveal, error association with `aria-describedby`, focus on first error).
- **`harden`**: long emails and names, 320px, 200% text, Keycloak messages longer than expected.

Also not yet done from R5.1 and owed here: run `impeccable` critique against the R5.1 portal screens
(Overview, Health, Appointments, request and log-reading forms) and fix anything material it finds
in the same unit, noting it in the review as an R5.1 follow-up.

## Start here

Read `R5.1-REVIEW.md`, the latest `../PROGRESS.md` entries (R1.1/R1.2 "Outstanding problems" on the
login sheet and Keycloak email templates), `../MASTER.md` sections 8 (controls, `FormActions`) and 9
(component contract), and master spec sections **7.12** and **Phase R5**, plus `apps/web/AGENTS.md`.
Synthetic data only; never open `references/01-current-ui` or `02-design-references`.

## Scope

Spec 7.12: bring login, account activation, invitation and related presentation into the same
visual family, with restrained branding and a clear form hierarchy. Do not change Keycloak security,
identity verification, session behaviour or authorization.

- Web app: `app/(workspace)/login/page.tsx` (397 lines), `accept-invite/page.tsx`,
  `claim-record/page.tsx`.
- Keycloak login theme: `infra/nkwapa/keycloak/themes/nkwapa/login/` (`template.ftl`, `login.ftl`,
  `register.ftl`, `login-reset-password.ftl`, `login-update-password.ftl`, `login-verify-email.ftl`,
  `login-page-expired.ftl`, `info.ftl`, `error.ftl`, `resources/css/styles.css`, `messages_en`).
- Known gaps: the login page and Keycloak form sit on the canvas, not a sheet (deferred to R5 since
  R1.1). Keycloak email templates (`email/html/*.ftl`) use Tailwind greys and `#0f766e`, not brand
  tokens. Email clients need inline styles and tables; do not import the app's CSS.
- R5.1 carry-over: `/account` (profile, "Your data", notifications, staff name form) is shared with
  staff and was not restyled. Bring it to the R4 contracts (hairline rows, `RecordSection` over
  nested `Card`s, `FormActions`, Accra dates) without changing its permission split.

Design 390 and 320 first. Touch targets are 44px on a coarse pointer (36px on a mouse is by design,
R3.8). Every field gets correct `autocomplete` (`username`, `current-password`, `new-password`,
`email`, `one-time-code`).

## Contracts carried from R4 and R5.1

- Warning ink with `ShieldCheck` only for what cannot be undone from the screen. Reversible actions
  are plain outline buttons.
- Counts in words at the end of a description, never a boxed tile.
- Dates through `formatOps*`, `formatInviteDate`, or `formatPortalDate*` (all Africa/Accra since
  R5.1). Never `toLocaleString()`.
- Phone lists are hairline rows (`divide-y divide-rule`), not rounded cards.
- A waiting decision leads in a ruled band; after the action, focus moves to what replaced it.

## Known before you start

- **Keycloak theme:** `nkwapa-keycloak` bind-mounts the theme from this main checkout in
  `start-dev`, so edits show on reload. From a worktree they do not (see the memory note; use a
  throwaway Keycloak on another port).
- **Local DB drift:** in R5.1 the local `nkwapa` database lacked every migration after 2026-10-31,
  so `/auth/whoami` returned 500 and 39 specs failed. If whoami fails, run `npm run db:migrate:deploy`
  (root `.env` loaded) and rebuild the API before blaming the change. `nkwapa_audit` is current.
- **Specs that reach this unit:** `login-theme`, `forgot-password`, `patient-account-setup`
  (also fails on release/dev), `patient-claim` (consumes its fixture; restore with
  `SEED_SAMPLE_IDENTITY=true`), `portal-invite-lifecycle` (needs the email env), `staff-invite`,
  `settings`, `auth.setup.js` (every spec logs in through the Keycloak form: a broken selector there
  fails everything). Grep `e2e/` and `playwright/` for every string, label and id you change,
  especially Keycloak form ids (`#username`, `#password`, `#kc-login`).
- `portal-shell` held-changes test fails on baseline; do not count it.
- Carried, still out of scope: open-overlay accessibility, transient sync, backend Crisis
  acknowledgement, Sunday appointment lifecycle, Safari/Firefox, screen readers, MASTER #274's older
  warning rule, page eyebrows (R7).

## Validation

Follow `HANDOFF-R3.8.md` and the R2.1 audit-harness recipe (guarded `nkwapa_audit`, one worker,
Jest `--maxWorkers=2`, never the full e2e suite). Recreate `S/audit-env.sh` and `S/env.sh` in the new
scratchpad; the BAD-DB guard must pass.

- Audit-flag build, standalone TypeScript, changed-file ESLint and Prettier, `impeccable` detector.
- Focused Chromium over the specs above in one invocation.
- Six-role normal-route audit (R5.1 baseline: 12/12, 228 rows, 0 violations, 0 overflow).
- Scratch evidence spec: copy `route-audit/route-audit.spec.js` and its config, set the routes to the
  login, invite and claim pages plus the Keycloak pages reachable without credentials (login, reset
  password), widths 390/320 (add 768/1440 for the sheet layout), both themes, full-page shots into
  ignored `evidence/r5-2/after/`, and a list of `main` controls under 44px. Run it once with
  `hasTouch: true` so touch sizing is measured, not the mouse size. Delete the scratch files after.
- Write `R5.2-REVIEW.md` and a `PROGRESS.md` entry, mark R5 complete if both units are done, and
  write `HANDOFF-R6.1.md` (public site).
