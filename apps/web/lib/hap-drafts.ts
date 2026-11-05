import { apiFetch, readApiError, type GetToken } from './api';

/** One of the signed-in author's own HAP drafts, oldest first (#307). */
export interface HapDraft {
  id: string;
  encounterId: string;
  patientId: string;
  updatedAt: string;
  patient: { patientCode: string; firstName: string; lastName: string };
}

export async function fetchMyHapDrafts(clinicId: string, getToken: GetToken): Promise<HapDraft[]> {
  const response = await apiFetch(
    `/clinics/${encodeURIComponent(clinicId)}/clinical-notes/my-drafts`,
    { getToken, activeClinicId: clinicId },
  );
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as HapDraft[];
}

export const hapDraftPatientName = (draft: HapDraft) =>
  `${draft.patient.firstName} ${draft.patient.lastName}`.trim() || draft.patient.patientCode;
