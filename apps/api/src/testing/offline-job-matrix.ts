/**
 * Offline replay and background job execution, described once as a table (#21).
 *
 * The outbox and the workers touch patient records, reminders, research exports and the clinic
 * floor, and each one fails in ways that are easy to miss: a change written twice, written to the
 * wrong clinic, lost on a bad connection, or a job that sends twice or never records its failure.
 * Release validation used to rely on whoever ran it remembering those cases.
 *
 * This table is the list. Every scenario names its fixture, what must happen, the surface that owns
 * it, and where it is proven. `offline-job-matrix.spec.ts` fails if a named test no longer exists,
 * if a manual scenario is missing from the user testing guide, or if the generated
 * `docs/security/offline-job-execution-matrix.md` drifts from this file. Edit here, then run
 * `npm run docs:offline-job-matrix --workspace=@nkwapa/api`.
 */

export const MATRIX_CONDITIONS = [
  'offline',
  'weak-network',
  'duplicate-replay',
  'conflict',
  'stale-clinic',
  'cross-tenant',
  'background-job',
] as const;
export type MatrixCondition = (typeof MATRIX_CONDITIONS)[number];

export const CONDITION_HEADINGS: Record<MatrixCondition, { title: string; intro: string }> = {
  offline: {
    title: 'Offline',
    intro: 'No connection at all. Work is saved on the device and must reach the server intact.',
  },
  'weak-network': {
    title: 'Weak network',
    intro:
      'A connection that fails partway: a server error, a request that stalls, a drop between batches. Nothing may be lost or confirmed early, and the queue must drain without anyone pressing a button.',
  },
  'duplicate-replay': {
    title: 'Duplicate replay',
    intro:
      'The same change arriving more than once: two tabs, a resend of a request that had in fact landed, a double tap. It must apply once, and every copy must get the same answer.',
  },
  conflict: {
    title: 'Conflict handling',
    intro:
      'The server disagrees with the device. Nothing is merged or overwritten automatically, and only what a replay can never change is cached against the idempotency key.',
  },
  'stale-clinic': {
    title: 'Stale active clinic',
    intro:
      'A device holds work for a clinic other than the one now active, or for a clinic the account has lost its seat at, or for an account that has signed out.',
  },
  'cross-tenant': {
    title: 'Cross-tenant isolation',
    intro:
      'A replay or a job must never read or write another clinic. Enforced by the API and, beneath it, by PostgreSQL row-level security under the unprivileged application role.',
  },
  'background-job': {
    title: 'Background jobs',
    intro:
      'BullMQ workers: reminders, research exports, and the maintenance sweeps. Each is checked for duplicate delivery, retry, and work that went stale between queueing and running.',
  },
};

/** Who owns the behaviour, so a failure lands with the people who can fix it. */
export const OWNER_SURFACES = {
  'web-outbox': 'Web outbox and sync engine (`apps/web/lib/outbox.ts`, `sync.ts`)',
  'web-sync-provider': 'Web sync provider (`apps/web/app/ServiceWorkerAndSyncProvider.tsx`)',
  'portal-cache': 'Portal read cache (`apps/web/lib/portal-cache.ts`)',
  'api-sync': 'Sync API (`apps/api/src/sync`)',
  'ops-replay': 'Clinic operations replay (`apps/api/src/ops`)',
  'job-runner': 'Job tenant runner (`apps/api/src/prisma/job-tenant-context.runner.ts`)',
  'reminders-worker': 'Reminders worker (`apps/api/src/reminders`)',
  'research-worker': 'Research export worker (`apps/api/src/research`)',
  'maintenance-jobs': 'Maintenance schedulers (portal invite expiry, telemetry retention)',
  'database-rls': 'Row-level security (`packages/db/prisma/migrations`)',
} as const;
export type OwnerSurface = keyof typeof OWNER_SURFACES;

/** A test that proves the scenario. `file` is relative to the repository root. */
export interface AutomatedTestRef {
  file: string;
  test: string;
}

/**
 * A risk the matrix records honestly instead of hiding: today's behaviour, why it is tolerated,
 * and the follow-up that will change it.
 */
export interface KnownRisk {
  title: string;
  behaviour: string;
  mitigation: string;
  followUp: string;
}

