import {
  encounterQueueQuery,
  hasQueueFilters,
  laneTotal,
  NO_QUEUE_FILTERS,
  parseQueueFilters,
  queueFilterParams,
} from './encounter-queues';

describe('encounter queue paging (#307)', () => {
  it('asks for one page at a time, past the rows already shown', () => {
    expect(encounterQueueQuery('DRAFT')).toBe('status=DRAFT&take=50');
    expect(encounterQueueQuery('REVIEW', 50)).toBe('status=IN_REVIEW&stage=REVIEW&take=50&skip=50');
  });

  it('shows the true lane total, not the 50 rows loaded', () => {
    expect(laneTotal({ drafts: 120, review: 0, finalize: 3 }, 'drafts', 50)).toBe(120);
  });

  it('falls back to the loaded rows when the counts are missing or behind', () => {
    expect(laneTotal(null, 'review', 12)).toBe(12);
    expect(laneTotal({ drafts: 0, review: 4, finalize: 0 }, 'review', 5)).toBe(5);
  });
});

describe('encounter queue filters (#340)', () => {
  const filters = {
    search: '  Abena ',
    bpClassification: 'STAGE2' as const,
    glucoseFlagged: true,
    riskTier: 'HIGH' as const,
    createdFrom: '2026-10-01',
    createdTo: '2026-10-31',
  };

  it('sends every set filter with the page, and nothing for unset ones', () => {
    expect(encounterQueueQuery('DRAFT', 50, filters)).toBe(
      'status=DRAFT&take=50&skip=50&search=Abena&bpClassification=STAGE2&glucoseFlagged=true&riskTier=HIGH&createdFrom=2026-10-01&createdTo=2026-10-31',
    );
    expect(encounterQueueQuery('REVIEW', 0, { ...NO_QUEUE_FILTERS, search: '   ' })).toBe(
      'status=IN_REVIEW&stage=REVIEW&take=50',
    );
    expect(hasQueueFilters(NO_QUEUE_FILTERS)).toBe(false);
  });

  it('round-trips through the URL and drops values the API would refuse', () => {
    const params = queueFilterParams(filters);
    expect(parseQueueFilters(params)).toEqual({ ...filters, search: 'Abena' });
    expect(
      parseQueueFilters(
        new URLSearchParams(
          'bpClassification=STAGE3&glucoseFlagged=yes&riskTier=SEVERE&createdFrom=10/01/2026',
        ),
      ),
    ).toEqual(NO_QUEUE_FILTERS);
  });
});
