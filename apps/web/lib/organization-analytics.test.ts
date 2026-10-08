import { UNZONED_FILTER_VALUE } from './clinic-zones';
import {
  ANALYTICS_MAX_RANGE_DAYS,
  APPOINTMENT_STATUS_LABELS,
  EMPTY_COHORT_FILTERS,
  cohortFilterProblem,
  hasActiveCohortFilters,
  labelled,
  organizationAnalyticsQuery,
} from './organization-analytics';

describe('organizationAnalyticsQuery', () => {
  it('sends no query string when nothing is filtered', () => {
    expect(organizationAnalyticsQuery('org-1', EMPTY_COHORT_FILTERS)).toEqual({
      path: '/organizations/org-1/analytics',
      resourceKey: 'organization-analytics:org-1:',
    });
  });

  it('sends every filter that is set, and keys the cache by exactly what was sent', () => {
    const query = organizationAnalyticsQuery('org-1', {
      from: '2026-09-01',
      to: '2026-09-30',
      clinicId: 'clinic-1',
      zone: UNZONED_FILTER_VALUE,
      workflow: 'EYE',
      encounterStatus: 'FINALIZED',
      appointmentStatus: 'NO_SHOW',
    });
    const params = new URL(query.path, 'http://x').searchParams;
    expect(Object.fromEntries(params)).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
      clinicId: 'clinic-1',
      zoneCode: UNZONED_FILTER_VALUE,
      workflow: 'EYE',
      encounterStatus: 'FINALIZED',
      appointmentStatus: 'NO_SHOW',
    });
    expect(query.resourceKey).toBe(`organization-analytics:org-1:${params.toString()}`);
  });

  it('gives different filters different cache keys', () => {
    const a = organizationAnalyticsQuery('org-1', { ...EMPTY_COHORT_FILTERS, workflow: 'EYE' });
    const b = organizationAnalyticsQuery('org-1', {
      ...EMPTY_COHORT_FILTERS,
      workflow: 'DIABETES',
    });
    expect(a.resourceKey).not.toBe(b.resourceKey);
  });
});

describe('cohortFilterProblem', () => {
  it('accepts blank dates, a single day, and the longest allowed range', () => {
    expect(cohortFilterProblem(EMPTY_COHORT_FILTERS)).toBeNull();
    expect(
      cohortFilterProblem({ ...EMPTY_COHORT_FILTERS, from: '2026-09-01', to: '2026-09-01' }),
    ).toBeNull();
    expect(
      cohortFilterProblem({ ...EMPTY_COHORT_FILTERS, from: '2025-01-01', to: '2026-01-01' }),
    ).toBeNull();
  });

  it('flags a backwards range and one longer than the API allows', () => {
    expect(
      cohortFilterProblem({ ...EMPTY_COHORT_FILTERS, from: '2026-09-10', to: '2026-09-01' }),
    ).toMatch(/after/);
    expect(
      cohortFilterProblem({ ...EMPTY_COHORT_FILTERS, from: '2024-01-01', to: '2026-01-01' }),
    ).toContain(String(ANALYTICS_MAX_RANGE_DAYS));
  });
});

describe('hasActiveCohortFilters', () => {
  it('is false only when every filter is cleared', () => {
    expect(hasActiveCohortFilters(EMPTY_COHORT_FILTERS)).toBe(false);
    expect(hasActiveCohortFilters({ ...EMPTY_COHORT_FILTERS, from: '2026-09-01' })).toBe(true);
    expect(hasActiveCohortFilters({ ...EMPTY_COHORT_FILTERS, zone: UNZONED_FILTER_VALUE })).toBe(
      true,
    );
  });
});

describe('labelled', () => {
  it('keys counts by label in the label order, zeros included', () => {
    const result = labelled(
      { CONFIRMED: 0, COMPLETED: 3, CANCELLED: 1, NO_SHOW: 2 },
      APPOINTMENT_STATUS_LABELS,
    );
    expect(Object.entries(result)).toEqual([
      ['Confirmed', 0],
      ['Completed', 3],
      ['Cancelled', 1],
      ['No-show', 2],
    ]);
  });
});
