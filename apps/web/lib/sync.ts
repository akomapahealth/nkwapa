'use client';

import type { Table } from 'dexie';
import { db, type OutboxRecord } from './db';
import type { SyncPullResponseDto } from './sync-types';
import { applyAdherencePull } from './medication-adherence';
import { isOwnedBy, outboxFailureUpdate, outboxSyncState } from './outbox';
import { describeSyncTransportFailure, type SyncTransportFailure } from './sync-conflicts';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

/**
 * Kept in step with SYNC_PUSH_MAX_MUTATIONS on the API. The whole outbox used to go in one request,
 * so a device that had queued more than the server accepts was refused with a 413 on every pass
 * and could never drain.
 */
export const SYNC_PUSH_BATCH_SIZE = 200;

/**
 * - `retrying`: the pass completed, but some changes stayed queued because the server said they
 *   could still succeed later. Nothing needs the clinician.
 * - `attention`: the pass completed, but some changes are blocked until the clinician retries,
 *   opens the record, or discards them. Inbound data still arrived.
 * - `error`: the pass itself failed, so nothing was confirmed either way.
 */
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'retrying' | 'attention' | 'error';

export type SyncStatusListener = (status: SyncStatus, message?: string, detail?: string) => void;

/** Told once per `syncNow` call, with everything that call pushed and refused. */
export type SyncPassListener = (clinicId: string, result: SyncResult) => void;

const listeners: Set<SyncStatusListener> = new Set();
const passListeners: Set<SyncPassListener> = new Set();
const inFlightByClinic = new Map<string, Promise<SyncResult>>();
const rerunRequestedByClinic = new Set<string>();
/**
 * The newest options each clinic's sync was asked for. A rerun uses these, not the first caller's:
 * on a reload the clinic is known before the account is, so the first pass runs with no account and
 * the call that arrives with one is coalesced into it (#162). Rerunning with the stale options left
 * the account's own changes unsent until something else triggered a sync.
 */
const latestOptionsByClinic = new Map<string, SyncNowOptions>();

export function onSyncStatusChange(listener: SyncStatusListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function onSyncPassComplete(listener: SyncPassListener): () => void {
  passListeners.add(listener);
  return () => passListeners.delete(listener);
}

function notifyStatus(status: SyncStatus, message?: string, detail?: string) {
  listeners.forEach((fn) => fn(status, message, detail));
}

export interface SyncNowOptions {
  clinicId: string;
  /**
   * The signed-in account (#162). Only its own queued changes are sent; another account's, and
   * changes with no recorded owner, stay held on the device. Null sends nothing and still pulls.
   */
  currentUserId: string | null;
  getAccessToken?: () => Promise<string | null>;
}

export interface SyncMutationFailure {
  id: string;
  conflictType?: string;
  conflictDetails?: Record<string, unknown>;
}

export interface SyncResult {
  success: boolean;
  error?: string;
  /** Changes the server answered with a conflict during this call. */
  conflicts?: SyncMutationFailure[];
  /** Changes the server refused outright during this call, e.g. a payload it will never accept. */
  rejected?: SyncMutationFailure[];
  /** Every change for the clinic now waiting on the clinician, including earlier passes. */
  blockedCount?: number;
  /** Every change for the clinic that will be re-sent automatically. */
  retryingCount?: number;
  /** Changes for the clinic held because another account (or no known account) queued them. */
  heldCount?: number;
}

/** True when the call finished and nothing for the clinic is still waiting. */
export function isFullySynced(result: SyncResult | null | undefined): boolean {
  return Boolean(result?.success && !result.blockedCount && !result.retryingCount);
}

interface PushResultRow {
  id: string;
  status: string;
  conflictType?: string;
  conflictDetails?: Record<string, unknown>;
  retryable?: boolean;
}

class SyncTransportError extends Error {
  constructor(readonly failure: SyncTransportFailure) {
    super(failure.message);
  }
}

/**
 * How long one push or pull may take before the pass is abandoned.
 *
 * Clinic wifi that resolves DNS and then stalls never rejects a fetch. Without a bound the clinic's
 * in-flight pass stayed pending forever, and every later `syncNow` for that clinic was handed the
 * same stuck promise, so nothing synced until a reload. Longer than an ordinary request's timeout,
 * because a full push batch or a first pull of a busy clinic is legitimately slow.
 */
export const SYNC_REQUEST_TIMEOUT_MS = 30_000;

async function fetchOrThrow(url: string, init: RequestInit): Promise<Response> {
  const timeout = new AbortController();
  const timeoutId = globalThis.setTimeout(() => timeout.abort(), SYNC_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: timeout.signal });
  } catch (err) {
    throw new SyncTransportError(
      describeSyncTransportFailure(
        null,
        timeout.signal.aborted
          ? `No answer within ${SYNC_REQUEST_TIMEOUT_MS / 1000} seconds`
          : err instanceof Error
            ? err.message
            : String(err),
      ),
    );
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
  if (!response.ok) {
    throw new SyncTransportError(
      describeSyncTransportFailure(response.status, await response.text()),
    );
  }
  return response;
}

