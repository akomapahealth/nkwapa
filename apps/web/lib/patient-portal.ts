import type { GetToken } from '@/lib/api';
import { apiFetch } from '@/lib/api';
import { getActiveBootstrapClinic, getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import type { WhoAmIResponse } from '@/lib/bootstrap-context';

export const PATIENT_PORTAL_LINK_MISSING = 'PATIENT_PORTAL_LINK_MISSING';

export interface PortalMeResponse {
  patient: {
    id: string;
    patientCode: string;
    firstName: string;
    lastName: string;
    dob: string | null;
    sex: string;
  };
  recommendations: {
    followUpDate: string | null;
    carePlanNotes: string | null;
    counselingGiven: boolean;
    medicationPrescribed: boolean;
  } | null;
  reminders: Array<{
    id: string;
    scheduledAt: string;
    status: string;
    channel: string;
  }>;
}

export interface MeasurementPayload {
  [key: string]: unknown;
}

export interface MeasurementRecord {
  id: string;
  patientId: string;
  clinicId: string;
  recordedAt: string;
  source: string;
  type: 'BP' | 'GLUCOSE' | 'WEIGHT';
  payload: MeasurementPayload;
  notes: string | null;
  linkedEncounterId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentSummary {
  id: string;
  clinicId: string;
  patientId: string;
  startsAt: string;
  endsAt: string;
  status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
  linkedRequestId: string | null;
  assignedDoctor: { id: string; displayName: string | null } | null;
  assignedVolunteer: { id: string; displayName: string | null } | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AppointmentRequestType =
  | 'NEW_APPOINTMENT'
  | 'CANCEL_APPOINTMENT'
  | 'RESCHEDULE_APPOINTMENT';

export type StaffAppointmentStatus = 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';

export interface StaffAppointmentPatientSummary {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  displayName: string;
}

export interface StaffAppointmentRecord {
  id: string;
  clinicId: string;
  patientId: string;
  startsAt: string;
  endsAt: string;
  status: StaffAppointmentStatus;
  linkedRequestId: string | null;
  patient: StaffAppointmentPatientSummary;
  assignedDoctor: { id: string; displayName: string | null } | null;
  assignedVolunteer: { id: string; displayName: string | null } | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffAppointmentsResponse {
  range: {
    from: string;
    to: string;
  };
  timezone: string;
  summary: {
    total: number;
    confirmed: number;
    cancelled: number;
    completed: number;
    noShow: number;
  };
  items: StaffAppointmentRecord[];
}

export interface PatientAppointmentsResponse {
  range: {
    from: string;
    to: string;
  };
  timezone: string;
  summary: {
    total: number;
    confirmed: number;
    cancelled: number;
    completed: number;
    noShow: number;
  };
  items: AppointmentSummary[];
}

export interface AppointmentStaffOption {
  id: string;
  displayName: string;
}

export interface AppointmentStaffOptionsResponse {
  doctors: AppointmentStaffOption[];
  volunteers: AppointmentStaffOption[];
}

export interface BloodPressureTrendPoint {
  t: string;
  sys: number;
  dia: number;
  source: 'ENCOUNTER' | 'PATIENT';
}

export interface GlucoseTrendPoint {
  t: string;
  value: number;
  type: 'FASTING' | 'RANDOM' | 'UNKNOWN';
  source: 'ENCOUNTER' | 'PATIENT';
}

export interface FollowUpSummary {
  requested: number;
  confirmed: number;
  completed: number;
  noShow: number;
  closed: number;
}

export interface PatientTrendsResponse {
  bp: BloodPressureTrendPoint[];
  glucose: GlucoseTrendPoint[];
  followUp: FollowUpSummary;
}

export interface AppointmentRequestRecord {
  id: string;
  clinicId: string;
  patientId: string;
  requestType: AppointmentRequestType;
  sourceAppointmentId: string | null;
  preferredStartDate: string;
  preferredEndDate: string;
  reason: string | null;
  notes: string | null;
  status: 'REQUESTED' | 'TRIAGED' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED';
  triagedAt: string | null;
  triagedBy: { id: string; displayName: string } | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  appointment: AppointmentSummary | null;
  sourceAppointment: AppointmentSummary | null;
}

export interface LegacySelfReport {
  id: string;
  type: string;
  systolicBp?: number | null;
  diastolicBp?: number | null;
  glucoseMgDl?: number | null;
  glucoseType?: string | null;
  weightKg?: number | null;
  notes?: string | null;
  symptomsJson?: string | null;
  recordedAt: string;
  createdAt: string;
}

interface PortalApiErrorBody {
  code?: string;
  message?: string | string[];
}

export class PortalApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'PortalApiError';
    this.status = status;
    this.code = code;
  }
}

async function readPortalApiError(response: Response) {
  const raw = await response.text();
  if (!raw) {
    return new PortalApiError(`Request failed with status ${response.status}`, response.status);
  }

  try {
    const parsed = JSON.parse(raw) as PortalApiErrorBody | string;
    if (typeof parsed === 'string') {
      return new PortalApiError(parsed, response.status);
    }

    const message = Array.isArray(parsed.message)
      ? parsed.message.join(', ')
      : parsed.message || raw;

    return new PortalApiError(message, response.status, parsed.code);
  } catch {
    return new PortalApiError(raw, response.status);
  }
}

async function parsePortalResponse<T>(response: Response) {
  if (!response.ok) {
    throw await readPortalApiError(response);
  }

  return (await response.json()) as T;
}

export function isPortalLinkMissingError(error: unknown) {
  return error instanceof PortalApiError && error.code === PATIENT_PORTAL_LINK_MISSING;
}

export function getPortalErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function getPortalClinicId(bootstrap: WhoAmIResponse | null) {
  return getBootstrapActiveClinicId(bootstrap);
}

export function getPortalClinicName(bootstrap: WhoAmIResponse | null, clinicId: string | null) {
  return getActiveBootstrapClinic(bootstrap, clinicId)?.clinicName ?? null;
}

export async function fetchPortalMe(clinicId: string, getToken: GetToken) {
  const res = await apiFetch(`/clinics/${encodeURIComponent(clinicId)}/patient-portal/me`, {
    getToken,
    activeClinicId: clinicId,
  });
  return parsePortalResponse<PortalMeResponse>(res);
}

export async function fetchMeasurements(
  clinicId: string,
  getToken: GetToken,
  params?: { from?: string; to?: string; type?: MeasurementRecord['type'] },
) {
  const search = new URLSearchParams();
  if (params?.from) search.set('from', params.from);
  if (params?.to) search.set('to', params.to);
  if (params?.type) search.set('type', params.type);
  const suffix = search.toString() ? `?${search.toString()}` : '';
  const res = await apiFetch(`/patients/me/measurements${suffix}`, {
    getToken,
    activeClinicId: clinicId,
  });
  return parsePortalResponse<MeasurementRecord[]>(res);
}

function buildDateRangeQuery(params?: { from?: string; to?: string }) {
  const search = new URLSearchParams();
  if (params?.from) search.set('from', params.from);
  if (params?.to) search.set('to', params.to);
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return suffix;
}

export async function fetchPatientTrends(
  clinicId: string,
  getToken: GetToken,
  params?: { from?: string; to?: string },
) {
  const suffix = buildDateRangeQuery(params);
  const res = await apiFetch(`/patients/me/trends${suffix}`, {
    getToken,
    activeClinicId: clinicId,
  });
  return parsePortalResponse<PatientTrendsResponse>(res);
}

export async function fetchStaffPatientTrends(
  patientId: string,
  clinicId: string,
  getToken: GetToken,
  params?: { from?: string; to?: string },
) {
  const search = new URLSearchParams();
  search.set('clinicId', clinicId);
  if (params?.from) search.set('from', params.from);
  if (params?.to) search.set('to', params.to);
  const suffix = search.toString() ? `?${search.toString()}` : '';
  const res = await apiFetch(`/patients/${encodeURIComponent(patientId)}/trends${suffix}`, {
    getToken,
    activeClinicId: clinicId,
  });
  return parsePortalResponse<PatientTrendsResponse>(res);
}

export async function createMeasurement(
  clinicId: string,
  getToken: GetToken,
  body: {
    type: MeasurementRecord['type'];
    payload: Record<string, unknown>;
    notes?: string;
    recordedAt?: string;
  },
) {
  const res = await apiFetch(`/patients/me/measurements`, {
    method: 'POST',
    body: JSON.stringify(body),
    getToken,
    activeClinicId: clinicId,
  });
  return parsePortalResponse<MeasurementRecord>(res);
}

export async function fetchAppointmentRequests(clinicId: string, getToken: GetToken) {
  const res = await apiFetch(`/patients/me/appointment-requests`, {
    getToken,
    activeClinicId: clinicId,
  });
  return parsePortalResponse<AppointmentRequestRecord[]>(res);
}

export async function fetchPatientAppointments(
  clinicId: string,
  getToken: GetToken,
  params?: { from?: string; to?: string; status?: AppointmentSummary['status'] },
) {
  const search = new URLSearchParams();
  if (params?.from) search.set('from', params.from);
  if (params?.to) search.set('to', params.to);
  if (params?.status) search.set('status', params.status);
  const suffix = search.toString() ? `?${search.toString()}` : '';
  const res = await apiFetch(`/patients/me/appointments${suffix}`, {
    getToken,
    activeClinicId: clinicId,
  });
  return parsePortalResponse<PatientAppointmentsResponse>(res);
}

export async function fetchStaffAppointments(
  clinicId: string,
  getToken: GetToken,
  params?: {
    from?: string;
    to?: string;
    status?: StaffAppointmentStatus;
    assignedDoctorId?: string;
    assignedVolunteerId?: string;
    patientSearch?: string;
  },
) {
  const search = new URLSearchParams();
  if (params?.from) search.set('from', params.from);
  if (params?.to) search.set('to', params.to);
  if (params?.status) search.set('status', params.status);
  if (params?.assignedDoctorId) search.set('assignedDoctorId', params.assignedDoctorId);
  if (params?.assignedVolunteerId) {
    search.set('assignedVolunteerId', params.assignedVolunteerId);
  }
  if (params?.patientSearch) search.set('patientSearch', params.patientSearch);
  const suffix = search.toString() ? `?${search.toString()}` : '';
  const res = await apiFetch(`/clinics/${encodeURIComponent(clinicId)}/appointments${suffix}`, {
    getToken,
    activeClinicId: clinicId,
  });
  return parsePortalResponse<StaffAppointmentsResponse>(res);
}

export async function fetchAppointmentStaffOptions(clinicId: string, getToken: GetToken) {
  const res = await apiFetch(
    `/clinics/${encodeURIComponent(clinicId)}/appointments/staff-options`,
    {
      getToken,
      activeClinicId: clinicId,
    },
  );
  return parsePortalResponse<AppointmentStaffOptionsResponse>(res);
}

export async function rescheduleStaffAppointment(
  clinicId: string,
  appointmentId: string,
  getToken: GetToken,
  body: {
    startsAt: string;
    endsAt: string;
    assignedDoctorId?: string;
    assignedVolunteerId?: string;
    notes?: string;
  },
) {
  const res = await apiFetch(
    `/clinics/${encodeURIComponent(clinicId)}/appointments/${encodeURIComponent(appointmentId)}/reschedule`,
    {
      method: 'POST',
      body: JSON.stringify(body),
      getToken,
      activeClinicId: clinicId,
    },
  );
  return parsePortalResponse<StaffAppointmentRecord>(res);
}

export async function cancelStaffAppointment(
  clinicId: string,
  appointmentId: string,
  getToken: GetToken,
  body: { reason: string },
) {
  const res = await apiFetch(
    `/clinics/${encodeURIComponent(clinicId)}/appointments/${encodeURIComponent(appointmentId)}/cancel`,
    {
      method: 'POST',
      body: JSON.stringify(body),
      getToken,
      activeClinicId: clinicId,
    },
  );
  return parsePortalResponse<StaffAppointmentRecord>(res);
}

export async function completeStaffAppointment(
  clinicId: string,
  appointmentId: string,
  getToken: GetToken,
  body: { notes?: string },
) {
  const res = await apiFetch(
    `/clinics/${encodeURIComponent(clinicId)}/appointments/${encodeURIComponent(appointmentId)}/complete`,
    {
      method: 'POST',
      body: JSON.stringify(body),
      getToken,
      activeClinicId: clinicId,
    },
  );
  return parsePortalResponse<StaffAppointmentRecord>(res);
}

export async function markStaffAppointmentNoShow(
  clinicId: string,
  appointmentId: string,
  getToken: GetToken,
  body: { reason?: string },
) {
  const res = await apiFetch(
    `/clinics/${encodeURIComponent(clinicId)}/appointments/${encodeURIComponent(appointmentId)}/no-show`,
    {
      method: 'POST',
      body: JSON.stringify(body),
      getToken,
      activeClinicId: clinicId,
    },
  );
  return parsePortalResponse<StaffAppointmentRecord>(res);
}

export async function createAppointmentRequest(
  clinicId: string,
  getToken: GetToken,
  body: {
    preferredStartDate: string;
    preferredEndDate: string;
    reason?: string;
    notes?: string;
  },
) {
  const res = await apiFetch(`/patients/me/appointment-requests`, {
    method: 'POST',
    body: JSON.stringify(body),
    getToken,
    activeClinicId: clinicId,
  });
  return parsePortalResponse<AppointmentRequestRecord>(res);
}

export async function requestPatientAppointmentCancellation(
  clinicId: string,
  appointmentId: string,
  getToken: GetToken,
  body: { reason: string; notes?: string },
) {
  const res = await apiFetch(
    `/patients/me/appointments/${encodeURIComponent(appointmentId)}/cancel-request`,
    {
      method: 'POST',
      body: JSON.stringify(body),
      getToken,
      activeClinicId: clinicId,
    },
  );
  return parsePortalResponse<AppointmentRequestRecord>(res);
}

export async function requestPatientAppointmentReschedule(
  clinicId: string,
  appointmentId: string,
  getToken: GetToken,
  body: {
    preferredStartDate: string;
    preferredEndDate: string;
    reason?: string;
    notes?: string;
  },
) {
  const res = await apiFetch(
    `/patients/me/appointments/${encodeURIComponent(appointmentId)}/reschedule-request`,
    {
      method: 'POST',
      body: JSON.stringify(body),
      getToken,
      activeClinicId: clinicId,
    },
  );
  return parsePortalResponse<AppointmentRequestRecord>(res);
}

export async function fetchLegacySelfReports(clinicId: string, getToken: GetToken) {
  const res = await apiFetch(
    `/clinics/${encodeURIComponent(clinicId)}/patient-portal/self-reports`,
    { getToken, activeClinicId: clinicId },
  );
  return parsePortalResponse<LegacySelfReport[]>(res);
}

export function formatPortalDate(value: string | null | undefined) {
  if (!value) return 'Not set';
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatPortalDateTime(value: string | null | undefined) {
  if (!value) return 'Not scheduled';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatMeasurementLabel(type: MeasurementRecord['type'] | string) {
  switch (type) {
    case 'BP':
    case 'HOME_BP':
      return 'Blood pressure';
    case 'GLUCOSE':
    case 'HOME_GLUCOSE':
      return 'Glucose';
    case 'WEIGHT':
      return 'Weight';
    case 'FOLLOW_UP_UPDATE':
      return 'Follow-up update';
    case 'SYMPTOMS':
      return 'Symptoms';
    case 'GENERAL':
      return 'General note';
    default:
      return type.replace(/_/g, ' ').toLowerCase();
  }
}

export function formatMeasurementValue(record: MeasurementRecord | LegacySelfReport) {
  if ('payload' in record) {
    if (record.type === 'BP') {
      const systolic = readNumber(record.payload.systolic);
      const diastolic = readNumber(record.payload.diastolic);
      return systolic != null && diastolic != null
        ? `${systolic}/${diastolic} mmHg`
        : 'Blood pressure';
    }
    if (record.type === 'GLUCOSE') {
      const value = readNumber(record.payload.value);
      const glucoseType =
        typeof record.payload.glucoseType === 'string'
          ? record.payload.glucoseType.toLowerCase()
          : null;
      return value != null ? `${value} mg/dL${glucoseType ? ` • ${glucoseType}` : ''}` : 'Glucose';
    }
    if (record.type === 'WEIGHT') {
      const kg = readNumber(record.payload.kg);
      return kg != null ? `${kg} kg` : 'Weight';
    }
  }

  const legacyRecord = record as LegacySelfReport;

  if (legacyRecord.type === 'HOME_BP') {
    return legacyRecord.systolicBp != null && legacyRecord.diastolicBp != null
      ? `${legacyRecord.systolicBp}/${legacyRecord.diastolicBp} mmHg`
      : 'Blood pressure';
  }
  if (legacyRecord.type === 'HOME_GLUCOSE') {
    return legacyRecord.glucoseMgDl != null
      ? `${legacyRecord.glucoseMgDl} mg/dL${legacyRecord.glucoseType ? ` • ${legacyRecord.glucoseType.toLowerCase()}` : ''}`
      : 'Glucose';
  }
  if (legacyRecord.type === 'WEIGHT') {
    return legacyRecord.weightKg != null ? `${legacyRecord.weightKg} kg` : 'Weight';
  }
  return legacyRecord.notes?.trim() || 'Patient submission';
}

export function measurementTypeFromPreset(value: string | null) {
  switch ((value ?? '').toLowerCase()) {
    case 'bp':
      return 'BP' as const;
    case 'glucose':
      return 'GLUCOSE' as const;
    case 'weight':
      return 'WEIGHT' as const;
    default:
      return 'BP' as const;
  }
}

function readNumber(value: unknown) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}
