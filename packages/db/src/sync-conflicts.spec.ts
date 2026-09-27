import {
  DETERMINISTIC_SYNC_CONFLICT_CODES,
  SYNC_CONFLICT_CATEGORIES,
  SYNC_CONFLICT_CODES,
  isKnownSyncConflictCode,
  syncConflictCategory,
  type SyncConflictCode,
} from './sync-conflicts';

describe('sync conflict catalog', () => {
  const codes = Object.keys(SYNC_CONFLICT_CODES) as SyncConflictCode[];

  it('assigns every code a known category', () => {
    for (const key of codes) {
      expect(SYNC_CONFLICT_CATEGORIES).toContain(SYNC_CONFLICT_CODES[key].category);
    }
  });

  it('keeps codes in the SCREAMING_SNAKE_CASE the server emits', () => {
    for (const key of codes) {
      expect(key).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  it('derives the deterministic set from the catalog', () => {
    expect([...DETERMINISTIC_SYNC_CONFLICT_CODES].sort()).toEqual(
      codes.filter((key) => SYNC_CONFLICT_CODES[key].deterministic).sort(),
    );
  });

  // A merge cannot be undone and a finalized encounter cannot be reopened by a replay; if either
  // stopped being deterministic, the server would re-run the handler for every retry.
  it.each(['PATIENT_MERGED', 'DUPLICATE_NATIONAL_ID', 'CONFLICT_FINALIZED'] as const)(
    'treats %s as deterministic',
    (key) => {
      expect(DETERMINISTIC_SYNC_CONFLICT_CODES.has(key)).toBe(true);
    },
  );

  // Transient and fixable outcomes must stay retryable, or a device can never drain its queue
  // after the cause is fixed.
  it.each([
    'APPLICATION_ERROR',
    'FORBIDDEN',
    'VALIDATION_ERROR',
    'PATIENT_NATIONAL_ID_REQUIRED',
  ] as const)('never caches %s', (key) => {
    expect(DETERMINISTIC_SYNC_CONFLICT_CODES.has(key)).toBe(false);
  });

  it('recognizes only catalog codes', () => {
    expect(isKnownSyncConflictCode('PATIENT_MERGED')).toBe(true);
    expect(isKnownSyncConflictCode('toString')).toBe(false);
    expect(isKnownSyncConflictCode(undefined)).toBe(false);
  });

  it('falls back on the result status for a code this build does not know', () => {
    expect(syncConflictCategory('DUPLICATE_NATIONAL_ID')).toBe('patient');
    expect(syncConflictCategory('SOMETHING_NEW', 'CONFLICT')).toBe('stale');
    expect(syncConflictCategory('SOMETHING_NEW', 'ERROR')).toBe('unexpected');
    expect(syncConflictCategory(undefined)).toBe('unexpected');
  });
});