function toFailure(row: PushResultRow): SyncMutationFailure {
  return { id: row.id, conflictType: row.conflictType, conflictDetails: row.conflictDetails };
}

/**
 * Send every queued change that is not waiting on the clinician, and record each answer on its
 * row so it survives a refresh.
 *
 * A blocked row is skipped: the server has already said a replay cannot change its answer, and
 * re-sending it every pass only spends the rate limit. The clinician's Retry puts it back.
 */
async function pushOutbox(
  clinicId: string,
  currentUserId: string | null,
  headers: Record<string, string>,
): Promise<Pick<SyncResult, 'conflicts' | 'rejected'>> {
  const queued = await db.outbox.where('clinicId').equals(clinicId).sortBy('createdAt');
  // Another account's change is never sent under this account's token (#162).
  const sendable = queued.filter(
    (row) => isOwnedBy(row, currentUserId) && outboxSyncState(row) !== 'blocked',
  );
  const conflicts: SyncMutationFailure[] = [];
  const rejected: SyncMutationFailure[] = [];

  for (let start = 0; start < sendable.length; start += SYNC_PUSH_BATCH_SIZE) {
    const batch = sendable.slice(start, start + SYNC_PUSH_BATCH_SIZE);
    const response = await fetchOrThrow(
      `${API_BASE}/sync/push?clinicId=${encodeURIComponent(clinicId)}`,
      { method: 'POST', headers, body: JSON.stringify(batch.map(toPushMutation)) },
    );
    const { results } = (await response.json()) as { results: PushResultRow[] };
    const rowsById = new Map(batch.map((row) => [row.id, row]));

    for (const result of results) {
      const row = rowsById.get(result.id);
      if (!row) continue;
      if (result.status === 'APPLIED') {
        await db.outbox.delete(row.id);
        continue;
      }
      // The row is always kept so a clinician's entry is never silently discarded.
      const update = outboxFailureUpdate(row, {
        status: result.status,
        conflictType: result.conflictType,
        conflictDetails: result.conflictDetails,
        retryable: result.retryable,
      });
      await db.outbox.update(row.id, update);
      if (result.status === 'CONFLICT') conflicts.push(toFailure(result));
      else if (update.syncState === 'blocked') rejected.push(toFailure(result));
    }
  }

  return {
    ...(conflicts.length ? { conflicts } : {}),
    ...(rejected.length ? { rejected } : {}),
  };
}

function toPushMutation(row: OutboxRecord) {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    operation: row.operation,
    clinicId: row.clinicId,
    payloadJson: JSON.parse(row.payloadJson) as Record<string, unknown>,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
  };
}

async function countOutstanding(clinicId: string, currentUserId: string | null) {
  const rows = await db.outbox.where('clinicId').equals(clinicId).toArray();
  const own = rows.filter((row) => isOwnedBy(row, currentUserId));
  return {
    blockedCount: own.filter((row) => outboxSyncState(row) === 'blocked').length,
    retryingCount: own.filter((row) => outboxSyncState(row) === 'retrying').length,
    heldCount: rows.length - own.length,
  };
}

function plural(count: number, one: string, many: string) {
  return count === 1 ? one : many.replace('{n}', String(count));
}

/**
 * Push, then always pull.
 *
 * A conflict or refusal used to end the pass before the pull, so one queued change the server
 * would never accept cut the device off from every inbound update until someone intervened. A
 * refused row stays queued and visible instead, and the rest of the sync carries on.
 */
async function performSync(options: SyncNowOptions): Promise<SyncResult> {
  const { clinicId, currentUserId, getAccessToken } = options;
  notifyStatus('syncing');

  try {
    const token = getAccessToken ? await getAccessToken() : null;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const pushed = await pushOutbox(clinicId, currentUserId, headers);
    await pullIntoLocalStore(clinicId, headers);
    const outstanding = await countOutstanding(clinicId, currentUserId);

    if (outstanding.blockedCount > 0) {
      notifyStatus(
        'attention',
        plural(
          outstanding.blockedCount,
          'An offline change needs your attention.',
          '{n} offline changes need your attention.',
        ),
      );
    } else if (outstanding.retryingCount > 0) {
      notifyStatus(
        'retrying',
        plural(
          outstanding.retryingCount,
          'A pending change will be retried.',
          '{n} pending changes will be retried.',
        ),
      );
    } else {
      notifyStatus('success');
    }

    return { success: true, ...pushed, ...outstanding };
  } catch (err) {
    const failure =
      err instanceof SyncTransportError
        ? err.failure
        : describeSyncTransportFailure(null, err instanceof Error ? err.message : String(err));
    notifyStatus('error', failure.message, failure.detail);
    return { success: false, error: failure.message };
  }
}

