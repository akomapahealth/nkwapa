# User Testing Guide

This guide is the current manual QA and user acceptance checklist for the implemented product surface.

Use it when validating releases, new role setup, workflow changes, or the safety of major infrastructure updates.

---

## 1. Prerequisites

Postgres, Redis and Keycloak come up together; the API and web app run from the workspace.

```bash
cd infra/nkwapa && docker compose up -d
```

Then, from the repository root:

```bash
npm run db:migrate:dev
npm run db:generate
npm run e2e:keycloak-user      # creates the deterministic identities in Keycloak
npm run db:seed                # links them, and seeds the sample clinic
```

`e2e:keycloak-user` prints the user id Keycloak actually assigned for each identity, which is **not**
the id requested. Feed those back into the seed as `SEED_E2E_*_SUB` or the accounts will exist in
Keycloak without matching rows in the database.

Seed inputs worth setting:

| Variable                                                              | Why                                                                                                                                                                    |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SEED_SAMPLE_PATIENT=true`                                            | a demo patient with two encounters                                                                                                                                     |
| `SEED_SAMPLE_APPOINTMENTS=true`                                       | one appointment in each state, plus two requests awaiting triage                                                                                                       |
| `SEED_E2E_PATIENT_SUB`                                                | links the portal identity to a patient record, and stages one unclaimed patient with a pending invite. **Without it no portal or `/claim-record` check is reachable.** |
| `SEED_E2E_STAFF_SUB`, `SEED_E2E_DOCTOR_SUB`, `SEED_E2E_VOLUNTEER_SUB` | the single-role accounts the no-access checks need                                                                                                                     |
| `SEED_SYSTEM_ADMIN_SUB`                                               | your own account, for the system-admin matrix                                                                                                                          |

### Two things that will waste your afternoon

**Re-seeding cannot restore consumed appointment fixtures.** The triage checks consume the pending
requests they act on. `seedSampleAppointments` guards on the demo _patient_, not on the
appointments, so `npm run db:seed` reports `Sample appointments already exist; skipping` while the
fixtures you need are gone. Delete the patient — appointments cascade — and seed again:

```js
await prisma.patient.deleteMany({ where: { firstName: 'Appointment', lastName: 'Demo' } });
```

Use the seed's own connection options (`-c app.is_system_admin=true`) or row-level security blocks
the delete, and run the script from inside the repository so Node resolves its dependencies.

**The rate limiter will fail unrelated checks.** `/auth/whoami` allows 60 requests a minute per
user, and every page load calls it. A long manual sweep on one account exhausts the budget, after
which pages show **"We couldn't confirm your access"** — a 429 resolves to _unavailable_, which
looks exactly like a broken build. The E2E job raises the limit for itself; if you are clicking
through quickly, either pause or set `RATE_LIMIT_AUTH_WHOAMI_LIMIT` for your local API.

---

## 2. Accounts

`npm run e2e:keycloak-user` creates five deterministic identities. Their passwords are the
`E2E_*_PASSWORD` defaults unless you overrode them.

| Username        | Holds                                 | Use it for                                                                                     |
| --------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `e2e.staff`     | `SYSTEM_ADMIN` plus every clinic role | walking the product quickly. **Never** for proving what a role is refused — it sees everything |
| `e2e.doctor`    | one `DOCTOR` seat                     | the review and finalization matrices, and doctor-side no-access checks                         |
| `e2e.volunteer` | one `VOLUNTEER` seat                  | the volunteer matrix, and what a volunteer is refused                                          |
| `e2e.patient`   | `PATIENT`, linked to a patient record | every portal check                                                                             |
| `e2e.reset`     | password-reset flows                  | the forgot-password path                                                                       |

Create by hand as needed:

- a `DIRECTOR` and a `MANAGER`, for sections 7 and 8
- a second clinic, and a staff account holding a seat at both, for tenant-isolation and
  clinic-switching checks
- a patient with a pending invite but no linked record, if you did not seed one, for `/claim-record`

**Single-role accounts are not optional.** Most of what this guide asks you to prove is that a role
_cannot_ do something, and the multi-role staff account can do everything.

---

## 3. What Already Runs On Every Push

Read this before running anything below. Most of what the matrices in this guide describe is
checked on every push, and re-running it by hand is wasted effort. What is left after this section
is the part that genuinely needs a person.

### Automated — do not re-do these by hand

| Check                                                              | Where                                                                                               |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Every route at 375 / 640 / 768 / 1024 / 1440, no overflow          | `e2e/responsive-migration.spec.js` (staff + portal)                                                 |
| Patient portal renders, per route, signed in as a patient          | `e2e/portal.spec.js`                                                                                |
| A patient is refused every staff surface                           | `e2e/portal.spec.js`                                                                                |
| Dark mode renders and passes axe on staff and portal routes        | `e2e/dark-mode.spec.js`                                                                             |
| Dark mode survives navigation without flashing light               | `e2e/dark-mode.spec.js`                                                                             |
| Automatable WCAG rules on the chart and the portal                 | `accessibility.spec.js`, `portal.spec.js`                                                           |
| Focus is visible on every control the keyboard reaches             | `accessibility.spec.js`, `portal.spec.js`, `login-theme.spec.js`                                    |
| Login theme: typeface, brand fill, radius, no third-party fonts    | `e2e/login-theme.spec.js`                                                                           |
| Loading / empty / error / retry on the three #22 routes            | `e2e/route-fallbacks.spec.js`                                                                       |
| Chart series palette, contrast and colour-blind separation         | `npm run design:check-charts`                                                                       |
| Every duplicate rule, exact and fuzzy, reaching the queue          | `patients/patient-duplicate.service.spec.ts`                                                        |
| Every merge refusal and warning, and both merge strategies         | `patients/patient-merge.service.spec.ts`                                                            |
| Every way a claim is refused, and the four ways it is accepted     | `patient-portal/patient-claim.spec.ts`                                                              |
| Canonical chart redirects, including a merge chain and a cycle     | `patients/patient.repository.spec.ts`                                                               |
| A refused merge, and the redirect banner, in a browser             | `e2e/patient-identity.spec.js`, `e2e/patient-merge-preview.spec.js`                                 |
| Claiming a record, refused and accepted, as the patient            | `e2e/patient-claim.spec.js`                                                                         |
| Every sync conflict code catalogued, worded, and retry-classified  | `packages/db/src/sync-conflicts.spec.ts`, `sync/sync-outcome.spec.ts`, `lib/sync-conflicts.test.ts` |
| Refused changes persist, are not re-sent, and never stop the pull  | `lib/sync.test.ts`, `lib/sync-rejected.test.ts`                                                     |
| A duplicate-patient conflict, recovered in a browser               | `e2e/sync-recovery.spec.js`                                                                         |
| An offline patient edit drains on reconnect                        | `e2e/sync-recovery.spec.js`                                                                         |
| Offline shift start and patient check-in replay exactly once       | `ops/ops.service.spec.ts`, `sync/sync.service.spec.ts`, `e2e/today-offline.spec.js`                 |
| Every automated row of the offline and job execution matrix        | `testing/offline-job-matrix.spec.ts` (fails if a named test disappears)                             |
| A failed or stalled sync drains by itself; stale-clinic work waits | `lib/sync-replay.test.ts`, `lib/sync-retry.test.ts`, `e2e/offline-replay.spec.js`                   |
| One change pushed twice applies once, and only at its own clinic   | `sync/sync.service.spec.ts`, `e2e/offline-replay.spec.js`                                           |
| Reminders and research exports run once, retry, and record failure | `reminders/*.spec.ts`, `research/research-export.*.spec.ts`                                         |
| Job and replay rows are isolated per clinic by the database        | `packages/db/src/tenant-isolation.integration.spec.ts`                                              |

640 is in the width list because it is what 1280 becomes at 200% zoom.

### Manual — genuinely irreducible

Automated rules catch a real subset of accessibility defects and nothing more. These need a
person, and they are the ones worth an afternoon:

- [ ] **Does the focus order match the reading order?** A spec can prove every control takes focus
      and shows a ring. It cannot tell you the order felt wrong.
- [ ] **Do the labels mean anything?** `aria-label="Show help"` passes every rule and tells a
      clinician nothing about which help.
- [ ] **Rendered chart contrast.** axe reads DOM colours; a chart is painted into SVG from token
      values, so the numbers are computed by `design:check-charts` and the _result_ is not
      inspected by anything but an eye.
- [ ] **A real screen reader.** VoiceOver or NVDA through one encounter, start to finish. Announced
      order, whether a save is reported, whether an error is reachable from where focus lands.
- [ ] **Clinical language.** Whether a volunteer who has never used the product can tell what a
      field wants without asking. No rule measures this.
- [ ] **The offline path on a genuinely bad connection**, not a throttled one — clinic wifi that
      resolves DNS and then stalls is a different failure from being offline.

### Before trusting a local full-suite run

The two `patient request triage` specs consume the pending requests they act on, so they fail on
any second run against the same database, and re-seeding does not put them back. Reset them the way
section 1 describes, or expect exactly those two failures and check that nothing else moved.

`e2e/patient-claim.spec.js` consumes its fixture too, for a reason no reset can avoid: a claim
links the account permanently, and after one the identity is redirected off `/claim-record` and
every test in the file fails at the first assertion. Unlike the triage specs, `npm run db:seed`
**does** put this one back — `SEED_SAMPLE_IDENTITY` clears the link, the role, the `portalUserId`
and the settled invitation on every run. So: re-seed between local runs of that file, and if you
see all seven of its tests fail together, re-seed before reading any of them as a real failure.

CI is unaffected either way, since it seeds once into a fresh database and runs once.

---

## 4. Global Smoke Test

1. Open the web app.
2. Confirm `/` stays on the marketing landing page and does not show a sign-in CTA.
3. Confirm an unauthenticated visit to `/dashboard` redirects to `/login?next=...`.
4. Confirm `/login` redirects to Keycloak after clicking the secure sign-in button.
5. Log in.
6. Confirm `/auth/whoami` bootstraps successfully.
7. Confirm the app loads without raw crash output.
8. Confirm clinic switching works for multi-clinic users.
9. Confirm logout and re-login work.

Also verify:

- no obvious blank screen on initial load
- route loading skeleton appears when the app is still resolving
- page-level retry actions exist for recoverable failures
- landing page buttons only scroll within the page and do not jump directly into app sign-in

---

## 5. Security And Tenant Isolation Smoke

- [ ] allowed frontend origins can call the API
- [ ] a disallowed origin is rejected by CORS
- [ ] a clinic-scoped user cannot access another clinic's records
- [ ] a system admin can access cross-clinic administrative views
- [ ] rate-limited endpoints return `429` with a readable recovery message
- [ ] API failures return a structured error with a request ID

### Clinical records release gate

Run once per environment, before enabling clinical records there. See
`docs/specs/11_CLINICAL_RECORDS_RELEASE_GATE.md` for the operator steps behind these.

- [ ] the API boot log reads `Row level security is enforced for database role "nkwapa_app"`
- [ ] `DATABASE_RLS_ENFORCEMENT=required` is set, and the service refuses to start without it when
      pointed at the owner credential
- [ ] a doctor at clinic A, signed in and switched to clinic A, cannot open a patient belonging to
      clinic B by URL
- [ ] a user holding a seat at two clinics sees only the first clinic's patients while it is active
- [ ] an audit entry for a clinical write shows the caller's address and a request ID shared with
      the other writes from the same action

---

## 6. System Admin Matrix

- [ ] `/admin/clinics` loads
- [ ] `/admin/users` loads
- [ ] create clinic works
- [ ] assign clinic roles works
- [ ] global `SYSTEM_ADMIN` assignment works
- [ ] user deactivation works
- [ ] self-deactivation is blocked
- [ ] duplicate patient merge succeeds for same-clinic charts (section 6b covers the rest)
- [ ] `/admin/duplicates/cross-clinic` loads and is read-only (section 6b)

---

## 6b. Patient Identity Matrix

Signed in as a system administrator. Run this when a release touched duplicate detection, patient
merge, the portal claim, or anything that resolves a chart by id or by code.

Identity is the one workflow here where a mistake is a safety incident rather than a bug: a merge
cannot be undone from the product, and a mis-scoped claim hands one patient another patient's
record. See `docs/security/patient-identity-matrix.md` for the rules behind these checks — it is
generated from the table the API suite asserts against, so it cannot drift from the code.

**Fixtures:** `SEED_SAMPLE_DUPLICATES` stages two duplicate pairs, and `SEED_SAMPLE_IDENTITY`
stages four charts the product cannot produce: "E2E Merged" with "E2E Retired" already merged into
it, "E2E Keep Blocked" and "E2E Duplicate Blocked" whose merge is refused because "E2E Collision"
already answers to the duplicate's code, "E2E No Birthday" with a live invitation and no date of
birth, and "E2E By Phone" with a phone-only invitation. Without them the only merge refusal you can
reach is naming the same chart twice.

### The duplicate review queue

- [ ] `/admin/duplicates` lists both seeded pairs, strongest first
- [ ] each row reads in plain language — "Very likely", "Same name and date of birth" — and never
      shows an enum value
- [ ] the Kwabena / Kwabina pair says the names are not spelt the same, because it matched on a
      resemblance rather than an exact value
- [ ] a clinic manager sees only their own clinic's pairs; a cross-clinic pair is marked as not
      mergeable rather than offering a button that can only fail
- [ ] dismissing a pair hides it, the filter brings it back, and undoing it is possible
- [ ] the queue never changes a chart: after any decision, both patient records are untouched

### Investigating duplicates across clinics

**Fixtures:** `SEED_SAMPLE_CROSS_CLINIC=true` adds "Nkwapa Clinic - Kumasi" (active) and
"Nkwapa Clinic - Tamale" (inactive), with matching charts across them. To run this with your own
data instead, register the same person (same name, date of birth and phone) at two active clinics.

- [ ] `/admin/duplicates/cross-clinic` appears in the navigation for a system administrator, and
      not for a director, manager, doctor or volunteer
- [ ] a director who types the address sees a no-access explanation with a link back to Duplicate
      review, and no patient data
- [ ] the clinic pair "Nkwapa Clinic - Demo and Nkwapa Clinic - Kumasi" shows 2 pairs: 1 very
      likely, 1 possible
- [ ] Abena Sarpong does not appear anywhere: one of her charts is in an inactive clinic
- [ ] each pair names both clinics and both chart codes, says why it matched, and says merge is
      not allowed because the charts belong to different clinics
- [ ] the page and the comparison panel offer no decision, no merge and no merge preview; the
      panel says "Investigation only" and links to the review queue
- [ ] choosing a clinic pair narrows the list, and the totals and the clinic-pair card do not change
- [ ] "Export counts" downloads a CSV of clinic pairs and counts with no patient names or codes
- [ ] the `AuditEvent` table holds a `PATIENT.DUPLICATE.CROSS_CLINIC.VIEW` row per load, with a
      null clinic, filters and counts, and no patient identifiers (the clinic-scoped `/audit`
      screen does not list unowned events)
- [ ] the review queue's "All clinics" view links to the investigation
- [ ] 375 / 768 / 1024 / 1440: the page never scrolls sideways, and pairs are cards below 1024

### Previewing a merge

- [ ] the preview names, for both charts, what moves and what is left behind
- [ ] a national ID appears only as its last four digits, never in full
- [ ] "E2E Keep Blocked" against "E2E Duplicate Blocked" is refused, says the duplicate's code is
      already recorded against another chart, and tells you to ask a system administrator
- [ ] a refused merge offers no way to commit it — not a disabled button further down, no step at
      all
- [ ] a warning is visibly different from a refusal by more than its colour, and each list says
      whether it stops the merge
- [ ] the confirmation asks for the retiring chart's code typed back, and backing out changes
      nothing
- [ ] a preview left open while the chart changes elsewhere is refused on submit, and says to
      preview again

### Canonical chart redirects

- [ ] opening "E2E Retired" by its own address lands on "E2E Merged"
- [ ] the page says the record you opened was merged into this one, and the notice is still there
      after the address changes
- [ ] the retired chart does not appear in the patient list or in search
- [ ] the merged chart's visits, measurements and invitations are all present on the survivor

### Claiming a record

Run as the patient, not as staff. Every refusal must say what to do next; a refusal a patient
cannot act on ends with them phoning a clinic that cannot see what they saw.

`e2e/patient-claim.spec.js` now signs in as an invited, unclaimed account and covers the routing,
both detail mismatches, the skip link and keyboard order, four widths, axe, and a real claim. What
is left below is what that spec cannot reach: states needing a second account, a lapsed
invitation, or a chart the claim form cannot be pointed at.

- [ ] "E2E By Phone" can be claimed from an account whose number matches and whose email does not
- [ ] "E2E No Birthday" is refused, and says to ask clinic staff to add the date of birth — not to
      try again
- [ ] an account that was never invited is refused on identity before the code is even considered
- [ ] an expired invitation names the date it expired
- [ ] a cancelled invitation says the clinic cancelled it
- [ ] claiming the same invitation twice is refused the second time
- [ ] a record already connected to another sign-in is refused rather than taken over
- [ ] the old patient code from a merged chart still claims the surviving record

**Fixture note:** a successful claim links the account for good. `SEED_SAMPLE_IDENTITY` clears the
link, the role, the `portalUserId` and the settled invitation on every seed, so re-running
`npm run db:seed` puts the claimant back rather than leaving it spent.

### Widths and keyboard

- [ ] 375 / 768 / 1024 / 1440 and 200% zoom: the duplicate queue and the merge panel never scroll
      sideways (the claim form is covered by `e2e/patient-claim.spec.js`)
- [ ] the merge panel is fully operable by keyboard, including both steps and the confirmation
- [ ] a refusal on the claim form is announced, not only shown

---

## 7. Director Matrix

- [ ] clinic settings page loads
- [ ] research toggles persist
- [ ] research export request succeeds
- [ ] approval and rejection actions work
- [ ] completed export shows metadata and artifact actions
- [ ] clinic-scoped admin user actions respect allowed bounds
- [ ] audit page loads

---

## 8. Manager Matrix

- [ ] `/today` loads
- [ ] active shifts render
- [ ] patient check-ins group correctly by status
- [ ] assignment modal only shows active eligible staff
- [ ] reassignment works
- [ ] **Offline floor (#17).** DevTools → Network → `Offline` on `/today`:
  - [ ] the board stays on screen, and the banner says when it was loaded
  - [ ] starting a shift shows _On Duty_ with **Pending sync**
  - [ ] checking a patient in from `/patients` puts them in _Waiting_ with **Pending sync**
  - [ ] Assign, Reassign and Refresh are disabled, and say why on hover
  - [ ] back online: the badges clear on their own, each person and patient appears once, and
        the sync center is empty
  - [ ] start a shift online in a second browser while the first is offline, then start one in
        the first and reconnect: it shows **Needs attention**, and the sync center explains it
- [ ] checking in a patient already in today's queue says so, with a link to the board
- [ ] clinic user lifecycle actions work within allowed scope
- [ ] dashboard and audit views load

---

## 9. Volunteer Matrix

- [ ] `/patients` loads
- [ ] patient create works
- [ ] patient detail loads
- [ ] encounter create works
- [ ] vitals and screening save
- [ ] consent grant and revoke work
- [ ] `/my/assigned` loads
- [ ] start intake from assigned patient works
- [ ] offline, the shift card still starts and ends a shift (pending sync), and Start intake is
      disabled with the reason

---

## 10. Doctor Review Matrix

- [ ] queues page shows review workload
- [ ] Pending HAP Cosign lane shows only notes assigned to the signed-in doctor
- [ ] assigned volunteer HAP note can be reviewed and cosigned exactly once
- [ ] signed HAP content is read-only and a doctor can append, but not edit, an addendum
- [ ] in-review encounter loads
- [ ] clinical review action works
- [ ] finalize remains disabled until review is complete

---

## 11. Doctor Finalization Matrix

- [ ] queues page shows finalize-ready encounters
- [ ] care plan save works
- [ ] prescription create/update/delete works before finalization
- [ ] encounter finalization works
- [ ] finalized encounter becomes read-only
- [ ] follow-up reminder is created when follow-up date exists

### Clinical note connectivity and layout

- [ ] doctor-authored HAP note signs without a second cosigner
- [ ] volunteer draft preserves unsaved-change state and supports `Ctrl+S` or `Command+S`
- [ ] going offline removes rendered note content and disables every note action
- [ ] manager, director, patient, and unscoped system administrator cannot retrieve note content
- [ ] editor, signed view, dialogs, and queue have visible focus and no horizontal overflow at 375,
      768, 1024, and 1440 pixels

---

## 12. Patient Portal Matrix

Signed in as the patient identity, not as staff. Staff have no portal, which is why none of this
was ever covered before there was a patient account to sign in as.

**Fixtures:** needs `SEED_E2E_PATIENT_SUB` set at seed time — that links the identity to a patient
record through `Patient.portalUserId` and stages a second, unclaimed patient with a pending invite.
Without it the portal shows the "ask your clinic to link this account" state and `/claim-record`
cannot be reached at all.

- [ ] patient with pending invite is routed to `/claim-record`
- [ ] each listed invitation shows how long it has left
- [ ] claim-record succeeds with valid matching details
- [ ] `/portal` loads after successful claim
- [ ] measurement logging works
- [ ] self-report submission works
- [ ] appointment request creation works
- [ ] a request for a backwards date window is refused before it is sent
- [ ] reschedule and cancellation requests can be raised against an upcoming confirmed visit
- [ ] both actions are unavailable on a past, cancelled, completed, or no-show visit
- [ ] a visit already carrying a pending change request offers no second request
- [ ] an unclaimed patient opening `/portal/appointments/request` sees the claim prompt, not an
      error string
- [ ] trend views render usable data

---

## 12b. Portal Invite Lifecycle Matrix

Signed in as staff, on a patient chart. Run this when a release touched portal invites,
notification delivery, or the chart's right-hand column.

**Fixtures:** `SEED_E2E_PATIENT_SUB` at seed time stages two unclaimed charts — "E2E
Unclaimed" with a live invite, and "E2E Lifecycle" with a cancelled and an expired one, so
the previous-invitations list has something in it.

### Reading the card

- [ ] the portal status reads in plain language, never `LINKED` / `INVITED` / `UNLINKED`
- [ ] a chart whose only invites have lapsed reads "No portal access", not "Invitation
      waiting", and offers a new invitation rather than a resend
- [ ] the live invitation shows a countdown ("Expires in 6 days"), the address or number it
      was staged against, and who issued it
- [ ] "Previous invitations" is collapsed by default, expands on click and by keyboard, and
      lists cancelled, expired, and claimed invitations
- [ ] a chart that has never been invited shows no previous-invitations control at all

### Acting on it

- [ ] creating an invitation offers 7, 14, and 30 days and shows the resulting date
- [ ] creating an invitation on a chart that already has one warns that the old one stops
      working
- [ ] "Resend invite email" keeps its label while sending; nothing on the card resizes or
      moves
- [ ] resend is not offered on an expired invitation
- [ ] "Cancel invitation" asks first, names the address, and backing out changes nothing
- [ ] after cancelling, the chart does not blank; the invitation appears under previous
      invitations
- [ ] every one of these appears in the audit log under `PATIENT.PORTAL.INVITE*`

### When email cannot carry it

Force by staging a phone-only invitation, or by starting the API with `EMAIL_PROVIDER`
unset.

- [ ] a phone-only invitation says nothing was sent, and does not read as a failure
- [ ] an unconfigured mail server reads as a configuration problem, not a failed send
- [ ] the copyable instructions carry the patient code, the sign-in address, and the expiry
      date, and no patient name or date of birth
- [ ] "Copy instructions" confirms without changing width; on a plain-HTTP address, where
      the browser refuses, it says so instead of doing nothing

### Expiry

- [ ] an expired invitation cannot be claimed: `/claim-record` refuses it, names the date it
      expired, and says to ask the clinic for a new one
- [ ] an expired invitation no longer routes its holder to `/claim-record` at sign-in

### Widths and keyboard

- [ ] 375 / 768 / 1024 / 1440 and 200% zoom: the card never scrolls sideways and the
      previous-invitations rows wrap
- [ ] the whole card is reachable and operable by keyboard, including both dialogs

---

## 13. Route State Matrix

The six states every route owes its user, how to force each one, and what you should see. This is
the section to run when a release touched data fetching, guards, or the shell.

### How to force each state

Repeatable without fixtures or code changes. All of it is DevTools plus the clinic switcher.

| State         | How to force it                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Loading**   | DevTools → Network → throttle to `Slow 3G`, then hard-reload the route.                                                                                                                     |
| **Error**     | DevTools → Network → Request blocking, add the route's API path (for example `*/dashboard`), then reload. Stopping the API container works too and covers every route at once.              |
| **Retry**     | From the error state, press the button the page offers. Unblock the request first to see it recover, and leave it blocked once to confirm the button does not simply vanish.                |
| **Empty**     | Switch to a clinic with no records of that kind, or apply a filter that matches nothing — a patient search for `zzz-no-such-patient` is the quickest.                                       |
| **Stale**     | Load the route successfully, _then_ block the API, then trigger a refresh (the route's own Refresh control, or wait for a poll on the export queue). The previous data must stay on screen. |
| **No access** | Sign in as a role that lacks the route's permission — the table below names it per route — and open the route by URL.                                                                       |
| **Offline**   | DevTools → Network → `Offline`. Distinct from Error: the app knows it is offline and says so.                                                                                               |

### What each state should look like

Copy is quoted exactly so a check is unambiguous. If the wording has changed, the component
changed — treat that as a finding, not a stale guide.

| State                      | Expected                                                                                                                                                                                                                                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access resolving           | Full-page skeleton, heading **"Checking your access"**                                                                                                                                                                                                                                                                 |
| Identity unavailable       | **"We couldn't confirm your access"**, a retry, and a **"Go to secure sign in"** link                                                                                                                                                                                                                                  |
| Session expired            | **"Your session needs to be renewed"** — and deliberately _no_ retry, because retrying cannot help                                                                                                                                                                                                                     |
| No access                  | **"You don't have access to this page"**, neutral not red, offering **"Check again"** and **"Back to Queues"**. It must never look like an error, and must not offer "Try again". A user with seats at more than one clinic is told to try switching clinics; a single-clinic user is told to contact an administrator |
| No clinic selected         | The select-a-clinic state naming the surface, not a bare paragraph                                                                                                                                                                                                                                                     |
| Section loading            | A skeleton in the content area — never a spinner in the middle of the page, never a blank panel                                                                                                                                                                                                                        |
| Section error              | A tinted panel with a heading, the reason, and a retry                                                                                                                                                                                                                                                                 |
| Stale after failed refresh | **"Showing the last version that loaded"** above data that is **still on screen**, with a **Refresh** action                                                                                                                                                                                                           |
| Offline                    | **"You are offline"** with an explanation                                                                                                                                                                                                                                                                              |
| Empty                      | A heading and a sentence saying what would appear here and how to make it appear — not a dashed box with one line                                                                                                                                                                                                      |

**The two that matter most, and are easiest to get wrong:**

- **Stale must not blank the screen.** A failed refresh on clinic wifi that clears a measurement
  someone is reading is the single loudest way this product reads as broken.
- **No access must not read as an error.** It is not a failure, and offering a retry teaches people
  to hammer a wall they cannot pass.

### Per-route reference

Permission is what to remove to reach the no-access state. **Stale** marks the surfaces that keep
last-known-good data across a failed refetch; elsewhere a failed refresh is simply an error.

| Route                                    | Permission                         | Needs a clinic | Stale |
| ---------------------------------------- | ---------------------------------- | -------------- | ----- |
| `/dashboard`                             | `DASHBOARD.READ`                   |                |       |
| `/today`                                 | `OPS.CHECKIN.READ`                 |                |       |
| `/queues`                                | `ENCOUNTER.READ`                   | yes            |       |
| `/my/assigned`                           | `OPS.ASSIGNMENT.READ_SELF`         |                |       |
| `/patients`                              | `PATIENT.SEARCH`                   | yes            | yes   |
| `/patients/new`                          | `PATIENT.CREATE`                   | yes            |       |
| `/patients/[id]`                         | `PATIENT.READ`                     |                |       |
| `/patients/[id]/consent`                 | `CONSENT.RECORD`                   | yes            |       |
| `/patients/[id]/encounters/new`          | `ENCOUNTER.CREATE`                 | yes            |       |
| `/clinics/[clinicId]/patients`           | `PATIENT.SEARCH`                   |                | yes   |
| `/clinics/[clinicId]/patients/[id]`      | `PATIENT.READ`                     |                |       |
| `/clinics/[clinicId]/patients/[id]/edit` | `PATIENT.UPDATE`                   |                |       |
| `/clinics/[clinicId]/encounters`         | `ENCOUNTER.READ`                   |                |       |
| `/encounters/[id]`                       | `ENCOUNTER.READ`                   |                |       |
| `/appointments`                          | `APPOINTMENT.READ`                 |                |       |
| `/notifications`                         | `REMINDER.READ`                    |                |       |
| `/audit`                                 | `AUDIT.READ`                       |                |       |
| `/admin/users`                           | `CLINIC.MANAGE`                    |                |       |
| `/admin/clinics`                         | `CLINIC.MANAGE`                    |                |       |
| `/settings/clinic`                       | `RESEARCH.SETTINGS.UPDATE`         | yes            | yes   |
| `/clinics/[clinicId]/research/exports`   | `RESEARCH.EXPORT.REQUEST`          |                | yes   |
| `/portal`                                | `PATIENT.PORTAL.READ_SELF`         |                | yes   |
| `/portal/health`                         | `PATIENT.PORTAL.READ_SELF`         |                | yes   |
| `/portal/self-reports`                   | `PATIENT.PORTAL.READ_SELF`         |                | yes   |
| `/portal/self-reports/new`               | `PATIENT.PORTAL.WRITE_SELF_REPORT` |                | yes   |
| `/portal/appointments`                   | `PATIENT.PORTAL.READ_SELF`         |                | yes   |
| `/portal/appointments/request`           | `PATIENT.PORTAL.READ_SELF`         |                | yes   |
| `/claim-record`                          | none by design — see below         |                |       |

**`/claim-record` deliberately has no permission guard.** It serves a user who holds an invitation
but no linked patient record, so they may hold no role at all; a permission guard would refuse
exactly the people the page exists for. The API agrees — the claim endpoint is behind
authentication alone. Check instead that an authenticated user _without_ a pending claim is
redirected away, and that while identity is still loading the page does **not** claim that no
invitation was found.

### Refresh behaviour

The contract is in `docs/design-system/MASTER.md` section 11; these are the checks.

- [ ] a refresh **never clears the screen** — trigger one on a slow connection and confirm the
      previous result stays readable throughout
- [ ] a refresh is **visible** — a thin bar appears above the content, and it does not push the
      content down
- [ ] a refresh control **does not resize**. "Refresh" must not become "Refreshing", "Apply
      filters" must not become "Loading…". The icon spins; the word holds still
- [ ] the one case where blanking is correct: **changing the subject**. A date change on the Today
      board, or a clinic switch, should re-skeleton rather than relabel the previous day's data

### Spot checks worth doing by hand

The automated suite covers these routes rendering and not overflowing. It does not judge whether
the result is sensible.

- [ ] a failed read never leaves an **editable form** on screen seeded with default values
- [ ] a mutation that fails reports _itself_, not "we couldn't load this view" — check by failing a
      save, an approval, or a download while the list around it is healthy
- [ ] a permission or tenant error is never flattened into a generic failure
- [ ] every empty state names the action that would populate it
- [ ] a search that matches nothing reads differently from a clinic that has nothing yet

### Fixture assumptions

- A clinic seeded with `SEED_SAMPLE_PATIENT=true` and `SEED_SAMPLE_APPOINTMENTS=true`.
- The portal checks need the patient identity linked through `Patient.portalUserId`; seeding with
  `SEED_E2E_PATIENT_SUB` set does this and also stages one unclaimed patient with a pending invite,
  which is the only way to reach `/claim-record`.
- The no-access checks need single-role accounts. The multi-role staff account holds everything and
  cannot show what a role is refused.

---

## 14. Dashboard And Analytics Matrix

Six role dashboards compose different sections from the same chart components, so check at least a
director, a volunteer and a doctor — they do not render the same things.

### Every chart

- [ ] a chart with no data shows an empty state naming what would populate it, not an empty axis
- [ ] figures line up down a column — axis ticks and table values use tabular figures, so a count
      going from 9 to 10 must not shift the axis
- [ ] no chart animates on load. Recharts' draw-in cannot be reached by `prefers-reduced-motion`,
      so it is switched off at the component; a chart that animates is a regression
- [ ] **no pie or donut chart exists anywhere.** It is a deliberate absence: a pie is the one form
      where any two slices can touch, which caps a colour-blind-safe palette at about three series

### Blood pressure levels (doctor dashboard)

The chart most likely to regress, because it used to be a donut.

- [ ] bars run in clinical severity order — Normal, Elevated, Stage 1, Stage 2, Crisis, Not
      classified — and **not** sorted by count
- [ ] every bar is labelled on the axis in plain language. `STAGE1` or `CRISIS` reaching the screen
      is a defect
- [ ] every bar carries its count as text beside it, so the chart reads without the axis
- [ ] "Not classified" is neutral grey, not a severity colour. It is a missing finding, not a
      clinical one
- [ ] colour is redundant: cover the bars and the chart still reads

### Series colour

- [ ] two lines on the same chart differ by more than colour — the blood-pressure trend uses a dash
      pattern, and the legend swatch shows that pattern rather than a plain dot
- [ ] the same series keeps its colour when a filter changes the number of series on screen

### Portal trends

- [ ] blood pressure, glucose and weight trends render for a linked patient
- [ ] a patient with no readings sees an empty state, not an empty chart frame

### Fixture assumptions

Needs a clinic with recorded hypertension assessments and diabetes screenings; the sample seed
gives you encounters but not necessarily a spread across classifications. Record two or three
assessments by hand at different severities to check the ordering and the labels.

---

## 15. Responsive And Chat Matrix

- [ ] landing page is readable and unclipped at `375`, `768`, `1024`, and `1440` widths
- [ ] dashboard cards wrap cleanly without horizontal page overflow at the same widths
- [ ] tables stay inside scroll containers instead of forcing full-page overflow
- [ ] mobile nav drawer opens and closes cleanly on phone widths
- [ ] sidebar collapse state still works on laptop and desktop widths
- [ ] chat toggle stays visible above page content on every breakpoint
- [ ] chat panel opens within the viewport on phone and tablet sizes
- [ ] chat panel is visibly larger on desktop without covering the full screen

---

## 16. Clinical Workflow Matrix (Doctor And Volunteer)

The two roles the release gate covers end to end. Run each column separately, signed in as that
role only, not as the multi-role staff account.

### Volunteer

- [ ] register a patient, including residential location
- [ ] record expanded vitals and a tobacco screening in an encounter
- [ ] record a diabetes screening and read it back on the chart
- [ ] record a hypertension assessment and read it back on the chart's Hypertension tab and on
      the overview's latest-assessment card
- [ ] open the chart's Diabetes and Hypertension tabs offline and confirm each says it is showing
      records saved on this device
- [ ] add a medical history entry and revise it, and confirm the earlier revision is still visible
- [ ] record a patient-reported medication and reconcile it
- [ ] author a clinical note and submit it for cosign
- [ ] confirm no cosign action is offered
- [ ] confirm an existing chart cannot be edited
- [ ] go offline, record vitals and a screening, reconnect, and confirm both sync
- [ ] go offline and confirm clinical notes show a connection-required notice with no content

### Doctor

- [ ] open the pending cosign queue and cosign the volunteer's note
- [ ] add an addendum and confirm the signed content is unchanged
- [ ] confirm the signed note cannot be edited
- [ ] prescribe from an encounter
- [ ] finalize the encounter and confirm its vitals and screenings become read-only
- [ ] confirm a queued offline change against the finalized encounter reports a conflict rather
      than disappearing or blocking the rest of the queue

### Manager or director

- [ ] confirm a pending cosign count is visible
- [ ] confirm no clinical note content is reachable anywhere, including the chart tab
- [ ] confirm medical history and medications are readable but not editable

### Accessibility and layout

Automated checks cover axe rules, focus indicators, keyboard tab movement, 200 percent zoom, and
horizontal overflow. These are the parts a person still has to judge.

- [ ] text and status colours are legible against their backgrounds on the chart and in dialogs
- [ ] focus order follows reading order through a clinical form
- [ ] each field label describes what the field is actually for
- [ ] a screen reader announces loading, empty, error and offline states when a tab changes
- [ ] the chart, its dialogs and the sync bar have no horizontal overflow at 375, 768, 1024, and
      1440 pixels
- [ ] dialogs can be completed and dismissed at 375 pixels

---

## 17. Appointment Lifecycle Matrix

The workflow this release gates end to end. See
`docs/specs/12_APPOINTMENT_OPERATIONS_RELEASE_GATE.md` for what sits behind these.

**The triage checks consume the requests they act on**, so run this section against fixtures you
have just reset — see section 1. Seeding alone will not put them back.

### Staff triage

- [ ] `/appointments` lists pending patient requests above the schedule
- [ ] a new-visit request and a reschedule request both appear, each naming what the patient asked
      for and why
- [ ] the confirm dialog opens on the patient's preferred window rather than an empty form
- [ ] confirming books the visit, and it appears on the schedule below without a manual reload
- [ ] declining without a reason is refused before anything is sent
- [ ] a declined request shows the reason back to the patient in the portal

### Staff lifecycle

- [ ] day and week views both load, and the range controls move forward, back, and to today
- [ ] status, doctor, volunteer, and patient filters each narrow the schedule
- [ ] a filter matching nothing shows the empty state, not a blank panel
- [ ] a confirmed appointment can be rescheduled, and an end time before the start is refused
- [ ] cancelling requires a reason
- [ ] completing and marking a no-show are refused until the appointment start time has passed
- [ ] a cancelled, completed, or no-show appointment offers no further action
- [ ] a volunteer sees the schedule and the request queue, and is offered no action on either
- [ ] a director sees the schedule and is offered no action

### Reminders

- [ ] confirming a request returns without error and creates a queued reminder for 24 hours before
      the visit
- [ ] a patient with no phone and no email produces a visible failed reminder rather than silence
- [ ] rescheduling suppresses the old reminder and queues a new one
- [ ] cancelling, completing, or marking a no-show suppresses the queued reminder
- [ ] a suppressed reminder stays visible with its reason instead of disappearing

### Tenant isolation

- [ ] a staff user switched to clinic A sees no appointment or request belonging to clinic B
- [ ] opening another clinic's appointment by URL reports not found rather than forbidden
- [ ] a portal patient reaches no staff appointment view
- [ ] an audit entry for a lifecycle action shows the previous and new status and a request ID
      shared with the reminder writes from the same action

### Accessibility and layout

Automated checks cover axe rules, focus indicators, keyboard movement, and horizontal overflow at
the four supported widths. These are the parts a person still has to judge.

- [ ] a screen reader announces the schedule changing when a filter or the day/week view changes
- [ ] a dialog's validation message is announced when it appears, not only when navigated to
- [ ] the schedule table is navigable by column, and its caption names the day it covers
- [ ] status colours are legible against their backgrounds in both light and dark themes
- [ ] the same status reads the same way on the staff schedule and in the portal
- [ ] cards rather than a wide table are shown below 1280 pixels
- [ ] the schedule, the request panel, and every dialog have no horizontal overflow at 375, 768,
      1024, and 1440 pixels
- [ ] every dialog can be completed and dismissed at 375 pixels

---

## 17b. Offline Sync Recovery Matrix

Changes saved offline wait in the device outbox. When the server refuses one, the clinician
should be able to see which change failed, why, and what to do next without opening DevTools.
The sync center is where that happens: the sync pill in the header opens it at every width.

### What each group means

| Group            | What it holds                                                                                      | Sent again automatically? |
| ---------------- | -------------------------------------------------------------------------------------------------- | ------------------------- |
| Needs attention  | A conflict, or a refusal that resending the same change cannot fix                                 | No, only after Retry      |
| Waiting to retry | A refusal that may clear on its own: a role not yet granted, a record still queued, a server error | Yes, every pass           |
| Queued           | Saved on this device and not yet sent                                                              | Yes                       |

The state lives in IndexedDB on the outbox row, so it survives a refresh and a browser restart
until the change is applied or discarded. Nothing is merged or overwritten automatically.
**Discard** removes only this device's copy. It never changes server data, and it asks for
confirmation first because an offline entry that never reached the server cannot be recovered.

### Simulating a duplicate patient conflict

Offline registration is not offered in the UI, so queue the conflicting change by hand. Register
a patient online and note their national ID, then open any chart for the same clinic and run this
in the browser console, replacing the national ID:

```js
const clinicId = location.pathname.split('/')[2];
const open = indexedDB.open('NkwapaDb');
open.onsuccess = () => {
  const tx = open.result.transaction('outbox', 'readwrite');
  tx.objectStore('outbox').put({
    id: crypto.randomUUID(),
    clinicId,
    entityType: 'patient',
    entityId: crypto.randomUUID(),
    operation: 'UPSERT',
    payloadJson: JSON.stringify({
      nationalId: 'REPLACE-WITH-EXISTING-ID',
      primaryClinicId: clinicId,
      firstName: 'Offline',
      lastName: 'Duplicate',
    }),
    idempotencyKey: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  });
  // Reload so the app reads a row written outside it; opening the app syncs by itself.
  tx.oncomplete = () => location.reload();
};
```

- [ ] a toast says an offline change needs attention, and its **Review** button opens the sync center
- [ ] the pill reads "1 needs attention" and uses the warning colour; on a phone it shows a count
- [ ] the card is titled "Patient details · Offline Duplicate" and says another chart already uses
      this national ID, in plain language, with a next step
- [ ] **Open existing chart** opens the chart that already has the ID
- [ ] **Review duplicates** appears for a manager or director and is absent for a volunteer
- [ ] **Retry** is not offered, because the server would give the same answer
- [ ] **Technical details** shows the code, status, attempts, and ids, and **Copy for support**
      copies them without any names or clinical values
- [ ] after a refresh the card is still there
- [ ] **Discard** asks for confirmation, names the change, and afterwards the sync center reads
      "Everything is synced"

### Merged chart

- [ ] on device A, open chart B's edit page, go offline, and save a change; the page says it is
      saved on this device
- [ ] on device B, merge chart B into chart A
- [ ] reconnect device A: the card says the chart was merged, and **Open current chart** opens A
- [ ] chart B no longer appears in device A's offline patient list after that sync

### Locked encounter

- [ ] queue a vitals change offline, finalize the encounter from another device, then reconnect:
      the card says the record is locked and **Open visit** opens the encounter
- [ ] other queued changes still sync, and new server data still arrives, while that card waits

### Connection problems

- [ ] offline, the pill reads "Offline" and the sync center says saved work is safe
- [ ] navigating offline to a page this device has never loaded shows the offline page, not the
      marketing home page
- [ ] with the API stopped, **Sync now** reports a server problem in plain language, with the raw
      response under Technical details rather than on screen

### Widths and keyboard

- [ ] the pill, sheet, cards, and discard dialog have no horizontal overflow at 375, 768, 1024, and
      1440 pixels, in light and dark themes
- [ ] the sheet and the discard dialog can be opened, used, and closed with the keyboard alone,
      and focus returns to the pill
- [ ] a screen reader announces the online and sync status when it changes

---

## 17c. Metrics And Telemetry Matrix

Telemetry records counts and failure codes for high-value workflows; see
`docs/specs/15_TELEMETRY_AND_METRICS.md`. Events are written about five seconds after they happen.

### Dashboard

- [ ] a director or manager sees **Metrics** under Oversight; a doctor or volunteer does not, and
      opening `/metrics` directly shows the no-access state
- [ ] switching between 7, 30 and 90 days reloads the figures without blanking the page
- [ ] confirm a patient appointment request, then refresh: **Appointment requests** gains a step and
      the conversion changes
- [ ] preview a merge, then cancel: **Merge previews** rises and **Charts merged** does not
- [ ] claim a record with a wrong date of birth: **Record claims** shows a failure, and **Most common
      failure reasons** names it
- [ ] a clinic with no activity shows zeros and "Nothing failed in this window", not an error
- [ ] offline, the page says metrics need a connection
- [ ] no name, email, phone number, patient code or note text appears anywhere on the page

### Recording on and off

- [ ] with `TELEMETRY_ENABLED=true`, API logs contain `"type":"telemetry"` lines with counts and
      codes only
- [ ] with `TELEMETRY_ENABLED=false`, workflows behave identically and no telemetry lines or rows
      are written
- [ ] with the database stopped briefly, clinical saves still succeed; telemetry catches up once
      it is back

### Browser analytics

- [ ] with `NEXT_PUBLIC_ANALYTICS_ENABLED=false` (the default), no analytics calls leave the browser
- [ ] with it `true` and a provider loaded, opening the sync center sends `sync.center.open` with
      counts only

### Widths and keyboard

- [ ] the dashboard has no horizontal overflow at 375, 768, 1024 and 1440 pixels, in light and dark
      themes; wide tables scroll inside their card
- [ ] every help hint and the time-window control work from the keyboard

---

## 17d. Offline Replay And Background Job Matrix

The full matrix, with every automated test behind it, is
`docs/security/offline-job-execution-matrix.md`. It is generated, and the suite fails if a scenario
marked manual there is missing here. These are the rows a person walks before a release. Everything
else in the matrix runs in CI.

Each item below names its matrix ID. Use the staff identity unless a step says otherwise, keep
DevTools open on the **Application → IndexedDB → NkwapaDb → outbox** store, and watch the sync
pill in the header. A change that is still queued is still a row in that store.

### Tools you will need

- **Offline:** DevTools → Network → throttling → _Offline_. It applies to one tab only.
- **A failing server without going offline:** DevTools → Network → right-click a request →
  _Block request URL_, using the pattern `*/sync/push*`. The browser reports a network error, which
  is what a clinic router that drops the API looks like.
- **A stalled server (local only):** `kill -STOP <api pid>` freezes the API with its port still
  open, which is the "DNS resolves and then nothing" failure. `kill -CONT <api pid>` resumes it.
  Find the PID with `lsof -ti :4000`.
- **Worker logs:** the API log. Reminder and export workers write JSON lines with `reminderId` or
  `exportId`.
- **Mail:** Mailpit at `http://localhost:8025` shows every reminder email the worker sent.

