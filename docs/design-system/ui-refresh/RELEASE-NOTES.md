# UI refresh release notes

Branch: `ui-refresh/r1-1-tokens`. Base: `release/dev`. This is a local review
candidate, not a deployment. See [the final review](R8.8-R8.9-REVIEW.md) for measured
results and release limitations; older phase reviews describe their own builds.

## Shared experience

A consistent clinical workspace now uses shared color, typography, spacing,
status labels and ruled records. Desktop navigation, the tablet rail, phone bottom
navigation and More sheet adapt to available space. Forms retain labelled inputs,
visible focus, keyboard controls, validation and save feedback. Settings use one
readable column with links to existing notification controls, installation state
and clinic facts. Light/dark, reduced motion, offline and recovery states have
phase-specific coverage documented in the review series.

## Volunteers

The home screen leads with the volunteer's shift and real work. Stations show the
next patient, saved measurements, handoff notes and counselling. Sectioned HTN/DM
interviews and clinical forms have clearer navigation and save states. A volunteer
at the review station can submit a HAP note without selecting a doctor; a clinic
doctor can cosign it. The volunteer's identity and the actual cosigner remain
recorded. Clinician planning remains available to authorized volunteers.

## Doctors

Assigned work and clinical queues lead to a consistent encounter workspace with
station results, vitals, HTN/DM screening, clinician plans and note review. Pending
station notes now expose the cosign action even when no doctor was assigned.
Named doctor assignments retain their restriction. Confirmation dialogs protect
signing and finalization. Patient note lists show short assessment/history previews,
while signed content and addenda preserve their existing rules.

## Managers and clinic staff

Clinic operations, patient registration and registry, appointments, shift/station
staffing and roster screens use the shared workspace patterns. Operational charts
and patient lanes retain their real counts, waits and source data. Settings expose
clinic facts and research policy dependencies; permitted editors use the existing
administration entry points. Sync recovery distinguishes waiting, blocked and
retryable changes.

## Directors

Oversight homes, metrics, audit and research interfaces use a consistent information
hierarchy, filters and compact rows. Navigation tests distinguish authorized views
from intentional denial pages. The organization report remains unavailable to the
seeded clinic-only director account; this refresh does not grant new permissions.

## Patients

The portal has an adapted header and bottom navigation, clearer home/health,
appointment and self-report screens, and readable empty/recovery states. Long
appointment headings wrap on narrow enlarged-text layouts. Account and settings
retain their existing identity and notification flows.

## Administrators and public visitors

Administration, authentication, onboarding and public pages share the refreshed
visual language, focus/error states and generated social preview cards. The inbox
notification migration supports the notification experience. The staging Keycloak
memory configuration is a documented proposal only; it has not been deployed or
measured.

## Data and compatibility

Clinical-note summaries add a bounded preview using existing read permissions and
no offline note cache. Screening sync payloads carry optional `baseUpdatedAt`;
stale saves still apply and generate an overwrite audit/notification when another
clinician's saved fields are replaced. Older APIs that reject this metadata are
retried without it while retaining the mutation identity and clinical values.
There is no new blocking screening conflict dialog.

Two migrations belong to this branch relative to `release/dev`: inbox
notifications and the station-note submission guard. Deploy them through the
normal migration process before serving the corresponding workflows. Exact names,
reasons and rollout cautions are in [the PR draft](PR-DRAFT.md).