export const KNOWN_RISKS = {
  'job-transaction': {
    title: 'External calls run inside the job transaction',
    behaviour:
      'Each job runs in one interactive Prisma transaction with the default 5 second timeout. The SMS or email send, and the research pack build plus GitHub push, happen inside it. A slow provider can expire the transaction after the message or commit has already gone out.',
    mitigation:
      'Sends and exports are claimed with an advisory lock, so two deliveries never run at the same time. That does not cover this case: if the transaction expires after the provider accepted the message, the SENT or COMPLETED write rolls back and the retry sends or pushes again. Typical sends finish well inside the window; watch for expired-transaction errors in the worker log.',
    followUp: '#164: Move provider calls and the GitHub push outside the tenant transaction.',
  },
  'early-reminder': {
    title: 'A reminder job that fires early completes without sending',
    behaviour:
      'A reminder job delivered before its scheduled time (clock skew between the API and Redis) finds the row not yet due, returns, and completes. Nothing re-queues it, so the row stays QUEUED.',
    mitigation:
      'Delays are computed from the same scheduledAt the check reads, so this needs skew larger than the gap between them. The reminders page shows a QUEUED row past its time, which is the signal to look.',
    followUp: '#165: Re-queue a reminder that is not yet due for the remaining delay.',
  },
} as const satisfies Record<string, KnownRisk>;
export type KnownRiskId = keyof typeof KNOWN_RISKS;

export interface MatrixScenario {
  id: string;
  condition: MatrixCondition;
  /** `high` scenarios are the release gate: each condition has at least one that is automated. */
  risk: 'high' | 'medium';
  surface: OwnerSurface;
  scenario: string;
  fixture: string;
  expected: string;
  automated: readonly AutomatedTestRef[];
  /** Also walked by a person, in section 17d of `docs/USER_TESTING_GUIDE.md`. */
  manual: boolean;
  knownRisk?: KnownRiskId;
}

const WEB = 'apps/web/lib';
const E2E = 'apps/web/e2e';
const SYNC = 'apps/api/src/sync';
const REMINDERS = 'apps/api/src/reminders';
const RESEARCH = 'apps/api/src/research';
const ISOLATION = 'packages/db/src/tenant-isolation.integration.spec.ts';

const ref = (file: string, test: string): AutomatedTestRef => ({ file, test });

