/**
 * The actor every machine-written audit event is attributed to.
 *
 * `AuditEvent.actorUserId` is a `UUID` with a foreign key to `User`, so a background job
 * cannot simply name itself. Passing the string `'system'` — which the reminder delivery
 * paths did — is rejected by Postgres before the row is written:
 *
 *   ERROR:  invalid input syntax for type uuid: "system"
 *
 * meaning those events were never recorded at all. The alternative, attributing a job's
 * work to whichever person happened to trigger the thing it is cleaning up after, would
 * put a name against an action that person did not take. A dedicated row is the only
 * shape that keeps the audit trail both writable and true.
 *
 * The row is created by `20260902120000_portal_invite_expiry` and is deliberately inert:
 * `isActive` is false, so it is invisible to every staff picker and every recipient
 * query, and it holds no clinic role, so it grants nothing. Its `keycloakSub` is a
 * reserved value no realm can mint, so nobody can sign in as it.
 */
export const SYSTEM_ACTOR_USER_ID = '00000000-0000-4000-8000-00000000dead';

/** Matches the `keycloakSub` written by the migration. Kept beside the id so the two cannot drift. */
export const SYSTEM_ACTOR_KEYCLOAK_SUB = 'system:nkwapa';
