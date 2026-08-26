# User Testing Guide

This guide is the current manual QA and user acceptance checklist for the implemented product surface.

Use it when validating releases, new role setup, workflow changes, or the safety of major infrastructure updates.

---

## 1. Prerequisites

Make sure these services are available:

- Postgres
- Redis
- Keycloak
- API
- Web app

Local infra:

```bash
cd infra/nkwapa
docker compose up -d
```

Then sync and seed the database:

```bash
npm run db:migrate:dev
npm run db:generate
npm run db:seed
npm run e2e:keycloak-user
```

Useful seed inputs:

- `SEED_SYSTEM_ADMIN_SUB`
- `SEED_SYSTEM_ADMIN_NAME`
- `SEED_E2E_STAFF_SUB`
- `SEED_E2E_STAFF_NAME`
- `SEED_E2E_STAFF_EMAIL`
- `SEED_SAMPLE_PATIENT=true`
- `SEED_SAMPLE_APPOINTMENTS=true`

---

## 2. Suggested Accounts

Create at least:

- one `SYSTEM_ADMIN`
- one `DIRECTOR`
- one `MANAGER`
- one `DOCTOR`
- one `VOLUNTEER`
- one `PATIENT`

Recommended extra accounts:

- one multi-role clinic staff account for permission overlap testing
- one patient account intended for invite-and-claim testing

---

## 3. Global Smoke Test

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

## 4. Security And Tenant Isolation Smoke

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

## 5. System Admin Matrix

- [ ] `/admin/clinics` loads
- [ ] `/admin/users` loads
- [ ] create clinic works
- [ ] assign clinic roles works
- [ ] global `SYSTEM_ADMIN` assignment works
- [ ] user deactivation works
- [ ] self-deactivation is blocked
- [ ] duplicate patient merge succeeds for same-clinic charts

---

## 6. Director Matrix

- [ ] clinic settings page loads
- [ ] research toggles persist
- [ ] research export request succeeds
- [ ] approval and rejection actions work
- [ ] completed export shows metadata and artifact actions
- [ ] clinic-scoped admin user actions respect allowed bounds
- [ ] audit page loads

---

## 7. Manager Matrix

- [ ] `/today` loads
- [ ] active shifts render
- [ ] patient check-ins group correctly by status
- [ ] assignment modal only shows active eligible staff
- [ ] reassignment works
- [ ] clinic user lifecycle actions work within allowed scope
- [ ] dashboard and audit views load

---

## 8. Volunteer Matrix

- [ ] `/patients` loads
- [ ] patient create works
- [ ] patient detail loads
- [ ] encounter create works
- [ ] vitals and screening save
- [ ] consent grant and revoke work
- [ ] `/my/assigned` loads
- [ ] start intake from assigned patient works

---

## 9. Doctor Review Matrix

- [ ] queues page shows review workload
- [ ] Pending HAP Cosign lane shows only notes assigned to the signed-in doctor
- [ ] assigned volunteer HAP note can be reviewed and cosigned exactly once
- [ ] signed HAP content is read-only and a doctor can append, but not edit, an addendum
- [ ] in-review encounter loads
- [ ] clinical review action works
- [ ] finalize remains disabled until review is complete

---

## 10. Doctor Finalization Matrix

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

## 11. Patient Portal Matrix

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

## 12. UX Recovery Matrix

- [ ] loading skeleton appears for route-level loads
- [ ] not-found page shows recovery actions
- [ ] simulated page error shows retry and refresh options
- [ ] network failure shows readable retry guidance instead of raw exceptions
- [ ] server-side validation errors surface field-level or clear actionable messages

---

## 13. Responsive And Chat Matrix

- [ ] landing page is readable and unclipped at `375`, `768`, `1024`, and `1440` widths
- [ ] dashboard cards wrap cleanly without horizontal page overflow at the same widths
- [ ] tables stay inside scroll containers instead of forcing full-page overflow
- [ ] mobile nav drawer opens and closes cleanly on phone widths
- [ ] sidebar collapse state still works on laptop and desktop widths
- [ ] chat toggle stays visible above page content on every breakpoint
- [ ] chat panel opens within the viewport on phone and tablet sizes
- [ ] chat panel is visibly larger on desktop without covering the full screen

---

## 14. Clinical Workflow Matrix (Doctor And Volunteer)

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

## 15. Appointment Lifecycle Matrix

The workflow this release gates end to end. See
`docs/specs/12_APPOINTMENT_OPERATIONS_RELEASE_GATE.md` for what sits behind these, and seed the
fixtures first with `SEED_SAMPLE_APPOINTMENTS=true npm run db:seed`.

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

## 16. Partial Areas To Test Carefully

These areas are implemented but still worth extra regression attention:

- appointment times where staff, the clinic, and the browser are in different zones
- offline behavior outside the original EMR flow
- portal invite and claim edge cases
- duplicate patient merge and canonical-chart redirects
- organization and zone-related assumptions in new features
