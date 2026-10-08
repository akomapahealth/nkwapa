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
- is the boundary for rollup reporting (`GET /organizations/:id/report`, #13) and cohort
  analytics (`GET /organizations/:id/analytics`, #25), and the future boundary for higher-level
  admin

#### Organization analytics (#25)

Cohort analytics read one organization's clinics through a set of optional filters. Both
endpoints need `ORGANIZATION.REPORT.READ`, and the service also checks for the global
`SYSTEM_ADMIN` seat. A clinic-scoped role is refused, a director included, even for its own
organization.

How the cohort is built:

- **Encounter cohort.** Encounters at the organization's clinics whose `createdAt` falls in
  `[from, to]`.
  - The dates are calendar days in `Organization.timezone`, and both ends are included.
  - The default is the last 30 days. The longest range allowed is 366 days.
  - The cohort can be narrowed by `clinicId`, `zoneCode`, `encounterStatus` and `workflow`.
- **Condition workflow.** An encounter is in a workflow when it has that 1:1 child record:
  - `HYPERTENSION`: `HypertensionAssessment`
  - `DIABETES`: `DiabetesScreening`
  - `EYE`: `EyeScreening`
  - `COUNSELLING`: `CounsellingRecord`

  One encounter can be in several workflows.

- **Appointments.** Appointments whose `startsAt` falls in the same range, at the same clinics,
  narrowed by `appointmentStatus`. `workflow` and `encounterStatus` do not apply to
  appointments. The response's `appliesTo` field says which filters affected which section.
- **Patients.** The number of distinct patients with an encounter in the cohort.
  - The organization total is its own count. It is not the sum of the clinic rows, because a
    patient seen at two clinics is one patient to the organization.
- **Clinic filter.** A `clinicId` from another organization is refused with a 400. It is not
  treated as an empty cohort.

The response is aggregate counts only. It contains no patient identifiers and no row-level data,
so it sits apart from research exports and their de-identification rules.

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

Validation rules (one shared implementation in `packages/db/src/clinic-metadata.ts`, read by the
API's DTO validators, the admin UI, the seed, and `npm run db:audit-clinics`):

- `locationCode` is required, lowercase letters/digits/single hyphens, at most 64 characters
- `timezone` must be a named IANA zone; a fixed offset is refused because it has no DST rules
- `zoneCode` is optional, and shape-checked like a location code when present. It groups clinics
  for reporting and filtering, and is never a permission scope: two clinics in different
  organizations may share a zone code, and neither gains access to the other.
- `countryCode` is ISO-3166 alpha-2, stored uppercase
- a duplicate `locationCode` within an organization is a 409, not a constraint error

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

### Duplicates across clinics

A chart belongs to exactly one clinic through `primaryClinicId`, so two charts for the same person
registered at two clinics are two records with no link between them. The duplicate rules in
`packages/db/src/patient-duplicates.ts` match them like any other pair; what differs is what can be
done about it.

Investigation (`GET /admin/patients/duplicates/cross-clinic`, `/admin/duplicates/cross-clinic`):

- considers only pairs whose two charts sit in different clinics, and only **active** clinics; an
  inactive clinic's charts are not part of the burden anyone could act on
- filters to cross-clinic pairs inside the blocking scan, before its 500-pair ceiling, so a busy
  clinic's same-clinic pairs cannot crowd them out; `truncated` still says when the result is a
  lower bound
- reports the burden per clinic pair (total, by confidence, by review decision, and whether the two
  clinics share an organization), per match rule, and the clinics and organizations affected; the
  burden always covers the whole scan, whatever filter narrows the list
- writes nothing to a chart; a decision about a pair is recorded through the review queue as a
  `PatientDuplicateReview` with a null `clinicId`

Current merge limitation. `PatientMergeService` refuses every cross-clinic pair (`CROSS_CLINIC`),
and the duplicate queue reports the same refusal per pair as `mergeBlockers`, from the shared
`structuralMergeFindings` rule. The refusal is structural rather than a missing button:

- `PatientMergeRecord.clinicId` is non-null and its row-level-security policy is clinic-scoped, so
  a merge must belong to one clinic
- every relation the merge repoints (visits, notes, prescriptions, consent, appointments) carries
  clinic-scoped meaning, and two clinics may hold conflicting consent for the same person
- nothing yet decides which clinic owns the surviving chart, or how the losing clinic's staff keep
  access to the history they recorded

Building consolidation therefore needs a policy decision first (ownership, consent and access),
then a migration of the merge record's scope. The investigation exists to size that decision.

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

Lifecycle:

- `PENDING` while claimable; `CLAIMED`, `CANCELLED`, or `EXPIRED` once settled
- `expiresAt` is always set on creation, and an invite at or past it is treated as expired
  wherever it is used, whether or not the hourly sweep has settled the row yet
- creating an invite cancels any other pending invite on the same chart, and so does a
  successful claim

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
- `preceptorReviewedById` (legacy name: the doctor who reviewed the encounter; the PRECEPTOR role
  was retired in `20260520000000_remove_preceptor_role`)
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
