import { deriveAsyncResourceFlags, type AsyncResourceStatus } from './async-resource-state';

function flags(hasData: boolean, status: AsyncResourceStatus, blocked = false) {
  return deriveAsyncResourceFlags({ hasData, status, blocked });
}

describe('deriveAsyncResourceFlags', () => {
  describe('the first load, with nothing to show yet', () => {
    it('skeletons while the first request is in flight', () => {
      expect(flags(false, 'loading')).toEqual({
        isInitialLoading: true,
        isRefreshing: false,
        isStale: false,
      });
    });

    it('skeletons before the request starts, so there is no blank frame', () => {
      expect(flags(false, 'idle').isInitialLoading).toBe(true);
    });

    it('does not skeleton forever when the read is blocked and will never start', () => {
      // Offline, signed out, or a disabled tab. An idle read that is never going to run must
      // fall through to whatever the caller shows instead, not hold a skeleton indefinitely.
      expect(flags(false, 'idle', true).isInitialLoading).toBe(false);
    });

    it('reports a failed first load as neither loading nor stale', () => {
      // There is no previous version to be stale about; the caller renders a full error.
      expect(flags(false, 'error')).toEqual({
        isInitialLoading: false,
        isRefreshing: false,
        isStale: false,
      });
    });
  });

  describe('refreshing over data that is already on screen', () => {
    it('is refreshing, and never initial loading', () => {
      // This is the whole point of the hook: a poll on clinic wifi must not blank a screen
      // someone is reading a measurement off.
      expect(flags(true, 'loading')).toEqual({
        isInitialLoading: false,
        isRefreshing: true,
        isStale: false,
      });
    });

    it('goes stale rather than blank when the refresh fails', () => {
      expect(flags(true, 'error')).toEqual({
        isInitialLoading: false,
        isRefreshing: false,
        isStale: true,
      });
    });

    it('is quiet once the refresh lands', () => {
      expect(flags(true, 'ready')).toEqual({
        isInitialLoading: false,
        isRefreshing: false,
        isStale: false,
      });
    });
  });

  it('never reports initial loading and refreshing at the same time', () => {
    const statuses: AsyncResourceStatus[] = ['idle', 'loading', 'ready', 'error'];
    for (const status of statuses) {
      for (const hasData of [true, false]) {
        for (const blocked of [true, false]) {
          const result = flags(hasData, status, blocked);
          expect(result.isInitialLoading && result.isRefreshing).toBe(false);
        }
      }
    }
  });
});
