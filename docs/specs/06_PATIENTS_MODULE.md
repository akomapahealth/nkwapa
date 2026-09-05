# Patients Module

## Status

Current with follow-on work.

The patient module now covers registry, detail, longitudinal medical history, allergy safety,
medication reconciliation and pharmacy history, portal access linking, patient claim onboarding
support, and duplicate-chart merge handling.

---

## Core Endpoints

### Registry and search

- `GET /clinics/:clinicId/patients`
- `GET /clinics/:clinicId/patients/search`
- `GET /patients/:patientId`

Registry reads support the older `page` and `pageSize` contract and the newer `cursor` and `limit` options for higher-volume screens.

### Create and update

- `POST /clinics/:clinicId/patients`
- `PATCH /clinics/:clinicId/patients/:patientId`

### Portal identity linking

- `POST /clinics/:clinicId/patients/:patientId/portal-link`
- `GET /clinics/:clinicId/patients/:patientId/portal-link-candidates`
- `POST /clinics/:clinicId/patients/:patientId/portal-invite`
- `POST /clinics/:clinicId/patients/:patientId/portal-invite/:inviteId/resend`
- `DELETE /clinics/:clinicId/patients/:patientId/portal-invite/:inviteId`

Creating an invite supersedes any invite already waiting on that chart. The body takes an
optional `ttlDays` (7, 14, or 30) or an exact `expiresAt`; with neither, the invite takes
the deployment default from `PORTAL_INVITE_TTL_DAYS`, which is 14 days. There is no way to
create an invite with no expiry.

### Duplicate resolution

- `POST /admin/patients/merge`

### Patient chart (longitudinal)

- `GET /clinics/:clinicId/patients/:patientId/chart/summary`
- `GET /clinics/:clinicId/patients/:patientId/chart/vitals`
- `GET /clinics/:clinicId/patients/:patientId/chart/visits`

Chart reads are cursor-paginated (default 25, maximum 100) and ordered by
`[createdAt desc, id desc]`. The summary returns the sections the caller may open plus one
block per section; a block the caller may not read is omitted from the payload entirely
rather than blanked, so clinical note content never reaches a role without
`CLINICAL_NOTE.READ`.

### Medical history and allergies

- `GET /clinics/:clinicId/patients/:patientId/medical-history`
- `POST /clinics/:clinicId/patients/:patientId/medical-history`
- `POST /clinics/:clinicId/patients/:patientId/medical-history/:recordId/revisions`
- `GET /clinics/:clinicId/patients/:patientId/medical-history/:recordId/revisions`
- `GET /clinics/:clinicId/patients/:patientId/allergy-summary`

### Medication reconciliation and pharmacies

- `GET /clinics/:clinicId/patients/:patientId/medication-reconciliation`
- `POST /clinics/:clinicId/patients/:patientId/medication-reconciliation/medications`
- `POST /clinics/:clinicId/patients/:patientId/medication-reconciliation/reconciliations`
- medication and pharmacy revision-history subroutes
- pharmacy preference set/end subroutes
- permission-gated read-only prescription-history subroute

---

## Current Behaviors

### Patient creation

- generates a unique `patientCode`
- normalizes user-entered contact fields
- encrypts national ID
- stores a hash and last-four fragment for dedupe and safe display

### Patient detail

- supports canonical chart reads after merge
- exposes recent encounter and portal-related data paths

### Registry listing

- supports search by patient code, name, phone, and related human-facing terms
- excludes merged source charts from normal operator browsing
- benefits from keyset-friendly and search-oriented indexes

### Portal access

- staff can directly link an existing local user
- staff can create a portal invite, resend its email, cancel it, or replace it
- every invite has an expiry, and an expired invite cannot be claimed, cannot put its
  holder into claim onboarding, and grants no clinic scope
- the chart carries the live invite plus recently settled ones, so a cancelled or expired
  invitation is visible rather than absent
- create, resend, cancel, claim, and expiry are all written to the audit trail
- patients can later claim the record through the claim flow, which still matches the
  staged email or phone, the patient code, and the date of birth

### Merge

