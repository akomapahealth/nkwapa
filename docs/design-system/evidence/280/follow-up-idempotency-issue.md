# Draft issue: Idempotency keys for online API writes

Not filed yet: creating the GitHub issue from the #280 session was blocked by its permission
settings. File it with `gh issue create --title "Idempotency keys for online API writes"
--body-file docs/design-system/evidence/280/follow-up-idempotency-issue.md` (drop this preamble).

---

Found while auditing #280 (UX-20, item 16 of the owner's motion and feedback list). #280 does not
cover API behaviour, so this is split out rather than changed there.

## What already holds

- The offline outbox gives every queued write an `idempotencyKey` (`apps/web/lib/outbox.ts`),
  sync replays send it, and the server records it in `SyncMutation` with
  `@@unique([clinicId, idempotencyKey])`. A replayed offline write cannot apply twice.

## The gap

Online writes go straight through `apiFetch` (`apps/web/lib/api.ts`) with no key. `apiFetch`
aborts after its timeout and tells the user the request is retryable ("Check your connection and
retry."). On clinic wifi the POST may already have reached the API, so pressing the button again
can create a second record: a duplicate check-in, appointment, invitation or clinical save.

## Proposed scope

1. Web: `apiFetch` sends an `Idempotency-Key` header on POST, PUT, PATCH and DELETE. The key is
   created once per user action and reused on that action's retries, not per HTTP attempt.
2. API: a NestJS interceptor stores `(clinicId, userId, key)` with the response status and body
   for 24 hours and returns the stored response on a repeat. A repeat with a different body gets 422.
3. Start with the create endpoints where a duplicate is costly (check-in, appointment create,
   staff invite, encounter and screening saves), then widen.
4. Tests: an API e2e that sends the same key twice and gets one row; a web unit test that a
   retried action reuses its key.

## Out of scope

Changing any clinical save semantics, validation or permissions. The stored response must respect
the same RBAC and clinic scope as the original request.