### Offline

- [ ] **OFF-01** With a chart open, go offline and save an edit. The form says it is saved on this
      device, the pill reads "Offline · 1 saved", and the outbox has one row. Go back online: within a
      few seconds the row is gone, the pill reads "All synced", and the chart shows the edit after a
      reload. Do the same from the Today board with **Start shift**: the shift is labelled
      _Pending sync_ until it lands.
- [ ] **OFF-02** Offline, open a route this browser has never visited. You get the offline page,
      not the marketing home page and not a blank screen.

### Weak network

- [ ] **NET-01** Queue one change offline. Block `*/sync/push*`, then go back online. The pill
      reads "Sync failed" and the sync center says your changes are saved on this device. The row in
      IndexedDB is unchanged: no `attempts`, no `lastFailure`. Unblock the URL and touch nothing else.
      Within about 10 seconds the change syncs by itself. Leave it blocked for a few minutes instead,
      and confirm in the Network tab that the retries spread out (10s, 30s, 1m, 2m, then every 5m)
      rather than hammering the API.
- [ ] **NET-02** Locally, queue a change, freeze the API with `kill -STOP`, and press **Sync now**.
      After 30 seconds the pill reads "Sync failed" with "Could not reach the server" and the row is
      intact. Resume the API with `kill -CONT`: the next automatic retry drains it. Pressing **Sync now**
      during the freeze must never leave the pill spinning past those 30 seconds.

