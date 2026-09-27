'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { syncNow, onSyncStatusChange, type SyncResult, type SyncStatus } from '@/lib/sync';

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
}: {
  children: React.ReactNode;
  getAccessToken?: () => Promise<string | null>;
  activeClinicId?: string | null;
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
        getAccessToken,
      });
    },
    [getAccessToken],
  );

  useEffect(() => {
    if (!isOnline || !activeClinicId) return;
    void doSyncNow(activeClinicId);
  }, [activeClinicId, doSyncNow, isOnline]);

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
