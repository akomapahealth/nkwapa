# Telemetry And Metrics

## Status

Current (#29). The event catalog, its sanitizer, server-side recording, the metrics dashboard and
the retention purge are implemented. This document is the event taxonomy the issue asks for; the
catalog in `packages/db/src/telemetry-events.ts` is the source of truth, and a spec fails if an
event in it is missing from the tables below.

## Purpose

Product and operations teams need to measure conversion, failure and retry patterns in the
workflows that matter: appointment requests, chart merges, invitations and claims, offline sync,
and throttling. Telemetry answers **how often** and **how well**. It does not answer **who** or
**to whom**: that remains the audit log's job, and the audit log remains the source of truth for
every compliance action.

## Privacy Rules

Payloads are built from an allow-list, never filtered through a block-list. An event may carry:

- its name, category and timestamp;
- the clinic it happened at (an organisational unit, not a person), or none;
- `outcome`: `SUCCEEDED` or `FAILED`;
- `reason`: a machine code matching `^[A-Z][A-Z0-9_]{1,63}$`, such as `INVITE_EXPIRED`. Free text
  cannot match, so an exception message is never recorded even if a caller passes one;
- `durationMs` and the event's own properties, each an enumerated value, a bounded count or a
  boolean.

An event never carries names, contact details, dates of birth, national IDs, clinical values, free
text, or patient and user identifiers. The rules are enforced three times:

1. `sanitizeTelemetry` drops anything the catalog does not allow for that event, and reports the
   dropped key names (never their values) in a warning log.
2. The database repeats the outcome, reason-code and bucket rules as `CHECK` constraints.
3. A catalog spec fails if any declared property's name suggests a person (`name`, `email`,
   `phone`, `patientId`, and so on).

Browser analytics (`apps/web/lib/analytics.ts`) may send only events marked as browser events,
through the same sanitizer, and only when `NEXT_PUBLIC_ANALYTICS_ENABLED` is `true` and a provider
script is present.

## Architecture

- **Recording.** API routes declare `@Track(event)`. A global interceptor records the outcome, the
  duration, and on failure the refusal's code, around the handler, so services stay free of
  telemetry calls and the recorded outcome is what the caller actually received. Refused sync
  changes (`sync.mutation.refuse`) and throttled requests (`security.rate_limit`) are recorded
  directly where they happen.
- **Writing.** `TelemetryService.record` is synchronous and cannot throw. It logs one structured
  line (`"type":"telemetry"`) and buffers the event; a timer writes the buffer every five seconds in
  batches, under an explicit system context outside any request. A slow or unavailable database
  delays metrics and never a clinician. The buffer is capped at 5,000 events.
- **Storage.** `TelemetryEvent`, with forced row level security: a director or manager reads their
  own clinic's rows, and rows with no clinic are visible to system administrators only.
- **Reading.** `GET /clinics/:clinicId/metrics?days=7|30|90` (permission `METRICS.READ`, held by
  directors and managers, and system administrators through the wildcard) returns counts only:
  per-event outcomes, funnels, top failure reasons, daily totals and sync volumes. The web page is
  `/metrics`, under Oversight.
- **Retention.** A daily BullMQ job deletes rows older than `TELEMETRY_RETENTION_DAYS`.

## Configuration

| Variable                        | Service          | Default | Effect                                                 |
| ------------------------------- | ---------------- | ------- | ------------------------------------------------------ |
| `TELEMETRY_ENABLED`             | API              | `true`  | `false` stops recording and logging telemetry entirely |
| `TELEMETRY_RETENTION_DAYS`      | API              | `180`   | Days kept before the purge; bounded to 7-730           |
| `NEXT_PUBLIC_ANALYTICS_ENABLED` | Web (build time) | `false` | Allows browser events to reach a provider script       |

## Event Taxonomy

Names follow `domain.object.action`. Every event may also carry `outcome`, `durationMs` and
`reason`; only `security.rate_limit` carries `bucket`, the rate-limit key such as `sync_push`.

### Appointments

| Event                         | Label                    | Source | Properties                            | Meaning                                                           |
| ----------------------------- | ------------------------ | ------ | ------------------------------------- | ----------------------------------------------------------------- |
| `appointment.request.submit`  | Appointment requests     | API    | `kind`: `NEW`, `RESCHEDULE`, `CANCEL` | A patient asked for a new visit, a reschedule, or a cancellation. |
| `appointment.request.confirm` | Requests confirmed       | API    | `kind`: `NEW`, `RESCHEDULE`, `CANCEL` | Staff confirmed a patient request, booking or changing the visit. |
| `appointment.request.reject`  | Requests declined        | API    | `kind`: `NEW`, `RESCHEDULE`, `CANCEL` | Staff declined a patient request.                                 |
| `appointment.reschedule`      | Appointments rescheduled | API    | none                                  | Staff moved a confirmed appointment.                              |
| `appointment.cancel`          | Appointments cancelled   | API    | none                                  | Staff cancelled an appointment.                                   |
| `appointment.complete`        | Appointments completed   | API    | none                                  | An appointment was marked completed.                              |
| `appointment.no_show`         | No-shows                 | API    | none                                  | An appointment was marked as a no-show.                           |

### Identity

