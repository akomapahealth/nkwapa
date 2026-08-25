'use client';

import { useEffect, useState } from 'react';
import { CloudOff, RefreshCw, TriangleAlert, Wifi } from 'lucide-react';
import { useSync } from './ServiceWorkerAndSyncProvider';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';

interface SyncStatusBarProps {
  clinicId: string;
}

export function SyncStatusBar({ clinicId }: SyncStatusBarProps) {
  const { isOnline, syncStatus, syncError, syncNow } = useSync();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const updateCount = async () => {
      const count = await db.outbox.where('clinicId').equals(clinicId).count();
      setPendingCount(count);
    };
    updateCount();
    const interval = setInterval(updateCount, 2000);
    return () => clearInterval(interval);
  }, [clinicId]);

  const isSyncing = syncStatus === 'syncing';

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2 text-sm',
        isOnline ? 'border-border/70 bg-card' : 'border-amber-300/60 bg-amber-50',
      )}
      // Connection and queue state change without user action, so the change is announced.
      role="status"
      aria-live="polite"
    >
      <span className="flex items-center gap-1.5 font-medium">
        {isOnline ? (
          <>
            <Wifi aria-hidden="true" className="size-4 text-emerald-600" />
            <span className="text-emerald-700">Online</span>
          </>
        ) : (
          <>
            <CloudOff aria-hidden="true" className="size-4 text-amber-700" />
            <span className="text-amber-800">Offline</span>
          </>
        )}
      </span>

      <span className="text-muted-foreground">
        {pendingCount === 0
          ? 'All changes saved'
          : `${pendingCount} change${pendingCount === 1 ? '' : 's'} waiting to sync`}
      </span>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="cursor-pointer rounded-2xl"
        onClick={() => syncNow(clinicId)}
        disabled={!isOnline || isSyncing}
      >
        <RefreshCw aria-hidden="true" className={cn('size-4', isSyncing && 'animate-spin')} />
        {isSyncing ? 'Syncing…' : 'Sync now'}
      </Button>

      {/*
        A change the server said it may yet accept is not a problem the clinician has to solve, so
        it reads as information. A change it will not accept needs attention and reads as a warning.
      */}
      {syncStatus === 'retrying' && syncError && (
        <span className="text-muted-foreground">{syncError}</span>
      )}

      {syncStatus === 'error' && syncError && (
        <span className="flex items-start gap-1.5 text-destructive">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{syncError}</span>
        </span>
      )}
    </div>
  );
}
