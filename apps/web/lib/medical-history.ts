import { formatOpsDay } from './ops';

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

// Clinical reading order: what can harm the patient today, then what they live with, then context.
const CATEGORY_ORDER: MedicalHistoryCategory[] = [
  'ALLERGY',
  'CONDITION',
  'SURGERY_PROCEDURE',
  'FAMILY_HISTORY',
  'SOCIAL_HISTORY',
];

export function sortMedicalHistory(records: MedicalHistoryRecord[]) {
  return [...records].sort((left, right) => {
    const activeOrder =
      Number(left.currentRevision.status !== 'ACTIVE') -
      Number(right.currentRevision.status !== 'ACTIVE');
    const categoryOrder =
      CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category);
    return (
      activeOrder ||
      categoryOrder ||
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    );
  });
}

const SOCIAL_LABELS: Record<string, string> = {
  TOBACCO: 'Tobacco use',
  ALCOHOL: 'Alcohol use',
  SUBSTANCE_USE: 'Substance use',
  OCCUPATION: 'Occupation',
  LIVING_SITUATION: 'Living situation',
  OTHER: 'Social history',
};

const SEVERITY_LABELS: Record<string, string> = {
  MILD: 'Mild',
  MODERATE: 'Moderate',
  SEVERE: 'Severe',
};

/** Calendar dates from the form, read as the day written (noon UTC, so no zone moves the day). */
function day(date: string | null | undefined) {
  return date ? formatOpsDay(`${date.slice(0, 10)}T12:00:00Z`) : null;
}

/** The clinical detail a row needs at a glance: severity and reaction, dates, a description. */
export function medicalHistoryDetail(record: MedicalHistoryRecord): string | null {
  const revision = record.currentRevision;
  const details = revision.details;
  const text = (key: string) =>
    typeof details[key] === 'string' && details[key] ? String(details[key]) : null;
  const parts: Array<string | null> = [];
  switch (record.category) {
    case 'ALLERGY':
      if (details.kind !== 'NO_KNOWN_ALLERGIES') {
        parts.push(SEVERITY_LABELS[String(details.severity)] ?? null, text('reaction'));
      }
      break;
    case 'CONDITION':
      parts.push(revision.onsetDate ? `Since ${day(revision.onsetDate)}` : null);
      break;
    case 'SURGERY_PROCEDURE':
      parts.push(day(revision.occurrenceDate));
      break;
    case 'SOCIAL_HISTORY':
      parts.push(text('description'));
      break;
    case 'FAMILY_HISTORY':
      break;
  }
  parts.push(revision.resolvedDate ? `Resolved ${day(revision.resolvedDate)}` : null);
  const shown = parts.filter(Boolean);
  return shown.length ? shown.join(' · ') : null;
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
      return SOCIAL_LABELS[String(details.socialType)] ?? 'Social history';
  }
}

export function requiresPrescriptionAllergyAcknowledgement(
  state: AllergySummaryState | undefined,
): boolean {
  return state === 'ACTIVE_ALLERGIES' || state === 'NOT_RECORDED' || state === 'UNAVAILABLE';
}
