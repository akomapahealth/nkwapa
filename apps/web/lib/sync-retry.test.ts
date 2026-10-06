import { AUTOMATIC_SYNC_RETRY_DELAYS_MS, automaticSyncRetryDelay } from './sync-retry';

describe('automatic sync retry', () => {
  it('tries again by itself after a pass the server or the network failed', () => {
    expect(automaticSyncRetryDelay('error', 0)).toBe(AUTOMATIC_SYNC_RETRY_DELAYS_MS[0]);
  });

  it('tries again by itself while a change is waiting to retry', () => {
    expect(automaticSyncRetryDelay('retrying', 0)).toBe(AUTOMATIC_SYNC_RETRY_DELAYS_MS[0]);
  });

  it.each(['success', 'attention', 'syncing', 'idle'] as const)(
    'schedules nothing after a %s pass',
    (status) => {
      expect(automaticSyncRetryDelay(status, 0)).toBeNull();
    },
  );

  it('backs off with each consecutive retry and keeps trying at the longest interval', () => {
    const delays = [0, 1, 2, 3, 4, 5, 50].map((n) => automaticSyncRetryDelay('error', n));

    expect(delays).toEqual([10_000, 30_000, 60_000, 120_000, 300_000, 300_000, 300_000]);
  });
});