### Duplicate replay

- [ ] **DUP-01** Offline, save an edit to a chart's first name. In the console, queue the same change
      again under the same idempotency key with a different name, as a resend would:

  ```js
  const open = indexedDB.open('NkwapaDb');
  open.onsuccess = () => {
    const store = open.result.transaction('outbox', 'readwrite').objectStore('outbox');
    store.getAll().onsuccess = (event) => {
      const original = event.target.result.at(-1);
      const payload = { ...JSON.parse(original.payloadJson), firstName: 'Second copy' };
      store.put({
        ...original,
        id: crypto.randomUUID(),
        payloadJson: JSON.stringify(payload),
        createdAt: new Date(Date.parse(original.createdAt) + 1000).toISOString(),
      });
    };
  };
  ```

  Go online. Both rows leave the outbox, and the chart shows the first name you typed, never "Second
  copy". The `/sync/push` response answers both as `APPLIED`.

- [ ] **DUP-02** Open the same chart in two tabs. In tab A, go offline and save an edit. In tab B
      (online), press **Sync now** while, at the same moment, you bring tab A back online. Both pills
      settle on "All synced", neither shows an error, the API log has no 500 for `/sync/push`, and the
      chart's audit history shows one edit.

### Conflicts

The conflict cards themselves are walked in section 17b. From the matrix, these are the ones a
person still checks:

