'use client';

import { useEffect, useRef, useState } from 'react';
import type { GetToken } from './api';
import { db, type OpsCacheKind } from './db';
import { readOpsCache, writeOpsCache } from './ops-cache';
import { useAsyncResource } from './use-async-resource';

export interface OpsViewState<T> {
  /** The view for the requested day: live when it could load, else this device's last copy. */
  data: T | null;
  /** When the copy on screen was loaded, if it is this device's saved copy rather than live. */
  savedCopyAt: string | null;
  /** When whatever is on screen was loaded, live or saved. Null when nothing is. */
  dataAsOf: string | null;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  /** Set only when there is nothing at all to show for the day. */
  error: string | null;
  isOnline: boolean;
  refresh: () => void;
}

/**
 * A clinic-operations view that still renders offline.
 *
 * Online it loads like any other view and keeps a copy on the device. Offline, or when a load
 * fails, it shows the last copy for the same clinic day and says when it was taken. A copy from a
 * different day is never shown as this one.
 *
 * `pendingIds` are the device's queued changes for the view. When one leaves the queue it has
 * applied or been discarded, and the view reloads so the server's copy replaces the drawn one.
 */
export function useOpsView<T>({
  clinicId,
  kind,
  date,
  fetcher,
  errorMessage,
  pendingIds = [],
}: {
  clinicId: string | null;
  kind: OpsCacheKind;
  date: string;
  fetcher: (getToken: GetToken, signal: AbortSignal) => Promise<T>;
  errorMessage: string;
  pendingIds?: readonly string[];
}): OpsViewState<T> {
  const live = useAsyncResource<{ date: string; data: T; loadedAt: string }>({
    fetcher: async (getToken, signal) => {
      const data = await fetcher(getToken, signal);
      if (clinicId) void writeOpsCache(db, { clinicId, kind, date, data });
      return { date, data, loadedAt: new Date().toISOString() };
    },
    resourceKey: `${clinicId}:${kind}:${date}`,
    errorMessage,
    enabled: Boolean(clinicId),
    requiresOnline: true,
  });

  const cacheKey = `${clinicId}:${kind}:${date}`;
  const [saved, setSaved] = useState<{ date: string; data: T; updatedAt: string } | null>(null);
  const [checkedKey, setCheckedKey] = useState<string | null>(null);
  useEffect(() => {
    if (!clinicId) return;
    let current = true;
    void readOpsCache<T>(db, { clinicId, kind, date }).then((record) => {
      if (!current) return;
      setSaved(record);
      setCheckedKey(cacheKey);
    });
    return () => {
      current = false;
    };
  }, [cacheKey, clinicId, kind, date]);

  // A queued change that left the queue has applied (or been discarded): reload for the truth.
  const previousPending = useRef<readonly string[]>(pendingIds);
  const { refresh, isOnline } = live;
  useEffect(() => {
    const left = previousPending.current.some((id) => !pendingIds.includes(id));
    previousPending.current = pendingIds;
    if (left && isOnline) refresh();
  }, [pendingIds, isOnline, refresh]);

  // The live copy survives a change of day inside useAsyncResource, so check it is for this day.
  const liveForDay = live.data?.date === date ? live.data.data : null;
  const savedForDay = saved?.date === date ? saved : null;
  const showingSaved = liveForDay === null && savedForDay !== null;
  const nothingYet = liveForDay === null && !showingSaved;
  // Still finding out: a load is due or running, or the saved copy has not been read yet.
  const loadPending =
    live.status === 'loading' || (live.status === 'idle' && isOnline && Boolean(clinicId));

  return {
    data: liveForDay ?? savedForDay?.data ?? null,
    savedCopyAt: showingSaved ? savedForDay.updatedAt : null,
    dataAsOf:
      liveForDay !== null ? (live.data?.loadedAt ?? null) : (savedForDay?.updatedAt ?? null),
    isInitialLoading: nothingYet && (loadPending || (Boolean(clinicId) && checkedKey !== cacheKey)),
    isRefreshing: live.status === 'loading' && !nothingYet,
    error: nothingYet ? live.error : null,
    isOnline,
    refresh,
  };
}
