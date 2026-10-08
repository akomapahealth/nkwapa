import {
  SYNC_CONFLICT_CODES,
  isKnownSyncConflictCode,
  syncConflictCategory,
  type SyncConflictCategory,
  type SyncConflictCode,
} from '@nkwapa/db/sync-conflicts';
import type { OutboxFailure, OutboxRecord } from './db';
import { outboxSyncState } from './outbox';

/**
 * Plain-language copy and safe recovery actions for a queued change the server refused.
 *
 * The codes and their recovery family come from the shared catalog, so a code the API starts
 * emitting has a category here before anyone writes copy for it. Copy is written per category and
 * overridden only where a specific code has a better next step. Nothing on screen shows the code
 * itself; that lives in the technical details for support.
 */

export type SyncRecoveryAction =
  | 'retry'
  | 'open-patient'
  | 'open-canonical-patient'
  | 'review-duplicates'
  | 'open-encounter'
  | 'open-ops-board'
  | 'discard';

export type SyncFailureTone = 'danger' | 'warning' | 'info';

interface SyncFailureCopy {
  title: string;
  explanation: string;
  nextStep: string;
  tone: SyncFailureTone;
}

const CATEGORY_COPY: Record<SyncConflictCategory, SyncFailureCopy> = {
  patient: {
    title: 'This patient may already have a chart',
    explanation: 'The server matched this change to a different patient chart.',
    nextStep: 'Open the existing chart and re-enter anything that is missing there.',
    tone: 'danger',
  },
  locked: {
    title: 'The record is locked',
    explanation: 'This record was finalized after the change was saved on this device.',
    nextStep: 'Open the record to see what was kept. Add anything missing as a new entry.',
    tone: 'danger',
  },
  stale: {
    title: 'Someone else changed this record',
    explanation:
      'The record was updated on the server after this device last synced, so this change no longer applies cleanly.',
    nextStep: 'Open the record, check the latest version, and make the change again if needed.',
    tone: 'warning',
  },
  validation: {
    title: 'The server could not accept this change',
    explanation: 'Some of what was entered does not pass the server’s checks.',
    nextStep: 'Open the record and enter the change again, then discard this copy.',
    tone: 'danger',
  },
  permission: {
    title: 'Your account cannot make this change here',
    explanation: 'This change needs a role you do not have at this clinic.',
    nextStep:
      'Ask a clinic manager to check your role. It will sync automatically once access is granted.',
    tone: 'warning',
  },
  unexpected: {
    title: 'This change is waiting to sync',
    explanation: 'The server could not save it yet. Nothing has been lost.',
    nextStep: 'It will be retried automatically. Retry now if you have just fixed a connection.',
    tone: 'info',
  },
};