| Event                           | Label                                 | Source | Properties                                                                             | Meaning                                                                  |
| ------------------------------- | ------------------------------------- | ------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `patient.merge.preview`         | Merge previews                        | API    | `blocked`: boolean<br>`blockerCount`: count (0-50)<br>`warningCount`: count (0-50)     | Staff previewed merging two charts.                                      |
| `patient.merge.execute`         | Charts merged                         | API    | none                                                                                   | Staff merged two charts.                                                 |
| `patient.duplicate.investigate` | Cross-clinic duplicate investigations | API    | `pairCount`: count (0-500)<br>`clinicPairCount`: count (0-500)<br>`truncated`: boolean | A system administrator looked at likely duplicates spanning two clinics. |

### Invites

| Event                  | Label                        | Source | Properties                                                                                                                                                               | Meaning                                                   |
| ---------------------- | ---------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `portal.invite.create` | Portal invitations sent      | API    | `identity`: `NOT_REQUESTED`, `PROVISIONED`, `EXISTING_PENDING`, `ALREADY_ACTIVE`, `SKIPPED`, `FAILED`<br>`delivery`: `QUEUED`, `SENT`, `DELIVERED`, `FAILED`, `NOT_SENT` | Staff invited a patient to the portal.                    |
| `portal.invite.resend` | Portal invitations resent    | API    | none                                                                                                                                                                     | Staff resent a portal invitation.                         |
| `portal.invite.cancel` | Portal invitations cancelled | API    | none                                                                                                                                                                     | Staff cancelled a portal invitation.                      |
| `portal.claim`         | Record claims                | API    | none                                                                                                                                                                     | A patient tried to claim their record with an invitation. |
| `staff.invite.create`  | Staff invitations sent       | API    | none                                                                                                                                                                     | A director or manager invited a staff member.             |
| `staff.invite.accept`  | Staff invitations accepted   | API    | none                                                                                                                                                                     | An invited staff member tried to accept.                  |

### Sync

| Event                  | Label                     | Source  | Properties                                                                                                                                                                                                                                                                                                                                                                                        | Meaning                                         |
| ---------------------- | ------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `sync.push`            | Sync pushes               | API     | `mutations`: count (0-500)<br>`applied`: count (0-500)<br>`conflicts`: count (0-500)<br>`errors`: count (0-500)<br>`retryable`: count (0-500)                                                                                                                                                                                                                                                     | A device pushed a batch of offline changes.     |
| `sync.mutation.refuse` | Offline changes refused   | API     | `entityType`: `patient`, `encounter`, `vitals`, `encounter_vitals_bundle`, `diabetes_screening`, `hypertension_assessment`, `encounter_medication_adherence`, `care_plan`, `patient_consent`, `prescription`, `medical_history_revision`, `patient_medication_revision`, `medication_reconciliation`, `patient_pharmacy_revision`, `patient_pharmacy_preference`, `other`<br>`retryable`: boolean | The server refused one offline change.          |
| `sync.center.open`     | Sync center opened        | Browser | `blocked`: count (0-500)<br>`queued`: count (0-500)                                                                                                                                                                                                                                                                                                                                               | A clinician opened the sync center.             |
| `sync.change.retry`    | Offline changes retried   | Browser | none                                                                                                                                                                                                                                                                                                                                                                                              | A clinician retried a refused offline change.   |
| `sync.change.discard`  | Offline changes discarded | Browser | none                                                                                                                                                                                                                                                                                                                                                                                              | A clinician discarded a refused offline change. |

### Security

| Event                 | Label              | Source | Properties                          | Meaning                                           |
| --------------------- | ------------------ | ------ | ----------------------------------- | ------------------------------------------------- |
| `security.rate_limit` | Requests throttled | API    | `scope`: `user`, `ip`, `user-or-ip` | A request was refused for exceeding a rate limit. |

### Engagement

| Event               | Label                | Source  | Properties                      | Meaning                                 |
| ------------------- | -------------------- | ------- | ------------------------------- | --------------------------------------- |
| `landing.page.view` | Landing page views   | Browser | none                            | The public landing page was viewed.     |
| `landing.cta.click` | Landing page actions | Browser | `target`: `workflow`, `product` | A landing page call to action was used. |

### Funnels

| Funnel               | Steps                                                        | Meaning                                                   |
| -------------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| Appointment requests | `appointment.request.submit` → `appointment.request.confirm` | Patient requests submitted, and how many staff confirmed. |
| Visits               | `appointment.request.confirm` → `appointment.complete`       | Confirmed requests, and how the visits ended.             |
| Chart merges         | `patient.merge.preview` → `patient.merge.execute`            | Merge previews, and how many became merges.               |
| Portal invitations   | `portal.invite.create` → `portal.claim`                      | Patients invited, and how many claimed their record.      |
| Staff invitations    | `staff.invite.create` → `staff.invite.accept`                | Staff invited, and how many accepted.                     |

Funnels are counted per window, not per person: following one patient from request to visit would
need an identifier in every event, which telemetry must not hold. A window's step-to-step ratio is
the measure that needs none.

## Known Limits

- A failed claim or staff acceptance has no clinic yet, so it is stored without one and appears
  only to system administrators.
- A throttled request is attributed to a clinic only when its route names one.
- Counts are best effort. If the database is unreachable long enough to fill the buffer, the
  oldest events are dropped and a warning is logged. The audit log is unaffected.

## Adding An Event

1. Add it to `TELEMETRY_EVENTS` with a label, a description and its property rules.
2. Emit it: `@Track('your.event')` on the route, or `telemetry.record('your.event', …)`.
3. Add its row to the taxonomy above. The coverage spec in `apps/api/src/telemetry` fails if a
   server event is never emitted, and the catalog spec fails if the row is missing here.
