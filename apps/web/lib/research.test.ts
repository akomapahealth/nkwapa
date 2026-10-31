import {
  describeCadence,
  describeChanges,
  formatBytes,
  ordinal,
  skipReasonLabel,
} from './research';

describe('research wording', () => {
  it('describes a cadence in the clinic time zone', () => {
    expect(
      describeCadence(
        { cadence: 'MONTHLY', dayOfWeek: null, dayOfMonth: 1, localHour: 3 },
        'Africa/Accra',
      ),
    ).toBe('Monthly, on the 1st at 03:00 Africa/Accra');
    expect(
      describeCadence({ cadence: 'WEEKLY', dayOfWeek: 7, dayOfMonth: null, localHour: 22 }, 'UTC'),
    ).toBe('Weekly, on Sunday at 22:00 UTC');
  });

  it('orders days of the month', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 28].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '28th',
    ]);
  });

  it('summarises changes since the previous run', () => {
    const base = {
      runKey: 'rx-3f9a2c1d-m2026-11',
      consentedSubjects: 14,
      previousConsentedSubjects: 12,
      subjectsAdded: 3,
      subjectsRevoked: 1,
      subjectsOtherwiseRemoved: 0,
      rowCountDeltas: {},
    };
    expect(describeChanges(null)).toBeNull();
    expect(describeChanges({ ...base, previousRunKey: null })).toBe(
      'First run: 14 consented patients.',
    );
    expect(describeChanges({ ...base, previousRunKey: 'rx-3f9a2c1d-m2026-10' })).toBe(
      '14 consented patients since rx-3f9a2c1d-m2026-10: 3 added, 1 revoked.',
    );
    expect(
      describeChanges({
        ...base,
        previousRunKey: 'rx-3f9a2c1d-m2026-10',
        subjectsOtherwiseRemoved: 2,
      }),
    ).toContain('2 merged or removed');
  });

  it('explains skip reasons and falls back for unknown ones', () => {
    expect(skipReasonLabel('BELOW_MINIMUM_COHORT')).toMatch(/Too few patients/);
    expect(skipReasonLabel('SOMETHING_NEW')).toBe('The run was skipped.');
  });

  it('formats sizes', () => {
    expect(formatBytes(null)).toBeNull();
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(4096)).toBe('4 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
