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
- apply mutations idempotently
- track conflicts through `SyncMutation`
- emit audit events for accepted writes

### Pull

`GET /sync/pull`

Server responsibilities:

- return changes after the provided cursor
- scope results to the allowed clinic context

---

## Conflict Handling

Current important rules:

- national ID collisions surface duplicate suspicion instead of silent merge
- finalized encounter-linked data is treated as canonical
- merged patients resolve toward the canonical chart
- sync mutations preserve applied, conflict, and error state
- medical-history creates and revisions use client-generated IDs for replay idempotency
- stale medical-history revisions and no-known-allergies conflicts remain queued for user-visible
  recovery instead of overwriting the server record
- medical-history deletion is not a supported mutation

---

## Security And Reliability Rules

- sync endpoints are authenticated and permission-gated
- sync endpoints are rate limited
- request IDs and audit events remain part of the mutation path
- clinic-scoped request traffic uses the same RLS context as other protected routes

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
