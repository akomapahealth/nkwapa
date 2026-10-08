import { formatRate, openWork } from './organization-report';

describe('organization report formatting', () => {
  it('shows a rate with the counts behind it', () => {
    expect(formatRate({ numerator: 153, denominator: 303, percent: 50 })).toBe('50% (153 of 303)');
  });

  // Nothing to divide by is not the same as zero percent.
  it('says there is no data rather than 0%', () => {
    expect(formatRate({ numerator: 0, denominator: 0, percent: null })).toBe('No data');
  });

  it('adds up the open backlog', () => {
    expect(openWork({ openDrafts: 5, awaitingReview: 2, readyToFinalize: 1 })).toBe(8);
  });
});
