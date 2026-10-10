import {
  DUPLICATE_MATCH_REASON_LABELS,
  mergeFinding,
  type DuplicateConfidence,
  type DuplicateMatchReason,
  type MergeFinding,
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
  clinic: DuplicateCandidateClinic;
}

export interface DuplicateCandidateClinic {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
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
  /**
   * Why the merge would be refused, from the same rule the merge preview applies. Optional so a
   * response from an older API, which sends only `mergeEligible`, still parses.
   */
  mergeBlockers?: MergeFinding[];
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

/** How many cross-clinic pairs one clinic pair holds. Mirrors the API's `CrossClinicBurdenRow`. */
export interface CrossClinicBurdenRow {
  key: string;
  clinics: [DuplicateCandidateClinic, DuplicateCandidateClinic];
  sameOrganization: boolean;
  total: number;
  open: number;
  confirmed: number;
  dismissed: number;
  high: number;
  medium: number;
  low: number;
}

export interface CrossClinicBurden {
  totalPairs: number;
  openPairs: number;
  highConfidencePairs: number;
  clinicsAffected: number;
  organizationsAffected: number;
  crossOrganizationPairs: number;
  clinicPairs: CrossClinicBurdenRow[];
  reasons: { reason: DuplicateMatchReason; count: number }[];
}

export interface CrossClinicInvestigation extends DuplicateCandidatePage {
  burden: CrossClinicBurden;
}

export type DuplicateStatusFilter = DuplicateReviewStatus | 'ALL';
export type DuplicateConfidenceFilter = DuplicateConfidence | 'ALL';
export type DuplicateReasonFilter = DuplicateMatchReason | 'ALL';

/** The filters both duplicate screens share, in the shape their filter panel edits. */
export interface DuplicateFilters {
  status: DuplicateStatusFilter;
  confidence: DuplicateConfidenceFilter;
  reason: DuplicateReasonFilter;
  q: string;
}

export const DEFAULT_DUPLICATE_FILTERS: DuplicateFilters = {
  status: 'OPEN',
  confidence: 'ALL',
  reason: 'ALL',
  q: '',
};

export function duplicateFiltersAreDefault(filters: DuplicateFilters): boolean {
  return (
    filters.status === DEFAULT_DUPLICATE_FILTERS.status &&
    filters.confidence === DEFAULT_DUPLICATE_FILTERS.confidence &&
    filters.reason === DEFAULT_DUPLICATE_FILTERS.reason &&
    filters.q.trim() === ''
  );
}

/**
 * The query string for a duplicate list request.
 *
 * `page` is the grid's zero-based index; the API counts from one. `ALL` is sent for status,
 * because omitting status means "open only", and omitted for the other filters, where omission
 * already means "any".
 */
export function buildDuplicateQuery(
  filters: DuplicateFilters,
  page: number,
  pageSize: number,
  extra: Record<string, string | null | undefined> = {},
): string {
  const params = new URLSearchParams();
  params.set('status', filters.status);
  if (filters.confidence !== 'ALL') params.set('confidence', filters.confidence);
  if (filters.reason !== 'ALL') params.set('reason', filters.reason);
  if (filters.q.trim()) params.set('q', filters.q.trim());
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value);
  }
  params.set('page', String(page + 1));
  params.set('pageSize', String(pageSize));
  return params.toString();
}

export interface MergeAvailability {
  available: boolean;
  /** A short badge label. */
  label: string;
  /** The first refusal, in plain language, with its detail when there is one. */
  reason: string | null;
  /** What to do instead. */
  recovery: string | null;
}

/**
 * Whether the merge preview would accept this pair, and if not, why and what to do.
 *
 * Reads the blockers the API computed from the merge service's own rule rather than re-deriving
 * one here, so this screen cannot promise a merge the preview then refuses. An older API that
 * sends only the flag still gets an honest answer for the one refusal it could have meant.
 */
export function describeMergeAvailability(candidate: DuplicateCandidate): MergeAvailability {
  if (candidate.mergeEligible) {
    return { available: true, label: 'Can be merged', reason: null, recovery: null };
  }

  const blocker: MergeFinding | undefined =
    candidate.mergeBlockers?.[0] ??
    (candidate.crossClinic ? mergeFinding('CROSS_CLINIC') : undefined);

  return {
    available: false,
    label: 'Merge not available',
    reason: blocker
      ? blocker.detail
        ? `${blocker.label}: ${blocker.detail}.`
        : `${blocker.label}.`
      : null,
    recovery: blocker?.recovery ?? null,
  };
}

