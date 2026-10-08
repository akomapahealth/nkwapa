'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { db } from '@/lib/db';
import { setOutboxClinicNames, setOutboxOwner } from '@/lib/outbox';
import { purgePortalCacheExcept } from '@/lib/portal-cache';
import { syncNow, onSyncStatusChange, type SyncResult, type SyncStatus } from '@/lib/sync';
import { automaticSyncRetryDelay } from '@/lib/sync-retry';

interface SyncContextValue {
  isOnline: boolean;
  syncStatus: SyncStatus;
  /** Plain-language summary of the last pass, when it needs saying. */
  syncError?: string;
  /** Raw response or error text behind `syncError`, for the support view only. */
  syncErrorDetail?: string;
  syncNow: (clinicId: string) => Promise<SyncResult>;
  /** The sync center is one sheet for the whole workspace, so any screen can open it. */
  syncCenterOpen: boolean;
  setSyncCenterOpen: (open: boolean) => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error('useSync must be used within ServiceWorkerAndSyncProvider');
  }
  return ctx;
}

export function ServiceWorkerAndSyncProvider({
  children,
  getAccessToken,
  activeClinicId,
  currentUserId,
  currentUserName,
  knownClinics,
}: {
  children: React.ReactNode;
  getAccessToken?: () => Promise<string | null>;
  activeClinicId?: string | null;
  /** The signed-in account, once bootstrap has resolved it. */
  currentUserId?: string | null;
  currentUserName?: string | null;
  /** The clinics this account can open, so each queued change records its clinic's name. */
  knownClinics?: ReadonlyArray<{ clinicId: string; clinicName: string }>;
}) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncError, setSyncError] = useState<string | undefined>();
  const [syncErrorDetail, setSyncErrorDetail] = useState<string | undefined>();
  const [syncCenterOpen, setSyncCenterOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/service-worker.js')
        .catch((err) => console.warn('SW registration failed:', err));
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  /*
    Whatever another account left on this device goes as soon as this one is known (#18).

    Sign-out clears the portal cache too, but a session can also end without it: the token
    expires, the tab is closed, or someone signs in as another account in a second tab. Reads
    are keyed by account regardless; this keeps the other account's history off the disk.
  */
  useEffect(() => {
    if (!currentUserId) return;
    void purgePortalCacheExcept(db, currentUserId);
  }, [currentUserId]);

  /*
    Every change queued from here on is this account's, and only this account sends it (#162).
    The outbox is deliberately not cleared when the account changes: an entry that never reached
    the server cannot be recovered. It is held for its owner instead.
  */
  useEffect(() => {
    setOutboxOwner(
      currentUserId ? { userId: currentUserId, displayName: currentUserName ?? undefined } : null,
    );
  }, [currentUserId, currentUserName]);

  const knownClinicsKey = (knownClinics ?? [])
    .map((clinic) => `${clinic.clinicId}:${clinic.clinicName}`)
    .join('|');
  useEffect(() => {
    setOutboxClinicNames(knownClinics ?? []);
    // knownClinicsKey stands in for knownClinics, which is a new array on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knownClinicsKey]);

  useEffect(() => {
    const unsub = onSyncStatusChange((status, message, detail) => {
      setSyncStatus(status);
      // A pass in progress keeps the last message on screen rather than blanking it mid-read.
      if (status === 'syncing') return;
      setSyncError(message);
      setSyncErrorDetail(detail);
    });
    return unsub;
  }, []);

  const doSyncNow = useCallback(
    async (clinicId: string) => {
      return syncNow({
        clinicId,
        currentUserId: currentUserId ?? null,
        getAccessToken,
      });
    },
    [currentUserId, getAccessToken],
  );

  /*
    Also when the account changes: an owner signing back in drains what they left held.

    Not before the account is known (#172). The stored clinic arrives before whoami does, so a
    pass started then ran without an owner, and the account's arrival started a second one: two
    full pulls on every boot. Nothing is lost by waiting; the outbox only sends its owner's
    changes, and without an account there is no owner to send for.
  */
  useEffect(() => {
    if (!isOnline || !activeClinicId || !currentUserId) return;
    void doSyncNow(activeClinicId);
  }, [activeClinicId, currentUserId, doSyncNow, isOnline]);

  /*
    Follow a failed or partly refused pass with another, backing off, so the queue drains on its
    own once the server recovers. Any pass that leaves nothing to retry resets the schedule, and a
    new pass (manual or otherwise) clears the pending timer through this effect's cleanup.
  */
  const automaticRetries = useRef(0);
  useEffect(() => {
    if (syncStatus === 'syncing') return;
    const delay = automaticSyncRetryDelay(syncStatus, automaticRetries.current);
    if (delay === null) automaticRetries.current = 0;
    if (delay === null || !isOnline || !activeClinicId) return;

    const timer = window.setTimeout(() => {
      automaticRetries.current += 1;
      void doSyncNow(activeClinicId);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [activeClinicId, doSyncNow, isOnline, syncStatus]);

  const value = useMemo(
    () => ({
      isOnline,
      syncStatus,
      syncError,
      syncErrorDetail,
      syncNow: doSyncNow,
      syncCenterOpen,
      setSyncCenterOpen,
    }),
    [doSyncNow, isOnline, syncCenterOpen, syncError, syncErrorDetail, syncStatus],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