const CODE_COPY: Partial<Record<SyncConflictCode, Partial<SyncFailureCopy>>> = {
  DUPLICATE_NATIONAL_ID: {
    title: 'Another chart already uses this national ID',
    explanation:
      'The server already has a chart with this national ID, so this change was not applied to avoid creating a duplicate.',
    nextStep:
      'Open the existing chart to check it is the same person. If the charts need combining, send them to duplicate review.',
  },
  PATIENT_MERGED: {
    title: 'This chart was merged into another chart',
    explanation:
      'A manager combined this patient’s charts while this device was offline. The old chart no longer accepts changes.',
    nextStep: 'Open the current chart and re-enter this change there, then discard this copy.',
  },
  PATIENT_NATIONAL_ID_REQUIRED: {
    title: 'This new patient needs a national ID',
    explanation: 'A chart cannot be created without a national ID.',
    nextStep: 'Register the patient again while online, then discard this copy.',
    tone: 'danger',
  },
  UNSUPPORTED_STATUS_TRANSITION: {
    title: 'This step has to be done online',
    explanation: 'Finalizing or submitting a visit for review cannot be done from an offline save.',
    nextStep: 'Open the visit while online and complete the step there.',
  },
  MEDICAL_HISTORY_TERMINAL: {
    title: 'This history entry is closed',
    explanation: 'The entry was marked as entered in error or closed on the server.',
    nextStep: 'Open the chart and add a new history entry if something still needs recording.',
  },
  RECORD_NOT_FOUND: {
    title: 'Waiting for a related record',
    explanation:
      'This change belongs to a patient or visit the server does not have yet, usually because it is still queued.',
    nextStep:
      'Resolve anything under “Needs attention” first. This change will sync once the related record does.',
  },
  CLINIC_MISMATCH: {
    title: 'This change belongs to a different clinic',
    explanation: 'It was saved while another clinic was selected.',
    nextStep: 'Switch to the clinic it was recorded at and sync again, or discard it.',
  },
  DELETE_NOT_SUPPORTED: {
    title: 'This record cannot be removed',
    explanation: 'Records of this kind are corrected, not deleted.',
    nextStep: 'Open the record and add a correction instead, then discard this copy.',
  },
  ALLERGY_REVIEW_REQUIRED: {
    title: 'Allergies need review first',
    explanation: 'A prescription cannot sync until the patient’s allergies have been reviewed.',
    nextStep: 'Open the chart, review allergies, then prescribe again.',
  },
  SHIFT_ALREADY_ACTIVE: {
    title: 'You already have a shift running',
    explanation:
      'A shift for you was started at this clinic, probably on another device, before this one could sync.',
    nextStep:
      'Check the Today board. If that shift is yours, discard this copy; if it should not be running, end it and retry.',
  },
  SHIFT_ALREADY_CLOSED: {
    title: 'This shift has already ended',
    explanation: 'Someone ended the shift before this change reached the server.',
    nextStep: 'Nothing is lost. Discard this copy.',
  },
  SHIFT_NOT_FOUND: {
    title: 'Waiting for the start of this shift',
    explanation:
      'Ending this shift is queued behind starting it, and the start has not reached the server yet.',
    nextStep: 'Resolve the shift start under “Needs attention” first. This will sync once it does.',
  },
  PATIENT_ALREADY_CHECKED_IN: {
    title: 'This patient is already checked in today',
    explanation:
      'Someone checked the patient in before this device synced, so a second check-in was not created.',
    nextStep: 'Find the patient on the Today board. If they are in the queue, discard this copy.',
  },
  OPS_REPLAY_EXPIRED: {
    title: 'This was saved on an earlier clinic day',
    explanation:
      'Check-ins and shift changes only sync on the day they happened, so the board stays accurate.',
    nextStep: 'Record it again if it still matters today, then discard this copy.',
  },
  INVALID_OPS_TIME_ORDER: {
    title: 'The time on this change does not add up',
    explanation: 'The device clock may be wrong, or the shift would end before it started.',
    nextStep:
      'Check the device’s date and time, then record the change again and discard this copy.',
  },
};

const ACTION_LABELS: Record<SyncRecoveryAction, string> = {
  retry: 'Retry',
  'open-patient': 'Open chart',
  'open-canonical-patient': 'Open existing chart',
  'review-duplicates': 'Review duplicates',
  'open-encounter': 'Open visit',
  'open-ops-board': 'Open Today board',
  discard: 'Discard',
};

export function syncRecoveryActionLabel(action: SyncRecoveryAction): string {
  return ACTION_LABELS[action];
}

/** What each outbox entity is, in the words used elsewhere in the product. */
const ENTITY_LABELS: Record<string, string> = {
  patient: 'Patient details',
  encounter: 'Visit',
  vitals: 'Vital signs',
  encounter_vitals_bundle: 'Vital signs',
  diabetes_screening: 'Diabetes screening',
  diabetes_glucose_reading: 'Glucose reading',
  hypertension_assessment: 'Hypertension assessment',
  // Sealed: the sync center can say what it is and for which visit, never what it says (#131).
  clinician_plan: 'Clinician plan (sealed)',
  encounter_medication_adherence: 'Medication adherence',
  care_plan: 'Care plan',
  patient_consent: 'Consent',
  prescription: 'Prescription',
  medical_history_revision: 'Medical history entry',
  patient_medication_revision: 'Medication list change',
  medication_reconciliation: 'Medication reconciliation',
  patient_pharmacy_revision: 'Pharmacy details',
  patient_pharmacy_preference: 'Preferred pharmacy',
  shift_check_in: 'Shift start',
  shift_check_out: 'Shift end',
  patient_check_in: 'Patient check-in',
};

