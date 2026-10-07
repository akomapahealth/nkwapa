'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, CloudOff, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { EmptyState } from '@/components/feedback/AppState';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { db } from '@/lib/db';
import { useBootstrap } from '@/lib/bootstrap-context';
import {
  claimUnownedOutboxMutation,
  discardOutboxMutation,
  retryOutboxMutation,
} from '@/lib/outbox';
import { trackEvent } from '@/lib/analytics';
import type { SyncRecoveryAccess } from '@/lib/sync-conflicts';
import type { OutboxQueue, OutboxQueueItem } from '@/lib/use-outbox-queue';
import { DiscardMutationDialog } from './DiscardMutationDialog';
import { HeldChangesSection } from './HeldChangesSection';
import { SyncMutationCard } from './SyncMutationCard';

const GROUPS = [
  {
    key: 'blocked',
    title: 'Needs attention',
    hint: 'The server could not accept these. Each one says what to do next.',
  },
  {
    key: 'retrying',
    title: 'Waiting to retry',
    hint: 'These will be sent again automatically.',
  },
  {
    key: 'pending',
    title: 'Queued',
    hint: 'Saved on this device and not yet sent.',
  },
] as const;

export function SyncCenterSheet({
  clinicId,
  queue,
  canSync,
  recoveryAccess,
}: {
  clinicId: string;
  queue: OutboxQueue;
  canSync: boolean;
  recoveryAccess: SyncRecoveryAccess;
}) {
  const {
    isOnline,
    syncStatus,
    syncError,
    syncErrorDetail,
    syncNow,
    syncCenterOpen,
    setSyncCenterOpen,
  } = useSync();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState<OutboxQueueItem | null>(null);
  const syncing = syncStatus === 'syncing';
  const bootstrap = useBootstrap()?.bootstrap ?? null;

  // Counts only: how much was waiting when someone looked, never what it was.
  useEffect(() => {
    if (syncCenterOpen) {
      trackEvent('sync.center.open', {
        blocked: queue.blocked.length,
        queued: queue.retrying.length + queue.pending.length,
      });
    }
    // Once per opening, not on every queue change while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncCenterOpen]);

  const handleRetry = async (item: OutboxQueueItem) => {
    setBusyId(item.row.id);
    trackEvent('sync.change.retry');
    try {
      await retryOutboxMutation(db, item.row.id);
      await syncNow(clinicId);
    } finally {
      setBusyId(null);
    }
  };

  const handleClaim = async (item: OutboxQueueItem) => {
    if (!bootstrap?.userId) return;
    await claimUnownedOutboxMutation(db, item.row.id, {
      userId: bootstrap.userId,
      displayName: bootstrap.displayName,
    });
    await syncNow(clinicId);
  };

  const handleDiscard = async (item: OutboxQueueItem) => {
    await discardOutboxMutation(db, item.row);
    trackEvent('sync.change.discard');
    await syncNow(clinicId);
  };

  return (
    <Sheet open={syncCenterOpen} onOpenChange={setSyncCenterOpen}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
        aria-describedby="sync-center-description"
      >
        <SheetHeader className="space-y-1 border-b border-border p-5 pr-14 text-left">
          <SheetTitle>Offline changes</SheetTitle>
          <SheetDescription id="sync-center-description">
            Changes saved on this device, and whether the server has them yet.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-3 border-b border-border p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm" role="status" aria-live="polite">
              {isOnline ? (
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-success" />
              ) : (
                <WifiOff aria-hidden="true" className="h-4 w-4 text-destructive" />
              )}
              <span className="font-medium">{isOnline ? 'Online' : 'Offline'}</span>
              <span className="text-muted-foreground">
                {syncing
                  ? 'Syncing…'
                  : queue.total === 0
                    ? 'Everything is synced'
                    : `${queue.total} on this device`}
              </span>
            </p>
            <Button
              size="sm"
              onClick={() => void syncNow(clinicId)}
              disabled={!isOnline || syncing || !canSync}
            >
              <RefreshCw aria-hidden="true" className={syncing ? 'animate-spin' : undefined} />
              {syncing ? 'Syncing' : 'Sync now'}
            </Button>
          </div>
          {syncStatus === 'error' && syncError ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"
            >
              <p className="flex items-start gap-2">
                <CloudOff aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <span>{syncError}</span>
              </p>
              {syncErrorDetail ? (
                <details className="mt-2 pl-6">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                    Technical details
                  </summary>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 font-mono text-xs">
                    {syncErrorDetail}
                  </pre>
                </details>
              ) : null}
            </div>
          ) : null}
          {!isOnline ? (
            <p className="text-sm text-muted-foreground">
              Keep working. Everything you save stays on this device and syncs when the connection
              returns.
            </p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
          {queue.loaded && queue.total === 0 && queue.held.length === 0 ? (
            <EmptyState
              density="compact"
              icon={CheckCircle2}
              title="Everything is synced"
              description="Changes saved while offline appear here until the server has them."
            />
          ) : null}
          {GROUPS.map((group) => {
            const items = queue[group.key];
            if (items.length === 0) return null;
            return (
              <section key={group.key} aria-labelledby={`sync-group-${group.key}`}>
                <div className="mb-3">
                  <h3 id={`sync-group-${group.key}`} className="text-sm font-semibold">
                    {group.title}{' '}
                    <span className="font-normal text-muted-foreground">({items.length})</span>
                  </h3>
                  <p className="text-xs text-muted-foreground">{group.hint}</p>
                </div>
                <ul className="space-y-3">
                  {items.map((item) => (
                    <li key={item.row.id}>
                      <SyncMutationCard
                        item={item}
                        clinicId={clinicId}
                        recoveryAccess={recoveryAccess}
                        isOnline={isOnline && canSync}
                        busy={busyId === item.row.id || syncing}
                        onRetry={(target) => void handleRetry(target)}
                        onDiscard={setDiscarding}
                        onNavigate={() => setSyncCenterOpen(false)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          <HeldChangesSection
            items={queue.held}
            currentUserName={bootstrap?.displayName ?? null}
            disabled={!isOnline || !canSync || syncing}
            onDiscard={setDiscarding}
            onClaim={handleClaim}
          />
        </div>
      </SheetContent>
      <DiscardMutationDialog
        item={discarding}
        onOpenChange={(open) => {
          if (!open) setDiscarding(null);
        }}
        onConfirm={handleDiscard}
      />
    </Sheet>
  );
}
