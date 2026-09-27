import { formatRelativeTime } from './relative-time';

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-09-27T12:00:00.000Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it.each([
    [ago(10_000), 'just now'],
    [ago(5 * 60_000), '5 min ago'],
    [ago(3 * 3_600_000), '3 h ago'],
    [ago(26 * 3_600_000), 'yesterday'],
    [ago(3 * 86_400_000), '3 days ago'],
  ])('formats %s as %s', (iso, expected) => {
    expect(formatRelativeTime(iso, now)).toBe(expected);
  });

  it('returns nothing for a missing or unreadable time', () => {
    expect(formatRelativeTime(undefined, now)).toBe('');
    expect(formatRelativeTime('not a date', now)).toBe('');
  });
});