export function syncEntityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? 'Offline change';
}

export function parseOutboxPayload(
  row: Pick<OutboxRecord, 'payloadJson'>,
): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(row.payloadJson);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function stringField(source: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = source?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** The patient a queued change is about, when the change itself says. */
export function outboxPatientId(
  row: Pick<OutboxRecord, 'entityType' | 'entityId' | 'payloadJson'>,
): string | undefined {
  if (row.entityType === 'patient') return row.entityId;
  return stringField(parseOutboxPayload(row), 'patientId');
}

/** The visit a queued change is about, when the change itself says. */
export function outboxEncounterId(
  row: Pick<OutboxRecord, 'entityType' | 'entityId' | 'payloadJson'>,
): string | undefined {
  if (row.entityType === 'encounter') return row.entityId;
  return stringField(parseOutboxPayload(row), 'encounterId');
}

/** What this account may open from the sync center, decided once from its permissions. */
export interface SyncRecoveryAccess {
  /** Holds PATIENT.DUPLICATE.REVIEW at this clinic. */
  canReviewDuplicates: boolean;
  /**
   * Where this account sees clinic operations: the Today board, or its own assignments. `null`
   * when it has neither, so no link is offered. Defaults to the Today board.
   */
  opsBoardHref?: string | null;
}

export interface SyncFailureContext extends SyncRecoveryAccess {
  clinicId: string;
  /** The patient resolved by the caller when the change only names a visit. */
  patientId?: string;
}

export interface SyncFailureDescription extends SyncFailureCopy {
  code: string;
  category: SyncConflictCategory;
  /** The server’s own redacted wording, when it adds something the copy does not. */
  serverDetail?: string;
  /** Primary action first. Only actions that are safe for this failure are listed. */
  actions: SyncRecoveryAction[];
  /** Where this failure words an action better than the default label. */
  actionLabels: Partial<Record<SyncRecoveryAction, string>>;
  patientHref?: string;
  canonicalPatientHref?: string;
  encounterHref?: string;
  duplicatesHref?: string;
  opsBoardHref?: string;
}

export const DUPLICATE_REVIEW_HREF = '/admin/duplicates';
export const TODAY_BOARD_HREF = '/today';

/** Changes whose effect is seen on an operations board rather than on a chart. */
const OPS_BOARD_ENTITIES: ReadonlySet<string> = new Set([
  'shift_check_in',
  'shift_check_out',
  'patient_check_in',
]);

export function patientChartHref(clinicId: string, patientId: string): string {
  return `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}`;
}

export function encounterHref(encounterId: string): string {
  return `/encounters/${encodeURIComponent(encounterId)}`;
}

function serverDetailFor(failure: OutboxFailure | undefined): string | undefined {
  const details = failure?.conflictDetails;
  const fieldErrors = details?.fieldErrors;
  if (Array.isArray(fieldErrors)) {
    const first = fieldErrors.find(
      (entry): entry is { message: string } =>
        Boolean(entry) && typeof (entry as { message?: unknown }).message === 'string',
    );
    if (first?.message) return first.message;
  }
  return stringField(details, 'message');
}

/** Describe a queued change the server refused, or is still retrying. */
export function describeSyncFailure(
  row: Pick<
    OutboxRecord,
    'entityType' | 'entityId' | 'payloadJson' | 'syncState' | 'lastFailure' | 'operation'
  >,
  context: SyncFailureContext,
): SyncFailureDescription {
  const failure = row.lastFailure;
  const code = failure?.conflictType ?? 'APPLICATION_ERROR';
  const category = syncConflictCategory(code, failure?.status);
  const copy = {
    ...CATEGORY_COPY[category],
    ...(isKnownSyncConflictCode(code) ? CODE_COPY[code] : undefined),
  };
  const state = outboxSyncState(row);

  const canonicalPatientId =
    stringField(failure?.conflictDetails, 'canonicalPatientId') ??
    stringField(failure?.conflictDetails, 'existingPatientId');
  const patientId = outboxPatientId(row) ?? context.patientId;
  const encounterId = outboxEncounterId(row);
  // A merged chart no longer opens as itself, so its own link is withheld in favour of the one
  // that survived.
  const targetIsRetired = code === 'PATIENT_MERGED';

  const description: SyncFailureDescription = {
    ...copy,
    code,
    category,
    serverDetail: category === 'validation' ? serverDetailFor(failure) : undefined,
    actions: [],
    // After a merge the surviving chart is the patient's only chart, not an "existing" one.
    actionLabels: targetIsRetired ? { 'open-canonical-patient': 'Open current chart' } : {},
  };

  if (canonicalPatientId) {
    description.canonicalPatientHref = patientChartHref(context.clinicId, canonicalPatientId);
    description.actions.push('open-canonical-patient');
  }
  if (code === 'DUPLICATE_NATIONAL_ID' && context.canReviewDuplicates) {
    description.duplicatesHref = DUPLICATE_REVIEW_HREF;
    description.actions.push('review-duplicates');
  }
  const opsBoardHref = context.opsBoardHref === undefined ? TODAY_BOARD_HREF : context.opsBoardHref;
  if (OPS_BOARD_ENTITIES.has(row.entityType) && opsBoardHref) {
    description.opsBoardHref = opsBoardHref;
    description.actions.push('open-ops-board');
    if (opsBoardHref !== TODAY_BOARD_HREF) {
      description.actionLabels['open-ops-board'] = 'Open my assignments';
    }
  }
  if (encounterId && category !== 'patient') {
    description.encounterHref = encounterHref(encounterId);
    description.actions.push('open-encounter');
  }
  // A patient-identity refusal of the chart itself means that chart is not the one to open: it is
  // retired, or it is a new chart the server declined to create.
  const ownChartIsSuspect = category === 'patient' && row.entityType === 'patient';
  if (patientId && !targetIsRetired && patientId !== canonicalPatientId && !ownChartIsSuspect) {
    description.patientHref = patientChartHref(context.clinicId, patientId);
    description.actions.push('open-patient');
  }

  // Retrying is offered only where it can change the answer. A deterministic conflict would come
  // back the same, and offering the button anyway teaches people that sync buttons do nothing.
  // For a blocked change it goes after the record links, because looking at the record is the
  // better first move and Retry only helps once something has changed.
  const deterministic = isKnownSyncConflictCode(code) && SYNC_CONFLICT_CODES[code].deterministic;
  if (state === 'retrying') description.actions.unshift('retry');
  else if (state === 'blocked' && !deterministic) description.actions.push('retry');
  description.actions.push('discard');
  return description;
}

/** Why a whole sync pass failed, before any single change was answered. */
export interface SyncTransportFailure {
  message: string;
  /** Raw server response or error text, for the support view only. */
  detail?: string;
}

function parseErrorBody(body: string | undefined): { code?: string; message?: string } {
  if (!body) return {};
  try {
    const parsed = JSON.parse(body) as { code?: unknown; message?: unknown };
    return {
      code: typeof parsed.code === 'string' ? parsed.code : undefined,
      message: typeof parsed.message === 'string' ? parsed.message : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Describe a failed push or pull. `status` is null when the request never reached the server.
 *
 * The raw response body used to be shown to the clinician verbatim, JSON braces and all.
 */
export function describeSyncTransportFailure(
  status: number | null,
  body?: string,
): SyncTransportFailure {
  const { code } = parseErrorBody(body);
  const detail = body?.slice(0, 2000) || undefined;
  const saved = 'Your changes are saved on this device.';

  if (status === null) {
    return { message: `Could not reach the server. ${saved}`, detail };
  }
  if (status === 401) {
    return { message: `Your session has expired. Sign in again to sync. ${saved}`, detail };
  }
  if (status === 403) {
    return { message: `This account cannot sync at this clinic. ${saved}`, detail };
  }
  if (status === 429 || code === 'RATE_LIMITED') {
    return { message: `Sync is paused for a minute to protect the server. ${saved}`, detail };
  }
  if (code === 'VALIDATION_ERROR') {
    return {
      message: `This version of the app sent changes the server could not read. Refresh the page, then sync again. ${saved}`,
      detail,
    };
  }
  if (status >= 500) {
    return {
      message: `The server had a problem. ${saved} Sync will try again shortly.`,
      detail,
    };
  }
  return { message: `Sync did not finish. ${saved}`, detail };
}
