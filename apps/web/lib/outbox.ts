import type { NkwapaDb, OutboxFailure, OutboxRecord, OutboxSyncState } from './db';

export const SYNC_OPERATION = {
  UPSERT: 'UPSERT',
  DELETE: 'DELETE',
} as const;

export type SyncOperationType = (typeof SYNC_OPERATION)[keyof typeof SYNC_OPERATION];

export interface OutboxMutationParams {
  clinicId: string;
  entityType: string;
  entityId: string;
  operation: SyncOperationType;
  payloadJson: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface OutboxRecordShape {
  id: string;
  clinicId: string;
  entityType: string;
  entityId: string;
  operation: string;
  payloadJson: string;
  idempotencyKey: string;
  createdAt: string;
}

export interface MedicalHistoryOutboxPayload {
  patientId: string;
  revisionId: string;
  category?: string;
  expectedCurrentRevisionId?: string;
  status: string;
  onsetDate?: string;
  occurrenceDate?: string;
  resolvedDate?: string;
  details: Record<string, unknown>;
  notes?: string;
  sourceEncounterId?: string;
}

export function buildMedicalHistoryOutboxPayload(
  payload: MedicalHistoryOutboxPayload,
): Record<string, unknown> {
  return {
    patientId: payload.patientId,
    revisionId: payload.revisionId,
    ...(payload.category ? { category: payload.category } : {}),
    ...(payload.expectedCurrentRevisionId
      ? { expectedCurrentRevisionId: payload.expectedCurrentRevisionId }
      : {}),
    status: payload.status,
    ...(payload.onsetDate ? { onsetDate: payload.onsetDate } : {}),
    ...(payload.occurrenceDate ? { occurrenceDate: payload.occurrenceDate } : {}),
    ...(payload.resolvedDate ? { resolvedDate: payload.resolvedDate } : {}),
    details: payload.details,
    ...(payload.notes ? { notes: payload.notes } : {}),
    ...(payload.sourceEncounterId ? { sourceEncounterId: payload.sourceEncounterId } : {}),
  };
}

function withoutUndefined(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

export function buildMedicationRevisionOutboxPayload(
  payload: Record<string, unknown> & { patientId: string; revisionId: string },
) {
  return withoutUndefined(payload);
}

export function buildMedicationReconciliationOutboxPayload(
  payload: Record<string, unknown> & { patientId: string; outcome: string; items: unknown[] },
) {
  return withoutUndefined(payload);
}

export function buildPharmacyRevisionOutboxPayload(
  payload: Record<string, unknown> & { patientId: string; revisionId: string },
) {
  return withoutUndefined(payload);
}

export function buildPharmacyPreferenceOutboxPayload(
  payload: Record<string, unknown> & { patientId: string; action: 'SET' | 'END' },
) {
  return withoutUndefined(payload);
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Pure helper that builds an outbox mutation object.
 * Does not write to IndexedDB.
 */
export function buildOutboxMutation(params: OutboxMutationParams): OutboxRecordShape {
  const id = generateId();
  const idempotencyKey = params.idempotencyKey ?? generateId();
  const createdAt = new Date().toISOString();
  return {
    id,
    clinicId: params.clinicId,
    entityType: params.entityType,
    entityId: params.entityId,
    operation: params.operation,
    payloadJson: JSON.stringify(params.payloadJson),
    idempotencyKey,
    createdAt,
  };
}

/**
 * Enqueues an outbox mutation to IndexedDB.
 * Writes to db.outbox and returns the created record.
 */
export async function enqueueOutboxMutation(
  dbInstance: NkwapaDb,
  params: OutboxMutationParams,
): Promise<OutboxRecordShape> {
  const record = buildOutboxMutation(params);
  await dbInstance.outbox.add(record);
  return record;
}

/** A row written before sync states existed has never been refused, so it is pending. */
export function outboxSyncState(row: Pick<OutboxRecord, 'syncState'>): OutboxSyncState {
  return row.syncState ?? 'pending';
}

/**
 * Whether a refusal needs a person before the change can go anywhere.
 *
 * A conflict always does: the server's copy disagrees with this device's, and only a clinician
 * can say which is right. So does any refusal the server does not explicitly call retryable; an
 * older server that omits the flag must not have its silence read as optimism.
 */
export function isBlockingFailure(failure: Pick<OutboxFailure, 'status' | 'retryable'>): boolean {
  return failure.status === 'CONFLICT' || failure.retryable !== true;
}

/** The outbox fields that record one refused attempt. */
export function outboxFailureUpdate(
  row: Pick<OutboxRecord, 'attempts'>,
  failure: Omit<OutboxFailure, 'at'>,
  at: string = new Date().toISOString(),
): Pick<OutboxRecord, 'syncState' | 'attempts' | 'lastAttemptAt' | 'lastFailure'> {
  return {
    syncState: isBlockingFailure(failure) ? 'blocked' : 'retrying',
    attempts: (row.attempts ?? 0) + 1,
    lastAttemptAt: at,
    lastFailure: { ...failure, at },
  };
}