export const OFFLINE_JOB_SCENARIOS: readonly MatrixScenario[] = [
  // Offline
  {
    id: 'OFF-01',
    condition: 'offline',
    risk: 'high',
    surface: 'web-outbox',
    scenario: 'A change saved with no connection waits on the device and syncs once it returns',
    fixture: 'Staff identity, a chart created online, the browser taken offline',
    expected:
      'The form says it is saved on this device and the pill reads "Offline · 1 saved". On reconnect one push applies it and the outbox empties.',
    automated: [
      ref(
        `${E2E}/sync-recovery.spec.js`,
        'an offline patient edit syncs once the connection returns',
      ),
      ref(
        `${E2E}/today-offline.spec.js`,
        'a shift started offline is labelled pending, then syncs once',
      ),
    ],
    manual: true,
  },
  {
    id: 'OFF-02',
    condition: 'offline',
    risk: 'medium',
    surface: 'web-outbox',
    scenario: 'A page this device has never loaded is opened offline',
    fixture: 'A signed-in device, offline, navigating to a route it has not visited',
    expected: 'The offline page is shown, not the marketing home page or a blank screen.',
    automated: [],
    manual: true,
  },
  {
    id: 'OFF-03',
    condition: 'offline',
    risk: 'medium',
    surface: 'portal-cache',
    scenario: 'The patient portal goes offline',
    fixture: 'Patient identity with history loaded once online',
    expected:
      'History pages show the saved copy and when it was saved. Portal writes are disabled and never enter the outbox.',
    automated: [
      ref(
        `${E2E}/portal-offline.spec.js`,
        'offline, history pages keep their saved copy and writes wait for a connection',
      ),
    ],
    manual: false,
  },

  // Weak network
  {
    id: 'NET-01',
    condition: 'weak-network',
    risk: 'high',
    surface: 'web-sync-provider',
    scenario: 'The server fails a push, then recovers',
    fixture: 'One queued change; `/sync/push` answers 503 once, then normally',
    expected:
      'The pill reads "Sync failed" and the queued row is untouched (no attempt counted). The provider retries by itself after 10 seconds and the change applies once, with no reconnect and no Sync now.',
    automated: [
      ref(
        `${WEB}/sync-replay.test.ts`,
        'drains a change on the pass after a server failure, without counting the failure against it',
      ),
      ref(
        `${WEB}/sync-retry.test.ts`,
        'tries again by itself after a pass the server or the network failed',
      ),
      ref(
        `${E2E}/offline-replay.spec.js`,
        'a change the server failed to take drains by itself once the server answers again',
      ),
    ],
    manual: true,
  },
  {
    id: 'NET-02',
    condition: 'weak-network',
    risk: 'high',
    surface: 'web-outbox',
    scenario: 'A request stalls: the connection resolves and then never answers',
    fixture: 'One queued change; the push never settles',
    expected:
      'The request is abandoned after 30 seconds with "Could not reach the server", the row is untouched, and the next pass sends instead of waiting behind the stuck one.',
    automated: [
      ref(
        `${WEB}/sync-replay.test.ts`,
        'abandons a stalled request so the next pass is not stuck behind it',
      ),
    ],
    manual: true,
  },
  {
    id: 'NET-03',
    condition: 'weak-network',
    risk: 'high',
    surface: 'web-outbox',
    scenario: 'The connection drops between two push batches',
    fixture: '201 queued changes (two batches); the second batch request fails',
    expected:
      'The first batch stays applied and leaves the outbox, the rest stay queued, and the pull is skipped so the cursor never moves past unconfirmed work.',
    automated: [
      ref(
        `${WEB}/sync-replay.test.ts`,
        'keeps a batch the server applied when a later batch fails, and skips the pull',
      ),
    ],
    manual: false,
  },
  {
    id: 'NET-04',
    condition: 'weak-network',
    risk: 'medium',
    surface: 'web-sync-provider',
    scenario: 'The server stays down for a long time',
    fixture: 'Consecutive failed passes',
    expected:
      'Automatic retries back off (10s, 30s, 1m, 2m, then every 5m) and never stop. Changes waiting on the clinician are never re-sent automatically.',
    automated: [
      ref(
        `${WEB}/sync-retry.test.ts`,
        'backs off with each consecutive retry and keeps trying at the longest interval',
      ),
      ref(`${WEB}/sync-retry.test.ts`, 'schedules nothing after a %s pass'),
    ],
    manual: false,
  },

  // Duplicate replay
  {
    id: 'DUP-01',
    condition: 'duplicate-replay',
    risk: 'high',
    surface: 'api-sync',
    scenario: 'The same change is pushed twice under one idempotency key',
    fixture: 'A recorded SyncMutation for the key; the second copy carries a different payload',
    expected:
      'The second push is answered from the first one’s record without running the handler. Only the first payload is written.',
    automated: [
      ref(
        `${SYNC}/sync.service.spec.ts`,
        "answers a second push of the same change with the first push's outcome, without writing again",
      ),
      ref(
        `${E2E}/offline-replay.spec.js`,
        'the same change sent twice under one idempotency key is applied once',
      ),
    ],
    manual: true,
  },
  {
    id: 'DUP-02',
    condition: 'duplicate-replay',
    risk: 'high',
    surface: 'api-sync',
    scenario: 'Two pushes of the same change arrive at once (two tabs, or a retried request)',
    fixture: 'Two concurrent push requests carrying one clinic and idempotency key',
    expected:
      'The key is held with a transaction-scoped advisory lock before its record is read. The second request waits, then answers from the first. No 500, no second write.',
    automated: [
      ref(
        `${SYNC}/sync.service.spec.ts`,
        'holds the idempotency key for the rest of the request before reading its record',
      ),
      ref(
        `${SYNC}/sync.service.spec.ts`,
        'applies a change once when it appears twice in one push',
      ),
    ],
    manual: true,
  },
  {
    id: 'DUP-03',
    condition: 'duplicate-replay',
    risk: 'high',
    surface: 'web-outbox',
    scenario: 'Sync is asked for repeatedly while a pass is running in one tab',
    fixture: 'One queued change; three concurrent `syncNow` calls',
    expected:
      'The change is pushed once. A change queued mid-pass is picked up by one follow-up pass.',
    automated: [
      ref(
        `${WEB}/sync-replay.test.ts`,
        'sends a change once, however many times sync is asked for while it is in flight',
      ),
      ref(
        `${WEB}/sync.test.ts`,
        'runs a follow-up pass when a mutation is queued during an active sync',
      ),
    ],
    manual: false,
  },
  {
    id: 'DUP-04',
    condition: 'duplicate-replay',
    risk: 'medium',
    surface: 'web-outbox',
    scenario: 'A button is tapped twice, or one key is queued at two clinics',
    fixture: 'Two enqueues under one caller-supplied idempotency key',
    expected:
      'One row for one action at one clinic. The same key at another clinic is a separate change, as the server records it.',
    automated: [
      ref(
        `${WEB}/outbox.test.ts`,
        'queues one row for one action, however many times it is submitted',
      ),
      ref(
        `${WEB}/outbox.test.ts`,
        'keeps the same key at two clinics as two changes, as the server does',
      ),
    ],
    manual: false,
  },
  {
    id: 'DUP-05',
    condition: 'duplicate-replay',
    risk: 'high',
    surface: 'ops-replay',
    scenario: 'The same patient check-in is replayed under two different keys',
    fixture: 'Two outbox rows with one check-in id and different idempotency keys',
    expected: 'One arrival on the Today board. The device-made record id stops the second write.',
    automated: [
      ref(`${E2E}/today-offline.spec.js`, 'replaying the same check-in twice creates one arrival'),
      ref(
        `${SYNC}/sync.service.spec.ts`,
        'answers a duplicate replay from the idempotency record without a second write',
      ),
    ],
    manual: false,
  },
  {
    id: 'DUP-06',
    condition: 'duplicate-replay',
    risk: 'medium',
    surface: 'web-outbox',
    scenario: 'The push response repeats an answer, names an unknown change, or omits one',
    fixture: 'A push response with a duplicate APPLIED, a foreign id, and a missing id',
    expected:
      'Answers for changes the device no longer holds are ignored; a change with no answer stays queued.',
    automated: [
      ref(
        `${WEB}/sync-replay.test.ts`,
        'ignores answers for changes this device no longer holds, and keeps any it was not answered for',
      ),
    ],
    manual: false,
  },

  // Conflict handling
  {
    id: 'CON-01',
    condition: 'conflict',
    risk: 'high',
    surface: 'api-sync',
    scenario: 'A refusal a replay can never change is replayed',
    fixture: 'A CONFLICT_FINALIZED outcome recorded for the key; server state since changed',
    expected:
      'The replay gets the stored conflict with the same details and `retryable: false`, and the handler does not run.',
    automated: [
      ref(
        `${SYNC}/sync.service.spec.ts`,
        'replays a deterministic conflict with the details it was first refused with',
      ),
      ref(
        `${SYNC}/sync-outcome.spec.ts`,
        'caches exactly the codes the shared catalog calls deterministic',
      ),
    ],
    manual: false,
  },
  {
    id: 'CON-02',
    condition: 'conflict',
    risk: 'high',
    surface: 'web-outbox',
    scenario: 'A conflict waits on the clinician, then is retried',
    fixture: 'A queued change the server answers with a conflict',
    expected:
      'The row is blocked, shown under Needs attention, and not re-sent on later passes. After Retry the next pass sends it, and an APPLIED answer clears it.',
    automated: [
      ref(
        `${WEB}/sync-rejected.test.ts`,
        'does not re-send a blocked change until the clinician asks',
      ),
      ref(
        `${WEB}/sync-replay.test.ts`,
        're-sends a change waiting to retry, but not one waiting on the clinician',
      ),
      ref(
        `${WEB}/sync-replay.test.ts`,
        'clears a conflict once the clinician retries it and the server applies it',
      ),
    ],
    manual: true,
  },
  {
    id: 'CON-03',
    condition: 'conflict',
    risk: 'high',
    surface: 'api-sync',
    scenario: 'A refusal that could clear later is replayed after its cause is fixed',
    fixture: 'A FORBIDDEN outcome recorded while the account lacked the role; the role restored',
    expected:
      'The stale record is cleared and the change genuinely re-attempted, so the queue drains.',
    automated: [
      ref(
        `${SYNC}/sync.service.spec.ts`,
        're-attempts a mutation whose earlier failure could since have been fixed',
      ),
      ref(
        `${SYNC}/sync.service.spec.ts`,
        'lets a change refused for a lost role through once the role is restored',
      ),
    ],
    manual: false,
  },
  {
    id: 'CON-04',
    condition: 'conflict',
    risk: 'high',
    surface: 'api-sync',
    scenario: 'A replay meets a finalized visit, a merged chart, or a national ID already in use',
    fixture: 'Queued changes against each of those server states',
    expected:
      'Each is refused as a conflict naming what to do next and is never written. The sync center explains it in plain language.',
    automated: [
      ref(
        `${SYNC}/sync.service.spec.ts`,
        'returns CONFLICT with CONFLICT_FINALIZED when encounter is FINALIZED',
      ),
      ref(
        `${SYNC}/sync.service.spec.ts`,
        'points an edit of a merged chart at the chart that survived',
      ),
      ref(
        `${E2E}/sync-recovery.spec.js`,
        'a duplicate patient conflict is explained and recoverable without the console',
      ),
    ],
    manual: true,
  },
  {
    id: 'CON-05',
    condition: 'conflict',
    risk: 'medium',
    surface: 'web-outbox',
    scenario: 'A clinician discards a refused change',
    fixture: 'A blocked change with a local copy of the record',
    expected:
      'Only the device copy is removed, the pull cursor resets, and the next sync restores the server’s version.',
    automated: [
      ref(
        `${WEB}/outbox.test.ts`,
        'discards only the local copy and makes the next sync restore the server version',
      ),
    ],
    manual: true,
  },
  {
    id: 'CON-06',
    condition: 'conflict',
    risk: 'medium',
    surface: 'ops-replay',
    scenario: 'A clinic floor action is replayed after its clinic day has ended',
    fixture: 'A queued check-in whose device time is on an earlier clinic day',
    expected:
      'Refused with OPS_REPLAY_EXPIRED, not retryable, and the sync center asks for it to be recorded again.',
    automated: [
      ref(
        `${SYNC}/sync.service.spec.ts`,
        'reports an expired replay as a refusal that will not clear by itself',
      ),
    ],
    manual: false,
  },

  // Stale active clinic
  {
    id: 'CLN-01',
    condition: 'stale-clinic',
    risk: 'high',
    surface: 'web-outbox',
    scenario: 'Work queued under clinic A while clinic B is active',
    fixture: 'An outbox row for clinic A; clinic B selected',
    expected:
      'Clinic A’s row is neither pushed nor counted on the pill, and stays on the device untouched.',
    automated: [
      ref(
        `${WEB}/sync-replay.test.ts`,
        "never sends another clinic's changes while a different clinic is active",
      ),
      ref(
        `${E2E}/offline-replay.spec.js`,
        'a change queued under another clinic is neither sent nor counted while this one is active',
      ),
    ],
    manual: true,
  },
  {
    id: 'CLN-02',
    condition: 'stale-clinic',
    risk: 'high',
    surface: 'web-outbox',
    scenario: 'The clinician switches back to the clinic the work was queued under',
    fixture: 'Rows for clinic A and clinic B; B synced first, then A selected',
    expected:
      'Clinic A’s rows drain on the first pass after it becomes active, pushed to clinic A only.',
    automated: [
      ref(
        `${WEB}/sync-replay.test.ts`,
        "drains a clinic's changes once that clinic is active again",
      ),
    ],
    manual: true,
  },
  {
    id: 'CLN-03',
    condition: 'stale-clinic',
    risk: 'high',
    surface: 'api-sync',
    scenario: 'The account lost its seat at the clinic its queued work belongs to',
    fixture:
      'A push or pull naming a clinic where the account holds no role, or only a patient role',
    expected:
      'The route refuses it with 403 before the service runs. The device keeps every row and says "This account cannot sync at this clinic".',
    automated: [
      ref(
        `${SYNC}/sync.controller.spec.ts`,
        'refuses a %s for a clinic the account holds no seat at',
      ),
      ref(
        `${SYNC}/sync.controller.spec.ts`,
        'refuses a push for the other clinic of an account that holds a seat at only one',
      ),
      ref(
        `${SYNC}/sync.controller.spec.ts`,
        'refuses a push from a portal patient, even at their own clinic',
      ),
      ref(
        `${WEB}/sync-replay.test.ts`,
        'keeps every change when the server refuses the clinic itself',
      ),
    ],
    manual: true,
  },
  {
    id: 'CLN-04',
    condition: 'stale-clinic',
    risk: 'high',
    surface: 'api-sync',
    scenario: 'A push carries a change whose own clinic is not the clinic pushed to',
    fixture: 'One mutation naming clinic B inside a push to clinic A, beside a valid one',
    expected:
      'CLINIC_MISMATCH for that change, nothing recorded under clinic A, and the rest of the push applies.',
    automated: [
      ref(
        `${SYNC}/sync.service.spec.ts`,
        'refuses a change queued under another clinic without recording it, and applies the rest',
      ),
    ],
    manual: false,
  },
  {
    id: 'CLN-05',
    condition: 'stale-clinic',
    risk: 'high',
    surface: 'web-outbox',
    scenario: 'An account signs out with work still queued, and another signs in on the device',
    fixture: 'A queued change from account A; account B signs in at the same clinic',
    expected:
      'The change is held, never sent under account B. B sees it in the sync center attributed to A and can discard it after confirming; A signing back in sends it. A change from before owners were recorded is held until an account confirms it as its own (#162).',
    automated: [
      ref(
        `${WEB}/sync-replay.test.ts`,
        "never sends another account's change, and holds it untouched",
      ),
      ref(
        `${WEB}/sync-replay.test.ts`,
        'drains the held change once its own account signs back in',
      ),
      ref(
        `${WEB}/sync-replay.test.ts`,
        'holds a change queued before owners were recorded, for every account',
      ),
      ref(
        `${WEB}/sync-replay.test.ts`,
        'reruns a pass that began before the account was known as that account',
      ),
      ref(
        `${E2E}/outbox-owner.spec.js`,
        "another account's queued change is held, attributed, and never sent",
      ),
      ref(
        `${E2E}/outbox-owner.spec.js`,
        'a change with no recorded owner is sent only after it is claimed',
      ),
      ref(`${E2E}/outbox-owner.spec.js`, "the owner's own session sends what it queued"),
    ],
    manual: true,
  },

  {
    id: 'CLN-06',
    condition: 'stale-clinic',
    risk: 'medium',
    surface: 'web-outbox',
    scenario: 'The account loses its seat at a clinic entirely while work is queued there',
    fixture: 'A queued change for clinic A; the account’s only role at A removed by an admin',
    expected:
      'Clinic A is no longer offered as active, and its change is listed in the sync center under "Saved for other clinics", named, never pushed. A clinic the account can still open offers a switch that sends it there; a lost one offers only a confirmed discard of this account’s own changes (#163).',
    automated: [
      ref(
        `${E2E}/outbox-other-clinics.spec.js`,
        'a change saved for another open clinic is listed, not pushed, and sent there on switching',
      ),
      ref(
        `${E2E}/outbox-other-clinics.spec.js`,
        'a lost clinic offers only a confirmed discard of this account’s own changes',
      ),
      ref(
        `${WEB}/other-clinic-queue.test.ts`,
        'groups by clinic, open clinics first, and names a lost one from what was recorded',
      ),
    ],
    manual: true,
  },

  // Cross-tenant isolation
  {
    id: 'TEN-01',
    condition: 'cross-tenant',
    risk: 'high',
    surface: 'api-sync',
    scenario: 'A replayed payload points at another clinic’s data',
    fixture: 'An encounter naming another clinic, or a patient who belongs to another clinic',
    expected: 'Refused before any write.',
    automated: [
      ref(`${SYNC}/sync.service.spec.ts`, 'refuses an encounter payload that names another clinic'),
      ref(
        `${SYNC}/sync.service.spec.ts`,
        'refuses an encounter whose patient belongs to another clinic',
      ),
    ],
    manual: false,
  },
  {
    id: 'TEN-02',
    condition: 'cross-tenant',
    risk: 'high',
    surface: 'database-rls',
    scenario: 'Two clinics use the same idempotency key',
    fixture: 'One key recorded at clinic A and pushed at clinic B',
    expected: 'Two independent records. Neither clinic’s replay is answered from the other’s.',
    automated: [
      ref(
        `${SYNC}/sync.service.spec.ts`,
        'keeps the same idempotency key at two clinics as two changes',
      ),
      ref(ISOLATION, 'keeps the same idempotency key at two clinics as two separate records'),
    ],
    manual: false,
  },
  {
    id: 'TEN-03',
    condition: 'cross-tenant',
    risk: 'high',
    surface: 'database-rls',
    scenario: 'A job running for one clinic reads job tables',
    fixture:
      'Reminder, ResearchExport and SyncMutation rows at two clinics; the unprivileged app role',
    expected: 'Only that clinic’s rows are visible, and none at all without a clinic context.',
    automated: [
      ref(
        ISOLATION,
        "shows a clinic's job context only that clinic's reminders, exports and replay records",
      ),
      ref(ISOLATION, 'returns no job rows without a clinic context'),
    ],
    manual: false,
  },
  {
    id: 'TEN-04',
    condition: 'cross-tenant',
    risk: 'high',
    surface: 'database-rls',
    scenario: 'A job tries to act on another clinic’s row by id',
    fixture: 'A clinic A context updating clinic B’s export and reminder, and inserting rows for B',
    expected: 'Updates touch no rows; inserts are refused by row-level security.',
    automated: [
      ref(ISOLATION, "cannot finish or send another clinic's job, even by naming its id"),
      ref(
        ISOLATION,
        'refuses to queue a job row or record a replay for a clinic outside the context',
      ),
    ],
    manual: false,
  },
  {
    id: 'TEN-05',
    condition: 'cross-tenant',
    risk: 'medium',
    surface: 'database-rls',
    scenario: 'A notification that belongs to no clinic',
    fixture: 'A global reminder (null clinic), e.g. an account deactivation notice',
    expected: 'Visible only to system work, and delivered as system work rather than discarded.',
    automated: [
      ref(ISOLATION, 'shows a notification that belongs to no clinic only to system work'),
      ref(
        `${REMINDERS}/reminder.processor.spec.ts`,
        'runs a deliberately global notification as system work instead of discarding it',
      ),
    ],
    manual: false,
  },
  {
    id: 'TEN-06',
    condition: 'cross-tenant',
    risk: 'high',
    surface: 'job-runner',
    scenario: 'A job runs under the clinic its payload names',
    fixture: 'Reminder and research export jobs carrying clinicId and userId',
    expected:
      'The work runs in that clinic’s context; a database lookup never replaces a supplied tenant.',
    automated: [
      ref(
        `${REMINDERS}/reminder.processor.spec.ts`,
        'passes new reminder jobs through the queued clinic context',
      ),
      ref(
        `${REMINDERS}/reminder.processor.spec.ts`,
        'does not replace a supplied tenant with a database lookup',
      ),
      ref(
        `${RESEARCH}/research-export.processor.spec.ts`,
        'propagates the queued clinic and actor context',
      ),
    ],
    manual: false,
  },
  {
    id: 'TEN-07',
    condition: 'cross-tenant',
    risk: 'high',
    surface: 'job-runner',
    scenario: 'A job’s clinic is missing, blank, or not a string',
    fixture: 'Payloads with a blank, numeric or null clinicId, and legacy payloads with none',
    expected:
      'Treated as missing and resolved from the record under a named system reason. If unresolved, a reminder is discarded and an export fails. Never run under a clinic made up from a bad payload.',
    automated: [
      ref(
        'apps/api/src/prisma/job-tenant-context.runner.spec.ts',
        'treats a clinic id that is %s as missing and resolves it from the record',
      ),
      ref(
        'apps/api/src/prisma/job-tenant-context.runner.spec.ts',
        'safely discards unresolved work without invoking the callback',
      ),
      ref(
        'apps/api/src/prisma/job-tenant-context.runner.spec.ts',
        'fails unresolved work without invoking it when fail policy is selected',
      ),
      ref(
        `${RESEARCH}/research-export.processor.spec.ts`,
        'declares failure and resolves the full legacy export tenant context',
      ),
    ],
    manual: false,
  },

  // Background jobs
  {
    id: 'JOB-01',
    condition: 'background-job',
    risk: 'high',
    surface: 'reminders-worker',
    scenario: 'A reminder job is delivered twice',
    fixture: 'A stalled job redelivered, or two workers holding one job id',
    expected:
      'The send is claimed with an advisory lock before the row is read. A duplicate that finds it held stands down; one that arrives after reads SENT. One message.',
    automated: [
      ref(
        `${REMINDERS}/appointment-reminder-lifecycle.spec.ts`,
        'stands down when another delivery of the same reminder is already sending it',
      ),
      ref(
        `${REMINDERS}/appointment-reminder-lifecycle.spec.ts`,
        'claims the send before it reads the reminder',
      ),
      ref(
        `${REMINDERS}/appointment-reminder-lifecycle.spec.ts`,
        'does nothing for a reminder that is no longer queued',
      ),
    ],
    manual: true,
  },
  {
    id: 'JOB-02',
    condition: 'background-job',
    risk: 'high',
    surface: 'reminders-worker',
    scenario: 'The appointment changed between queueing and sending',
    fixture: 'A queued reminder whose appointment was rescheduled, cancelled, or deleted',
    expected: 'Not sent. The row is suppressed with a reason that stays visible.',
    automated: [
      ref(
        `${REMINDERS}/appointment-reminder-lifecycle.spec.ts`,
        'refuses to send a reminder for a time the appointment no longer holds',
      ),
      ref(
        `${REMINDERS}/appointment-reminder-lifecycle.spec.ts`,
        'refuses to send when the appointment has gone entirely',
      ),
    ],
    manual: false,
  },
  {
    id: 'JOB-03',
    condition: 'background-job',
    risk: 'high',
    surface: 'reminders-worker',
    scenario: 'The provider fails transiently, or Redis is briefly unavailable',
    fixture: 'A send that fails as transient, with attempts left and then without',
    expected:
      'The row stays QUEUED between attempts, retried after 5s then 60s, and is marked FAILED only once the attempts are spent.',
    automated: [
      ref(
        `${REMINDERS}/reminder.service.spec.ts`,
        'hands a transient failure back to the queue instead of marking it failed',
      ),
      ref(
        `${REMINDERS}/reminder.service.spec.ts`,
        'marks a transient failure failed once the attempts are spent',
      ),
      ref(
        `${REMINDERS}/reminder-retry.spec.ts`,
        'names a backoff type BullMQ hands to the worker instead of computing itself',
      ),
      ref(
        `${REMINDERS}/appointment-reminder-lifecycle.spec.ts`,
        'queues retries on the schedule the worker computes',
      ),
    ],
    manual: true,
  },
  {
    id: 'JOB-04',
    condition: 'background-job',
    risk: 'medium',
    surface: 'reminders-worker',
    scenario: 'A reminder job fires before its scheduled time',
    fixture: 'A queued reminder whose scheduledAt is still in the future',
    expected:
      'Nothing is sent. Today the job completes and the row stays QUEUED; see the known risk.',
    automated: [
      ref(
        `${REMINDERS}/appointment-reminder-lifecycle.spec.ts`,
        'does nothing before the reminder is due',
      ),
    ],
    manual: false,
    knownRisk: 'early-reminder',
  },
  {
    id: 'JOB-05',
    condition: 'background-job',
    risk: 'high',
    surface: 'research-worker',
    scenario: 'A failed research export is retried',
    fixture: 'A FAILED export whose first job BullMQ still holds under the export id',
    expected:
      'Retry queues it under a fresh job id, so it actually runs, instead of reading APPROVED with nothing queued.',
    automated: [
      ref(
        `${RESEARCH}/research-export.service.spec.ts`,
        'retries a failed export under a job id the queue has not already used',
      ),
    ],
    manual: true,
  },
  {
    id: 'JOB-06',
    condition: 'background-job',
    risk: 'high',
    surface: 'research-worker',
    scenario: 'A research export run fails',
    fixture:
      'Pack generation or the GitHub push throws, with attempts left and on the last attempt',
    expected:
      'With attempts left the run is handed back to the queue and nothing is recorded. The last attempt records FAILED and its audit entry, and they commit.',
    automated: [
      ref(
        `${RESEARCH}/research-export.service.spec.ts`,
        'hands a failure with attempts left back to the queue without recording it',
      ),
      ref(
        `${RESEARCH}/research-export.service.spec.ts`,
        'records a failed export on its last attempt instead of throwing the record away',
      ),
      ref(
        `${RESEARCH}/research-export.processor.spec.ts`,
        "hands the service the job's place in its retry budget",
      ),
    ],
    manual: true,
  },
  {
    id: 'JOB-07',
    condition: 'background-job',
    risk: 'high',
    surface: 'research-worker',
    scenario: 'A research export job is delivered twice',
    fixture: 'Two deliveries of one export, concurrently or after completion',
    expected: 'The pack is built and pushed to the research repository once.',
    automated: [
      ref(
        `${RESEARCH}/research-export.service.spec.ts`,
        'stands down while another delivery of the same export is running',
      ),
      ref(`${RESEARCH}/research-export.service.spec.ts`, 'claims the export before it reads it'),
      ref(
        `${RESEARCH}/research-export.service.spec.ts`,
        'does nothing for a delivery that arrives after the export completed',
      ),
    ],
    manual: false,
  },
  {
    id: 'JOB-08',
    condition: 'background-job',
    risk: 'medium',
    surface: 'maintenance-jobs',
    scenario: 'Scheduled maintenance across several API instances and a Redis outage',
    fixture: 'The portal invite expiry and telemetry retention schedulers',
    expected:
      'One scheduler per cluster held in Redis, boot survives an unreachable queue, each sweep runs as system work and is safe to run twice.',
    automated: [
      ref(
        'apps/api/src/patient-portal/portal-invite-maintenance.processor.spec.ts',
        'registers one hourly scheduler, held in Redis rather than per instance',
      ),
      ref(
        'apps/api/src/patient-portal/portal-invite-maintenance.processor.spec.ts',
        'sweeps under a system tenant context',
      ),
      ref(
        'apps/api/src/telemetry/telemetry-retention.processor.spec.ts',
        'boots even when the queue is unreachable',
      ),
      ref(
        'apps/api/src/telemetry/telemetry-retention.processor.spec.ts',
        'is safe to run twice, because it only ever deletes by age',
      ),
    ],
    manual: false,
  },
  {
    id: 'JOB-09',
    condition: 'background-job',
    risk: 'high',
    surface: 'research-worker',
    scenario: 'A send or export outlasts the job transaction',
    fixture: 'A slow SMTP relay, or a large clinic export pushed to a slow GitHub',
    expected:
      'Today the transaction can expire after the external call succeeded; see the known risk.',
    automated: [],
    manual: true,
    knownRisk: 'job-transaction',
  },
];
