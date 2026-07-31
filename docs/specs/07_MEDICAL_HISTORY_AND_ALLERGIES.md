# Medical History And Allergies

## Status

Current, behind the medical-history feature flag.

## Clinical Record Model

Medical history is patient-level and clinic-scoped. `MedicalHistoryRecord` is the stable logical
identity, while `MedicalHistoryRevision` is the append-only clinical source of truth. A revision
captures the status, clinical dates, category-specific structured details, notes, source encounter,
author, schema version, and revision number.

Supported categories are:

- condition
- allergy or adverse reaction
- surgery or procedure
- family history
- social history

Supported statuses are active, resolved, inactive, historical, and entered-in-error.
Entered-in-error is terminal. There is no deletion endpoint: corrections create revisions so prior
values remain recoverable.

An empty history is returned as `EMPTY`; it is not interpreted as a clinical claim. Allergy state is
reported independently as active allergies, no known allergies, historical only, or not recorded.
No-known-allergies is an intentional allergy record, not the absence of records.

## API Contract

All routes are clinic and patient scoped:

- `GET /clinics/:clinicId/patients/:patientId/medical-history`
- `POST /clinics/:clinicId/patients/:patientId/medical-history`
- `POST /clinics/:clinicId/patients/:patientId/medical-history/:recordId/revisions`
- `GET /clinics/:clinicId/patients/:patientId/medical-history/:recordId/revisions`
- `GET /clinics/:clinicId/patients/:patientId/allergy-summary`

Revision writes require `expectedCurrentRevisionId`. A mismatch returns a structured conflict with
the latest revision instead of overwriting another clinician's work. Source encounters must belong
to the same clinic and patient.

Active allergy records prevent recording no-known-allergies. Adding an active allergy
transactionally retires a current no-known-allergies record. Both the immutable revisions and the
generic audit log identify the acting user.

## Access Policy

`SYSTEM_ADMIN`, `DIRECTOR`, `MANAGER`, `DOCTOR`, and `VOLUNTEER` may read within their existing
clinic scope. `DOCTOR` and `VOLUNTEER` may write; system administrators retain wildcard authority.
Patient portal reads and patient-authored submissions are not part of this version.

The API flag is authoritative and fails closed with `404` before feature business logic:

```dotenv
FEATURE_MEDICAL_HISTORY_ENABLED=false
NEXT_PUBLIC_FEATURE_MEDICAL_HISTORY_ENABLED=false
```

Enable and validate the API first. Then rebuild the web application with its public flag enabled.
For rollback, hide and redeploy the web application first, then disable the API.

## Offline And Conflict Behavior

Dexie stores medical-history records and revisions. Pull synchronization includes both entities.
Push synchronization accepts only create or revise mutations with client-generated record and
revision IDs. `SyncMutation` provides replay idempotency.

Stale-revision and no-known-allergies conflicts remain in the outbox for visible recovery. The
client never deletes or silently replaces server history. The highest-risk boundary is concurrent
offline replay, so conflict resolution must always start from the server's latest revision.

## Patient Chart And Prescription Safety

Both staff patient-chart routes use the same permission-aware Medical History panel. Current active
items appear first; resolved, inactive, and historical items remain filterable and reverse
chronological. Status meaning uses text and icons as well as color. Forms, errors, offline state,
conflicts, and revision history remain keyboard accessible and responsive.

Encounter prescription panels share the allergy summary. Submission requires an explicit
acknowledgement when active allergies exist or allergy status has not been recorded. The application
does not infer drug interactions or diagnoses.

## Release Gate

Before enabling the feature in a clinical environment:

1. Apply and validate the Prisma migration, foreign keys, constraints, indexes, and RLS policies.
2. Verify category validation, status transitions, stale writes, no-known-allergies transitions,
   audit entries, RBAC, and cross-clinic rejection.
3. Verify offline create/revise replay, mutation idempotency, and visible conflict retention.
4. Verify research export v2 compatibility, de-identification, hashes, row counts, and ZIP contents.
5. Exercise active, empty, historical, validation-error, offline, conflict, and prescription
   acknowledgement states.
6. Validate keyboard navigation, focus visibility, reduced motion, and layouts at 375, 768, 1024,
   and 1440 pixels.
7. Run formatting, lint, typecheck, unit tests with coverage, security checks, production builds,
   and Docker-backed Playwright tests.

This feature integrates with the role-aware patient chart tracked by issue #69 and must be included
in the clinical-records release gate tracked by issue #68.
