import {
  describeScreening,
  presetFor,
  presetRange,
  screenedCountLine,
  screenedRangeError,
} from './patient-registry-screened';

describe('screened presets', () => {
  const today = '2026-10-10';

  it('maps each preset to a range ending today', () => {
    expect(presetRange('today', today)).toEqual({ from: '2026-10-10', to: '' });
    expect(presetRange('last7', today)).toEqual({ from: '2026-10-04', to: '2026-10-10' });
    expect(presetRange('any', today)).toEqual({ from: '', to: '' });
  });

  it('reads a range from a shared link back as its preset, or as custom', () => {
    expect(presetFor('', '', today)).toBe('any');
    expect(presetFor('2026-10-10', '', today)).toBe('today');
    expect(presetFor('2026-10-04', '2026-10-10', today)).toBe('last7');
    expect(presetFor('2026-10-01', '2026-10-15', today)).toBe('custom');
  });
});

describe('screenedRangeError', () => {
  it('accepts no range, a single day and an inclusive range of up to 366 days', () => {
    expect(screenedRangeError('', '')).toBeNull();
    expect(screenedRangeError('2026-10-10', '')).toBeNull();
    expect(screenedRangeError('2026-10-10', '2026-10-10')).toBeNull();
    expect(screenedRangeError('2026-01-01', '2027-01-01')).toBeNull();
  });

  it('explains the ranges the API would refuse', () => {
    expect(screenedRangeError('', '2026-10-10')?.field).toBe('from');
    expect(screenedRangeError('2026-10-11', '2026-10-10')?.field).toBe('to');
    expect(screenedRangeError('2026-01-01', '2027-01-02')?.message).toMatch(/366 days/);
  });
});

describe('screened labels', () => {
  it('words the count for one day and for a range', () => {
    expect(screenedCountLine(23, '2026-10-10', '')).toBe('23 patients screened 10 Oct 2026');
    expect(screenedCountLine(1, '2026-10-01', '2026-10-15')).toBe(
      '1 patient screened between 1 Oct 2026 and 15 Oct 2026',
    );
  });

  it('shows the clinic-local time, or says none was kept', () => {
    const base = { date: '2026-10-10', checkInId: 'c1' };
    expect(
      describeScreening(
        { ...base, completedAt: '2026-10-11T03:30:00.000Z', source: 'REVIEW_STATION' },
        'America/New_York',
      ),
    ).toBe('10 Oct 2026, 23:30');
    expect(
      describeScreening({ ...base, completedAt: null, source: 'LEGACY_CHECKIN' }, 'Africa/Accra'),
    ).toBe('10 Oct 2026 (time not recorded)');
  });
});