- system admin can merge duplicate charts inside the same clinic
- the source chart points to the canonical chart instead of being deleted
- the legacy patient code is stored as an alias for later lookup

A read-only preview answers what the merge would do before anyone commits to it, at
`GET /clinics/:clinicId/patients/:patientId/merge-preview`, with an all-clinics twin at
`GET /admin/patients/merge/preview`. It reports both charts field by field, how many records of
each kind move and how many the surviving chart already holds, what happens to the app account and
any unclaimed invitation, which codes will still find the record afterwards, and everything that
would stop or complicate the merge. It stores nothing and is recomputed on every call.

Findings come in two severities, defined once in `packages/db/src/patient-merge.ts` and consumed by
the API that raises them and the screen that renders them:

- **blocked**: the same chart on both sides, a chart that has already been merged, two clinics, a
  deactivated clinic, a chart code already recorded against a third record, both charts holding an
  open preferred pharmacy, and two different app accounts with no choice made between them
- **warned**: an app account that loses access, an invitation that gets cancelled, two charts that
  do not look much alike, a duplicate holding more history than the chart being kept, and a pair
  someone has already ruled out in the review queue

Every finding carries plain-language wording and a next step, so a refusal can be acted on without
support. A refused merge returns the same list under `details.blockers` with the code
`PATIENT_MERGE_BLOCKED`.

The merge moves every relation listed in `MERGE_RELATIONS`, and a test parses `schema.prisma` and
fails if a model gains a `patientId` without either joining that list or being written into
`MERGE_SPECIAL_CASE_MODELS` with a reason. Charts previously merged into the duplicate follow it,
so no alias chain terminates at a retired record.

The preview returns a fingerprint of the state it described. The merge accepts it and refuses a
stale one with `PATIENT_MERGE_PREVIEW_STALE`, so an operator cannot commit against a panel that a
concurrent edit has made untrue. The guards re-run inside the transaction as well.

Every executed merge writes a `PatientMergeRecord` alongside its audit event, carrying the codes
involved, the strategies chosen, and how many rows of each kind moved -- so a consolidated chart
can be explained afterwards without database access.

### Longitudinal history

- keeps stable records with append-only, auditable revisions
- distinguishes active, resolved, inactive, historical, and entered-in-error states
- explicitly distinguishes no-known-allergies from allergy status not recorded
- is hidden and rejected while the medical-history feature flag is disabled

### Medication and pharmacy history

- separates patient-reported medications from encounter prescriptions
- keeps immutable medication and pharmacy revisions with visible authorship and source visits
- distinguishes an empty record from an explicit no-known-current-medications attestation
- enforces one open preferred-pharmacy period while retaining prior periods
- supports idempotent offline replay and visible optimistic-concurrency conflicts

---

## Patient Chart Information Architecture

The chart presents current summaries before chronological history, across role-aware tabs:
Overview, Vitals, Medications, Diabetes, Medical History, Notes, Visits, Patient-reported,
and Consent.

- section definitions, required permissions, and feature flags live in
  `packages/db/src/patient-chart-sections.ts`, which the API and the web app both import so
  the rendered tab list and the enforced access policy cannot drift
- the active section is held in `?tab=`, so a section is linkable, bookmarkable, and
  restored on reload; unknown or unauthorised values fall back to the first accessible
  section and the URL is normalised to match
- a section's data is fetched only once that section has been opened
- every chronological record carries recorded time, author, clinic, source-encounter link,
  and whether it is locked by a finalized encounter

## UI Surfaces

- `/patients`
- `/patients/new`
- `/patients/[patientId]` redirects to the clinic-scoped chart, preserving `?tab=`
- `/clinics/[clinicId]/patients/[patientId]` is the canonical chart
- `/claim-record` for patient onboarding when a pending invite exists

---

## Current Gaps

- no full cross-clinic patient consolidation workflow yet; the preview reports a cross-clinic
  pair as blocked and points at the review queue instead
- portal invites reach patients by email only; SMS delivery of an invitation is not wired,
  so a phone-only invite is passed on by hand from the copyable instructions on the chart
