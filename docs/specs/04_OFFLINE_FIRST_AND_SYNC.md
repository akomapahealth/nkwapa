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

### Pull

`GET /sync/pull`

Server responsibilities:

- return changes after the provided cursor
- scope results to the allowed clinic context

---

## Conflict Handling

Current important rules:

- national ID collisions surface duplicate suspicion instead of silent merge
- finalized encounter-linked data is treated as canonical, and a write against a finalized
  encounter is reported as a conflict for every entity type
- merged patients resolve toward the canonical chart
- sync mutations preserve applied, conflict, and error state
- an outcome short-circuits a later replay of the same idempotency key only when replaying the
  identical mutation is guaranteed to reach the same answer: applied, or a conflict arising from
  server state a replay cannot change. Anything else is recorded and genuinely re-attempted, so a
  repaired payload, a granted permission, or a fixed server can drain the queue
- results carry `retryable`, and the client keeps a retryable change queued while continuing to the
  pull rather than halting the pass
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
- richer retry/conflict UI for every newer surface

---

## Recommended Next Additions

1. Extend outbox coverage to the highest-value ops mutations.
2. Add better conflict UI for duplicate and canonical-chart resolution.
3. Support more stale-while-refresh behavior on list-heavy pages.
4. Re-evaluate which patient portal writes are safe and useful to queue offline.
