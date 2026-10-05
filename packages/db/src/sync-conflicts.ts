/**
 * Every code an offline sync push can report for a single mutation.
 *
 * One definition, consumed by both sides: the API decides from it which outcomes may be cached
 * against an idempotency key, and the web app decides from it what to tell the clinician and which
 * recovery actions are safe to offer. Before this catalog the API kept its own list of terminal
 * codes and the client knew none of them, so a device could only show the raw server message.
 *
 * `deterministic` means replaying the identical mutation is guaranteed to reach the same answer,
 * because the server state that caused it cannot change back: a finalized encounter stays
 * finalized, a merged chart stays merged. Only those outcomes may short-circuit a replay.
 *
 * `category` is the recovery family. The client words its messages per category and overrides
 * that copy only where a specific code has a more useful next step.
 */

export const SYNC_CONFLICT_CATEGORIES = [
  /** The change is about a patient identity: a duplicate chart, a merged chart. */
  'patient',
  /** The record the change targets is locked, usually a finalized encounter. */
  'locked',
  /** Someone else changed the record on the server after this device last saw it. */
  'stale',
  /** The server will not accept the content as written. */
  'validation',
  /** This account may not make the change at this clinic. */
  'permission',
  /** Something unexpected; the server may accept the same change later. */
  'unexpected',
] as const;

export type SyncConflictCategory = (typeof SYNC_CONFLICT_CATEGORIES)[number];

export interface SyncConflictCodeDefinition {
  category: SyncConflictCategory;
  deterministic: boolean;
  /**
   * Whether replaying the identical mutation could still succeed without anyone touching it.
   *
   * Deterministic conflicts never can. Neither can content the server refuses: the queued payload
   * does not change on its own, so re-sending it every pass only hides the problem behind a
   * counter that never clears. A permission, a missing reference or an unexpected failure can
   * resolve itself.
   */
  retryable: boolean;
}

const code = (
  category: SyncConflictCategory,
  options: { deterministic?: boolean; retryable?: boolean } = {},
): SyncConflictCodeDefinition => {
  const deterministic = options.deterministic ?? false;
  return {
    category,
    deterministic,
    retryable: options.retryable ?? (!deterministic && category !== 'validation'),
  };
};
const terminal = { deterministic: true } as const;

