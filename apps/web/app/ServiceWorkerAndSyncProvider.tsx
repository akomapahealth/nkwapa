'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { syncNow, onSyncStatusChange, type SyncResult, type SyncStatus } from '@/lib/sync';

interface SyncContextValue {
  isOnline: boolean;
  syncStatus: SyncStatus;
  syncError?: string;
  syncNow: (clinicId: string) => Promise<SyncResult>;
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
    const unsub = onSyncStatusChange((status, error) => {
      setSyncStatus(status);
      setSyncError(error);
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

  return (
    <SyncContext.Provider
      value={{
        isOnline,
        syncStatus,
        syncError,
        syncNow: doSyncNow,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}
