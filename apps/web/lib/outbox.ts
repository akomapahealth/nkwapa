import type {
  NkwapaDb,
  OutboxFailure,
  OutboxLocalContext,
  OutboxRecord,
  OutboxSyncState,
} from './db';

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
  localContext?: OutboxLocalContext;
  /** Defaults to the signed-in account (`setOutboxOwner`). */
  owner?: OutboxOwner | null;
}

export interface OutboxOwner {
  userId: string;
  displayName?: string;
}

/**
 * The account every new change is queued under (#162).
 *
 * Set by the sync provider once bootstrap names the signed-in account, cleared when it signs out.
 * Forms queue changes from dozens of places that have no reason to know who is signed in; this is
 * the one place that does. A change queued while nobody is known gets no owner and is held.
 */
let currentOwner: OutboxOwner | null = null;

export function setOutboxOwner(owner: OutboxOwner | null) {
  currentOwner = owner;
}

export function getOutboxOwner(): OutboxOwner | null {
  return currentOwner;
}

/**
 * Counts every change that gave the outbox something new to send: a row queued, retried or
 * claimed. Sync's own bookkeeping (recording a failure, removing an applied row) does not count.
 *
 * Forms queue a change and, in many places, leave sending it to whatever syncs next. When that was
 * a pass already running, the pass had read the outbox before the row landed, finished cleanly, and
 * nothing synced again until an unrelated trigger: a prescription queued as the connection came
 * back sat unsent. The revision lets a running pass see it missed something, and the listeners let
 * the sync provider start a pass when none is running.
 */
let outboxRevision = 0;
const outboxChangeListeners = new Set<(clinicId: string) => void>();

export function currentOutboxRevision(): number {
  return outboxRevision;
}

export function onOutboxChange(listener: (clinicId: string) => void): () => void {
  outboxChangeListeners.add(listener);
  return () => {
    outboxChangeListeners.delete(listener);
  };
}

function markOutboxChanged(clinicId: string) {
  outboxRevision += 1;
  outboxChangeListeners.forEach((listener) => listener(clinicId));
}

/**
 * Names of the clinics the signed-in account can open, set from bootstrap by the sync provider.
 * Each new change records its clinic's name (#163), so it can still be named after the account
 * loses that clinic and bootstrap stops listing it.
 */
let knownClinicNames = new Map<string, string>();

export function setOutboxClinicNames(
  clinics: ReadonlyArray<{ clinicId: string; clinicName: string }>,
) {
  knownClinicNames = new Map(clinics.map((clinic) => [clinic.clinicId, clinic.clinicName]));
}

/** Whether `userId` may send this change: only the account that queued it ever does. */
export function isOwnedBy(
  row: Pick<OutboxRecord, 'ownerUserId'>,
  userId: string | null | undefined,
) {
  return Boolean(userId) && row.ownerUserId === userId;
}

