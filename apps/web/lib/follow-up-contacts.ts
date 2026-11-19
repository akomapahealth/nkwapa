import type { FollowUpTier } from '@nkwapa/db/follow-up-stratification';
import type { HypertensionSymptomValue } from '@nkwapa/db/hypertension-interview';
import type { DiabetesUrgentSymptomValue } from '@nkwapa/db/diabetes-interview';
import type { MedicationAdherenceLevelValue } from '@nkwapa/db/clinical-vocabulary';
import { apiFetch, type GetToken } from '@/lib/api';

/*
  Follow-up contacts (#338): the worklist, one contact for the record sheet, and a patient's
  contact history. Recording a call works offline too; see follow-up-offline.ts.
*/

export const WORKLIST_TABS = ['today', 'overdue', 'week', 'done'] as const;
export type WorklistTab = (typeof WORKLIST_TABS)[number];
export const WORKLIST_TAB_LABELS: Record<WorklistTab, string> = {
  today: 'Due today',
  overdue: 'Overdue',
  week: 'This week',
  done: 'Done',
};

export type ContactMode = 'IN_PERSON' | 'PHONE' | 'SMS' | 'WHATSAPP' | 'VIDEO' | 'HOME_VISIT';
export const CONTACT_MODE_LABELS: Record<ContactMode, string> = {
  IN_PERSON: 'Clinic visit',
  PHONE: 'Phone call',
  SMS: 'SMS',
  WHATSAPP: 'WhatsApp',
  VIDEO: 'Video call',
  HOME_VISIT: 'Home visit',
};
/** The ways staff can reach a patient from the sheet. A clinic visit is recorded by the visit. */
export const ATTEMPT_MODES: ContactMode[] = ['PHONE', 'WHATSAPP', 'SMS', 'VIDEO', 'HOME_VISIT'];

export type ContactPurpose =
  | 'ROUTINE'
  | 'URGENT_CONFIRMATION'
  | 'CONFIRM_READING'
  | 'REMINDER_BEFORE_VISIT'
  | 'ADHERENCE_REFILL'
  | 'RESCREEN'
  | 'REFERRAL_CONFIRMATION';
export const CONTACT_PURPOSE_LABELS: Record<ContactPurpose, string> = {
  ROUTINE: 'Routine check',
  URGENT_CONFIRMATION: 'Confirm they reached care',
  CONFIRM_READING: 'Repeat the raised reading',
  REMINDER_BEFORE_VISIT: 'Reminder before the visit',
  ADHERENCE_REFILL: 'Medicines and refill',
  RESCREEN: 'Rescreen',
  REFERRAL_CONFIRMATION: 'Confirm the referral was kept',
};

export type ContactOutcome =
  | 'ATTEMPTED'
  | 'REACHED'
  | 'DECLINED'
  | 'AGREED_TO_RETURN'
  | 'RETURNED'
  | 'REFERRED'
  | 'REFERRAL_CONFIRMED';
export const CONTACT_OUTCOME_LABELS: Record<ContactOutcome, string> = {
  ATTEMPTED: 'Not reached',
  REACHED: 'Reached',
  DECLINED: 'Declined follow-up',
  AGREED_TO_RETURN: 'Agreed to come in',
  RETURNED: 'Came back',
  REFERRED: 'Referred',
  REFERRAL_CONFIRMED: 'Reached the referral',
};

export type NotReachedReason =
  | 'NO_ANSWER'
  | 'WRONG_NUMBER'
  | 'SWITCHED_OFF'
  | 'UNAVAILABLE'
  | 'OTHER';
export const NOT_REACHED_LABELS: Record<NotReachedReason, string> = {
  NO_ANSWER: 'No answer',
  SWITCHED_OFF: 'Phone off',
  WRONG_NUMBER: 'Wrong number',
  UNAVAILABLE: 'Not available',
  OTHER: 'Other',
};

export type CancelReason = 'NOT_NEEDED' | 'MOVED' | 'OPTED_OUT' | 'DECEASED';
export const CANCEL_REASON_LABELS: Record<CancelReason, string> = {
  NOT_NEEDED: 'Not needed',
  MOVED: 'Moved away',
  OPTED_OUT: 'Asked not to be contacted',
  DECEASED: 'Has died',
};
/** These cancel every open contact and book none until the patient is next seen in person. */
export const STOPPING_CANCEL_REASONS: CancelReason[] = ['MOVED', 'OPTED_OUT', 'DECEASED'];

export type ClosingStep =
  | 'EXPLAINED_RESULT'
  | 'NAMED_RISK_FACTOR'
  | 'AGREED_ACTIONS'
  | 'SET_NEXT_CONTACT'
  | 'REFERRED_IF_INDICATED';
export const CLOSING_STEP_LABELS: Record<ClosingStep, string> = {
  EXPLAINED_RESULT: 'Explained their result',
  NAMED_RISK_FACTOR: 'Named one risk factor to work on',
  AGREED_ACTIONS: 'Agreed what they will do',
  SET_NEXT_CONTACT: 'Set the next contact',
  REFERRED_IF_INDICATED: 'Referred, if needed',
};

export interface ContactPerson {
  id: string;
  displayName: string;
}

export interface WorklistItem {
  id: string;
  mode: ContactMode;
  purpose: ContactPurpose;
  status: 'DUE' | 'MISSED' | 'DONE' | 'CANCELLED';
  dueOn: string;
  daysOverdue: number;
  completedAt: string | null;
  owner: ContactPerson | null;
  attemptCount: number;
  lastAttempt: { at: string; outcome: ContactOutcome; mode: ContactMode } | null;
  patient: {
    id: string;
    patientCode: string;
    name: string;
    phoneE164: string | null;
    tier: FollowUpTier;
  };
}

