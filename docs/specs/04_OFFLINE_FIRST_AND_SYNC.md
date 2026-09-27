# Offline First And Sync

## Status

Current with follow-on work.

Offline support is strong for the original EMR capture flow, but the newer operations, admin, and patient portal features are still mostly online-first.

---

## Goal

Allow core clinical capture to continue when connectivity is unreliable, while preserving auditability, idempotency, and safe conflict handling.

---

## Current Offline-Capable Scope

The local Dexie store currently covers the core EMR workflow:

- patients
- encounters
- vitals
- diabetes screenings
- hypertension assessments
- care plans
- patient consents
- prescriptions
- medical-history records and append-only revisions
- outbox
- sync state

This lets the app preserve the most important intake and clinical documentation path even when the network is unstable.

---

## Sync Protocol

### Push

`POST /sync/push`

Server responsibilities:

- validate auth and clinic scope
- validate every mutation in the body, not merely that the body is an array
- require, per entity type, the same permission the equivalent REST route requires
- reject a payload naming a clinic other than the request's
- apply mutations idempotently
- track conflicts through `SyncMutation`
- emit audit events for accepted writes

`SYNC.PUSH` proves only that the caller may synchronize. Every entity type maps back to the
permission its online route requires, in a table typed so that adding a replayable entity without
deciding its permission is a compile error. Authorization does not depend on connectivity.

Two things are deliberately **not** replayable, and the reason is the same in both cases: `SYNC.PUSH`
is held by four roles, so an entity type is a wider door than the route it mirrors.

- **Clinical note content**, as recorded above, is server-only in full.
- **The supervising clinician plan** inside a chronic-disease interview. The interview itself
  replays; the plan is an online REST write behind `CAREPLAN.CLINICIAN_PLAN`. This follows the
  existing precedent that a clinician's deliberate, audited act stays online — a replay cannot
  finalize an encounter either. It is a real constraint on a doctor working without signal, tracked
  on issue #114 rather than hidden, and the web says so when the connection drops instead of failing
  quietly.

Because the interview replays and the plan does not, saving a plan flushes the outbox first.
Otherwise a clinician who completed the interview and moved straight to the plan would be refused by
a server that had not yet seen the screening, and the refusal would read as the plan being rejected
rather than as a queue that had not drained.

The pull is narrowed per record, not sent whole. `sync-projection.ts` names every column a device
receives and, beside it, every column deliberately withheld with the reason; a column in neither is
a decision nobody has made, which a drift test reports as a failure. Every clinician-plan column is
withheld, because IndexedDB is readable in devtools and caching a doctor-only plan on a volunteer's
laptop would defeat the permission rather than enforce it.

### Pull

`GET /sync/pull`

Server responsibilities:

- return changes after the provided cursor
- scope results to the allowed clinic context
- report charts a merge retired since the cursor (`mergedPatients`), so a device drops its copy
  instead of keeping a chart nobody can open and queueing changes against it

---

## Conflict Handling

Current important rules:

- national ID collisions surface duplicate suspicion instead of silent merge
- finalized encounter-linked data is treated as canonical, and a write against a finalized
  encounter is reported as a conflict for every entity type
- merged patients resolve toward the canonical chart. Any patient-scoped change queued against a
  merged chart is refused with `PATIENT_MERGED` and the surviving chart's id; it is never written
  to the retired record
- an offline edit of an existing chart needs no national ID, because the device does not keep one;
  only a new chart does (`PATIENT_NATIONAL_ID_REQUIRED`)
- sync mutations preserve applied, conflict, and error state
- an outcome short-circuits a later replay of the same idempotency key only when replaying the
  identical mutation is guaranteed to reach the same answer: applied, or a conflict arising from
  server state a replay cannot change. Anything else is recorded and genuinely re-attempted, so a
  repaired payload, a granted permission, or a fixed server can drain the queue
- every code a push can report is catalogued once in `packages/db/src/sync-conflicts.ts`, with its
  recovery category, whether it is deterministic, and whether it is retryable. The API derives its
  cacheable set and every `retryable` flag from it; the web derives its plain-language copy and safe
  recovery actions from it. A spec fails if a sync handler emits a code the catalog does not know
- results always carry `retryable`. A content refusal is not retryable, because the queued payload
  cannot change by itself
- the client records each refusal on its outbox row (`syncState`, `attempts`, `lastFailure`), so it
  survives a refresh. A conflict, or a refusal not marked retryable, is `blocked`: kept, shown in the
  sync center, and not re-sent until the clinician retries it. A retryable one is re-sent each pass
- a refused change never stops the pass: the pull always runs, and pushes go in batches no larger
  than the server's per-request limit
- the client never merges or overwrites to resolve a conflict. Discarding a change removes only the
  device's copy and resets the pull cursor so the server's version is restored
- conflict detail is built from an allow-list with its message redacted
- medical-history creates and revisions use client-generated IDs for replay idempotency
- stale medical-history revisions and no-known-allergies conflicts remain queued for user-visible
  recovery instead of overwriting the server record
- medical-history deletion is not a supported mutation
- encounter lifecycle transitions are not replayable; an offline push may only write a draft

---

## Security And Reliability Rules

- sync endpoints are authenticated and permission-gated, per entity type as well as per endpoint
- sync endpoints are rate limited, and one push is bounded in both row count and body size
- request IDs and audit events remain part of the mutation path
- clinic-scoped request traffic uses the same RLS context as other protected routes, and those
  policies are enforced rather than merely declared: see
  `docs/specs/11_CLINICAL_RECORDS_RELEASE_GATE.md`
- the pull sends a named list of fields rather than whole rows. The encrypted national ID and its
  hash are never sent and are not stored on the device
- clinical notes are never queued, cached, or replayed

---

## What Is Not Yet Fully Offline

- Today board and assignment operations
- most admin and research management pages
- patient portal claim flow
- patient portal self-service submissions
- in-form conflict prompts; recovery happens in the sync center rather than on the form that
  queued the change

---

## Recommended Next Additions

1. Extend outbox coverage to the highest-value ops mutations.
2. Offer offline patient registration, now that duplicate conflicts have a recovery path.
3. Support more stale-while-refresh behavior on list-heavy pages.
4. Re-evaluate which patient portal writes are safe and useful to queue offline.
