export const MEDICAL_HISTORY_CATEGORIES = [
  'CONDITION',
  'ALLERGY',
  'SURGERY_PROCEDURE',
  'FAMILY_HISTORY',
  'SOCIAL_HISTORY',
] as const;

export const MEDICAL_HISTORY_STATUSES = [
  'ACTIVE',
  'RESOLVED',
  'INACTIVE',
  'HISTORICAL',
  'ENTERED_IN_ERROR',
] as const;

export type MedicalHistoryCategory = (typeof MEDICAL_HISTORY_CATEGORIES)[number];
export type MedicalHistoryStatus = (typeof MEDICAL_HISTORY_STATUSES)[number];
export type AllergySummaryState =
  | 'ACTIVE_ALLERGIES'
  | 'NO_KNOWN_ALLERGIES'
  | 'HISTORICAL_ONLY'
  | 'NOT_RECORDED'
  | 'UNAVAILABLE';

export interface AllergySummary {
  state: AllergySummaryState;
  activeAllergies: Array<{
    recordId: string;
    revisionId: string;
    substance?: string;
    reaction?: string;
    severity: string;
  }>;
  updatedAt?: string | null;
}

export interface MedicalHistoryRevision {
  id: string;
  recordId: string;
  revisionNumber: number;
  status: MedicalHistoryStatus;
  onsetDate?: string | null;
  occurrenceDate?: string | null;
  resolvedDate?: string | null;
  detailsSchemaVersion: number;
  details: Record<string, unknown>;
  notes?: string | null;
  sourceEncounterId?: string | null;
  authoredByUserId: string;
  authoredBy?: { id: string; displayName: string };
  createdAt: string;
}

export interface MedicalHistoryRecord {
  id: string;
  clinicId: string;
  patientId: string;
  category: MedicalHistoryCategory;
  currentRevisionId: string;
  currentRevision: MedicalHistoryRevision;
  createdAt: string;
  updatedAt: string;
}

export function sortMedicalHistory(records: MedicalHistoryRecord[]) {
  return [...records].sort((left, right) => {
    const activeOrder =
      Number(left.currentRevision.status !== 'ACTIVE') -
      Number(right.currentRevision.status !== 'ACTIVE');
    return activeOrder || new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

export function medicalHistoryLabel(record: MedicalHistoryRecord): string {
  const details = record.currentRevision.details;
  switch (record.category) {
    case 'CONDITION':
      return String(details.conditionName ?? 'Condition');
    case 'ALLERGY':
      return details.kind === 'NO_KNOWN_ALLERGIES'
        ? 'No known allergies'
        : String(details.substance ?? 'Allergy or adverse reaction');
    case 'SURGERY_PROCEDURE':
      return String(details.procedureName ?? 'Surgery or procedure');
    case 'FAMILY_HISTORY':
      return `${String(details.relationship ?? 'Family')}: ${String(details.familyCondition ?? 'Condition')}`;
    case 'SOCIAL_HISTORY':
      return String(details.socialType ?? 'Social history').replaceAll('_', ' ');
  }
}

export function requiresPrescriptionAllergyAcknowledgement(
  state: AllergySummaryState | undefined,
): boolean {
  return state === 'ACTIVE_ALLERGIES' || state === 'NOT_RECORDED' || state === 'UNAVAILABLE';
}