export interface ContactDetail extends WorklistItem {
  /** The tier's date for the next contact of this kind; the sheet's editable default. */
  suggestedNextOn: string | null;
  /** Known diabetes or a glucose on record: ask the diabetes danger signs too. */
  asksDiabetes: boolean;
  location: {
    community: string | null;
    digitalAddress: string | null;
    landmark: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
}

export interface WorklistFilters {
  q: string;
  mode: ContactMode | '';
  tier: FollowUpTier | '';
  /** "me", "none" or empty for anyone. */
  owner: '' | 'me' | 'none';
}

export interface WorklistPage {
  items: WorklistItem[];
  nextCursor: string | null;
}

const base = (clinicId: string) => `/clinics/${encodeURIComponent(clinicId)}/follow-up/contacts`;

async function failure(res: Response, fallback: string): Promise<Error> {
  if (res.status === 409) return new Error('This contact is no longer open. Refresh the list.');
  if (res.status === 403) return new Error('Only staff who do follow-up can do this here.');
  const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
  const message = Array.isArray(body?.message) ? body.message[0] : body?.message;
  return new Error(typeof message === 'string' && res.status === 400 ? message : fallback);
}

export async function fetchWorklist(
  clinicId: string,
  tab: WorklistTab,
  filters: WorklistFilters,
  getToken: GetToken,
  signal: AbortSignal,
  cursor?: string | null,
): Promise<WorklistPage> {
  const params = new URLSearchParams({ tab });
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.mode) params.set('mode', filters.mode);
  if (filters.tier) params.set('tier', filters.tier);
  if (filters.owner) params.set('owner', filters.owner);
  if (cursor) params.set('cursor', cursor);
  const res = await apiFetch(`${base(clinicId)}?${params}`, { getToken, signal });
  if (!res.ok) throw await failure(res, `The follow-up list could not be loaded (${res.status}).`);
  return (await res.json()) as WorklistPage;
}

export async function fetchContact(
  clinicId: string,
  contactId: string,
  getToken: GetToken,
  signal: AbortSignal,
): Promise<ContactDetail> {
  const res = await apiFetch(`${base(clinicId)}/${encodeURIComponent(contactId)}`, {
    getToken,
    signal,
  });
  if (!res.ok) throw await failure(res, `This contact could not be loaded (${res.status}).`);
  return (await res.json()) as ContactDetail;
}

export async function takeContact(
  clinicId: string,
  contactId: string,
  getToken: GetToken | undefined,
): Promise<ContactPerson> {
  const res = await apiFetch(`${base(clinicId)}/${encodeURIComponent(contactId)}/take`, {
    getToken,
    method: 'POST',
    body: JSON.stringify({}),
    activeClinicId: clinicId,
  });
  if (!res.ok) throw await failure(res, 'Could not take this contact. Try again.');
  return (await res.json()) as ContactPerson;
}

export interface RecordAttemptInput {
  mode: ContactMode;
  outcome: ContactOutcome;
  notReachedReason?: NotReachedReason;
  closingSteps?: ClosingStep[];
  symptoms?: HypertensionSymptomValue[];
  diabetesSymptoms?: DiabetesUrgentSymptomValue[];
  adherence?: MedicationAdherenceLevelValue;
  reportedSystolicBp?: number;
  reportedDiastolicBp?: number;
  referralDestination?: string;
  notes?: string;
  nextContactOn?: string;
}

export async function cancelContact(
  clinicId: string,
  contactId: string,
  reason: CancelReason,
  getToken: GetToken | undefined,
): Promise<void> {
  const res = await apiFetch(`${base(clinicId)}/${encodeURIComponent(contactId)}/cancel`, {
    getToken,
    method: 'POST',
    body: JSON.stringify({ reason }),
    activeClinicId: clinicId,
  });
  if (!res.ok) throw await failure(res, 'The contact could not be cancelled. Try again.');
}

export interface PatientContactHistory {
  open: Array<{
    id: string;
    mode: ContactMode;
    purpose: ContactPurpose;
    status: 'DUE' | 'MISSED';
    dueOn: string;
    owner: ContactPerson | null;
  }>;
  attempts: Array<{
    id: string;
    at: string;
    mode: ContactMode;
    outcome: ContactOutcome;
    notReachedReason: NotReachedReason | null;
    referralDestination: string | null;
    by: ContactPerson;
    contact: { purpose: ContactPurpose };
  }>;
}

export async function fetchPatientContacts(
  clinicId: string,
  patientId: string,
  getToken: GetToken,
  signal: AbortSignal,
): Promise<PatientContactHistory> {
  const res = await apiFetch(
    `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/follow-up/contacts`,
    { getToken, signal },
  );
  if (!res.ok) throw await failure(res, `Follow-up contacts could not be loaded (${res.status}).`);
  return (await res.json()) as PatientContactHistory;
}

/** "Due 18 Dec" from a YYYY-MM-DD day, read as that calendar day wherever the browser is. */
export function formatDueDay(day: string, options: Intl.DateTimeFormatOptions = {}): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
    ...options,
  });
}

/** "3 days late", "Due today", "Due 18 Dec". */
export function dueLabel(
  item: Pick<WorklistItem, 'dueOn' | 'daysOverdue' | 'status'>,
  today: string,
) {
  if (item.daysOverdue > 0) {
    return `${item.daysOverdue} ${item.daysOverdue === 1 ? 'day' : 'days'} late`;
  }
  if (item.dueOn === today) return 'Due today';
  return `Due ${formatDueDay(item.dueOn)}`;
}
