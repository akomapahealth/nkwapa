'use client';

import { useEffect, useState } from 'react';
import type { GetToken } from '@/lib/api';
import { useBootstrap } from '@/lib/bootstrap-context';
import { db, type PortalCacheView } from '@/lib/db';
import {
  getPortalClinicId,
  isPortalLinkMissingError,
  isTransientPortalFailure,
} from '@/lib/patient-portal';
import {
  forgetPortalCache,
  portalCacheKey,
  readPortalCache,
  resolvePortalView,
  writePortalCache,
  type SavedPortalCopy,
} from '@/lib/portal-cache';
import { useAsyncResource, type AsyncResourceState } from '@/lib/use-async-resource';

/** How a portal view keeps its last good copy on the device (#18). */
export interface PortalCacheOptions<T> {
  view: PortalCacheView;
  /** Anything else that shapes the view, e.g. the Health time window. */
  variant?: string;
  /** The patient record the loaded data belongs to. A copy without one is never written. */
  patientIdOf: (data: T) => string | null | undefined;
  /** What of the data is kept on the device. Strip anything the screen does not render. */
  minimise?: (data: T) => T;
}

/**
 * `useAsyncResource`, plus the two portal-specific questions it cannot answer.
 *
 * A patient whose account has not been linked to a patient record must see the claim prompt, not
 * a red box: it is not a transient failure and retrying it forever will never help. That case is
 * identified by the typed `PortalApiError.code`, and `useAsyncResource` deliberately narrows every
 * failure to a message string for rendering. So the typed error is inspected here, in the one
 * place it is still typed, on its way past.
 *
 * The flag is sticky only until the next attempt resolves: a successful load clears it, which is
 * what makes "staff linked the record, press retry" work.
 *
 * With `cache`, a history view also survives a dropped connection. Each live load keeps a copy on
 * the device for the signed-in account; when the next load cannot happen (offline) or gets no
 * answer, that copy is shown instead and `savedCopyAt` says when it was taken. A load the server
 * refuses outright drops the copy, so ended access never lingers on screen. The read is withheld
 * while offline, and runs again by itself when the connection returns.
 */
export function usePortalResource<T>({
  fetcher,
  resourceKey,
  errorMessage,
  enabled,
  cache,
}: {
  fetcher: (getToken: GetToken, signal: AbortSignal) => Promise<T>;
  resourceKey: string;
  errorMessage: string;
  enabled?: boolean;
  cache?: PortalCacheOptions<T>;
}): AsyncResourceState<T> & { isLinkMissing: boolean } {
  const [isLinkMissing, setIsLinkMissing] = useState(false);
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const userId = bootstrap?.userId ?? null;
  const clinicId = getPortalClinicId(bootstrap);
  const owner =
    cache && userId && clinicId
      ? { userId, clinicId, view: cache.view, variant: cache.variant ?? '' }
      : null;
  const cacheKey = owner ? portalCacheKey(owner) : null;

  const [saved, setSaved] = useState<SavedPortalCopy<T> | null>(null);
  const [checkedKey, setCheckedKey] = useState<string | null>(null);

  const state = useAsyncResource<T>({
    resourceKey,
    errorMessage,
    enabled,
    requiresOnline: Boolean(cache),
    fetcher: async (getToken, signal) => {
      try {
        const data = await fetcher(getToken, signal);
        setIsLinkMissing(false);
        if (owner && cache) {
          void writePortalCache(db, {
            ...owner,
            patientId: cache.patientIdOf(data),
            data: cache.minimise ? cache.minimise(data) : data,
          });
        }
        return data;
      } catch (error) {
        setIsLinkMissing(isPortalLinkMissingError(error));
        if (owner && !isTransientPortalFailure(error)) {
          setSaved(null);
          void forgetPortalCache(db, owner);
        }
        throw error;
      }
    },
  });

  const view = cache?.view;
  const variant = cache?.variant ?? '';
  useEffect(() => {
    if (!cacheKey || !userId || !clinicId || !view) return;
    let current = true;
    void readPortalCache<T>(db, { userId, clinicId, view, variant }).then((record) => {
      if (!current) return;
      setSaved(record ? { key: cacheKey, data: record.data, updatedAt: record.updatedAt } : null);
      setCheckedKey(cacheKey);
    });
    return () => {
      current = false;
    };
  }, [cacheKey, userId, clinicId, view, variant]);

  if (!cache) return { ...state, isLinkMissing };

  const { data, savedCopyAt } = resolvePortalView({ key: cacheKey, live: state.data, saved });
  const showingSaved = savedCopyAt !== null;
  // Still finding out whether a saved copy exists: hold the skeleton rather than flash an error.
  const awaitingSaved = data === null && cacheKey !== null && checkedKey !== cacheKey;

  return {
    ...state,
    data,
    savedCopyAt,
    isInitialLoading: data === null && (state.isInitialLoading || awaitingSaved),
    isOfflineBlocked: state.isOfflineBlocked && !awaitingSaved,
    isRefreshing: showingSaved ? state.status === 'loading' : state.isRefreshing,
    // A saved copy on screen with a failed live read: say so, not "nothing to show".
    isStale: showingSaved || state.isStale,
    error: data === null ? state.error : null,
    isLinkMissing,
  };
}
