import { shouldSeedFormValues } from './form-seeding';

const unseeded = { hasSeeded: false, seededRecordId: undefined };

describe('shouldSeedFormValues', () => {
  it('waits for the record rather than seeding from nothing', () => {
    expect(shouldSeedFormValues({ hasRecord: false, recordId: undefined, ...unseeded })).toBe(
      false,
    );
  });

  it('seeds the record that arrives after the form mounted', () => {
    expect(shouldSeedFormValues({ hasRecord: true, recordId: 'rec-1', ...unseeded })).toBe(true);
  });

  /*
    The refetch case. The encounter page passes `onSaved={fetchData}`, so every save hands the
    form a new object for the same record; re-seeding from it discarded whatever had been typed
    since, silently.
  */
  it('leaves the form alone when the same record is handed back', () => {
    expect(
      shouldSeedFormValues({
        hasRecord: true,
        recordId: 'rec-1',
        hasSeeded: true,
        seededRecordId: 'rec-1',
      }),
    ).toBe(false);
  });

  it('seeds again when a different record takes its place', () => {
    expect(
      shouldSeedFormValues({
        hasRecord: true,
        recordId: 'rec-2',
        hasSeeded: true,
        seededRecordId: 'rec-1',
      }),
    ).toBe(true);
  });

  /*
    A record with no identity of its own. The clinician plan is a projection of its assessment's
    columns, so its caller states the encounter as the identity; a caller that can state nothing
    still seeds exactly once, which is the safe direction.
  */
  it('seeds once for a record with no stated identity, and not again', () => {
    expect(shouldSeedFormValues({ hasRecord: true, recordId: undefined, ...unseeded })).toBe(true);
    expect(
      shouldSeedFormValues({
        hasRecord: true,
        recordId: undefined,
        hasSeeded: true,
        seededRecordId: undefined,
      }),
    ).toBe(false);
  });
});
