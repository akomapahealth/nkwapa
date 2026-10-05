import { apiFetch, readApiError, type GetToken } from './api';
import type { ActiveShiftsResponse, CheckInsResponse, MyAssignmentsResponse } from './ops';

interface OpsReadOptions {
  clinicId: string;
  date: string;
  getToken: GetToken;
  signal?: AbortSignal;
}

async function readOps<T>(path: string, options: OpsReadOptions): Promise<T> {
  const response = await apiFetch(
    `/clinics/${encodeURIComponent(options.clinicId)}${path}?date=${encodeURIComponent(options.date)}`,
    { getToken: options.getToken, activeClinicId: options.clinicId, signal: options.signal },
  );
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as T;
}

export const fetchActiveShifts = (options: OpsReadOptions) =>
  readOps<ActiveShiftsResponse>('/shifts/active', options);

export const fetchCheckIns = (options: OpsReadOptions) =>
  readOps<CheckInsResponse>('/checkins', options);

export const fetchMyAssignments = (options: OpsReadOptions) =>
  readOps<MyAssignmentsResponse>('/my/assignments', options);
