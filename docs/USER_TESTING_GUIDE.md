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

| Check                                                           | Where                                                            |
| --------------------------------------------------------------- | ---------------------------------------------------------------- |
| Every route at 375 / 640 / 768 / 1024 / 1440, no overflow       | `e2e/responsive-migration.spec.js` (staff + portal)              |
| Patient portal renders, per route, signed in as a patient       | `e2e/portal.spec.js`                                             |
| A patient is refused every staff surface                        | `e2e/portal.spec.js`                                             |
| Dark mode renders and passes axe on staff and portal routes     | `e2e/dark-mode.spec.js`                                          |
| Dark mode survives navigation without flashing light            | `e2e/dark-mode.spec.js`                                          |
| Automatable WCAG rules on the chart and the portal              | `accessibility.spec.js`, `portal.spec.js`                        |
| Focus is visible on every control the keyboard reaches          | `accessibility.spec.js`, `portal.spec.js`, `login-theme.spec.js` |
| Login theme: typeface, brand fill, radius, no third-party fonts | `e2e/login-theme.spec.js`                                        |
| Loading / empty / error / retry on the three #22 routes         | `e2e/route-fallbacks.spec.js`                                    |
| Chart series palette, contrast and colour-blind separation      | `npm run design:check-charts`                                    |

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
- [ ] duplicate patient merge succeeds for same-clinic charts

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
| `/reminders`                             | `REMINDER.READ`                    |                |       |
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

## 18. Partial Areas To Test Carefully

These areas are implemented but still worth extra regression attention:

- appointment times where staff, the clinic, and the browser are in different zones
- offline behavior outside the original EMR flow
- portal invite and claim edge cases
- duplicate patient merge and canonical-chart redirects
- organization and zone-related assumptions in new features