export const SYNC_CONFLICT_CODES = {
  // Patient identity
  DUPLICATE_NATIONAL_ID: code('patient', terminal),
  PATIENT_MERGED: code('patient', terminal),
  PATIENT_NATIONAL_ID_REQUIRED: code('patient', { retryable: false }),

  // Locked records
  CONFLICT_FINALIZED: code('locked', terminal),
  UNSUPPORTED_STATUS_TRANSITION: code('locked', terminal),
  MEDICAL_HISTORY_TERMINAL: code('locked'),

  // Changed elsewhere since this device last synced
  MEDICAL_HISTORY_CONFLICT: code('stale', terminal),
  STALE_MEDICAL_HISTORY_REVISION: code('stale'),
  MEDICAL_HISTORY_MISSING_CURRENT_REVISION: code('stale'),
  MEDICAL_HISTORY_RECORD_EXISTS: code('stale'),
  MEDICATION_REVISION_CONFLICT: code('stale'),
  MEDICATION_LIST_CONFLICT: code('stale'),
  MEDICATION_ID_CONFLICT: code('stale'),
  PHARMACY_REVISION_CONFLICT: code('stale'),
  PHARMACY_PREFERENCE_CONFLICT: code('stale'),
  ACTIVE_ALLERGIES_PREVENT_NKA: code('stale'),
  CURRENT_MEDICATIONS_PREVENT_NO_KNOWN: code('stale'),
  APPLICATION_CONFLICT: code('stale'),
  // Clinic operations. Neither clears by itself in a way that should replay silently: re-sending a
  // check-in the moment the other shift closes would start a shift nobody asked for.
  SHIFT_ALREADY_ACTIVE: code('stale', { retryable: false }),
  PATIENT_ALREADY_CHECKED_IN: code('stale', { retryable: false }),

  // Content the server will not accept
  VALIDATION_ERROR: code('validation'),
  APPLICATION_REJECTED: code('validation'),
  DELETE_NOT_SUPPORTED: code('validation'),
  CLINIC_MISMATCH: code('validation'),
  ALLERGY_REVIEW_REQUIRED: code('validation'),
  AMBIGUOUS_SYMPTOMS_CONTRACT: code('validation'),
  COLLECTION_TIME_IN_FUTURE: code('validation'),
  INVALID_COLLECTION_TIME: code('validation'),
  DRUG_CLINIC_MISMATCH: code('validation'),
  FUTURE_PREFERENCE_NOT_SUPPORTED: code('validation'),
  INVALID_CLINICAL_DATE_ORDER: code('validation'),
  INVALID_MEDICAL_HISTORY_DETAILS: code('validation'),
  INVALID_MEDICATION_DATE_ORDER: code('validation'),
  INVALID_PHARMACY_PHONE: code('validation'),
  INVALID_PREFERENCE_END: code('validation'),
  INVALID_SOURCE_ENCOUNTER: code('validation'),
  NO_CURRENT_MEDICATIONS: code('validation'),
  RESOLVED_DATE_REQUIRED: code('validation'),
  SOURCE_ENCOUNTER_MISMATCH: code('validation'),
  // A queued clinic-operations action is only replayed on the clinic day it happened; the day
  // cannot come back, so no replay will ever be accepted.
  OPS_REPLAY_EXPIRED: code('validation', terminal),
  INVALID_OPS_TIME_ORDER: code('validation'),

  // Access
  FORBIDDEN: code('permission'),
  CLASSIFICATION_OVERRIDE_FORBIDDEN: code('permission'),

  // Everything else. A missing reference stays retryable: the patient or encounter it points at
  // may simply not have reached the server yet.
  RECORD_NOT_FOUND: code('unexpected'),
  // A check-out queued after an offline check-in can arrive before that check-in has drained.
  SHIFT_NOT_FOUND: code('unexpected'),
  APPLICATION_ERROR: code('unexpected'),
} as const satisfies Record<string, SyncConflictCodeDefinition>;

export type SyncConflictCode = keyof typeof SYNC_CONFLICT_CODES;

export function isKnownSyncConflictCode(value: unknown): value is SyncConflictCode {
  return (
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(SYNC_CONFLICT_CODES, value)
  );
}

/** The codes a replay can never change, and so the only ones an idempotency key may cache. */
export const DETERMINISTIC_SYNC_CONFLICT_CODES: ReadonlySet<SyncConflictCode> = new Set(
  (Object.keys(SYNC_CONFLICT_CODES) as SyncConflictCode[]).filter(
    (key) => SYNC_CONFLICT_CODES[key].deterministic,
  ),
);

/**
 * The recovery family for any code, including one this build does not know yet.
 *
 * An older client talking to a newer server must still say something useful, so an unknown code
 * falls back on what the HTTP-level status already told us.
 */
export function syncConflictCategory(
  conflictType: string | null | undefined,
  status?: string,
): SyncConflictCategory {
  if (isKnownSyncConflictCode(conflictType)) return SYNC_CONFLICT_CODES[conflictType].category;
  return status === 'CONFLICT' ? 'stale' : 'unexpected';
}

/**
 * The retry hint for any outcome, including a code this build does not know yet.
 *
 * An unknown code falls back on its category, so a newer server's validation refusal is still not
 * re-sent forever by an older client.
 */
export function isRetryableSyncOutcome(
  status: string,
  conflictType: string | null | undefined,
): boolean {
  if (status === 'APPLIED') return false;
  if (isKnownSyncConflictCode(conflictType)) return SYNC_CONFLICT_CODES[conflictType].retryable;
  return syncConflictCategory(conflictType, status) !== 'validation';
}
