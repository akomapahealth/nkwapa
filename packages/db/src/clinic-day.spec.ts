import { clinicDayWindow, startOfDayInTimeZone, todayInTimeZone } from './clinic-day';

/** The local wall-clock reading of an instant, for asserting where a boundary actually landed. */
function localReading(at: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(at);
}

describe('startOfDayInTimeZone', () => {
  it('is plain UTC midnight for a zone that is on UTC', () => {
    expect(startOfDayInTimeZone('2026-03-21', 'Africa/Accra').toISOString()).toBe(
      '2026-03-21T00:00:00.000Z',
    );
  });

  it('shifts by the offset for a zone behind UTC', () => {
    expect(startOfDayInTimeZone('2026-03-21', 'America/New_York').toISOString()).toBe(
      '2026-03-21T04:00:00.000Z',
    );
  });

  it('shifts by the offset for a zone ahead of UTC', () => {
    // The local day starts on the previous UTC date entirely.
    expect(startOfDayInTimeZone('2026-06-15', 'Asia/Tokyo').toISOString()).toBe(
      '2026-06-14T15:00:00.000Z',
    );
  });

  it('handles offsets that are not whole hours', () => {
    expect(startOfDayInTimeZone('2026-06-15', 'Asia/Kolkata').toISOString()).toBe(
      '2026-06-14T18:30:00.000Z',
    );
    expect(startOfDayInTimeZone('2026-06-15', 'Pacific/Chatham').toISOString()).toBe(
      '2026-06-14T11:15:00.000Z',
    );
  });

  it('uses the offset in force on that date, not the one in force today', () => {
    // Either side of the US spring-forward: the same local midnight, different UTC instants.
    expect(startOfDayInTimeZone('2026-03-07', 'America/New_York').toISOString()).toBe(
      '2026-03-07T05:00:00.000Z',
    );
    expect(startOfDayInTimeZone('2026-03-09', 'America/New_York').toISOString()).toBe(
      '2026-03-09T04:00:00.000Z',
    );
  });

  it('lands on local midnight for every zone it is asked about', () => {
    const zones = [
      'Africa/Accra',
      'America/New_York',
      'Europe/London',
      'Asia/Tokyo',
      'Asia/Kolkata',
      'Australia/Sydney',
      'Pacific/Chatham',
    ];
    for (const zone of zones) {
      for (const date of ['2026-01-15', '2026-03-29', '2026-07-01', '2026-11-01']) {
        expect(localReading(startOfDayInTimeZone(date, zone), zone)).toBe(`${date}, 00:00:00`);
      }
    }
  });

  it('starts the day at the transition when local midnight does not exist', () => {
    // Santiago and Havana both spring forward at midnight, so 00:00 is skipped entirely and
    // the naive arithmetic lands an hour into the previous day.
    for (const [date, zone] of [
      ['2026-09-06', 'America/Santiago'],
      ['2026-03-08', 'America/Havana'],
    ] as const) {
      const start = startOfDayInTimeZone(date, zone);
      expect(localReading(start, zone).startsWith(date)).toBe(true);
      expect(localReading(start, zone)).toBe(`${date}, 01:00:00`);
    }
  });

  it('falls back to the default zone rather than throwing on an unusable one', () => {
    expect(startOfDayInTimeZone('2026-03-21', 'Africa/Akra').toISOString()).toBe(
      '2026-03-21T00:00:00.000Z',
    );
    expect(startOfDayInTimeZone('2026-03-21', null).toISOString()).toBe('2026-03-21T00:00:00.000Z');
  });

  it('refuses a value that is not a date', () => {
    expect(() => startOfDayInTimeZone('not-a-date', 'Africa/Accra')).toThrow(RangeError);
  });
});

describe('todayInTimeZone', () => {
  it('reports the local date, which is not always the UTC date', () => {
    // 23:30 UTC is already tomorrow in Tokyo and still today in New York.
    const at = new Date('2026-06-15T23:30:00.000Z');
    expect(todayInTimeZone('Asia/Tokyo', at)).toBe('2026-06-16');
    expect(todayInTimeZone('America/New_York', at)).toBe('2026-06-15');
    expect(todayInTimeZone('Africa/Accra', at)).toBe('2026-06-15');
  });

  it('reports the previous date for a zone far enough behind', () => {
    const at = new Date('2026-06-15T02:00:00.000Z');
    expect(todayInTimeZone('America/Los_Angeles', at)).toBe('2026-06-14');
  });

  it('falls back to the default zone on an unusable one', () => {
    const at = new Date('2026-06-15T23:30:00.000Z');
    expect(todayInTimeZone('Mars/Olympus', at)).toBe('2026-06-15');
  });
});

describe('clinicDayWindow', () => {
  it('covers exactly one local day, inclusive of its last millisecond', () => {
    const window = clinicDayWindow('2026-03-21', 'America/New_York');
    expect(window.start.toISOString()).toBe('2026-03-21T04:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-03-22T03:59:59.999Z');
    expect(window.end.getTime() - window.start.getTime()).toBe(86_400_000 - 1);
  });

  it('is 23 hours long on the day a zone springs forward', () => {
    const window = clinicDayWindow('2026-03-08', 'America/New_York');
    // Derived from the next day's start, not by adding 24 hours, so the short day stays one day.
    expect(window.end.getTime() - window.start.getTime()).toBe(23 * 3_600_000 - 1);
  });

  it('is 25 hours long on the day a zone falls back', () => {
    const window = clinicDayWindow('2026-11-01', 'America/New_York');
    expect(window.end.getTime() - window.start.getTime()).toBe(25 * 3_600_000 - 1);
  });

  it('reports the canonical zone it actually used', () => {
    expect(clinicDayWindow('2026-03-21', 'america/new_york').timezone).toBe('America/New_York');
    expect(clinicDayWindow('2026-03-21', 'Africa/Akra').timezone).toBe('Africa/Accra');
  });

  it('defaults to today in the clinic zone when no date is given', () => {
    const window = clinicDayWindow(undefined, 'Asia/Tokyo');
    expect(window.date).toBe(todayInTimeZone('Asia/Tokyo'));
    // The UTC date can differ, which is the bug this replaces.
    expect(window.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('never lets one day’s window overlap the next', () => {
    for (const zone of ['Africa/Accra', 'America/New_York', 'Asia/Kolkata', 'Australia/Sydney']) {
      const first = clinicDayWindow('2026-03-21', zone);
      const second = clinicDayWindow('2026-03-22', zone);
      expect(second.start.getTime()).toBe(first.end.getTime() + 1);
    }
  });
});