- [ ] **CON-02** A refused change is listed under _Needs attention_ and is not sent again on later
      passes (watch the Network tab across two **Sync now** presses). **Retry** sends it once.
- [ ] **CON-04** The duplicate national ID, merged chart, and locked visit cases in section 17b each
      show their plain-language card and are never written to the server.
- [ ] **CON-05** **Discard** removes the device copy only. After the next sync the chart shows the
      server's version.

### Stale active clinic

Needs an account with seats at two clinics (the cross-clinic fixtures from
`SEED_SAMPLE_CROSS_CLINIC=true`, or any staff account given a second clinic in Admin → Users).

- [ ] **CLN-01** At clinic A, go offline and save an edit. Switch to clinic B and go online. B's pill
      does not count A's change and reads "All synced". The `/sync/push` requests carry
      `clinicId=<B>` only, and A's row is still in IndexedDB.
- [ ] **CLN-02** Switch back to clinic A. The row drains on the first pass, pushed to
      `clinicId=<A>`.
- [ ] **CLN-03** Queue a change at clinic A. As an admin in another browser, remove the account's
      role at A. Back in the first browser, without refreshing (clinic A is still selected), press
      **Sync now**. It says "This account cannot sync at this clinic", and the row stays in
      IndexedDB. Nothing is lost.
