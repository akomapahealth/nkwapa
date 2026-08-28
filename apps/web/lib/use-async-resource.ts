'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { useAuth } from '@/lib/auth-context';
import { getErrorMessage, type GetToken } from '@/lib/api';
import { deriveAsyncResourceFlags, type AsyncResourceStatus } from '@/lib/async-resource-state';

export type { AsyncResourceStatus };

export interface AsyncResourceState<T> {
  /**
   * The last value that loaded successfully.
   *
   * Deliberately kept across a refetch and across a failed refetch. Blanking a screen that
   * already had good data on it, because a poll on clinic wifi timed out, is the single loudest
   * way this product reads as broken. See docs/design-system/MASTER.md principle 4.
   */
  data: T | null;
  status: AsyncResourceStatus;
  error: string | null;
  /** True only when there is nothing to show yet, so a page skeletons exactly once. */
  isInitialLoading: boolean;
  /** True while a load runs over data that is already on screen. Show a quiet indicator. */
  isRefreshing: boolean;
  /** True when a load failed but a previous result is still being shown. */
  isStale: boolean;
  isOnline: boolean;
  /** True when the read is withheld because the device is offline. */
  isOfflineBlocked: boolean;
  refresh: () => void;
  retry: () => void;
  /** For a mutation that already knows the new value; avoids a round trip and a flash. */
  setData: (next: T | null) => void;
}

export interface UseAsyncResourceOptions<T> {
  fetcher: (getToken: GetToken, signal: AbortSignal) => Promise<T>;
  /**
   * Identity of what is being read, e.g. `${clinicId}:${date}`.
   *
   * Callers write `fetcher` inline, so it is never a stable dependency and cannot drive the
   * effect. This is the caller's explicit statement of when the thing being read actually
   * changed, and it is the only trigger for an automatic refetch.
   */
  resourceKey: string;
  errorMessage: string;
  enabled?: boolean;
  requiresOnline?: boolean;
}

/**
 * One read, with the five states every route owes its user.
 *
 * Around twenty pages hand-rolled the same `useState` triple and `useEffect`, and drifted while
 * doing it: four incompatible loading treatments, two error treatments only one of which offered
 * a retry, and several that blanked their panels on every refetch. This is that pattern written
 * once, with the three behaviours the hand-rolled version kept getting wrong:
 *
 *  - last-known-good data survives a refetch and a failed refetch;
 *  - a superseded response never overwrites a newer one;
 *  - an in-flight request is aborted when the resource changes or the component unmounts.
 *
 * It is not a data-fetching library and does not cache across components. Issue #23 owns that
 * question and is deliberately deferred.
 */
export function useAsyncResource<T>({
  fetcher,
  resourceKey,
  errorMessage,
  enabled = true,
  requiresOnline = false,
}: UseAsyncResourceOptions<T>): AsyncResourceState<T> {
  const getToken = useAuth();
  const { isOnline } = useSync();
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<AsyncResourceStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const isOfflineBlocked = requiresOnline && !isOnline;
  const blocked = !enabled || !getToken || isOfflineBlocked;

  const load = useCallback(async () => {
    if (blocked || !getToken) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const requestId = ++requestRef.current;
    setStatus('loading');
    setError(null);

    try {
      const next = await fetcherRef.current(getToken, controller.signal);
      if (requestRef.current !== requestId) return;
      setData(next);
      setStatus('ready');
    } catch (requestError) {
      if (controller.signal.aborted || requestRef.current !== requestId) return;
      setError(getErrorMessage(requestError, errorMessage));
      setStatus('error');
    }
  }, [blocked, getToken, errorMessage]);

  useEffect(() => {
    if (blocked) return;
    void load();
    // resourceKey is not read in the body; it is in the dependency list precisely so that a
    // change of identity re-runs this. See the option's docblock.
  }, [blocked, load, resourceKey]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return {
    data,
    status,
    error,
    ...deriveAsyncResourceFlags({ hasData: data !== null, status, blocked }),
    isOnline,
    isOfflineBlocked,
    refresh: load,
    retry: load,
    setData,
  };
}
