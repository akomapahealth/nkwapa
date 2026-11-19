/** Queue lanes page through the API 50 at a time; the tab count comes from /encounters/counts (#307). */

import type { FollowUpTier } from '@nkwapa/db/follow-up-stratification';
import { parseFollowUpTier } from '@/components/patients/follow-up/FollowUpTierFilter';
import { HYPERTENSION_CLASSIFICATIONS, type HypertensionClassification } from '@/lib/hypertension';

export const QUEUE_PAGE_SIZE = 50;

export type EncounterQueueStage = 'DRAFT' | 'REVIEW' | 'DOCTOR_READY';

export interface EncounterQueueCounts {
  drafts: number;
  review: number;
  finalize: number;
}

/** Search and filters shared by every lane, in their URL and API names (#340). */
export interface QueueFilters {
  search: string;
  bpClassification: HypertensionClassification | '';
  glucoseFlagged: boolean;
  /** Follow-up tier (#336); the API refuses it without FOLLOW_UP.READ. */
  riskTier: FollowUpTier | '';
  /** Clinic-local days, YYYY-MM-DD, both inclusive. */
  createdFrom: string;
  createdTo: string;
}

export const NO_QUEUE_FILTERS: QueueFilters = {
  search: '',
  bpClassification: '',
  glucoseFlagged: false,
  riskTier: '',
  createdFrom: '',
  createdTo: '',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Reads the filters back from the address bar, dropping anything the API would refuse. */
export function parseQueueFilters(params: URLSearchParams): QueueFilters {
  const bp = params.get('bpClassification') ?? '';
  const date = (key: string) => {
    const value = params.get(key) ?? '';
    return ISO_DATE.test(value) ? value : '';
  };
  return {
    search: (params.get('search') ?? '').slice(0, 80),
    bpClassification: (HYPERTENSION_CLASSIFICATIONS as readonly string[]).includes(bp)
      ? (bp as HypertensionClassification)
      : '',
    glucoseFlagged: params.get('glucoseFlagged') === 'true',
    riskTier: parseFollowUpTier(params.get('riskTier')),
    createdFrom: date('createdFrom'),
    createdTo: date('createdTo'),
  };
}

/** Writes only the filters that are set, so an unfiltered lane keeps a clean URL. */
export function queueFilterParams(filters: QueueFilters, params = new URLSearchParams()) {
  const search = filters.search.trim();
  if (search) params.set('search', search);
  if (filters.bpClassification) params.set('bpClassification', filters.bpClassification);
  if (filters.glucoseFlagged) params.set('glucoseFlagged', 'true');
  if (filters.riskTier) params.set('riskTier', filters.riskTier);
  if (filters.createdFrom) params.set('createdFrom', filters.createdFrom);
  if (filters.createdTo) params.set('createdTo', filters.createdTo);
  return params;
}

export function hasQueueFilters(filters: QueueFilters) {
  return queueFilterParams(filters).size > 0;
}

export function encounterQueueQuery(
  stage: EncounterQueueStage,
  skip = 0,
  filters: QueueFilters = NO_QUEUE_FILTERS,
) {
  const params = new URLSearchParams(
    stage === 'DRAFT' ? { status: 'DRAFT' } : { status: 'IN_REVIEW', stage },
  );
  params.set('take', String(QUEUE_PAGE_SIZE));
  if (skip > 0) params.set('skip', String(skip));
  return queueFilterParams(filters, params).toString();
}

/** The lane's true size; the loaded rows only when the count could not be read. */
export function laneTotal(
  counts: EncounterQueueCounts | null,
  lane: keyof EncounterQueueCounts,
  loaded: number,
) {
  return counts ? Math.max(counts[lane], loaded) : loaded;
}
