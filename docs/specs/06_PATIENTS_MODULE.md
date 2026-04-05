# Patients Module

## Status

Current with follow-on work.

The patient module now covers registry, detail, update, portal access linking, patient claim onboarding support, and duplicate-chart merge handling.

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