function toLocalRecord(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : value,
    ]),
  );
}

async function pullIntoLocalStore(clinicId: string, headers: Record<string, string>) {
  const syncState = await db.sync_state.get(clinicId);
  const cursor = syncState?.cursor ?? '';
  const pullUrl = `${API_BASE}/sync/pull?clinicId=${encodeURIComponent(clinicId)}${cursor ? `&since=${encodeURIComponent(cursor)}` : ''}`;
  const pullRes = await fetchOrThrow(pullUrl, { headers });
  const pull = (await pullRes.json()) as SyncPullResponseDto;

  // Each store is written in one bulk call rather than a put per row; a first sync of a busy clinic
  // is thousands of rows.
  const putAll = async <T>(table: Table<T, string>, rows: Array<Record<string, unknown>> = []) => {
    if (rows.length > 0) await table.bulkPut(rows.map(toLocalRecord) as unknown as T[]);
  };

  await putAll(db.patients, pull.patients);
  await putAll(db.encounters, pull.encounters);
  await putAll(
    db.vitals,
    pull.vitals.map((row) => {
      const record = { ...row };
      if (record.pulseBpm == null && record.heartRate != null) record.pulseBpm = record.heartRate;
      delete record.heartRate;
      return record;
    }),
  );
  await putAll(db.tobacco_screenings, pull.tobaccoScreenings);
  await putAll(db.diabetes_screenings, pull.diabetesScreenings);
  await putAll(db.hypertension_assessments, pull.hypertensionAssessments);
  await applyAdherencePull(db, pull.medicationAdherence ?? []);
  await putAll(db.care_plans, pull.carePlans);
  await putAll(db.patient_consents, pull.patientConsents);
  await putAll(db.prescriptions, pull.prescriptions);
  await putAll(db.medical_history_records, pull.medicalHistoryRecords);
  await putAll(db.medical_history_revisions, pull.medicalHistoryRevisions);
  await putAll(db.patient_medication_records, pull.patientMedicationRecords);
  await putAll(db.patient_medication_revisions, pull.patientMedicationRevisions);
  await putAll(db.medication_reconciliation_events, pull.medicationReconciliationEvents);
  await putAll(db.patient_pharmacy_records, pull.patientPharmacyRecords);
  await putAll(db.patient_pharmacy_revisions, pull.patientPharmacyRevisions);
  await putAll(db.patient_pharmacy_preferences, pull.patientPharmacyPreferences);

  // Charts a merge retired. The server stopped sending them, so without this the device kept its
  // copy indefinitely and went on queueing changes against a chart no one can open.
  const retiredPatientIds = (pull.mergedPatients ?? []).map((merged) => merged.id);
  if (retiredPatientIds.length > 0) {
    await db.patients.bulkDelete(retiredPatientIds);
  }

  await db.sync_state.put({
    clinicId,
    cursor: pull.cursor,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Coalesces concurrent retries without losing mutations queued during an active sync pass.
 * A concurrent caller requests one follow-up pass after the current push/pull completes.
 */
export function syncNow(options: SyncNowOptions): Promise<SyncResult> {
  latestOptionsByClinic.set(options.clinicId, options);
  const inFlight = inFlightByClinic.get(options.clinicId);
  if (inFlight) {
    rerunRequestedByClinic.add(options.clinicId);
    return inFlight;
  }

  const request = (async () => {
    const conflicts: SyncMutationFailure[] = [];
    const rejected: SyncMutationFailure[] = [];
    let result: SyncResult;

    do {
      rerunRequestedByClinic.delete(options.clinicId);
      result = await performSync(latestOptionsByClinic.get(options.clinicId) ?? options);
      if (result.conflicts) conflicts.push(...result.conflicts);
      if (result.rejected) rejected.push(...result.rejected);
    } while (result.success && rerunRequestedByClinic.has(options.clinicId));

    const merged: SyncResult = {
      ...result,
      ...(conflicts.length ? { conflicts } : {}),
      ...(rejected.length ? { rejected } : {}),
    };
    passListeners.forEach((fn) => fn(options.clinicId, merged));
    return merged;
  })().finally(() => {
    rerunRequestedByClinic.delete(options.clinicId);
    if (inFlightByClinic.get(options.clinicId) === request) {
      inFlightByClinic.delete(options.clinicId);
    }
  });
  inFlightByClinic.set(options.clinicId, request);
  return request;
}
