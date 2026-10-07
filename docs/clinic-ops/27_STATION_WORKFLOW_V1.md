# 27. Station Workflow V1

## Status

Implemented behind `FEATURE_STATION_WORKFLOW_ENABLED` (API) and
`NEXT_PUBLIC_FEATURE_STATION_WORKFLOW_ENABLED` (web). Issue #167. Set both together; the web flag
is inlined at build time, so changing it needs a rebuild.

While the flag is on, this replaces manager assignment (doc 21). While it is off, doc 21 describes
the live behaviour and nothing in this document is reachable.

---

## Why

Student clinics (UCC first) run screening as a line of stations. A patient is not owned by one
volunteer: whoever is free at a station takes the next patient waiting there, records that
station's data and hands them on. The last station counsels the patient and completes the session.
A doctor reviews afterwards.

## The line

| Order | Kind             | Default name                     | What it records                                                            |
| ----- | ---------------- | -------------------------------- | -------------------------------------------------------------------------- |
| 1     | `INTAKE`         | Registration and medical history | Medical history and allergies (`MedicalHistoryPanel`)                      |
| 2     | `BLOOD_PRESSURE` | Blood pressure                   | BP with context, and observations (Vitals groups `bloodPressure`, `notes`) |
| 3     | `GLUCOSE`        | Glucose testing                  | Today's reading and its timing (`diabetes_glucose_reading`)                |
| 4     | `ANTHROPOMETRY`  | Anthropometry                    | Weight and height; BMI is derived (Vitals group `anthropometry`)           |
| 5     | `REVIEW`         | Counselling and clinical review  | Combined results, counselling record, HAP note                             |

Every clinic is seeded with this line: existing clinics by migration `20261007120000_station_workflow`,
new clinics by `ClinicService.create`, local data by `seed.ts`. The template lives in
`packages/db/src/clinic-stations.ts`. Managers can rename, reorder, close and add stations
(`OPS.STATION.MANAGE`). A clinic always has exactly one active `REVIEW` station.

## Flow

1. **Check-in.** Any check-in (online or replayed offline) queues the patient at the first active
   station in the same transaction.
2. **Claim.** A volunteer on an active shift takes the patient. The claim is a conditional update
   on `status = QUEUED`; of two simultaneous claims, one wins and the other gets
   `409 STATION_VISIT_ALREADY_CLAIMED` naming the winner. The first claim of a check-in opens the
   DRAFT encounter every later station records into.
3. **Record.** The station's form saves offline like any other clinical form. Station forms write
   only their own groups, so two stations never erase each other's readings.
4. **Hand on.** The volunteer completes the visit with an optional note. The next station is the
   next active one by order; they may choose another, or skip stations with a reason each (the
   review station cannot be skipped). Before completing, the device flushes its outbox so the next
   station sees what was recorded.
5. **Review.** The review station sees every result with who recorded it, records counselling
   (topics, advice, follow-up, referral) and may submit a HAP note. Completing the review station
   requires a counselling record, locks it, moves the encounter to `IN_REVIEW` and the check-in to
   `COMPLETED`.
6. **Doctor.** The encounter appears in the existing review queue. The encounter page has a
   _Station session_ tab with the results, route and counselling. Any doctor at the clinic can
   cosign a note submitted from the line (first cosign wins). A volunteer's follow-up
   recommendation is not a scheduled reminder: the doctor sets the care plan follow-up date, which
   is what `EncounterService.finalize` schedules from, and the tab says so.

Overrides: the holder can put a patient back in the queue (`release`, with a reason) or record
that they left (`cancel`). Managers can move a patient to any station, release a claim someone
left open (`force-release`) and record a patient leaving. Ending a shift releases every patient
the person held (`SHIFT_ENDED`).

## Data

- `ClinicStation` — the line. `@@unique([clinicId, sortOrder])`; one active `REVIEW` per clinic
  (partial unique index).
- `PatientStationVisit` — one stop of one check-in at one station. At most one `QUEUED` or
  `IN_PROGRESS` row per check-in (partial unique index), so a patient is at one station at a time.
  A claimed row always names its holder (check constraint). Revisits are new rows.
- `StaffShift.stationId` — where someone is working now.
- `CounsellingRecord` — one per encounter, volunteer-writable, optimistic `version`, `lockedAt`.

All three tables have forced row-level security on `app.can_access_clinic("clinicId")`. Their
guarantees are tested against a real database in
`packages/db/src/station-workflow-migration.integration.spec.ts`.

## Permissions

| Permission                              | Roles                                |
| --------------------------------------- | ------------------------------------ |
| `OPS.STATION.READ`                      | Director, Manager, Doctor, Volunteer |
| `OPS.STATION.WORK`                      | Manager, Doctor, Volunteer           |
| `OPS.STATION.MANAGE`                    | Director, Manager                    |
| `COUNSELLING.READ`, `COUNSELLING.WRITE` | Doctor, Volunteer                    |

Managers and directors see where patients are and who holds them, never counselling or note
content. `CAREPLAN.WRITE` and `CAREPLAN.CLINICIAN_PLAN` stay doctor-only.

## API

All under `clinics/:clinicId`, 404 while the flag is off. Every transition writes its audit event
inside its own transaction (`STATION.QUEUE`, `STATION.CLAIM`, `STATION.RELEASE`,
`STATION.FORCE_RELEASE`, `STATION.COMPLETE`, `STATION.SKIP`, `STATION.MOVE`, `STATION.CANCEL`,
`CHECKIN.CANCEL`, `COUNSELLING.CREATE/UPDATE`). Counselling content is not written to the audit
trail.

| Route                                                                                            | Purpose                                      |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `GET stations`, `POST stations`, `PATCH stations/:id`, `PUT stations/order`                      | The line                                     |
| `GET stations/board?date=`                                                                       | Every station with its open visits and staff |
| `PATCH shifts/:shiftId/station`                                                                  | Where I am working                           |
| `GET station-visits/:id`, `GET checkins/:id/station-visits`, `GET encounters/:id/station-visits` | A visit and its route                        |
| `POST station-visits/:id/claim` \| `release` \| `force-release` \| `complete`                    | Moving a patient along                       |
| `POST checkins/:id/move`, `POST checkins/:id/cancel`                                             | Overrides                                    |
| `GET/PUT encounters/:id/counselling`                                                             | The counselling record                       |
| `PUT encounters/:id/diabetes-screening/glucose`                                                  | The glucose station's reading                |

With the flag on, `POST assignments`, `PATCH assignments/:id/reassign` and
`POST checkins/:id/start-intake` answer `409 STATION_WORKFLOW_ACTIVE`.

## Offline

Readings stay offline-capable. Two write shapes were added for the line:

- `encounter_vitals_bundle` **schemaVersion 2** carries `sections` and writes only those groups.
  Version 1 (a full-row replace) is still accepted for rows already queued on devices.
- `diabetes_glucose_reading` writes the reading alone and recomputes `derivedSuspicion` and the
  urgent-review flags from it and the stored interview answers.

Claim, release, complete, move and cancel are online-only: the server decides who holds a patient.
Counselling is online-only, like clinical notes.

## Known limits

- Polling, not push: an open station screen re-reads the line every 12 seconds.
- Shared station laptops: #162 (tie queued changes to the account that queued them) should land
  before a real clinic turns the flag on.
- Which volunteer may write a station's data is enforced in the UI and recorded by the visit and
  audit trail, not refused by the server, so an offline replay is never refused because a claim
  has since moved on.
- Retiring manager assignment and the flag is a follow-up, as #149 is for the pre-interview forms.
