export const MEDICATION_STATUSES = ['CURRENT', 'PAST', 'STOPPED'] as const;
export const MEDICATION_SOURCE_TYPES = [
  'PATIENT_REPORTED',
  'CAREGIVER_REPORTED',
  'CLINIC_RECORD',
  'EXTERNAL_DOCUMENT',
  'MEDICATION_CONTAINER',
  'OTHER',
] as const;

export type MedicationStatus = (typeof MEDICATION_STATUSES)[number];
export type MedicationSourceType = (typeof MEDICATION_SOURCE_TYPES)[number];

export interface PersonSummary {
  id: string;
  displayName: string;
}

export interface MedicationRevision {
  id: string;
  recordId: string;
  revisionNumber: number;
  medicationName: string;
  drugId?: string | null;
  drug?: { id: string; name: string; genericName?: string | null } | null;
  strength?: string | null;
  dose?: string | null;
  doseUnit?: string | null;
  route?: string | null;
  frequency?: string | null;
  duration?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  indication?: string | null;
  status: MedicationStatus;
  notes?: string | null;
  sourceEncounterId?: string | null;
  sourceEncounter?: { id: string; createdAt: string } | null;
  sourceType: MedicationSourceType;
  authoredByUserId: string;
  authoredBy?: PersonSummary;
  reconciledByUserId?: string | null;
  reconciledBy?: PersonSummary | null;
  lastReconciledAt?: string | null;
  createdAt: string;
}

export interface MedicationRecord {
  id: string;
  clinicId: string;
  patientId: string;
  currentRevisionId: string;
  recordedByUserId: string;
  recordedBy?: PersonSummary;
  currentRevision: MedicationRevision;
  createdAt: string;
  updatedAt: string;
}

export interface ReconciliationEvent {
  id: string;
  clinicId: string;
  patientId: string;
  outcome: 'CURRENT_LIST_REVIEWED' | 'NO_KNOWN_CURRENT_MEDICATIONS';
  sourceEncounterId?: string | null;
  sourceEncounter?: { id: string; createdAt: string } | null;
  reconciledByUserId: string;
  reconciledBy?: PersonSummary;
  notes?: string | null;
  createdAt: string;
}

export interface PharmacyRevision {
  id: string;
  recordId: string;
  revisionNumber: number;
  name: string;
  phoneE164?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  addressText?: string | null;
  notes?: string | null;
  authoredByUserId: string;
  authoredBy?: PersonSummary;
  createdAt: string;
}

export interface PharmacyPreference {
  id: string;
  clinicId: string;
  patientId: string;
  pharmacyRecordId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  notes?: string | null;
  setByUserId: string;
  setBy?: PersonSummary;
  endedByUserId?: string | null;
  endedBy?: PersonSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface PharmacyRecord {
  id: string;
  clinicId: string;
  patientId: string;
  currentRevisionId: string;
  recordedByUserId: string;
  recordedBy?: PersonSummary;
  currentRevision: PharmacyRevision;
  preferences: PharmacyPreference[];
  createdAt: string;
  updatedAt: string;
}

export interface MedicationReconciliationView {
  medications: MedicationRecord[];
  pharmacies: PharmacyRecord[];
  latestReconciliation: ReconciliationEvent | null;
}

export type MedicationListState =
  | 'CURRENT'
  | 'NO_KNOWN_CURRENT_MEDICATIONS'
  | 'HISTORICAL_ONLY'
  | 'NOT_RECORDED';

export function medicationListState(
  records: MedicationRecord[],
  latest: ReconciliationEvent | null,
): MedicationListState {
  if (records.some((record) => record.currentRevision.status === 'CURRENT')) return 'CURRENT';
  if (latest?.outcome === 'NO_KNOWN_CURRENT_MEDICATIONS') {
    return 'NO_KNOWN_CURRENT_MEDICATIONS';
  }
  return records.length > 0 ? 'HISTORICAL_ONLY' : 'NOT_RECORDED';
}

export function sortMedicationRecords(records: MedicationRecord[]) {
  const statusOrder: Record<MedicationStatus, number> = { CURRENT: 0, PAST: 1, STOPPED: 2 };
  return [...records].sort((left, right) => {
    const byStatus =
      statusOrder[left.currentRevision.status] - statusOrder[right.currentRevision.status];
    return byStatus || new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

export function pharmacyAddress(revision: PharmacyRevision) {
  if (revision.addressText) return revision.addressText;
  return [
    revision.addressLine1,
    revision.addressLine2,
    revision.city,
    revision.region,
    revision.postalCode,
    revision.countryCode,
  ]
    .filter(Boolean)
    .join(', ');
}
