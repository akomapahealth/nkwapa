import {
  RUN_KEY_PATTERN,
  adHocRunKey,
  baseRunKey,
  isoWeek,
  nextRunAt,
  revisionRunKey,
  runWindow,
  scheduledRunKey,
} from './research-run-key';

const CLINIC_KEY = '3f9a2c1d5e6b7a8c9d0e1f2a3b4c5d6e';

describe('research run keys', () => {
  it('names a weekly run by its ISO week', () => {
    expect(scheduledRunKey(CLINIC_KEY, 'WEEKLY', '2026-10-05')).toBe('rx-3f9a2c1d-w2026-41');
  });

  it('puts the days around new year into the ISO year their Thursday falls in', () => {
    expect(isoWeek('2026-12-31')).toEqual({ year: 2026, week: 53 });
    expect(isoWeek('2027-01-01')).toEqual({ year: 2026, week: 53 });
    expect(isoWeek('2027-01-04')).toEqual({ year: 2027, week: 1 });
    expect(isoWeek('2024-12-30')).toEqual({ year: 2025, week: 1 });
  });

  it('names a monthly run by its month', () => {
    expect(scheduledRunKey(CLINIC_KEY, 'MONTHLY', '2026-10-01')).toBe('rx-3f9a2c1d-m2026-10');
  });

  it('gives the same clinic and period the same key every time', () => {
    expect(scheduledRunKey(CLINIC_KEY, 'MONTHLY', '2026-10-01')).toBe(
      scheduledRunKey(CLINIC_KEY, 'MONTHLY', '2026-10-28'),
    );
  });

  it('gives an ad-hoc run a date and a random suffix', () => {
    const key = adHocRunKey(CLINIC_KEY, '2026-10-05');
    expect(key).toMatch(/^rx-3f9a2c1d-a20261005-[0-9a-z]{4}$/);
    expect(key).toMatch(RUN_KEY_PATTERN);
  });

  it('numbers a revision of a period, replacing any earlier revision', () => {
    expect(revisionRunKey('rx-3f9a2c1d-m2026-10', 2)).toBe('rx-3f9a2c1d-m2026-10-r2');
    expect(revisionRunKey('rx-3f9a2c1d-m2026-10-r2', 3)).toBe('rx-3f9a2c1d-m2026-10-r3');
    expect(baseRunKey('rx-3f9a2c1d-m2026-10-r3')).toBe('rx-3f9a2c1d-m2026-10');
    expect(() => revisionRunKey('rx-3f9a2c1d-m2026-10', 1)).toThrow(RangeError);
  });

  it('refuses anything that is not a research clinic key, such as a clinic uuid', () => {
    expect(() =>
      scheduledRunKey('6f1c0c1e-2b7d-4c55-9a64-1d2f3a4b5c6d', 'MONTHLY', '2026-10-01'),
    ).toThrow(/research clinic key/);
  });

  it('matches every key it produces, and the legacy backfill', () => {
    expect(scheduledRunKey(CLINIC_KEY, 'WEEKLY', '2026-10-05')).toMatch(RUN_KEY_PATTERN);
    expect(revisionRunKey('rx-3f9a2c1d-m2026-10', 2)).toMatch(RUN_KEY_PATTERN);
    expect('rx-legacy-a20260915-0a1b2c').toMatch(RUN_KEY_PATTERN);
  });
});

describe('research schedule cadence', () => {
  const monthly = { cadence: 'MONTHLY' as const, dayOfWeek: null, dayOfMonth: 1, localHour: 3 };
  const weekly = { cadence: 'WEEKLY' as const, dayOfWeek: 1, dayOfMonth: null, localHour: 3 };

  it('fires monthly on the day and local hour in a clinic on UTC', () => {
    const next = nextRunAt(monthly, 'Africa/Accra', new Date('2026-10-30T12:00:00Z'));
    expect(next.toISOString()).toBe('2026-11-01T03:00:00.000Z');
  });

  it('fires later the same day when the hour has not passed yet', () => {
    const next = nextRunAt(monthly, 'Africa/Accra', new Date('2026-11-01T02:59:00Z'));
    expect(next.toISOString()).toBe('2026-11-01T03:00:00.000Z');
  });

  it('is strictly after the instant it is given, so a run never refires its own slot', () => {
    const slot = new Date('2026-11-01T03:00:00.000Z');
    expect(nextRunAt(monthly, 'Africa/Accra', slot).toISOString()).toBe('2026-12-01T03:00:00.000Z');
  });

  it('uses the local hour in a clinic that is not on UTC', () => {
    // Nairobi is UTC+3: 03:00 local on Monday 2026-11-02 is 00:00 UTC.
    const next = nextRunAt(weekly, 'Africa/Nairobi', new Date('2026-10-30T12:00:00Z'));
    expect(next.toISOString()).toBe('2026-11-02T00:00:00.000Z');
  });

  it('finds the local Monday when the clinic is already a day ahead of UTC', () => {
    // 2026-11-01T20:00Z is already Monday 2026-11-02 08:00 in Auckland (UTC+13).
    const next = nextRunAt(
      { ...weekly, localHour: 9 },
      'Pacific/Auckland',
      new Date('2026-11-01T19:00:00Z'),
    );
    expect(next.toISOString()).toBe('2026-11-01T20:00:00.000Z');
  });

  it('covers the coverage start through the last complete local day before the run', () => {
    expect(runWindow('2026-01-01', new Date('2026-11-01T03:00:00Z'), 'Africa/Accra')).toEqual({
      localDate: '2026-11-01',
      fromDate: '2026-01-01',
      toDate: '2026-10-31',
    });
  });
});
