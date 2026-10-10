# Appointment Operations Release Gate

## Status and scope

Current. This is the release gate for Appointment Operations V2: patient appointment requests,
staff triage, the clinic schedule, the four lifecycle transitions, reminder automation, and the
audit and permission surfaces behind them.

Those shipped across three pull requests, each with its own tests. This gate covers what those
tests could not: the workflow between them. Every defect it found lives in a seam. A permission on
one route against the permission on its sibling. A status rendered by the staff calendar against
the same status rendered by the portal. An API route against the absence of any screen that calls
it.

## What the gate found

Verified against the running system, not inferred.

### Half the workflow had no way to reach it

The API implemented `GET /clinics/:clinicId/appointment-requests` and the confirm and reject routes
beneath it when Appointment V2 shipped. Nothing in `apps/web` ever called them. A patient could
request a visit, ask for a different time, or ask to cancel, and no screen in the product could see
the request or act on it. The portal meanwhile showed that patient a `Requested` badge on something
no one could move.

Measured before the fix: zero references to `appointment-requests` anywhere in the staff web
surface, against three implemented and permission-gated endpoints. The staff calendar listed
`Appointment` rows only, and an `Appointment` row exists only once a request has been confirmed.

### Every scheduled reminder threw

`queueReminder` gave each job the deterministic id `reminder:<id>` so that suppression could find
and remove it. BullMQ builds its Redis keys around `:` and rejects a custom job id containing one,
so the enqueue threw `Custom Id cannot contain :` on every reminder it was asked to schedule.

Measured: `POST /clinics/:clinicId/appointment-requests/:id/confirm` returned 500 with that message
after the appointment row, the request update, the audit entries, and the reminder row had all been
written. The same call site is used by appointment reschedule and by follow-up scheduling on
encounter finalization, so all three failed the same way.

Nothing caught it because every unit test mocks the queue, and no browser test had ever confirmed a
request: until this release there was no screen that could. The gate found it on the first
end-to-end confirmation. The separator is now a hyphen, and a test asserts the id the queue is
given contains no colon.

### Reading a request required a permission the people who action it do not hold

Listing requests was gated on `CLINIC.READ`, held by a director and a manager. Confirming and
rejecting them require `APPOINTMENT.WRITE`, held by a manager and a doctor. A doctor could
therefore act on a request they had no route to open, and a volunteer holding `APPOINTMENT.READ`
could see the schedule but not the requests feeding it.

This is the shape the clinical records gate already names: a volunteer once held `SCREENING.WRITE`
without `SCREENING.READ` and could not see what they had recorded. Every sibling appointment route
uses `APPOINTMENT.READ`; this one now does too.

### One status meant two things

The staff calendar and the portal each mapped appointment statuses independently and had drifted.
A request reading `CONFIRMED` rendered in the emerald used for finalized clinical records, while
the appointment that request produced rendered in the neutral grey, on the same page. A cancelled
request and a cancelled appointment likewise disagreed, and a request that had only been sent was
rendered identically to one that had been approved.

### Nothing announced a change

None of the three appointment views had a live region. Filters, day and week switching, and every
reload after a lifecycle action swapped the results silently. The schedule table carried no caption
and no column scope, and a dialog's validation message was neither a live region nor associated
with the field it concerned, so a rejected form stayed invisible until a screen reader user
happened to navigate onto the message.

### The wide schedule table grew the page

The card list stopped at 768 pixels and the table below it declares `min-w-[1080px]`. Every width
between 768 and 1080 therefore rendered an eight-column table in a space too small for it.

Moving the card list to 1024 was not enough. Measured at exactly 1024: the sidebar leaves 814
pixels of content, the table still renders at 1080, and the document scrolls sideways by 173
pixels despite the `overflow-x-auto` wrapper. The table now appears only from 1280, which is the
first width where it fits beside the sidebar. Below that the card list is used.

The published manual QA for this feature checked 375 pixels only, so nothing caught it. The
acceptance suite now measures all four supported widths.

### The portal request form was the odd one out

It rendered `err.message` in a hand-rolled div with no retry and no toast, while every sibling
portal screen used the shared error state. It had no missing-portal-link branch either, so a
patient who had not yet claimed their record saw a raw error string where the rest of the portal
gives them the claim prompt.

### There was no appointment test data at all

