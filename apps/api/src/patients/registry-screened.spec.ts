import { BadRequestException } from '@nestjs/common';
import { parseScreenedRange, screenedWindow } from './registry-screened';

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return ((error as BadRequestException).getResponse() as { code: string }).code;
  }
  return undefined;
}

describe('parseScreenedRange', () => {
  it('is inactive when neither date is given', () => {
    expect(parseScreenedRange(undefined, undefined)).toBeUndefined();
  });

  it('treats a lone screenedFrom as that single day', () => {
    expect(parseScreenedRange('2026-10-10', undefined)).toEqual({
      from: '2026-10-10',
      to: '2026-10-10',
    });
  });

  it('accepts an inclusive range and exactly 366 days', () => {
    expect(parseScreenedRange('2026-10-01', '2026-10-15')).toEqual({
      from: '2026-10-01',
      to: '2026-10-15',
    });
    expect(parseScreenedRange('2026-01-01', '2027-01-01')).toBeDefined();
  });

  it.each([
    [undefined, '2026-10-10', 'SCREENED_FROM_REQUIRED'],
    ['2026-02-30', undefined, 'INVALID_DATE'],
    ['2026-10-01', '2026-13-01', 'INVALID_DATE'],
    ['2026-10-11', '2026-10-10', 'INVALID_DATE_RANGE'],
    ['2026-01-01', '2027-01-02', 'DATE_RANGE_TOO_LONG'],
  ])('rejects from=%s to=%s with %s', (from, to, code) => {
    expect(codeOf(() => parseScreenedRange(from, to))).toBe(code);
  });
});

describe('screenedWindow', () => {
  it('converts clinic-local days to UTC (23:30 New York on 10 Oct is 03:30 UTC on 11 Oct)', () => {
    const window = screenedWindow({ from: '2026-10-10', to: '2026-10-10' }, 'America/New_York');
    const lateEvening = new Date('2026-10-11T03:30:00.000Z');
    expect(window.start.toISOString()).toBe('2026-10-10T04:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-10-11T03:59:59.999Z');
    expect(lateEvening >= window.start && lateEvening <= window.end).toBe(true);
  });

  it('spans a daylight-saving change without losing or gaining an hour at the edges', () => {
    // New York falls back on 1 Nov 2026: the range starts on EDT and ends on EST.
    const window = screenedWindow({ from: '2026-10-31', to: '2026-11-01' }, 'America/New_York');
    expect(window.start.toISOString()).toBe('2026-10-31T04:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-11-02T04:59:59.999Z');
  });

  it('uses Accra (UTC) days as they are', () => {
    const window = screenedWindow({ from: '2026-10-01', to: '2026-10-15' }, 'Africa/Accra');
    expect(window.start.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-10-15T23:59:59.999Z');
    expect(window.timezone).toBe('Africa/Accra');
  });
});