export interface OutboxRecordShape {
  id: string;
  clinicId: string;
  clinicName?: string;
  entityType: string;
  entityId: string;
  operation: string;
  payloadJson: string;
  idempotencyKey: string;
  createdAt: string;
  localContext?: OutboxLocalContext;
  ownerUserId?: string;
  ownerName?: string;
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

/** A v4 UUID for a record created on this device, so the server and the outbox share one id. */
export function generateClientId(): string {
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
  const id = generateClientId();
  const idempotencyKey = params.idempotencyKey ?? generateClientId();
  const createdAt = new Date().toISOString();
  const owner = params.owner === undefined ? currentOwner : params.owner;
  const clinicName = knownClinicNames.get(params.clinicId);
  return {
    id,
    clinicId: params.clinicId,
    entityType: params.entityType,
    entityId: params.entityId,
    operation: params.operation,
    payloadJson: JSON.stringify(params.payloadJson),
    idempotencyKey,
    createdAt,
    ...(params.localContext ? { localContext: params.localContext } : {}),
    ...(owner ? { ownerUserId: owner.userId } : {}),
    ...(owner?.displayName ? { ownerName: owner.displayName } : {}),
    ...(clinicName ? { clinicName } : {}),
  };
}

/**
 * Enqueues an outbox mutation to IndexedDB.
 * Writes to db.outbox and returns the created record.
 *
 * A caller that names its own idempotency key is saying "this is one action", so a second enqueue
 * under the same key returns the row already queued instead of adding another. A double tap on a
 * check-in button would otherwise queue two rows that the server has to deduplicate.
 */
export async function enqueueOutboxMutation(
  dbInstance: NkwapaDb,
  params: OutboxMutationParams,
): Promise<OutboxRecordShape> {
  if (params.idempotencyKey) {
    // Matched per clinic, as the server's own idempotency record is. A key that happened to be
    // queued at another clinic used to swallow this one, and the change never reached anyone.
    // And per owner: another account's queued action is theirs to send, never this one's to reuse.
    const record = buildOutboxMutation(params);
    const queued = (
      await dbInstance.outbox.where('idempotencyKey').equals(params.idempotencyKey).toArray()
    ).find((row) => row.clinicId === params.clinicId && row.ownerUserId === record.ownerUserId);
    if (queued) return queued;
    await dbInstance.outbox.add(record);
    markOutboxChanged(record.clinicId);
    return record;
  }
  const record = buildOutboxMutation(params);
  await dbInstance.outbox.add(record);
  markOutboxChanged(record.clinicId);
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

/**
 * Put a blocked or retrying change back in line for the next pass. The last failure is kept so
 * the card can still say what happened until the server answers again.
 */
export async function retryOutboxMutation(dbInstance: NkwapaDb, id: string): Promise<void> {
  await dbInstance.outbox.update(id, { syncState: 'pending' });
  const row = await dbInstance.outbox.get(id);
  if (row) markOutboxChanged(row.clinicId);
}

/**
 * Take a change that has no recorded owner as your own, so it can be sent (#162).
 *
 * Only for rows queued before owners were recorded: nobody can say whose they were, so the account
 * that claims them is the one the server will name. A row another account owns is never claimable;
 * that account signs back in to send it, or it is discarded.
 */
export async function claimUnownedOutboxMutation(
  dbInstance: NkwapaDb,
  id: string,
  owner: OutboxOwner,
): Promise<boolean> {
  const row = await dbInstance.outbox.get(id);
  if (!row || row.ownerUserId) return false;
  await dbInstance.outbox.update(id, {
    ownerUserId: owner.userId,
    ...(owner.displayName ? { ownerName: owner.displayName } : {}),
    syncState: 'pending',
  });
  markOutboxChanged(row.clinicId);
  return true;
}

/**
 * The local store each outbox entity is optimistically written to. Only one-row-per-id entities
 * are listed; the rest are corrected by the full pull that follows a discard.
 */
const LOCAL_TABLE_BY_ENTITY: Partial<Record<string, string>> = {
  patient: 'patients',
  encounter: 'encounters',
  vitals: 'vitals',
  encounter_vitals_bundle: 'vitals',
  diabetes_screening: 'diabetes_screenings',
  diabetes_glucose_reading: 'diabetes_screenings',
  hypertension_assessment: 'hypertension_assessments',
  care_plan: 'care_plans',
  patient_consent: 'patient_consents',
  prescription: 'prescriptions',
};

/**
 * Throw away this device's queued copy of a change. Server data is never touched.
 *
 * Forms write optimistically, so the device may still be showing the discarded values. The local
 * row is removed and the pull cursor reset, so the next sync restores whatever the server holds;
 * a row that never reached the server simply stays gone. The caller should sync straight after,
 * which is why the sync center only offers this while online.
 */
export async function discardOutboxMutation(
  dbInstance: NkwapaDb,
  row: Pick<OutboxRecord, 'id' | 'clinicId' | 'entityType' | 'entityId'>,
): Promise<void> {
  await dbInstance.outbox.delete(row.id);
  const localTable = LOCAL_TABLE_BY_ENTITY[row.entityType];
  if (localTable) {
    await dbInstance.table(localTable).delete(row.entityId);
  }
  await dbInstance.sync_state.delete(row.clinicId);
}
