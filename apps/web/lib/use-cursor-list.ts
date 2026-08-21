'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { useAuth } from '@/lib/auth-context';
import { getErrorMessage, type GetToken } from '@/lib/api';
import type { ChartPage } from '@/lib/patient-chart';

export type CursorListStatus = 'idle' | 'loading' | 'loadingMore' | 'ready' | 'error';

export interface CursorListState<T> {
  items: T[];
  status: CursorListStatus;
  error: string | null;
  /** True only while the first page is in flight, so panels skeleton exactly once. */
  isInitialLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  isEmpty: boolean;
  isOnline: boolean;
  /** True when the panel is withheld because the device is offline. */
  isOfflineBlocked: boolean;
  loadMore: () => void;
  retry: () => void;
}

export interface UseCursorListOptions<T> {
  /** Fetches one page, receiving the cursor for the page being requested. */
  fetchPage: (getToken: GetToken, cursor: string | null) => Promise<ChartPage<T>>;
  /**
   * Identity of the list, e.g. `${clinicId}:${patientId}`. Changing it resets the
   * accumulated pages and refetches from the start.
   */
  resourceKey: string;
  errorMessage: string;
  /** Skip fetching entirely, e.g. while a tab has never been opened. */
  enabled?: boolean;
  /** Most longitudinal reads need a connection; offline shows a banner instead. */
  requiresOnline?: boolean;
}

/**
 * Cursor-paginated list state for the patient chart.
 *
 * Every longitudinal panel needs the same loading / empty / error+retry / offline /
 * load-more behaviour, so it lives here once instead of being re-implemented per tab.
 * Pages are appended, and responses from superseded requests are discarded.
 */
export function useCursorList<T>({
  fetchPage,
  resourceKey,
  errorMessage,
  enabled = true,
  requiresOnline = true,
}: UseCursorListOptions<T>): CursorListState<T> {
  const getToken = useAuth();
  const { isOnline } = useSync();
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<CursorListStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  // Callers define fetchPage inline, so it is not a stable dependency. resourceKey is
  // the caller's explicit statement of when the list identity actually changed.
  const fetchPageRef = useRef(fetchPage);
  useEffect(() => {
    fetchPageRef.current = fetchPage;
  });

  const isOfflineBlocked = requiresOnline && !isOnline;
  const blocked = !enabled || !getToken || isOfflineBlocked;

  const load = useCallback(
    async (nextCursor: string | null) => {
      if (blocked || !getToken) return;
      const requestId = ++requestRef.current;
      setStatus(nextCursor ? 'loadingMore' : 'loading');
      setError(null);
      try {
        const page = await fetchPageRef.current(getToken, nextCursor);
        if (requestRef.current !== requestId) return;
        setItems((previous) => (nextCursor ? [...previous, ...page.items] : page.items));
        setCursor(page.nextCursor);
        setStatus('ready');
      } catch (requestError) {
        if (requestRef.current !== requestId) return;
        setError(getErrorMessage(requestError, errorMessage));
        setStatus('error');
      }
    },
    [blocked, getToken, errorMessage],
  );

  useEffect(() => {
    if (blocked) return;
    setItems([]);
    setCursor(null);
    void load(null);
  }, [blocked, load, resourceKey]);

  const loadMore = useCallback(() => {
    if (cursor && status !== 'loadingMore' && status !== 'loading') void load(cursor);
  }, [cursor, load, status]);

  const retry = useCallback(() => {
    setItems([]);
    setCursor(null);
    void load(null);
  }, [load]);

  return {
    items,
    status,
    error,
    isInitialLoading: status === 'loading' || (status === 'idle' && !blocked),
    isLoadingMore: status === 'loadingMore',
    hasMore: cursor !== null,
    isEmpty: status === 'ready' && items.length === 0,
    isOnline,
    isOfflineBlocked,
    loadMore,
    retry,
  };
}
