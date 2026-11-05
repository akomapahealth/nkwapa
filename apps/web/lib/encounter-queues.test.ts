import { encounterQueueQuery, laneTotal } from './encounter-queues';

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
