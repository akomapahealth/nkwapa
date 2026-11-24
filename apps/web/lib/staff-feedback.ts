import type { NkwapaDb } from './db';
import { apiFetch, readApiError, type GetToken } from './api';
import { enqueueOutboxMutation, generateClientId, SYNC_OPERATION } from './outbox';

/**
 * "Report a problem" (#422). Every report goes through the outbox, online or not, so it sends the
 * moment there is a connection and a retry never stores it twice.
 */
export const STAFF_FEEDBACK_ENTITY = 'staff_feedback';
export const STAFF_FEEDBACK_MAX_TEXT = 500;

export const STAFF_FEEDBACK_CATEGORIES = [
  { value: 'NOT_SAVED', label: 'Something did not save' },
  { value: 'ERROR_MESSAGE', label: 'Error message' },
  { value: 'SLOW', label: 'Slow or frozen' },
  { value: 'CONFUSING', label: 'Confusing' },
  { value: 'WRONG_INFO', label: 'Wrong information shown' },
  { value: 'OTHER', label: 'Other' },
] as const;

export type StaffFeedbackCategory = (typeof STAFF_FEEDBACK_CATEGORIES)[number]['value'];

export function staffFeedbackCategoryLabel(value: string): string {
  return STAFF_FEEDBACK_CATEGORIES.find((option) => option.value === value)?.label ?? value;
}

/** The page without its ids, query or hash, so the route names a screen and never a patient. */
export function maskRoute(pathname: string): string {
  const path = pathname.split(/[?#]/)[0] || '/';
  return (
    path
      .split('/')
      .map((segment) => (/\d/.test(segment) ? ':id' : segment))
      .join('/') || '/'
  );
}

export interface StaffFeedbackContext {
  route: string;
  role: string;
  version: string | null;
  online: boolean;
  outboxSize: number;
  occurredAt: string;
}

export interface StaffFeedbackReport {
  category: StaffFeedbackCategory;
  text: string;
  stationKind: string | null;
  context: StaffFeedbackContext;
}

/** Queues the report and returns the key that tells whether it has gone. */
export async function queueStaffFeedback(
  dbInstance: NkwapaDb,
  clinicId: string,
  report: StaffFeedbackReport,
): Promise<string> {
  const id = generateClientId();
  const idempotencyKey = `${STAFF_FEEDBACK_ENTITY}:${id}`;
  await enqueueOutboxMutation(dbInstance, {
    clinicId,
    entityType: STAFF_FEEDBACK_ENTITY,
    entityId: id,
    operation: SYNC_OPERATION.UPSERT,
    payloadJson: {
      schemaVersion: 1,
      category: report.category,
      text: report.text.trim() || null,
      stationKind: report.stationKind,
      context: report.context,
    },
    idempotencyKey,
  });
  return idempotencyKey;
}

/** The short commit the server runs, or null offline or when it cannot say. */
export async function fetchAppVersion(): Promise<string | null> {
  try {
    const res = await fetch('/api/version', { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { sha?: string | null };
    return body.sha ? body.sha.slice(0, 7) : null;
  } catch {
    return null;
  }
}

export const STATION_KIND_LABELS: Record<string, string> = {
  INTAKE: 'Registration',
  BLOOD_PRESSURE: 'Blood pressure',
  GLUCOSE: 'Glucose',
  ANTHROPOMETRY: 'Anthropometry',
  EYE: 'Eye',
  REVIEW: 'Review',
  CUSTOM: 'Other station',
};

export interface StaffFeedbackRow {
  id: string;
  category: StaffFeedbackCategory;
  text: string | null;
  stationKind: string | null;
  context: Partial<StaffFeedbackContext>;
  createdAt: string;
  reporter: { id: string; displayName: string };
}

export async function listStaffFeedback(
  clinicId: string,
  getToken: GetToken,
): Promise<StaffFeedbackRow[]> {
  const response = await apiFetch(`/clinics/${encodeURIComponent(clinicId)}/staff-feedback`, {
    getToken,
  });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as StaffFeedbackRow[];
}

/** Rows for the CSV download: one report per line, the columns triage reads. */
export function staffFeedbackCsvRows(rows: readonly StaffFeedbackRow[]) {
  return [
    [
      'Time',
      'Category',
      'Station',
      'Page',
      'Role',
      'App version',
      'Offline',
      'Waiting to sync',
      'Reporter',
      'Description',
    ],
    ...rows.map((row) => [
      row.createdAt,
      staffFeedbackCategoryLabel(row.category),
      row.stationKind ? (STATION_KIND_LABELS[row.stationKind] ?? row.stationKind) : '',
      row.context.route ?? '',
      row.context.role ?? '',
      row.context.version ?? '',
      row.context.online === false ? 'yes' : 'no',
      row.context.outboxSize ?? '',
      row.reporter.displayName,
      row.text ?? '',
    ]),
  ];
}