- [ ] **CLN-05** Queue a change as account A with `*/sync/push*` blocked, sign out, and sign in
      as account B at the same clinic. Unblock the URL. The change is **not** sent: B's sync pill
      does not count it, and the sync center lists it under "Saved by another account on this
      device", attributed to A. B can discard it only after confirming, and has no way to send
      it. Sign back in as A: it is sent and the audit entry names A (#162).
- [ ] **CLN-06** Queue a change at clinic A, then remove the account's only role at A. After a
      refresh, clinic A is no longer offered, the sync pill shows a small dot, and the sync center
      lists the change under "Saved for other clinics" with clinic A's name and "You no longer have
      access". The only action is **Discard**, which asks first. Restore the role instead: the
      section offers **Switch to clinic A**, and switching sends the change there (#163).

### Background jobs

- [ ] **JOB-01** Run a second API instance against the same Redis and database (`PORT=4001`, same
      `.env`). Confirm a request whose reminder is due at once (an appointment inside 24 hours, with
      an email address). Mailpit receives exactly one message, and the reminders page shows one `SENT`
      row.
- [ ] **JOB-03** Stop Mailpit (`docker stop nkwapa-mailpit`) and send a reminder. The row stays
      `QUEUED`, and the API log shows "Reminder send will be retried" about 5 seconds after the first
      attempt and about 60 seconds after the second. Start Mailpit before the third attempt: one email
      arrives and the row reads `SENT`. Leave Mailpit stopped through all three: the row reads `FAILED`
      with the provider's code, not a generic failure.
- [ ] **JOB-05** With the research repository token removed or wrong, request and approve an export.
      After its attempts are spent it reads **Failed** on the research page. Fix the token and press
      **Retry**. The export goes to _Processing_ and then _Completed_ on its own; it does not sit at
      _Approved_.
- [ ] **JOB-06** During JOB-05, watch the research page between attempts. The export stays
      _Approved_ while it is being retried, and reads **Failed**, with an audit entry, only after the
      last attempt. Refresh the page after it fails, to confirm it is still **Failed**.
- [ ] **JOB-09** _Known risk._ During the release smoke, search the API log for "Transaction already
      closed" or "expired transaction" from the reminder or research workers. Any hit means a send or
      push outlasted the job transaction. Note which one; it is tracked in #164.

---

## 17e. Station Workflow Matrix (#167)

Build and run with `FEATURE_STATION_WORKFLOW_ENABLED=true` and
`NEXT_PUBLIC_FEATURE_STATION_WORKFLOW_ENABLED=true`. Use four browsers: two volunteers, a third
volunteer for review, and a doctor. Every volunteer starts a shift first.

| #   | Step                                                                                      | Expected                                                                                                          |
| --- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Check a patient in from the patient chart                                                 | The patient appears in the first station's queue on `/stations`, with no manager action                           |
| 2   | Two volunteers at Registration press **Take patient** at the same moment                  | One opens the visit; the other sees "<name> has already taken this patient" and the queue refreshes               |
| 3   | Record history, hand on with a note                                                       | The patient appears at Blood pressure with the note under "From Registration"                                     |
| 4   | At Blood pressure, record 150/95 and save, then **Send to Glucose testing**               | Only BP fields and Notes are shown; the hand-off waits until the reading has synced                               |
| 5   | At Glucose, choose Anthropometry as the next station                                      | Nothing is skipped; choosing Review instead asks for a reason for each skipped station                            |
| 6   | At Anthropometry, save weight and height                                                  | BMI shows live; reopening the encounter still shows 150/95                                                        |
| 7   | At Review, press **Complete session** before recording counselling                        | Refused: "Record the counselling given before completing the session."                                            |
| 8   | Record counselling with a follow-up, submit the HAP note, complete                        | Patient leaves the line; counselling can no longer be edited                                                      |
| 9   | As the doctor, open the encounter from **Queues → Needs Review**, tab **Station session** | Every result with who recorded it, the route, the counselling, and a reminder to set the care plan follow-up date |
| 10  | Doctor cosigns the note from **Pending HAP Cosign**                                       | Any doctor at the clinic can cosign; a second doctor gets "already cosigned"                                      |
| 11  | Take a patient offline, save a reading, try to hand on                                    | The reading saves on the device; hand-off is disabled until the connection returns                                |
| 12  | End the shift while holding a patient                                                     | The patient goes back to that station's queue                                                                     |
| 13  | As a manager on `/today`, Move / Release / Left on a patient                              | Each asks for a reason and is reflected on every station screen within ~12 s                                      |
| 14  | As a manager, try the old Assign flow by API                                              | `409 STATION_WORKFLOW_ACTIVE`                                                                                     |

---

## 18. Partial Areas To Test Carefully

These areas are implemented but still worth extra regression attention:

- appointment times where staff, the clinic, and the browser are in different zones
- offline behavior outside the original EMR flow
- organization and zone-related assumptions in new features
