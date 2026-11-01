import { apiFetch, readApiError, type GetToken } from './api';

export type DataRequestType = 'ACCESS' | 'CORRECTION' | 'DELETION' | 'RESTRICTION';
export type DataRequestStatus = 'RECEIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'DECLINED';

export interface PatientDataRequest {
  id: string;
  type: DataRequestType;
  details: string | null;
  status: DataRequestStatus;
  dueAt: string;
  responseNote: string | null;
  respondedAt: string | null;
  createdAt: string;
}

export interface ClinicDataRequest extends PatientDataRequest {
  patient: { id: string; patientCode: string; firstName: string; lastName: string };
  respondedBy: { id: string; displayName: string } | null;
}

/** What each request asks for, in the patient's words and in the clinic's. */
export const DATA_REQUEST_TYPES: ReadonlyArray<{
  value: DataRequestType;
  label: string;
  patientHint: string;
}> = [
  {
    value: 'ACCESS',
    label: 'A copy of my information',
    patientHint: 'The clinic sends you a copy of what Nkwapa holds about you.',
  },
  {
    value: 'CORRECTION',
    label: 'Correct something',
    patientHint: 'Say what is wrong. The clinic corrects it and keeps a note of the change.',
  },
  {
    value: 'DELETION',
    label: 'Delete my information',
    patientHint:
      'Contact details, portal access and research use can usually be removed. Medical records must be kept for as long as the law requires, so the clinic will tell you what it can remove.',
  },
  {
    value: 'RESTRICTION',
    label: 'Limit how it is used',
    patientHint: 'For example, stop research use or reminders. Your care is not affected.',
  },
];

export const DATA_REQUEST_STATUS_LABEL: Record<DataRequestStatus, string> = {
  RECEIVED: 'Received',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  DECLINED: 'Declined',
};

export function dataRequestTypeLabel(type: DataRequestType): string {
  return DATA_REQUEST_TYPES.find((entry) => entry.value === type)?.label ?? type;
}

export const isOpenDataRequest = (status: DataRequestStatus) =>
  status === 'RECEIVED' || status === 'IN_PROGRESS';

/** "Due in 12 days", "Due today", "3 days overdue", or null once answered. */
export function describeDataRequestDue(
  request: Pick<PatientDataRequest, 'status' | 'dueAt'>,
  now = new Date(),
): { label: string; overdue: boolean } | null {
  if (!isOpenDataRequest(request.status)) return null;
  const days = Math.ceil((new Date(request.dueAt).getTime() - now.getTime()) / 86_400_000);
  if (days < 0) {
    const late = -days;
    return { label: `${late} day${late === 1 ? '' : 's'} overdue`, overdue: true };
  }
  if (days === 0) return { label: 'Due today', overdue: false };
  return { label: `Due in ${days} day${days === 1 ? '' : 's'}`, overdue: false };
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as T;
}

export async function listMyDataRequests(clinicId: string, getToken: GetToken) {
  return json<PatientDataRequest[]>(
    await apiFetch('/patients/me/data-requests', { getToken, activeClinicId: clinicId }),
  );
}

export async function createMyDataRequest(
  clinicId: string,
  input: { type: DataRequestType; details: string },
  getToken: GetToken,
) {
  return json<PatientDataRequest>(
    await apiFetch('/patients/me/data-requests', {
      method: 'POST',
      body: JSON.stringify({ type: input.type, details: input.details.trim() || undefined }),
      getToken,
      activeClinicId: clinicId,
    }),
  );
}

export async function listClinicDataRequests(clinicId: string, getToken: GetToken) {
  return json<ClinicDataRequest[]>(
    await apiFetch(`/clinics/${encodeURIComponent(clinicId)}/data-requests`, { getToken }),
  );
}

export async function respondToDataRequest(
  clinicId: string,
  requestId: string,
  input: { status: Exclude<DataRequestStatus, 'RECEIVED'>; responseNote: string },
  getToken: GetToken,
) {
  return json<ClinicDataRequest>(
    await apiFetch(
      `/clinics/${encodeURIComponent(clinicId)}/data-requests/${encodeURIComponent(requestId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          status: input.status,
          responseNote: input.responseNote.trim() || undefined,
        }),
        getToken,
      },
    ),
  );
}
