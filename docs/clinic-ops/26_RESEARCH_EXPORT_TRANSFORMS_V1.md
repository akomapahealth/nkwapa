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
- downloaded as local ZIP artifacts
- synced into a private GitHub data repository

---

## Current Gate Checks

An export can only proceed when these conditions are satisfied:

1. clinic research is enabled
2. the export requester has `RESEARCH.EXPORT.REQUEST`
3. if the clinic requires approval, a user with `RESEARCH.EXPORT.APPROVE` approves it
4. patients included in the export have effective research consent at execution time

---

## Current v1 Design Choices

### Destination

The v1 sync target is one private GitHub repository.

### Artifact model

- local ZIP artifact for download and short-term storage
- GitHub repo snapshot for canonical de-identified history

### De-identification model

- stable clinic-scoped HMAC keys
- 15-minute timestamp rounding
- no direct identifiers
- no free-text fields in exported research tables

---

## Fixed Pack Contract

Every completed v2 export pack preserves all v1 files and columns:

- `manifest.json`
- `SHA256SUMS.txt`
- `research_subjects.csv`
- `research_ops_checkins.csv`
- `research_ops_assignments.csv`
- `research_clinical_vitals.csv`
- `research_clinical_screenings.csv`
- `research_measurements.csv`
- `research_appointments.csv`
- `research_revocations.csv`
- `research_medical_history.csv`

The contract is versioned as:

- `policyVersion = research-export-v1`
- `datasetVersion = 2`

The version increment adds only `research_medical_history.csv`; existing filenames and columns
remain backward compatible. Any future schema change to the pack should increment the dataset
version.

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

### 4. Retry failures

Route:

- `PATCH /clinics/:clinicId/research/exports/:exportId/retry`

### 5. Download

Route:

- `GET /clinics/:clinicId/research/exports/:exportId/download`

Download output:

- ZIP artifact

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

### `ResearchRepoSyncService`

Owns:

- GitHub repo snapshot sync
- file size guard checks
- latest pointer write
- commit metadata return

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

## Current GitHub Sync Layout

The v1 repo adapter writes snapshot folders similar to:

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

---

## Current UI Flow

Primary route:

- `/clinics/[clinicId]/research/exports`

The current page supports:

- request form with date presets
- de-identification summary
- destination summary
- export list
- approval and rejection actions
- retry action
- download action
- row counts and repo metadata display

---

## Operational Checklist

Before using research exports in a real environment:

1. enable research for the clinic
2. decide whether approval is required per export
3. set all research GitHub env vars
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

1. GitHub sync was implemented and tested with mocks in the codebase, not with live credentials in this workspace session.
2. The current UI is a research export console, not a generic dataset builder.
3. Staff appointment triage has backend support but limited dedicated research-adjacent analytics UI beyond the export console itself.

---

## Recommended Future Extensions

When v1 limits are hit, likely next steps are:

1. add alternative object storage adapter while keeping the same pack contract
2. add staff-facing export history analytics
3. add scheduled exports if governance allows
4. add richer manifest lineage metadata
