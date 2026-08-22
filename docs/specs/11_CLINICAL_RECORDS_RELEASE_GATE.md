# Clinical Records Release Gate

## Status and scope

Current. This is the release gate for the clinical-records initiative: longitudinal medical history
and allergies, expanded encounter vitals and tobacco screening, medication reconciliation and
pharmacy history, the dedicated diabetes screening tab, HAP clinical notes with cosign and addenda,
patient residential location, and the role-aware patient chart.

Each of those shipped with its own tests. This gate covers what those tests could not: the seams
between them. Every defect it found lives in one of those seams — the offline path against the REST
path, one clinic's roles against another's, what a CSV includes against what the schema now holds.

## What the gate found

Verified against the running system, not inferred.

### Row level security was never in effect

Policies were declared on 39 tenant-scoped tables and applied to none of them. `FORCE ROW LEVEL
SECURITY` was set on the two chat tables only, and PostgreSQL exempts a table's owner from its own
policies without it. Independently, the application connected as a superuser holding `BYPASSRLS`,
which bypasses policies regardless of `FORCE`.

Measured before the fix: a query with an empty clinic context returned every patient, every vitals
row, and every clinical note in the database. Measured after: the same query returns nothing, a
clinic-scoped context returns only that clinic, and an insert naming another clinic is rejected by
the policy.

Clinic and organization isolation had been resting entirely on application code. Every guard defect
below was therefore the only thing standing between a bug and a cross-tenant read.

### The offline path granted more than the online one

`POST /sync/push` was gated by `SYNC.PUSH` alone. Six of the fourteen replayable entity types
reached their handler with no further check; the four that did check read the caller's whole role
array rather than the roles held at the target clinic.

- A director or manager could queue a care plan, a consent, or a prescription. The REST route
  refuses all three from those roles.
- A volunteer could queue a prescription or a care plan.
- A user who is a manager at one clinic and a volunteer at another was admitted on the manager seat
  and then authorized by the volunteer seat, so a role at one clinic granted clinical writes at a
  different one.
- A payload could name a different clinic than the request was scoped to, placing the record outside
  the clinic the caller was admitted to.
- A queued encounter could carry `status: FINALIZED`, locking the encounter and with it its vitals,
  screenings, and clinical notes — bypassing `DOCTOR.FINALIZE`, the review step, and note signing.
- Push bodies were never validated: Nest cannot infer an element type from an array annotation, so
  every constraint on `SyncMutationDto` was inert and `entityId` reached a primary key unchecked.

### Replay could not recover

Every failed mutation was cached against its idempotency key, and every later replay returned the
cached failure. A queued change could never succeed once it had failed for any reason, including
reasons that had since gone away. This is the mechanism behind the poisoned outbox.

### Sync shipped more than the client used

`GET /sync/pull` returned whole Prisma patient rows, so `nationalIdCiphertext` and `nationalIdHash`
were sent to every browser and written to IndexedDB, where the hash was also indexed. No client code
ever read either: the decryption key is server-side and duplicate detection is server-side.

### Error reports carried patient data

Neither Sentry configuration scrubbed anything. The API sent URLs naming patients, request bodies
that are clinical records, and unredacted exception messages. The web app recorded Session Replay on
ten percent of all sessions on a UI whose foreground is a patient chart.

### Research exports were silent about new data

Medication reconciliation, pharmacy history, and clinical notes were absent from the export with
nothing recording whether that was a decision or an oversight, as were the newer diabetes symptom
fields. A table nobody wired up and a field nobody considered looked identical.

### Audit events did not correlate

Twenty-two call sites generated a fresh request id, discarding the inbound `x-request-id`. That is
worse than an empty field: an invented id reads as a correlation, so the writes one request
performed could not be tied together and nobody could tell by reading the log.

## Access policy

The full per-role matrix, generated from what the API enforces, is
[`docs/security/clinical-records-role-matrix.md`](../security/clinical-records-role-matrix.md).
A test compares the file byte for byte against the code, so it cannot describe a policy the system
does not implement.

In summary:

- General clinical records are readable by an active clinic `SYSTEM_ADMIN`, `DIRECTOR`, `MANAGER`,
  `DOCTOR`, or `VOLUNTEER`, and writable by `DOCTOR` and `VOLUNTEER`.
- Clinical note content and cosign detail are restricted to `DOCTOR` and `VOLUNTEER`. Managers and
  directors receive an aggregate pending count and nothing else. `SYSTEM_ADMIN` wildcard permissions
  do not grant note content; a system administrator must separately hold a clinical seat.
- Cosigning and addenda are `DOCTOR` only.
- Registering a patient (`PATIENT.CREATE`) and editing an existing chart (`PATIENT.UPDATE`) are
  separate permissions, and a volunteer holds only the first. The offline path distinguishes them.
- A portal patient reaches none of it.
- Every permission is evaluated against the roles held **at the clinic being read or written**.

## Tenant isolation

Three layers, and all three must hold:

1. `ClinicScopeGuard` admits the request to a clinic; `RbacGuard` checks the permission against the
   roles held there.
2. Services re-check through `assertPermissionAtClinic`, never against the raw role array.
3. PostgreSQL policies apply to a connection that cannot bypass them.

The third layer requires an unprivileged database role. Migrations and table ownership stay with the
existing role; the API connects as `nkwapa_app`, which holds neither `SUPERUSER` nor `BYPASSRLS`.
The service reports at boot whether its connection can enforce the policies at all, and
`DATABASE_RLS_ENFORCEMENT=required` makes a database that cannot a startup failure.

## Offline replay and conflict recovery

- Authorization does not depend on connectivity: every entity type maps back to the permission its
  online route requires, in a table typed so that adding a replayable entity without deciding its
  permission is a compile error.
