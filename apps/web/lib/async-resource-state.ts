export type AsyncResourceStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * The three booleans a caller renders from, derived from the two the hook actually tracks.
 *
 * This lives apart from `use-async-resource.ts` because that module pulls in React context, and
 * the rules below are worth pinning with a plain test. They are easy to get subtly wrong and
 * expensive when wrong: `isInitialLoading` staying true once data has arrived is a permanent
 * skeleton, and folding `isRefreshing` into it is a screen that blanks on every poll, which is
 * the exact failure the hook exists to remove.
 */
export function deriveAsyncResourceFlags({
  hasData,
  status,
  blocked,
}: {
  hasData: boolean;
  status: AsyncResourceStatus;
  /** No token, offline, or explicitly disabled: this read is never going to run. */
  blocked: boolean;
}): {
  isInitialLoading: boolean;
  isRefreshing: boolean;
  isStale: boolean;
} {
  return {
    // 'idle' counts as loading only while a load is actually going to happen. A blocked read is
    // idle forever, and must not hold a skeleton forever with it.
    isInitialLoading: !hasData && (status === 'loading' || (status === 'idle' && !blocked)),
    isRefreshing: hasData && status === 'loading',
    isStale: hasData && status === 'error',
  };
}
