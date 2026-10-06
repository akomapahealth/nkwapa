import { Backoffs } from 'bullmq';
import {
  FIRST_RETRY_DELAY_MS,
  LATER_RETRY_DELAY_MS,
  REMINDER_BACKOFF,
  reminderRetryDelay,
} from './reminder-retry';

describe('reminder retry schedule', () => {
  it('names a backoff type BullMQ hands to the worker instead of computing itself', () => {
    // A built-in type is computed by BullMQ and the worker's strategy is never asked. That is how
    // the 5s first retry silently became 60s.
    expect(Object.keys(Backoffs.builtinStrategies)).not.toContain(REMINDER_BACKOFF.type);
    expect(
      Backoffs.calculate(REMINDER_BACKOFF, 1, new Error('blip'), {} as never, reminderRetryDelay),
    ).toBe(FIRST_RETRY_DELAY_MS);
  });

  it('retries a blip after seconds and anything longer after a minute', () => {
    expect(reminderRetryDelay(1)).toBe(FIRST_RETRY_DELAY_MS);
    expect(reminderRetryDelay(2)).toBe(LATER_RETRY_DELAY_MS);
    expect(reminderRetryDelay(5)).toBe(LATER_RETRY_DELAY_MS);
  });
});
