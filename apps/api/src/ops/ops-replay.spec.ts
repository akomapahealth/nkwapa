import { BadRequestException } from '@nestjs/common';
import { OPS_REPLAY_CLOCK_SKEW_MS, resolveReplayTime } from './ops-replay';

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return ((error as BadRequestException).getResponse() as { code: string }).code;
  }
  throw new Error('expected a refusal');
};

describe('resolveReplayTime', () => {
  const now = new Date('2026-03-21T12:00:00.000Z');

  it('keeps the time an action happened on the device, within the clinic day', () => {
    const occurredAt = new Date('2026-03-21T08:15:00.000Z');
    expect(resolveReplayTime(occurredAt, now, 'Africa/Accra')).toEqual(occurredAt);
  });

  it('refuses an action from an earlier clinic day', () => {
    expect(
      codeOf(() => resolveReplayTime(new Date('2026-03-20T23:59:00.000Z'), now, 'Africa/Accra')),
    ).toBe('OPS_REPLAY_EXPIRED');
  });

  it('judges the day in the clinic’s zone, not UTC', () => {
    // 23:30Z on the 21st and 03:45Z on the 22nd are the same evening in New York, but two
    // different days in Accra.
    const evening = new Date('2026-03-21T23:30:00.000Z');
    const laterThatNight = new Date('2026-03-22T03:45:00.000Z');
    expect(resolveReplayTime(evening, laterThatNight, 'America/New_York')).toEqual(evening);
    expect(codeOf(() => resolveReplayTime(evening, laterThatNight, 'Africa/Accra'))).toBe(
      'OPS_REPLAY_EXPIRED',
    );
  });

  it('clamps a device clock a little ahead to the server’s now', () => {
    const ahead = new Date(now.getTime() + OPS_REPLAY_CLOCK_SKEW_MS - 1_000);
    expect(resolveReplayTime(ahead, now, 'Africa/Accra')).toEqual(now);
  });

  it('refuses a device clock far ahead', () => {
    const farAhead = new Date(now.getTime() + OPS_REPLAY_CLOCK_SKEW_MS + 1_000);
    expect(codeOf(() => resolveReplayTime(farAhead, now, 'Africa/Accra'))).toBe(
      'INVALID_OPS_TIME_ORDER',
    );
  });

  it('refuses a time that is not a date', () => {
    expect(codeOf(() => resolveReplayTime(new Date('nonsense'), now, 'Africa/Accra'))).toBe(
      'INVALID_OPS_TIME_ORDER',
    );
  });
});