/** Two clinics, in the order the API sorted them, as one phrase. */
export function clinicPairLabel(row: Pick<CrossClinicBurdenRow, 'clinics'>): string {
  return `${row.clinics[0].name} and ${row.clinics[1].name}`;
}

/**
 * The burden table, one row per clinic pair, for a spreadsheet.
 *
 * Counts and clinic names only: this is the number leadership takes into a meeting, and nothing
 * in it identifies a patient, so it can leave the product without becoming a copy of the charts.
 */
export function burdenTableRows(burden: CrossClinicBurden): (string | number)[][] {
  return [
    [
      'Clinic A',
      'Clinic B',
      'Same organisation',
      'Pairs',
      'Needs review',
      'Confirmed',
      'Ruled out',
      DUPLICATE_CONFIDENCE_LABELS.HIGH,
      DUPLICATE_CONFIDENCE_LABELS.MEDIUM,
      DUPLICATE_CONFIDENCE_LABELS.LOW,
    ],
    ...burden.clinicPairs.map((row) => [
      row.clinics[0].name,
      row.clinics[1].name,
      row.sameOrganization ? 'Yes' : 'No',
      row.total,
      row.open,
      row.confirmed,
      row.dismissed,
      row.high,
      row.medium,
      row.low,
    ]),
  ];
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

/**
 * The rules that tolerate a difference rather than requiring an exact value.
 *
 * Exactly one, today. It is kept as a set because the distinction matters more than the count:
 * every other rule means "these two values are identical", and this one means "close enough".
 */
const APPROXIMATE_MATCH_REASONS = new Set<DuplicateMatchReason>(['NAME_SIMILAR_AND_DOB']);

/**
 * A note for a pair matched partly on a resemblance, or null when everything matched exactly.
 *
 * Worth saying out loud on a screen whose whole job is deciding whether two records are one
 * person. "Similar name, same date of birth" reads to a hurried operator as a match like any
 * other, and the names being spelt differently is precisely the thing they should go and look
 * at before merging anything.
 */
export function describeMatchPrecision(reasons: DuplicateMatchReason[]): string | null {
  return reasons.some((reason) => APPROXIMATE_MATCH_REASONS.has(reason))
    ? 'The names are not spelt the same. Compare them before merging.'
    : null;
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

/**
 * Enum values never reach the screen.
 *
 * The comparison table reads back raw columns, so without these an operator is shown
 * "NATIONAL_ID" and "FEMALE" -- system vocabulary the design system rules out, and, worse, two
 * values that look like codes in a panel whose whole job is helping someone judge whether two
 * codes describe one person. Unknown values fall through unchanged rather than being hidden.
 */
const NATIONAL_ID_TYPE_LABELS: Record<string, string> = {
  NATIONAL_ID: 'National ID',
  VOTER_ID: 'Voter ID',
  PASSPORT: 'Passport',
  OTHER: 'Other',
};

const SEX_LABELS: Record<string, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
  UNKNOWN: 'Not recorded',
};

export function nationalIdTypeLabel(value: string | null): string | null {
  if (!value) return null;
  return NATIONAL_ID_TYPE_LABELS[value] ?? value;
}

export function sexLabel(value: string | null): string | null {
  if (!value) return null;
  return SEX_LABELS[value] ?? value;
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
  // No chart-code row: the table header is the two codes, and repeating them as the first row
  // costs a line of a dense panel to say nothing new.
  const rows: Array<{ label: string; a: string; b: string }> = [
    { label: 'First name', a: present(left.firstName), b: present(right.firstName) },
    { label: 'Last name', a: present(left.lastName), b: present(right.lastName) },
    { label: 'Date of birth', a: formatDateOfBirth(left.dob), b: formatDateOfBirth(right.dob) },
    { label: 'Sex', a: present(sexLabel(left.sex)), b: present(sexLabel(right.sex)) },
    { label: 'Phone', a: present(left.phoneE164), b: present(right.phoneE164) },
    { label: 'Email', a: present(left.email), b: present(right.email) },
    {
      label: 'ID type',
      a: present(nationalIdTypeLabel(left.nationalIdType)),
      b: present(nationalIdTypeLabel(right.nationalIdType)),
    },
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
