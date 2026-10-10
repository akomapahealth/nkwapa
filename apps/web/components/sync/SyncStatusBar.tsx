'use client';

import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, CloudOff, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { useBootstrap } from '@/lib/bootstrap-context';
import { onSyncPassComplete } from '@/lib/sync';
import type { SyncRecoveryAccess } from '@/lib/sync-conflicts';
import { useOutboxQueue } from '@/lib/use-outbox-queue';
import { getSwitchableClinics } from '@/lib/bootstrap-clinics';
import { useOtherClinicQueues } from '@/lib/other-clinic-queue';
import { cn } from '@/lib/utils';
import { SyncCenterSheet } from './SyncCenterSheet';

type PillState = 'offline' | 'syncing' | 'attention' | 'failed' | 'queued' | 'synced';

const PILL = {
  offline: { icon: WifiOff, className: 'text-destructive' },
  syncing: { icon: RefreshCw, className: 'animate-spin text-primary' },
  attention: { icon: AlertTriangle, className: 'text-warning' },
  failed: { icon: CloudOff, className: 'text-destructive' },
  queued: { icon: RefreshCw, className: 'text-muted-foreground' },
  synced: { icon: CheckCircle2, className: 'text-success' },
} as const;

/**
 * The header's sync pill and the sync center it opens.
 *
 * The pill was `hidden md:flex`, so on a phone there was no way to see whether anything was
 * queued, let alone why something had failed. It now shows at every width: one compact control
 * with a count on a phone, where Sync now lives inside the sheet, and the full label plus a Sync
 * button from `sm` up. The whole pill opens the sync center.
 */
export function SyncStatusBar({
  clinicId,
  canSync,
  recoveryAccess,
}: {
  clinicId: string | null;
  canSync: boolean;
  recoveryAccess: SyncRecoveryAccess;
}) {
  const { isOnline, syncStatus, syncNow, setSyncCenterOpen } = useSync();
  const { showToast } = useToast();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  // Only this account's own changes count here; others' are held and shown in the sync center.
  const queue = useOutboxQueue(clinicId, bootstrap?.userId ?? null);
  const otherClinics = useOtherClinicQueues({
    activeClinicId: clinicId,
    currentUserId: bootstrap?.userId ?? null,
    accessibleClinics: getSwitchableClinics(bootstrap),
  });
  // Counted apart from the active clinic's, which the pill's number is about.
  const otherClinicChanges = otherClinics.reduce((sum, other) => sum + other.own.length, 0);
  const blocked = queue.blocked.length;
  const waiting = queue.retrying.length + queue.pending.length;

  // Toast when a pass newly blocks a change, not for what was already waiting when the app opened:
  // the pill already says that, and repeating it on every page load is noise.
  useEffect(
    () =>
      onSyncPassComplete((passClinicId, result) => {
        const newlyBlocked = (result.conflicts?.length ?? 0) + (result.rejected?.length ?? 0);
        if (passClinicId !== clinicId || newlyBlocked === 0) return;
        showToast({
          tone: 'warning',
          title:
            newlyBlocked === 1
              ? 'An offline change needs your attention'
              : `${newlyBlocked} offline changes need your attention`,
          description:
            newlyBlocked === 1
              ? 'The server could not accept it. Nothing has been lost.'
              : 'The server could not accept them. Nothing has been lost.',
          durationMs: 9000,
          action: { label: 'Review', onClick: () => setSyncCenterOpen(true) },
        });
      }),
    [clinicId, setSyncCenterOpen, showToast],
  );

  if (
    !clinicId ||
    (!canSync && queue.total === 0 && queue.held.length === 0 && otherClinicChanges === 0)
  ) {
    return null;
  }

  const state: PillState = !isOnline
    ? 'offline'
    : syncStatus === 'syncing'
      ? 'syncing'
      : blocked > 0
        ? 'attention'
        : syncStatus === 'error'
          ? 'failed'
          : waiting > 0
            ? 'queued'
            : 'synced';
  const label = {
    offline: waiting + blocked > 0 ? `Offline · ${waiting + blocked} saved` : 'Offline',
    syncing: 'Syncing…',
    attention: `${blocked} need${blocked === 1 ? 's' : ''} attention`,
    failed: 'Sync failed',
    queued: `${waiting} queued`,
    synced: 'All synced',
  }[state];
  const count = state === 'attention' ? blocked : waiting + (state === 'offline' ? blocked : 0);
  const { icon: Icon, className: iconClassName } = PILL[state];

  return (
    <>
      <div
        className={cn(
          'flex items-center rounded-lg border bg-card text-sm transition-colors',
          state === 'attention' ? 'border-warning/40' : 'border-border',
        )}
      >
        <button
          type="button"
          onClick={() => setSyncCenterOpen(true)}
          className="relative flex h-11 min-w-11 items-center gap-2 rounded-lg px-3 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:rounded-r-none"
          aria-label={`Offline changes: ${label}.${
            otherClinicChanges > 0 ? ` ${otherClinicChanges} saved for other clinics.` : ''
          } Open sync center.`}
          data-testid="sync-status"
          data-state={state}
        >
          <Icon aria-hidden="true" className={cn('h-4 w-4 shrink-0', iconClassName)} />
          <span
            className={cn(
              'hidden whitespace-nowrap sm:inline',
              state === 'attention' ? 'font-medium text-warning-ink' : 'text-muted-foreground',
            )}
          >
            {label}
          </span>
          {otherClinicChanges > 0 ? (
            // A quiet marker, not a count: it says "look in the sync center" without inflating
            // the active clinic's number.
            <span
              aria-hidden="true"
              data-testid="sync-other-clinics-marker"
              className="absolute left-1.5 top-1.5 h-2 w-2 rounded-full bg-primary"
            />
          ) : null}
          {count > 0 ? (
            <span
              aria-hidden="true"
              className={cn(
                'absolute right-1 top-1 min-w-4 rounded-full px-1 text-center text-[10px] font-semibold leading-4 sm:hidden',
                state === 'attention'
                  ? 'bg-warning text-foreground'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {count}
            </span>
          ) : null}
        </button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void syncNow(clinicId)}
          disabled={!isOnline || syncStatus === 'syncing' || !canSync}
          className="hidden rounded-l-none border-l border-border sm:inline-flex"
          aria-label="Sync now"
        >
          <RefreshCw
            aria-hidden="true"
            className={syncStatus === 'syncing' ? 'animate-spin' : undefined}
          />
        </Button>
      </div>
      <SyncCenterSheet
        clinicId={clinicId}
        queue={queue}
        otherClinics={otherClinics}
        canSync={canSync}
        recoveryAccess={recoveryAccess}
      />
    </>
  );
}