`packages/db/prisma/seed.ts` seeded zero appointments and zero requests, and there was no
Playwright appointment spec. Because a confirmed appointment can only be produced by confirming a
request, and no screen could confirm a request, the workflow could not be reached end to end on a
fresh database even by hand.

## Access policy

The full matrix, generated from what the API enforces, is
[`docs/security/appointment-lifecycle-matrix.md`](../security/appointment-lifecycle-matrix.md). A
test compares the file byte for byte against the code, so it cannot describe a policy the system
does not implement.

In summary:

- The clinic schedule and the request queue are readable with `APPOINTMENT.READ`, held by a
  director, a manager, a doctor, and a volunteer.
- Moving an appointment and resolving a request require `APPOINTMENT.WRITE`, held by a manager and
  a doctor. A director and a volunteer are read-only, and the affordance is absent rather than
  present and refused.
- Every role that can action something can also read it, asserted rather than assumed.
- Portal routes require `PATIENT.PORTAL.READ_SELF` or `PATIENT.PORTAL.WRITE_SELF_REPORT`, which no
  clinical role holds. A staff seat reaches no portal route and a portal patient reaches no staff
  route.
- Every permission is evaluated against the roles held **at the clinic the appointment belongs
  to**.

## Lifecycle

An appointment row is created already `CONFIRMED`, when staff confirm a request. `CONFIRMED` is
therefore the only state any action can be applied from, and `CANCELLED`, `COMPLETED`, and
`NO_SHOW` are terminal.

- Cancelling requires a reason. Completing and marking a no-show are refused until the start time
  has passed.
- The write is a status-guarded `updateMany` inside a transaction, so a concurrent transition loses
  the race and surfaces as an invalid transition rather than a silent overwrite.
- A refusal writes nothing, audits nothing, and moves no reminder. The suite asserts that on every
  refused pair, because a mutation that half-applies before rejecting is worse than one that
  rejects cleanly.
- A patient's change request never mutates the appointment. It records what they asked for and
  leaves the decision with staff, and is accepted only against a confirmed appointment still in the
  future.

## Reminders

A reminder is queued when a request is confirmed, for 24 hours before the start time, clamped to
now when that moment has already passed. It then sits in the queue for up to a day, which is the
window every lifecycle action has to invalidate it. The failure mode is a patient being told to
attend a visit that was cancelled.

Two defences, and both are asserted:

1. At mutation time, every queued reminder for the appointment is recorded as `FAILED` with the
   reason for that transition, and its queue job removed. The match covers reminders created before
   `appointmentId` was a column, which carry the appointment only in their payload.
2. At send time, the reminder is checked again against the appointment it names. A missing
   appointment, a status other than `CONFIRMED`, or a start time that no longer matches the payload
   all stop the send.

A suppressed reminder is recorded rather than deleted, and a patient with no phone and no email
produces a visible `FAILED` row rather than silence, so staff can see the patient was never told.

## Tenant isolation

Three layers, and all three must hold. This is the same arrangement the clinical records gate
established; appointments were never separately verified against it.

1. `ClinicScopeGuard` admits the request to a clinic; `RbacGuard` checks the permission against the
   roles held there.
2. Every appointment read and write carries `clinicId` in its Prisma `where`, asserted from the
   query arguments rather than trusted.
3. PostgreSQL policies on `Appointment` and `AppointmentRequest` apply to a connection that cannot
   bypass them.

A cross-clinic identifier therefore reports not found rather than forbidden, which is deliberate:
confirming that a row exists elsewhere is itself a disclosure.

## Test data requirements

The suite cannot reach its own subject without fixtures, because a confirmed appointment is
produced only by confirming a request.

`SEED_SAMPLE_APPOINTMENTS=true` on `npm run db:seed` creates, alongside the existing seed:

| Fixture                                 | Purpose                                               |
| --------------------------------------- | ----------------------------------------------------- |
| Patient "Appointment Demo"              | Owns every appointment fixture; synthetic national ID |
| One `CONFIRMED` appointment, 26h ahead  | The subject of reschedule and cancel                  |
| One `COMPLETED` appointment, 48h behind | Read-only rendering and the completed count           |
| One `CANCELLED` appointment, 72h behind | Read-only rendering and status filtering              |
| One `NO_SHOW` appointment, 96h behind   | Read-only rendering and status filtering              |
| One `REQUESTED` new-visit request       | The subject of confirm and reject                     |
| One `REQUESTED` reschedule request      | A change request against the confirmed appointment    |

