# Medication Reconciliation And Pharmacy History

## Status

Current, behind the medication-reconciliation API and web feature flags.

## Clinical Record Contract

Patient-reported medications are patient-level clinical history, not encounter prescriptions.
`PatientMedicationRecord` provides stable identity and points to the latest immutable
`PatientMedicationRevision`. Revisions retain medication details, optional same-clinic Drug links,
status, source, author, source encounter, and reconciliation metadata. External medications require
a name but never create a Drug catalog entry.

Whole-list reconciliation compares the exact current record/revision set. A stale or incomplete set
returns a structured conflict. Successful review creates new revisions for every current medication
and one `MedicationReconciliationEvent`. `NO_KNOWN_CURRENT_MEDICATIONS` is an explicit attestation;
an empty chart remains `NOT_RECORDED` until an authorized writer records that outcome.

Pharmacy details use stable records and immutable revisions. Preference periods are append-only.
Changing preference closes the prior period and creates a new one transactionally. PostgreSQL
enforces one open preference per clinic and patient with a partial unique index.

## Access And API

`SYSTEM_ADMIN`, `DIRECTOR`, `MANAGER`, `DOCTOR`, and `VOLUNTEER` may read within clinic scope.
Doctors and volunteers receive `MEDICATION_RECONCILIATION.WRITE`. Patient portal users receive no
v1 access. Linked prescriptions require `PRESCRIPTION.READ`, and every prescription mutation
continues to require `PRESCRIPTION.WRITE`.

Routes are scoped under:

```text
/clinics/:clinicId/patients/:patientId/medication-reconciliation
```

Subroutes create and revise medications/pharmacies, read revision history, reconcile the current
list, set or end pharmacy preference, and read permission-gated prescription context. There are no
delete, prescribing, dispensing, refill, insurance, or e-prescribing endpoints in this module.

## Offline And Conflict Behavior

Dexie stores medication records/revisions, reconciliation events, pharmacy records/revisions, and
preference periods. Outbox entity types remain distinct from prescriptions. Client-generated IDs
make successful replay idempotent. Stale revisions and competing pharmacy preferences remain in the
outbox with server conflict context until staff deliberately recover them.

## UI And Clinical States

The role-aware patient chart Medication tab shows allergy status, current medications, past/stopped
history, pharmacy preference/history, and read-only prescription context. It visibly distinguishes:

- no medication information recorded;
- explicit no known current medications;
- current medications;
- no current medication with historical entries;
- validation, offline, conflict, loading, and permission-restricted states.

The UI uses text and icons in addition to color, keyboard-visible focus, 44-pixel actions, responsive
dialogs, and a horizontally scrollable chart tab list at narrow widths.

## Rollout And Release Gate

```dotenv
FEATURE_MEDICATION_RECONCILIATION_ENABLED=false
NEXT_PUBLIC_FEATURE_MEDICATION_RECONCILIATION_ENABLED=false
```

Apply and verify the migration and API first, then rebuild the web app with its public flag enabled.
Rollback hides the web surface before disabling the API. Before clinical enablement, verify RLS,
clinic isolation, revision conflicts, preferred-pharmacy uniqueness, offline idempotency, permission
separation, explicit empty states, responsive layouts, security checks, builds, and Docker-backed
Playwright coverage. Include these results in clinical-records release gate issue #68.
