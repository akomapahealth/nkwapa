# HAP Clinical Notes, Cosign, and Addenda

## Status and scope

Current, behind disabled-by-default API and web feature flags. V1 provides one canonical History,
Assessment, and Plan (HAP) note per encounter. Clinical note content is server-only and is never
stored in Dexie, synchronized through the outbox, included in patient portal or research contracts,
or copied into notifications, logs, dashboard payloads, or audit metadata.

## Record and lifecycle

`ClinicalNote` keeps editable draft HAP sections separate from the immutable signed snapshot. It
also stores author role, submitter and cosigner provenance, encounter-assignment reference, assigned
staff identifiers and display-name snapshots, lifecycle timestamps, optimistic version, and a
SHA-256 hash of the signed content.

The allowed transitions are:

```text
Volunteer: DRAFT -> PENDING_COSIGN -> COSIGNED -> AMENDED
Doctor:    DRAFT --------------------> COSIGNED -> AMENDED
```

- Draft changes require the author and an exact `expectedVersion`.
- Volunteer submission re-resolves the active encounter assignment. The author must be the assigned
  volunteer and the assigned doctor is snapshotted as the only permitted cosigner.
- Doctor-authored notes are signed by their author through the submit action.
- Safe retries of an already completed submission or cosign return the current note without a
  duplicate audit event. Other invalid transitions return a structured conflict.
- The first addendum changes `COSIGNED` to `AMENDED`; subsequent addenda keep that status.
- There is no note or addendum delete API.

PostgreSQL constraints and triggers independently enforce encounter, patient, clinic, assignment,
state, and section validity. Submitted bodies and signed snapshots cannot be rewritten, signed notes
cannot be deleted, addenda cannot be updated or deleted, and an addendum's clinic must match its
parent note.

## Access policy

- An active clinic `DOCTOR` or `VOLUNTEER` role is required to read note content.
- Only the draft author may edit it.
- Only the snapshotted assigned doctor may cosign a volunteer note.
- Only an active clinic doctor may append an addendum.
- Managers and directors receive only the clinic aggregate pending count.
- Doctors receive their assigned pending count; volunteers receive their own draft and pending
  counts.
- `SYSTEM_ADMIN` wildcard permissions do not grant clinical-note content access. A system
  administrator must separately hold an active doctor or volunteer role in the selected clinic.

RLS repeats the active-clinical-role boundary at the database layer. Clinical-note responses use
`Cache-Control: private, no-store`, and audit events contain identifiers and transition metadata,
never HAP or addendum text.

## Online-only UX

All note reads and writes are online-only in v1. When connectivity is lost, the UI removes any
rendered note content and replaces the editor or signed view with a connection-required notice. It
does not read from or write to IndexedDB. Submission, signing, cosigning, and addenda use explicit
irreversible-action confirmation.

The encounter screen provides a labeled three-section editor, dirty-state warning, `Ctrl+S` or
`Command+S` draft save, section limits, assignment context, immutable signed view, provenance
timeline, and addenda. Doctors also have an assigned Pending HAP Cosign queue; doctors and volunteers
have a patient-chart Clinical Notes tab.

## Feature flags and rollout

```dotenv
FEATURE_CLINICAL_NOTES_ENABLED=false
NEXT_PUBLIC_FEATURE_CLINICAL_NOTES_ENABLED=false
```

Before clinical enablement:

1. Deploy both clinical-note migrations and verify the scope, state, immutability, deletion, and
   append-only integration tests against PostgreSQL.
2. Verify active-role authorization for every role, cross-clinic rejection, author ownership,
   assignment snapshots, idempotent retries, and metadata-only audit events.
3. Confirm clinical-note fields remain absent from sync, portal, research, notification, and
   dashboard-content contracts.
4. Enable the API flag and run the lifecycle tests against the target environment.
5. Enable the web flag, rebuild the web app, and validate keyboard/focus behavior, offline content
   removal, and layouts at 375, 768, 1024, and 1440 pixels.
6. Record the evidence in the clinical-records release gate tracked by issue #68.

Rollback hides and redeploys the web surface first, then disables the API after active clients no
longer expose it. Disabling flags does not remove or alter existing records.

## Known v1 limitation

Pending notes cannot be reassigned or taken over. If the snapshotted doctor becomes unavailable, the
note remains pending until that doctor can cosign. A future audited reassignment policy must preserve
the original assignment snapshot and must not mutate submitted content.

## Release-gate evidence

Issue #68 evidence for this change consists of the clinical-note migration integration suite,
service lifecycle and role matrix tests, feature-flag and dashboard tests, web contract tests,
Docker-backed Playwright lifecycle/offline/responsive coverage, workspace format/lint/typecheck/test
and production builds, secret scan, and dependency audit. Exact command results belong in the pull
request and issue #68 verification record.
