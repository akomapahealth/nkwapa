import {
  DUPLICATE_MATCH_REASON_LABELS,
  type DuplicateConfidence,
  type DuplicateMatchReason,
} from '@nkwapa/db';

export { DUPLICATE_MATCH_REASON_LABELS };
export type { DuplicateConfidence, DuplicateMatchReason };

export interface DuplicateCandidatePatient {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  dob: string | null;
  sex: string;
  phoneE164: string | null;
  email: string | null;
  nationalIdType: string | null;
  nationalIdLast4: string | null;
  portalLinked: boolean;
  createdAt: string;
  updatedAt: string;
  clinic: {
    id: string;
    name: string;
    organizationId: string;
    organizationName: string;
  };
}

export type DuplicateReviewStatus = 'OPEN' | 'DISMISSED' | 'CONFIRMED';

export interface DuplicateCandidateReview {
  status: DuplicateReviewStatus;
  note: string | null;
  reviewedAt: string;
  reviewedBy: { id: string; displayName: string } | null;
}

export interface DuplicateCandidate {
  pairKey: string;
  score: number;
  confidence: DuplicateConfidence;
  reasons: DuplicateMatchReason[];
  crossClinic: boolean;
  mergeEligible: boolean;
  lastUpdatedAt: string;
  review: DuplicateCandidateReview | null;
  patients: [DuplicateCandidatePatient, DuplicateCandidatePatient];
}

export interface DuplicateCandidatePage {
  items: DuplicateCandidate[];
  total: number;
  page: number;
  pageSize: number;
  generatedAt: string;
  truncated: boolean;
  summary: { open: number; high: number; crossClinic: number; dismissed: number };
}

/**
 * Confidence maps onto the existing status badge family, never a new one.
 *
 * `warning` for HIGH rather than `destructive`: a strong duplicate signal is something to look at
 * urgently, not a failure, and the design system reserves the destructive treatment for actions
 * that cannot be undone. The merge itself gets that treatment; noticing a candidate does not.
 */
export function confidenceBadgeVariant(
  confidence: DuplicateConfidence,
): 'warning' | 'review' | 'draft' {
  if (confidence === 'HIGH') return 'warning';
  if (confidence === 'MEDIUM') return 'review';
  return 'draft';
}

export const DUPLICATE_CONFIDENCE_LABELS: Record<DuplicateConfidence, string> = {
  HIGH: 'Very likely',
  MEDIUM: 'Possible',
  LOW: 'Weak signal',
};

export const DUPLICATE_REVIEW_STATUS_LABELS: Record<DuplicateReviewStatus, string> = {
  OPEN: 'Needs review',
  DISMISSED: 'Not a duplicate',
  CONFIRMED: 'Confirmed duplicate',
};

export function reviewStatusBadgeVariant(
  status: DuplicateReviewStatus,
): 'draft' | 'finalized' | 'warning' {
  if (status === 'DISMISSED') return 'finalized';
  if (status === 'CONFIRMED') return 'warning';
  return 'draft';
}

/** The decision recorded against a pair, or `OPEN` when nobody has looked at it yet. */
export function candidateStatus(candidate: DuplicateCandidate): DuplicateReviewStatus {
  return candidate.review?.status ?? 'OPEN';
}

export function formatReasons(reasons: DuplicateMatchReason[]): string {
  return reasons.map((reason) => DUPLICATE_MATCH_REASON_LABELS[reason]).join(' · ');
}

/** Full name, for a heading or a table cell. */
export function patientDisplayName(patient: DuplicateCandidatePatient): string {
  return `${patient.firstName} ${patient.lastName}`.trim();
}

/** Where the chart lives, which is also where the existing merge dialog lives. */
export function patientChartHref(patient: DuplicateCandidatePatient): string {
  return `/clinics/${encodeURIComponent(patient.clinic.id)}/patients/${encodeURIComponent(patient.id)}`;
}

export function formatDateOfBirth(value: string | null): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toISOString().slice(0, 10);
}

export interface ComparisonRow {
  label: string;
  valueA: string;
  valueB: string;
  /** True when both sides carry the same value. Drives the emphasis in the detail view. */
  matches: boolean;
}

const NOT_RECORDED = 'Not recorded';

function present(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : NOT_RECORDED;
}

/**
 * The field-by-field comparison the detail view renders.
 *
 * `matches` is deliberately false when both sides are absent. Two charts that each lack a phone
 * number agree about nothing; presenting that as a match would inflate an operator's confidence
 * in exactly the case where the record is thinnest.
 */
export function buildComparisonRows(
  left: DuplicateCandidatePatient,
  right: DuplicateCandidatePatient,
): ComparisonRow[] {
  const rows: Array<{ label: string; a: string; b: string }> = [
    { label: 'Chart code', a: left.patientCode, b: right.patientCode },
    { label: 'First name', a: present(left.firstName), b: present(right.firstName) },
    { label: 'Last name', a: present(left.lastName), b: present(right.lastName) },
    { label: 'Date of birth', a: formatDateOfBirth(left.dob), b: formatDateOfBirth(right.dob) },
    { label: 'Sex', a: present(left.sex), b: present(right.sex) },
    { label: 'Phone', a: present(left.phoneE164), b: present(right.phoneE164) },
    { label: 'Email', a: present(left.email), b: present(right.email) },
    { label: 'ID type', a: present(left.nationalIdType), b: present(right.nationalIdType) },
    {
      label: 'ID last 4',
      a: present(left.nationalIdLast4),
      b: present(right.nationalIdLast4),
    },
    { label: 'Clinic', a: left.clinic.name, b: right.clinic.name },
    { label: 'Organisation', a: left.clinic.organizationName, b: right.clinic.organizationName },
    {
      label: 'Portal access',
      a: left.portalLinked ? 'Linked' : 'Not linked',
      b: right.portalLinked ? 'Linked' : 'Not linked',
    },
  ];

  return rows.map(({ label, a, b }) => ({
    label,
    valueA: a,
    valueB: b,
    matches: a === b && a !== NOT_RECORDED,
  }));
}