- An outcome is cached against its idempotency key only when replaying the identical mutation is
  guaranteed to reach the same answer: applied, or a conflict arising from server state a replay
  cannot change. Everything else is recorded for the operator and genuinely re-attempted.
- A finalized encounter is reported as a conflict on every entity type. It used to be a conflict for
  vitals and diabetes and a plain error for care plans and prescriptions, so the same condition
  either recovered or wedged the queue depending on which record type hit it.
- The client keeps a retryable change queued and continues to the pull. A rejection still stops the
  pass, because it needs a clinician before anything else helps.
- Conflict detail is built from an allow-list with the message redacted, so a handler that starts
  including patient detail in an error cannot leak it through sync.
- Clinical notes are never queued, cached, or replayed.

## Research exports

Every field of every record type the initiative added carries an explicit disposition and a reason:
exported, coarsened, or excluded as a direct identifier, a quasi-identifier, free text, a staff
identifier, or internal bookkeeping. Clinical notes and addenda are excluded in full. Pharmacy
records keep coarse geography and lose the name, phone, address, city, and postal code.

A drift test reads the schema and fails when a migration adds a column the registry has not answered
for, and when the registry answers for a column that no longer exists. Standing rules — no free
text, no staff identifier, no note content — are checked across every model.

## Backward compatibility

Migrations are rehearsed against a synthetic pre-initiative dataset rather than only against an
empty database. Verified behaviour:

| Legacy data                         | After migration                                                   |
| ----------------------------------- | ----------------------------------------------------------------- |
| `Vitals.heartRate`                  | Carried to `pulseBpm`; rows without one stay empty                |
| Expanded vitals columns             | Null for legacy rows; no value is invented                        |
| Diabetes symptom text (mappable)    | Mapped to the enum, `legacySymptomsUnmapped` false                |
| Diabetes symptom text (partial)     | What was understood is kept, `legacySymptomsUnmapped` true        |
| Diabetes symptom text (unparseable) | Empty enum, `legacySymptomsUnmapped` true, original text retained |
| Patient residence                   | `NOT_RECORDED`; never guessed from clinic                         |
| Finalized encounters                | Still finalized                                                   |
| Consent decisions                   | Preserved in both states                                          |
| Absent optional identifiers         | Still absent                                                      |

A watermark check fails if a migration is inserted between the snapshot's schema and the first
clinical-records migration, which would silently stop the rehearsal testing the real upgrade.

## Operator steps before enablement

1. Deploy the migrations. They force row level security on every tenant-scoped table and provision
   the `nkwapa_app` role. If the migration credential cannot `CREATE ROLE`, provision it out of band.
2. Give the role a login: `APP_DATABASE_PASSWORD=… node scripts/provision-app-db-role.mjs`, run with
   the owner credential. The script refuses a role holding `SUPERUSER` or `BYPASSRLS`.
3. Point the API at it with `APP_DATABASE_URL`. Leave `DATABASE_URL` as the owner credential for
   migrations. Until this is done the service starts and logs that its policies are not enforced.
4. Set `DATABASE_RLS_ENFORCEMENT=required` so a database that cannot enforce isolation fails at boot
   rather than serving requests unprotected.
5. Confirm the boot log reads `Row level security is enforced for database role "nkwapa_app"`.
6. Validate keyboard and focus behaviour, offline content removal, and layouts at 375, 768, 1024, and
   1440 pixels.
7. Run the operator QA matrix in `docs/USER_TESTING_GUIDE.md` for the doctor and volunteer roles.

Rollback: revert `APP_DATABASE_URL` to the owner credential and unset `DATABASE_RLS_ENFORCEMENT`.
The service starts and warns. `FORCE ROW LEVEL SECURITY` is safe to leave in place — it changes
nothing for a bypassing role — and reverting it should not be necessary. No migration in this gate
alters or removes an existing row.

## Residual risks

- **Production still connects as the owner** until step 3 above is performed. The boot check reports
  this on every start, and it is the single highest-value action in this gate.
- **`_prisma_migrations` grants** are revoked from the application role only when the table exists at
  migration time. A database provisioned by replaying migration files directly will not have the
  revoke; the role has no other route to it.
- **Small-cell dashboard aggregates** are unsuppressed. A clinic with few encounters can produce a
  mean temperature or BMI over a handful of patients. No k-anonymity floor is applied, and this gate
  does not add one.
- **Research export separation of duties** is not enforced: a director both requests and approves,
  and download requires only the request permission. Out of scope here.
- **The service worker** caches authenticated navigation responses into Cache Storage. It does not
  intercept API traffic and no clinical payload passes through it, but the HTML shell of an
  authenticated page persists on the device.
- **Contrast and label semantics** are not machine-checkable. They stay in the operator QA matrix.
- **Pending clinical notes cannot be reassigned.** Carried forward from
  [`10_CLINICAL_NOTES.md`](./10_CLINICAL_NOTES.md).

## Release-gate evidence

Evidence for this gate is the tenant-isolation integration suite run against real PostgreSQL as the
unprivileged role; the migration rehearsal against the synthetic legacy snapshot; the role matrix and
its generated document; the sync authorization, replay, and payload-validation suites; the
non-exposure contracts for clinical notes and the patient portal; the research field registry and its
drift test; the row-level-security coverage and enforcement checks; the audit correlation tests; the
Sentry scrubbing tests; the Docker-backed Playwright suites including accessibility, role gating,
offline replay, and the four supported widths; and workspace format, lint, typecheck, test, secret
scan, dependency audit, and production builds.

Exact command results belong in the pull request and the issue #67 verification record.
