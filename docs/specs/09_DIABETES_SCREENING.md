# Dedicated Longitudinal Diabetes Screening

## Scope

Diabetes screening is a staff clinical workflow in encounter and patient-chart surfaces. It does
not infer a diagnosis, change clinical thresholds, or expand patient-portal access or contribution.

## Clinical record

Each source encounter has at most one stable diabetes screening record containing:

- glucose in mg/dL and an explicit `FASTING`, `RANDOM`, or `UNKNOWN` context;
- HbA1c percentage;
- structured Polyuria, Polydipsia, Weight loss, Blurred vision, and Fatigue symptoms;
- multiline clinical notes and sample collection time;
- author, source encounter, encounter status, and legacy-migration warning provenance.

`UNKNOWN` remains a distinct context. Dashboard flags retain the approved fasting `>=126 mg/dL`
and random `>=200 mg/dL` thresholds and never classify unknown-context measurements.

## Compatibility and migration

The migration backfills collection time from record creation and author from the source encounter
creator. Recognized legacy `symptomsJson` values populate the structured symptom array. Raw legacy
content remains preserved; malformed or unmapped content sets a staff-visible warning.

New REST and sync writes use `symptoms`. Legacy sync clients may send `symptomsJson`, but a payload
containing both contracts is rejected as ambiguous. Sync pull derives the deprecated JSON form for
older deployed clients. Stable screening IDs, explicit null field clearing, and idempotency are
preserved across online and offline writes.

## Access and lifecycle

- Staff reads require `SCREENING.READ` and clinic-scoped access.
- Writes require `SCREENING.WRITE`, matching clinic and patient scope, and a non-finalized source
  encounter.
- Finalized records remain visible in read-only encounter tabs and patient history.
- Every mutation records the current actor and an audit event.

## Downstream behavior

Glucose trends and research `recorded_at` use collection time. Research columns,
de-identification, source encounter keys, patient self-reports, and patient-portal routes remain
compatible. Patient-chart history is newest-first and links every staff screening to its visit.

## Release verification

The release gate covers migration compatibility, DTO and service validation, RBAC and clinic
isolation, finalized-record enforcement, sync replay and conflicts, dashboard thresholds, trends,
research exports, Dexie migration, accessible labels, keyboard navigation, offline round-trips,
longitudinal history, and responsive widths at 375, 768, 1024, and 1440 pixels.