Times are relative to the run, so completing and marking a no-show, which the API refuses before
the start time, stay reachable and the confirmed visit stays ahead. The seed is additive and skips
when the fixture patient already exists. It requires `NATIONAL_ID_ENCRYPTION_KEY` and at least one
seeded staff identity to own the records, and it runs off the E2E staff user rather than only
`SEED_SYSTEM_ADMIN_SUB`, which the E2E job never sets.

The API suites need no database. They mock the Prisma surface from
`apps/api/src/testing/appointment-fixtures.ts` and take their clinic and role identities from the
canonical tenant fixture in `@nkwapa/db`, so the appointment suites describe the same world as the
isolation suites.

## Operator steps before enablement

1. Deploy. No migration is required: this release adds no column and alters no row.
2. Confirm the request queue is visible to a doctor. The permission on that route changed from
   `CLINIC.READ` to `APPOINTMENT.READ`, which widens access to doctors and volunteers and narrows
   it for nobody.
3. Seed the acceptance fixtures in non-production environments:
   `SEED_SAMPLE_APPOINTMENTS=true npm run db:seed`. Do not set this in production.
4. Confirm `npm run docs:appointment-matrix --workspace=@nkwapa/api` leaves the generated matrix
   unchanged.
5. Validate keyboard and focus behaviour, and layouts at 375, 768, 1024, and 1440 pixels.
6. Run the appointment matrix in `docs/USER_TESTING_GUIDE.md` for a doctor, a volunteer, and a
   claimed portal patient.

Rollback: revert the release. The permission change is the only behavioural change to an existing
route, and reverting it restores the previous, narrower access.

## Residual risks

- **Times are read and entered in three different zones.** The schedule formats with the clinic
  timezone the API returns, computes its date ranges in UTC, and converts the reschedule and
  confirm dialogs through the browser's offset. A staff member outside `Africa/Accra` sees Accra
  time in the table and their own time in the dialog beside it, with nothing on screen naming
  either. This gate does not fix it.
- **`TRIAGED` and a request status of `CANCELLED` are unreachable.** Both are accepted as source
  states and neither is ever written, so a request cannot be parked mid-triage and a patient cannot
  withdraw one. The matrix records this rather than implying the states work.
- **The week view is unbounded.** Every returned row is rendered; a busy clinic's week is one long
  DOM list with no pagination and no "showing N of M".
- **Reminder failure reasons reach the UI as text.** The badge renders whatever the reminder
  subsystem writes before the first colon, sentence-cased. A new reason appears in the interface
  without anyone deciding how it reads.
- **No optimistic update.** After a lifecycle action the schedule reloads in the background and
  stays interactive with stale data until it lands.
- **Appointment data in research exports** is derived from `AppointmentRequest` only. The four
  lifecycle statuses on the `Appointment` row itself are not separately covered by the research
  field registry's drift test.
- **A system administrator cannot use the portal routes.** `ClinicScopeGuard` short-circuits for a
  global `SYSTEM_ADMIN` and returns before it sets `request.clinicId`. Staff routes are unaffected
  because they read the clinic from the path, but the portal routes read `request.clinicId` and
  answer `X-Clinic-Id header is required`. The refusal is arguably right, since a system
  administrator is not a patient, but the message describes a missing header the caller did send.
  Changing it means changing a guard every route depends on, which is out of scope here.
- **Contrast and label semantics** are not machine-checkable. They stay in the operator QA matrix.

## Release-gate evidence

Evidence for this gate is the appointment transition suite over every state and action pair
including the refusals; the authorization suite driving the real `ClinicScopeGuard` and `RbacGuard`
over every route and role, the cross-clinic seat holder, and the portal boundary in both
directions; the reminder scheduling, suppression, and send-time suites; the lifecycle matrix drift
test and its generated document; the Playwright appointment suite covering triage, the lifecycle
dialogs, role gating for a doctor against a volunteer, the portal views, and the four supported
widths; the existing accessibility suite; and workspace format, lint, typecheck, test, secret scan,
dependency audit, and production builds.

Exact command results belong in the pull request and the issue #6 verification record.
