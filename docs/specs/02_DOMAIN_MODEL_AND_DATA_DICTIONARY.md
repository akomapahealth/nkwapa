# Domain Model And Data Dictionary

## Purpose

Describe the current Prisma domain model and the main scoping rules that matter for feature work, migrations, and product behavior.

This is a practical schema guide, not a line-by-line schema dump.

---

## Naming And IDs

- Primary keys use UUIDs.
- Human-friendly patient identity uses `patientCode`.
- Legacy patient codes from merged charts are retained through `PatientCodeAlias`.
- The live schema uses Prisma enums for roles, encounter states, portal states, reminders, appointments, and research exports.

---

## Tenancy And Access Models

### Organization

Top-level tenant/reporting boundary.

Key fields:

- `id`
- `name`
- `slug`
- `timezone`

Current use:

- groups clinics across multiple locations
- provides the future boundary for rollup reporting and higher-level admin

### Clinic

Operational and physical location boundary.

Key fields:

- `organizationId`
- `name`
- `region`
- `countryCode`
- `timezone`
- `locationCode`
- `zoneCode`
- `isActive`

Important constraints:

- `(organizationId, locationCode)` is unique
- most app behavior, permissions, and RLS policies operate at clinic scope

### User

Local representation of a Keycloak identity.

Key fields:

- `keycloakSub`
- `displayName`
- `firstName`
- `lastName`
- `email`
- `phoneE164`
- `isActive`

### UserClinicRole

Local authorization mapping.

Key fields:

- `userId`
- `clinicId`
- `role`

Rules:

- `clinicId = null` is reserved for global `SYSTEM_ADMIN`
- all other active product roles are clinic-scoped

---

## Patient Identity Models

### Patient

Canonical chart record.

Key fields:

- `patientCode`
- `primaryClinicId`
- demographics and contact fields
- encrypted and hashed national ID fields
- `portalUserId`
- `mergedIntoPatientId`
- `mergedAt`
- `mergedByUserId`

Important behavior:

- national ID is encrypted and hashed in the app layer
- merged charts point to the canonical chart instead of hard deletion
- patient registry queries exclude merged source charts unless explicitly needed

### PatientCodeAlias

Preserves old patient codes after merges.

Use:

- lets operators resolve historical references to the canonical chart

### PatientAccountLink

Direct patient-to-Keycloak-sub link used by the patient portal.

### PatientPortalInvite

Staff-created invite for patient claim onboarding.

Key fields:

- `patientId`
- `clinicId`
- `status`
- `email`
- `phoneE164`
- `createdByUserId`
- `claimedByUserId`
- `claimedAt`
- `expiresAt`

Use:

- staged patient access before a chart is claimed into a portal account

---

## Clinical Models

### Encounter

Visit-level clinical record.

Key fields:

- `clinicId`
- `patientId`
- `status`
- `createdByUserId`
- `preceptorReviewedById`
- `doctorFinalizedById`

Status flow:

- `DRAFT`
- `IN_REVIEW`
- `FINALIZED`

### Vitals

One-to-one clinical vitals record for an encounter.

### DiabetesScreening

One-to-one diabetes screening record for an encounter.

### HypertensionAssessment

One-to-one hypertension assessment record for an encounter.

### CarePlan

One-to-one care plan record for an encounter, including follow-up date.

### Drug

Clinic-scoped medication catalog.

### Prescription

Encounter-linked prescription written by a clinician.

### MedicalHistoryRecord

Clinic- and patient-scoped stable identity for a longitudinal medical-history item. It points to
the current revision but does not replace prior clinical values.

### MedicalHistoryRevision

Append-only revision containing category-specific structured details, clinical status and dates,
source encounter, author, schema version, and revision number. Revisions represent corrections and
status transitions; clinical history is never deleted to represent resolution.

---

## Operations And Portal Models

### StaffShift

Daily staff check-in / on-duty availability.

### PatientCheckIn

Arrival tracking and waiting/assigned/in-progress state.

### PatientAssignment

Manager-created assignment linking a check-in to a volunteer and doctor.

### PatientMeasurement

Patient- or staff-originated measurements, including home readings.

### PatientSelfReport

Patient-submitted updates such as symptoms or follow-up updates.

### AppointmentRequest

Patient request for a preferred date window.

### Appointment

Clinic-confirmed appointment record.

### Reminder

Queued, sent, delivered, or failed outbound reminder.

---

## Governance And Platform Models

### PatientConsent

Research consent history with witness and snapshot fields.

### ClinicResearchSettings

Clinic-level research policy toggles.

### ResearchExport

Approval-aware, async research export request and artifact metadata.

### AuditEvent

Append-only mutation audit log with request ID, actor, entity, action, and before/after payloads.

### SyncMutation

Outbox/sync conflict tracking for offline-capable flows.

### PatientCodeSequence

Year-based sequence state for generated patient codes.

---

## Current Scoping Rules

1. Most operational and clinical tables are clinic-scoped and protected by Postgres RLS.
2. Patients are still anchored to a `primaryClinicId` even though the overall tenant model now supports organizations with multiple clinics.
3. `SYSTEM_ADMIN` can bypass clinic-scoped restrictions; all other roles depend on clinic membership and permission checks.
4. Patient portal access depends on both local role/identity state and a valid patient link or invite claim.
5. Background jobs and scripts must opt into the same tenant context deliberately if they need the same RLS guarantees as HTTP requests.
6. Medical-history records and revisions are protected by both clinic and patient ownership checks;
   a source encounter must match both.

---

## Scale-Oriented Indexing Themes

The current schema includes indexes intended to keep common high-volume flows fast:

- registry and list screens use compound indexes that support keyset-style pagination
- clinic and org lookup paths are indexed
- search-heavy fields use trigram/text indexes through migrations
- merge, portal invite, reminder, export, audit, and sync tables all have targeted operational indexes
