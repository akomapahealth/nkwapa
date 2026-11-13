# Refresh the clinical workspace and complete the R8 review

Draft only. Target `release/dev` from `ui-refresh/r1-1-tokens`. Local commits only;
no PR was created, no branch was pushed, and no service was deployed.

## Result

Unifies tokens, controls, adaptive shells, role homes, clinical workspaces,
patient records and portal/public/admin screens. Role-specific changes are in
[RELEASE-NOTES.md](RELEASE-NOTES.md). Keeps clinical permissions, signed-note
immutability, offline queue identity and save validation. Adds permanent route,
visual and keyboard audit coverage, plus reproducible build-size and browser
performance measurements. Final evidence and unresolved checks are in
[R8.8-R8.9-REVIEW.md](R8.8-R8.9-REVIEW.md).

A review-station volunteer submits a note without a named doctor. Previously the
API permitted clinic doctors to cosign it but the UI hid the action. The final
product fix exposes that action for unassigned pending notes and keeps assigned
notes restricted to their doctor. The browser journey also covers clinician plan
entry and encounter finalization; see the review for its actual result.

## Every migration on this branch

Inventory: `git diff --name-status release/dev...HEAD -- packages/db/prisma/migrations`.
These are the only migration additions relative to the documented base; no
historical base migrations are included in this list.

| Migration                                  | One-line reason                                                                                                                                             |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261113090000_inbox_notifications`       | Adds the scoped inbox notification model, indexes, RLS and privileges needed for durable in-app notices.                                                    |
| `20261113190000_station_note_cosign_guard` | Permits a review-station volunteer's pending note without a manager-assigned doctor while enforcing real review ownership and signature/content invariants. |

Run the normal migration deployment before the new workflow is enabled; retain
migration order and deploy the existing files unchanged. The station guard was
already applied to the isolated local audit database in R8.6/R8.7. This pass does
not edit that migration or deploy anything. Review the SQL and database role grants
in the destination environment. Reverting web code does not reverse schema or
notification data; follow the normal database rollback policy.

## Polish 2 API and compatibility changes

| Change                       | Contract and one-line reason                                                                                                                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Clinical note previews       | `GET /clinics/:clinicId/patients/:patientId/clinical-notes` adds `preview`: whitespace-collapsed assessment, falling back to history, bounded near 160 characters at a word boundary; helps readers choose a note without fetching each full note.                                         |
| Preview boundaries           | Existing clinical-role, patient-scope and RLS checks apply; full history/assessment and addenda are excluded from summaries and previews are not cached offline, to preserve note-read and offline privacy boundaries.                                                                     |
| Screening overwrite warnings | HTN, DM and vitals outbox payloads accept optional `baseUpdatedAt`; stale replays apply, but replacing another clinician's relevant newer save records `CONFLICT_OVERWRITTEN`, emits an inbox notice and increments conflict telemetry, to expose overwrites without blocking queued care. |
| Old-API resend               | When an older strict API rejects `baseUpdatedAt`, retry once without that metadata while preserving mutation identity and clinical values, so queued corrections can drain against the old server.                                                                                         |
| Scope decision               | No blocking REST 409 dialog, InterviewFlow conflict-dialog hook or two-context dialog test was built because these forms save through outbox/sync online and offline.                                                                                                                      |

No screening version-column migration was added. Missing metadata preserves old
client behavior; self-overwrites and unrelated plan saves do not count as another
clinician's screening overwrite. Sectioned vitals compare only fields they write.

## Keycloak staging proposal, not deployed

`infra/keycloak/Dockerfile` accepts build-time `KC_METRICS_ENABLED` with production's
existing default `true`. [OPERATIONS.md](../../OPERATIONS.md) documents staging-only
heap percentages, SerialGC, local cache, metrics off at build time and health on.
Reason: staging's 512 MB instance runs out of memory. No Render settings were
changed, no staging/prod rollout happened, and no memory improvement is claimed.
Validate container RSS and login-burst behavior on staging before adopting it;
production stays unchanged without measurements.

## Validation and open items

The final review is the source of truth for fresh builds, the single final
one-worker Playwright invocation excluding #197, all 50 baseline comparisons,
the nine carried non-baseline failures, keyboard coverage and cosign path.
Historical passing suites are not substituted for this run's failures.

| Known item                                                       | One-line reason                                                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Final browser exceptions                                         | See the final review's exact failed cases and one-attempt harness disposition; incomplete paths cannot receive release sign-off.           |
| Field performance                                                | Local browser samples are lab observations, not production p75 or low-end hardware results.                                                |
| Shared critical JS and dashboard hydration                       | R7.7 identified substantial provider/runtime weight and a dashboard long task; broad architecture work is outside this measure-only stage. |
| Station chart tick crowding                                      | Earlier desktop observations show crowded axis labels and this stage authorizes only clear performance regressions.                        |
| Physical devices, screen readers and virtual keyboards           | Browser automation cannot establish assistive-technology or actual-device usability.                                                       |
| WebKit against local HTTP Keycloak                               | Local authentication limitations prevent treating Chromium results as a Safari sign-off.                                                   |
| Internal root global-error injection and one-off auth lifecycles | Earlier route audit explicitly left these special states unverified.                                                                       |
| #197 offline-copy checks                                         | Excluded at the owner's request because of known local failures; no passing result is claimed.                                             |
| Staging Keycloak rollout                                         | Proposal only, pending staging deployment and RSS/login-burst measurements.                                                                |

Any baseline drift is reported against the committed images; release QA does not
silently accept new snapshots, increase the pixel allowance or remove validation.

## Final-stage release gate

Fresh API/web builds pass. Final Chromium: **54 passed / 26 failed**, one worker,
zero retries, no skips/flakes, #197 excluded. All seven route walks pass: 259 UI
scans plus seven HTTP resources, zero axe violations/overflow, all 64 navigable
entries represented. All nine carried non-baseline failures passed, including the
clinical keyboard case and complete cosign/plan/finalize path. The 50 unchanged
reference comparisons produced **24 passed / 26 failed**. The inspected samples
show mutable synthetic data, and the original baseline manifest explicitly used
a live DB/clock. No reference replacement, wider allowance or new masking was
used to turn those failures green. This candidate does not meet the requested
50-pass visual gate.

| Open final-stage item     | One-line reason                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 26 visual comparisons     | Reference data/clock are not frozen; rebuild controlled fixtures and review new references before another authorized comparison. |
| Phone load time           | All nine throttled LCP samples are 4.684–6.016 s; no matched historical sample attributes this to a new regression.              |
| Director input sample     | Opening the menu and pressing Escape records 216 ms INP at 4× CPU, warranting follow-up interaction profiling.                   |
| Normal-motion performance | The audit harness uses reduced motion, so normal-motion illustration/hydration cost was not recertified.                         |
