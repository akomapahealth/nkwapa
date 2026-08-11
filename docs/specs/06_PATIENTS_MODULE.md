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
- `DELETE /clinics/:clinicId/patients/:patientId/portal-invite/:inviteId`

### Duplicate resolution

- `POST /admin/patients/merge`

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
- staff can create a pending portal invite
- patients can later claim the record through the claim flow

### Merge

- system admin can merge duplicate charts inside the same clinic
- the source chart points to the canonical chart instead of being deleted
- the legacy patient code is stored as an alias for later lookup

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

## UI Surfaces

- `/patients`
- `/patients/new`
- `/patients/[patientId]`
- `/clinics/[clinicId]/patients/[patientId]`
- `/claim-record` for patient onboarding when a pending invite exists

---

## Current Gaps

- no dedicated duplicate review queue yet
- no full cross-clinic patient consolidation workflow yet
- portal invite delivery automation is still lighter than the rest of the access model
