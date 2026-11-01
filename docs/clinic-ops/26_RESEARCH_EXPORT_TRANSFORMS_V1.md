# 26. Research Export Transforms V1 And V2

## Status

Implemented in the current codebase.

This document now serves as both the v1 contract and the operator-oriented reference for the research export pipeline.

---

## Goal

Transform operational and clinical data into de-identified, research-safe export packs that can be:

- requested from the app UI
- approved when required
- processed asynchronously
- run on a director-approved weekly or monthly schedule (#166)
- downloaded as local ZIP artifacts
- published to research storage: Cloudflare R2 (recommended), a private GitHub repository, or a
  local folder in development

---

## Current Gate Checks

An export can only proceed when these conditions are satisfied:

1. clinic research is enabled
2. the export requester has `RESEARCH.EXPORT.REQUEST`
3. if the clinic requires approval, a user with `RESEARCH.EXPORT.APPROVE` approves it
4. patients included in the export have effective research consent at execution time

A run is checked again when it starts, not only when it was approved. It is recorded `SKIPPED`,
with a reason, an audit entry (`RESEARCH_EXPORT.SKIP`) and, for a scheduled run, an email to the
directors, when:

| Reason                     | Meaning                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| `RESEARCH_DISABLED`        | research was turned off after approval                             |
| `SCHEDULE_INACTIVE`        | its schedule is paused, revoked, expired or waiting for approval   |
| `REVIEW_EXPIRED`           | the schedule's standing approval is past its review date           |
| `APPROVER_LOST_PERMISSION` | the approving director is deactivated or no longer holds the role  |
| `BELOW_MINIMUM_COHORT`     | fewer consented patients than `RESEARCH_MIN_SUBJECTS` (default 10) |

The cohort guard applies to manual runs too; a skipped manual run emails nobody.

---

## Current v1 Design Choices

### Destination

One storage port, `ResearchStorageAdapter`, with three providers chosen by
`RESEARCH_STORAGE_PROVIDER` (or, unset: R2 when configured, then GitHub, then local outside
production). A schedule records its own destination.

- **R2**: the recommended destination. Lifecycle rules can expire a revoked subject's rows, which a
  git history cannot.
- **GitHub**: the original snapshot layout, unchanged. With `RESEARCH_GITHUB_MIRROR_MANIFESTS=true`
  and R2 as the primary, each run's `manifest.json` and `changes.json` (no data) are also mirrored
  to `<base>/<clinicKey>/runs/<runKey>/` for a reviewable history.
- **Local**: the R2 layout in a folder (`RESEARCH_LOCAL_STORAGE_DIR`), for development and e2e.

### Artifact model

- local ZIP artifact for download and short-term storage
- the published run in research storage, addressed by its run key

### De-identification model

- stable clinic-scoped HMAC keys
- 15-minute timestamp rounding
- no direct identifiers
- no free-text fields in exported research tables

---

## Fixed Pack Contract

Every completed export pack includes:

- `manifest.json`
- `SHA256SUMS.txt`
- `research_subjects.csv`
- `research_ops_checkins.csv`
- `research_ops_assignments.csv`
- `research_clinical_vitals.csv`
- `research_clinical_tobacco.csv`
- `research_clinical_screenings.csv`
- `research_medication_adherence.csv`
- `research_measurements.csv`
- `research_appointments.csv`
- `research_revocations.csv`
- `research_medical_history.csv`

The contract is versioned as:

- `policyVersion = research-export-v1`
- `datasetVersion = 5`

Consumers must select transforms by dataset version.

**Version 3** expands the canonical vitals columns, renames `heart_rate` to `pulse_bpm`, and adds
the structured tobacco dataset. Reviewer identity is excluded; only reviewed state and rounded
review time are exported.

**Version 4** adds a coarse `residential_region` column to `research_subjects.csv`.

**Version 5** realises the guided chronic-disease interviews (#114). It is additive: every column a
v4 consumer reads is unchanged, and the only file that has to be read for the first time is the
new one.

- `research_clinical_screenings.csv` gains forty hypertension columns, all prefixed
  `hypertension_`. It carried three -- classification, suspected, confirmed -- while the interview
  behind it recorded sixty fields, because `HypertensionAssessment` had no entry in the research
  field registry at all. Notably it now carries `hypertension_derived_classification` and
  `hypertension_classification_overridden` alongside `hypertension_classification`: given only the
  recorded value, an analysis cannot tell a threshold result from a clinician disagreeing with one.
- `research_medication_adherence.csv` is new, one row per medication observed at one visit. The
  medication is never named: `research_medication_record_key` and
  `research_observed_revision_key` join to the reconciled medication list, where the coded `drugId`
  is the analysable form and the patient-reported name is excluded as free text.
- Multi-valued columns (symptoms, barriers, review reasons) are pipe-joined, so a spreadsheet reads
  them without a JSON parser.
- `hypertension_year_diagnosed` is banded to five years. An exact diagnosis year combined with an
  age is frequently unique in a clinic of a few hundred, and the analysis it supports -- disease
  duration -- a band answers as well.
- The supervising clinician plan stays out, as it does for diabetes: it is a decision about one
  identified patient, and a research export is the widest reader there is. The numeric blood
  pressure goal is exported, because a target on a shared scale is a different kind of fact from
  the list of actions a named doctor chose.

Which columns of which tables are exported, coarsened or excluded -- and why, for every column of
every clinical model -- is recorded in `apps/api/src/research/research-field-registry.ts`. Since
v5 that file also names every model that is deliberately _out_ of scope, and a test fails unless
every table in the schema appears in exactly one of the two lists.

The medical-history dataset contains current and historical revisions within the requested range.
It includes de-identified patient, clinic, record, revision, and source-encounter keys; category,
status, clinical dates, revision/schema metadata, approved categorical details, and rounded
timestamps. It excludes notes, substance names, reactions, descriptions, and other free text.

---

## Key Derivation Rules

The current code uses stable clinic-scoped HMAC-based identifiers.

Pattern:

```text
HMAC_SHA256(RESEARCH_HMAC_KEY, "<clinicId>:<entity>:<internalId>")
```

Current export keys include stable derived IDs for:

- clinic
- patient
- encounter
- patient check-in
- assignment
- measurement
- appointment request
- appointment

Important implementation correction:

- v1 no longer salts subject IDs with `exportId`
- this preserves longitudinal analysis across exports

---

## Data Exclusion Rules

These fields must not leave the identified operational database in research export output:

- patient names
- patient code
- exact date of birth
- phone numbers
- email addresses
- national IDs
- witness data
- free-text notes
- assignment reasons
- raw symptom JSON
- raw internal UUIDs

---

## Data Retention Rules for Research Output

Allowed retained shapes in v1 include:

- `sex`
- `birth_year`
- typed enums
- normalized numeric measurements
- rounded operational timestamps
- rounded clinical timestamps
- appointment date windows and confirmed times in de-identified form

Current timestamp rule:

- event times are rounded down to 15-minute buckets

Date-only rule:

- date-only values remain date-only

---

## Current Source Tables and Domains

The transform currently draws from:

- patients
- consents
- encounters
- vitals
- tobacco screenings
- diabetes screenings
- care context needed for encounter relation
- staff shifts and patient check-ins through ops data
- patient assignments
- patient measurements
- selected legacy patient self-reports when they can be normalized safely
- appointment requests
- appointments

---

## Legacy Self-Report Handling

Current v1 behavior:

- include legacy `PatientSelfReport` rows only when they map safely into `research_measurements.csv`
- exclude free-text and non-normalizable symptom reports

This keeps the research measurement table typed and analyzable.

---

## Export Lifecycle

### 1. Request

Route:

- `POST /clinics/:clinicId/research/exports`

Body:

```json
{
  "fromDate": "YYYY-MM-DD",
  "toDate": "YYYY-MM-DD"
}
```

Possible results:

- pending approval
- approved and queued immediately

### 2. Approve or reject

Routes:

- `POST /clinics/:clinicId/research/exports/:exportId/approve`
- `POST /clinics/:clinicId/research/exports/:exportId/reject`

### 3. Process asynchronously

The export is queued on the `research-exports` BullMQ queue.

Current status progression:

- `PENDING_APPROVAL`
- `APPROVED`
- `PROCESSING`
- `COMPLETED`
- `FAILED`
- `REJECTED`
- `SKIPPED` (a run-time governance check failed; see Current Gate Checks)

Every run has a run key, `rx-<clinicKey8>-<period>[-r<n>]`: `w2026-41` for a weekly run, `m2026-10`
for a monthly one, `a20261005-k3m2` for a manual or Run now run, and `-r2` onwards for a rerun. The
prefix is the start of the HMAC research clinic key, never the clinic id, so a key is safe to quote.
It is unique in the database and is the queue job id, so a duplicate trigger is a no-op.

A run is a series of short clinic-scoped transactions, never one around the publish (#164):

1. **Claim**: `APPROVED` -> `PROCESSING`, committed, after the governance re-checks.
2. **Generate** the pack in a read-only transaction, which may run for up to two minutes because
   reading twice is harmless.
3. **Plan**: record the pack metadata and the repository path the push will write to.
4. **Publish** to storage with no transaction open.
5. **Record** `COMPLETED` with the storage path and reference (a commit sha, or the run's content
   hash), then mirror the manifest when that is configured. A mirror failure is audited
   (`RESEARCH_EXPORT.MIRROR_FAIL`) and does not undo the run.

A failure behaves as follows:

- **Before the push, attempts left:** the export is handed back (`PROCESSING` -> `APPROVED`) and
  the run is thrown to the queue, which runs it again (three attempts, exponential from 60 seconds).
- **Before the push, last attempt:** the run records `FAILED` and its `RESEARCH_EXPORT.FAIL` audit
  entry, then returns.
- **The publish fails, or COMPLETED cannot be recorded:** the planned path settles it. On GitHub,
  a commit touching the run's unique snapshot directory is that run's push; on R2 or local, a
  `manifest.json` at the run's prefix is, because the manifest is written last. The export
  completes from it without publishing again. No commit means the push did not land,
  and the run fails or retries as above. If GitHub cannot be asked, the export stays `PROCESSING`.
- **Two deliveries of one export:** a duplicate finds `PROCESSING` and stands down, and one that
  arrives after completion finds `COMPLETED` and does nothing. The pack is pushed once.
- **A run that never finished:** the reconciliation sweep (every fifteen minutes) settles exports
  still `PROCESSING` an hour after they started, the same way: a commit at the planned path
  completes it (`RESEARCH_EXPORT.RECONCILE`); none, or no planned path, fails it with
  `RESEARCH_EXPORT_INTERRUPTED`, which an operator can retry.

### 4. Retry failures

Route:

- `PATCH /clinics/:clinicId/research/exports/:exportId/retry`

Retry is offered only for a `FAILED` export. It puts the export back to `APPROVED` and queues it
under a new job id (`<exportId>-retry-<timestamp>`). BullMQ keeps a finished job under its id and
ignores an add that reuses one, so re-queueing under the export's own id once left the export
`APPROVED` with nothing queued to run it.

### 5. Download

Route:

- `GET /clinics/:clinicId/research/exports/:exportId/download`

Download output:

- ZIP artifact, named `<runKey>.zip`

### 6. Schedules (#166)

A schedule is a standing approval: weekly (ISO day 1 to 7) or monthly (day 1 to 28), at a local
hour in the clinic's time zone, from a coverage start date, to one destination. A run fired on local
date D covers the coverage start through D-1, the last complete day.

Routes (`clinics/:clinicId/research/schedules`):

| Route                             | Permission | Does                                                  |
| --------------------------------- | ---------- | ----------------------------------------------------- |
| `GET /`                           | REQUEST    | schedules, destinations, time zone, minimum cohort    |
| `POST /`, `PATCH /:id`            | REQUEST    | create, edit (an edit needs approving again)          |
| `POST /:id/approve`               | APPROVE    | activate, with `reviewBy` (default 12, max 24 months) |
| `POST /:id/reject`, `/:id/revoke` | APPROVE    | stop it, with a reason                                |
| `POST /:id/pause`, `/:id/resume`  | REQUEST    | resume is refused past the review date                |
| `POST /:id/run-now`               | REQUEST    | an ad-hoc `-a` run under the standing approval        |

Status: `PENDING_APPROVAL` -> `ACTIVE` <-> `PAUSED`; `EXPIRED` once past review (approve again);
`REVOKED` is final. A clinic that does not require approval per export activates a schedule at once.
One live schedule per destination per clinic. Every change is audited as `RESEARCH_SCHEDULE.*`.

The dispatcher is an hourly maintenance sweep. It reads due schedules under system context, then in
each clinic's own context creates the period's run under its run key (skipping it when the key
exists), queues it, and moves `nextRunAt` on. It never reads patient data. A schedule past its
review date still gets the period's run, which is skipped as `REVIEW_EXPIRED` and emailed, and the
schedule becomes `EXPIRED`.

### 7. Rerun

Route:

- `POST /clinics/:clinicId/research/exports/:exportId/rerun` (APPROVE, body `{ "reason" }`)

For a `COMPLETED` or `SKIPPED` run (and `FAILED`, though the UI offers Retry there). It builds the
same period again from today's consents as the next revision (`-r2`, `-r3`), approved and queued,
with the reason in the `RESEARCH_EXPORT.RERUN` audit entry. The earlier run is kept.

---

## Current Backend Components

### `ResearchExportService`

Owns:

- request validation
- approval flow
- rejection flow
- retry flow
- queue submission
- final state persistence

### `ResearchTransformService`

Owns:

- consent-aware data reads
- CSV generation
- manifest generation
- checksum generation
- ZIP artifact creation

### `DeIdentificationService`

Owns:

- stable key derivation
- birth year reduction
- timestamp rounding
- CSV escaping helpers

### Storage (`research/storage/`)

- `ResearchStorageRegistry`: which providers are configured and which is the default
- `R2ResearchStorage` and `LocalResearchStorage`: the object layout below over an `ObjectStore`
  (S3 API or the filesystem), with write order, verification, `current.json` and the catalog
- `GithubResearchStorage`: the snapshot layout, size guards, `latest.json`, and the manifest mirror

### `ResearchScheduleService` and `ResearchScheduleDispatcher`

Own the schedule state machine and the hourly dispatch.

### `ResearchRunNotifier`

Emails the clinic's directors (`RESEARCH_RUN_ATTENTION_V1`) when a scheduled run is skipped or
fails. The email names the run key and the reason only.

### `ResearchExportProcessor`

Owns:

- queue worker execution

---

## Current Local Artifact Storage

Default path:

```text
./data/research-exports/<exportId>/
```

Stored items:

- generated ZIP artifact
- export-local staging outputs as needed by the pipeline

Retention is env-configurable.

The `data/` directory is ignored by git.

---

## Object Storage Layout (R2 and local)

```text
research/v<datasetVersion>/clinic=<clinicKey>/runs/<runKey>/
  tables/<table>.csv.gz
  changes.json
  SHA256SUMS.txt
  manifest.json            written last; its presence means the run landed
research/v<datasetVersion>/clinic=<clinicKey>/current.json
research/catalog/runs/<runKey>.json
```

Every object is uploaded with a SHA-256 checksum that R2 verifies, then checked by HEAD. Only then
does `current.json` move, and never back to an older run. The catalog holds one small object per
run, readable together with DuckDB (`docs/clinic-ops/28_READING_THE_RESEARCH_DATASET.md`).

`manifest.json` carries the run key, trigger, schedule id, previous run key, HMAC key id, consented
and revoked counts, and `contentSha256`, the hash of the table lines of `SHA256SUMS.txt`, so two
runs over identical data share it. `changes.json` says who joined and left since the previous run.

Retention is an R2 lifecycle rule on the `research/v` prefix (90 days recommended), set in
Cloudflare, so a revoked subject's rows age out. The catalog is kept.

## GitHub Sync Layout

The GitHub adapter writes snapshot folders similar to:

```text
clinics/<research_clinic_key>/exports/<timestamp>__<exportId>/
```

The sync also writes a `latest.json` pointer for the clinic snapshot path.

Important safety rules:

- no HMAC key is ever written
- no reversible identity map is written
- no direct patient identifiers are written

---

## Current Env Variables

Required or important research env values:

- `RESEARCH_HMAC_KEY`
- `RESEARCH_HMAC_KEY_ID`
- `RESEARCH_EXPORT_DIR`
- `RESEARCH_EXPORT_RETENTION_DAYS`
- `RESEARCH_GITHUB_REPO_OWNER`
- `RESEARCH_GITHUB_REPO_NAME`
- `RESEARCH_GITHUB_REPO_BRANCH`
- `RESEARCH_GITHUB_REPO_BASE_PATH`
- `RESEARCH_GITHUB_TOKEN`
- `RESEARCH_GITHUB_MAX_FILE_BYTES`
- `RESEARCH_GITHUB_MAX_TOTAL_BYTES`
- `RESEARCH_STORAGE_PROVIDER` (`r2`, `github` or `local`)
- `RESEARCH_R2_ACCOUNT_ID`, `RESEARCH_R2_BUCKET`, `RESEARCH_R2_ACCESS_KEY_ID`,
  `RESEARCH_R2_SECRET_ACCESS_KEY`, `RESEARCH_R2_JURISDICTION`
- `RESEARCH_LOCAL_STORAGE_DIR`
- `RESEARCH_MIN_SUBJECTS` (default 10)
- `RESEARCH_GITHUB_MIRROR_MANIFESTS` (`true` to mirror manifests to GitHub)

---

## Current UI Flow

Primary route:

- `/research`, for the active clinic. It is in the Oversight nav as "Research exports" and linked
  from clinic settings.
- `/clinics/[clinicId]/research/exports` renders the same page for a clinic named in the URL.

The current page supports:

- readiness: research on or off, consented patients against the minimum cohort, the configured
  storage, the last publish and the next scheduled run, with a warning for each blocker
- a decision queue: runs waiting for approval, failed or skipped runs from the last 30 days that
  were not run again, and schedules waiting for approval, past review, or due for review within
  30 days, with approve, reject, retry and rerun in place
- activity filters by status and trigger, and "Load more" up to 100 runs
- per-run details: rows per table with the change since the previous run, the content and zip
  checksums, the storage reference, and the run's audit steps with any recorded reason
- a note on a completed run whose zip the server no longer holds (Render clears the disk on a
  restart or redeploy); the published copy is unaffected and a rerun builds a fresh zip
- request form with date presets
- de-identification summary
- scheduled exports: create, edit, approve, reject, pause, resume, revoke and Run now
- export list with a copyable run key, trigger, consented and revoked counts, a changes sentence,
  a skip reason and the storage location
- approval, rejection, retry, rerun and download actions

---

## Operational Checklist

Before using research exports in a real environment:

1. enable research for the clinic
2. decide whether approval is required per export
3. set up research storage: R2 (bucket, lifecycle rule, scoped token) or the GitHub env vars
4. set `RESEARCH_HMAC_KEY`
5. keep Redis running
6. verify API worker process is active

---

## Testing Expectations

Current test coverage exists for:

- stable HMAC keys
- timestamp rounding
- CSV generation and escaping
- pack generation
- repo sync service behavior
- request and approval lifecycle
- retry behavior

Manual checks still recommended:

- live GitHub repo sync with real credentials
- artifact size behavior with large exports
- real clinic approval flow in staging

---

## Known Current Limitations

1. R2 and GitHub publishing are tested with mocked clients; the local provider exercises the same
   object layout end to end. A revoked subject leaves R2 by lifecycle expiry, not by rewriting
   older runs.
2. The current UI is a research export console, not a generic dataset builder.
3. Staff appointment triage has backend support but limited dedicated research-adjacent analytics UI beyond the export console itself.

---

## Recommended Future Extensions

When v1 limits are hit, likely next steps are:

1. Parquet tables beside the CSVs
2. add staff-facing export history analytics
3. rewrite older runs on revocation (`deleteSubject`) if lifecycle expiry proves too slow
