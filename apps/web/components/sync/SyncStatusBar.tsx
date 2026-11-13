'use client';

import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, CloudOff, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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

type PillState = 'offline' | 'syncing' | 'attention' | 'failed' | 'queued' | 'held' | 'synced';

const PILL = {
  offline: { icon: WifiOff, className: 'bg-warning-surface text-warning-ink', short: 'Offline' },
  syncing: { icon: RefreshCw, className: 'bg-selected text-primary', short: 'Syncing…' },
  attention: {
    icon: AlertTriangle,
    className: 'bg-warning-surface text-warning-ink',
    short: 'Attention',
  },
  failed: {
    icon: CloudOff,
    className: 'bg-destructive-surface text-destructive-ink',
    short: 'Failed',
  },
  queued: { icon: RefreshCw, className: 'bg-surface-2 text-muted-foreground', short: 'Queued' },
  held: { icon: AlertTriangle, className: 'bg-warning-surface text-warning-ink', short: 'Review' },
  synced: { icon: CheckCircle2, className: 'bg-success-surface text-success-ink', short: 'Synced' },
} as const;

/**
 * The header's sync pill and the sync center it opens.
 *
 * A fixed footprint keeps clinic/account controls still as state and counts change. Phone labels
 * are short; the accessible name always carries the full status. Sync now stays in the sheet on
 * phones and is also available beside the pill from the workspace's 600px breakpoint.
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
  const { isOnline, syncStatus, syncNow, syncCenterOpen, setSyncCenterOpen } = useSync();
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
  const hasHeldChanges =
    queue.held.length > 0 || otherClinics.some((other) => other.others.length > 0);
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

  if (!clinicId || (!canSync && queue.total === 0 && !hasHeldChanges && otherClinicChanges === 0)) {
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
            : hasHeldChanges || otherClinicChanges > 0
              ? 'held'
              : 'synced';
  const label = {
    offline: waiting + blocked > 0 ? `Offline · ${waiting + blocked} saved` : 'Offline',
    syncing: 'Syncing…',
    attention: `${blocked} need${blocked === 1 ? 's' : ''} attention`,
    failed: 'Sync failed',
    queued: `${waiting} queued`,
    held: 'Review saved changes',
    synced: 'All synced',
  }[state];
  const count = state === 'attention' ? blocked : waiting + (state === 'offline' ? blocked : 0);
  const presentation = PILL[state];

  return (
    <>
      <div className="flex shrink-0 items-center text-sm">
        {/* The slot is reserved (108px, 192px from 600px) and the pill sits at its right edge, beside
            Sync now and the header icons: a changing state never moves the controls, and the quiet
            synced check is never stranded mid-header. Under 360px the bell needs the room, so the
            pill keeps its icon and count and the full status stays in its accessible name. */}
        <div className="flex w-[min(6.75rem,180px)] justify-end max-[359px]:w-16 compact:w-[192px]">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setSyncCenterOpen(true)}
                  className={cn(
                    'relative flex min-h-11 min-w-11 items-center justify-center rounded-md py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    state !== 'synced' && 'w-full',
                  )}
                  aria-label={`Offline changes: ${label}.${
                    otherClinicChanges > 0 ? ` ${otherClinicChanges} saved for other clinics.` : ''
                  } Open sync center.`}
                  data-testid="sync-status"
                  data-state={state}
                >
                  <span
                    className={cn(
                      'flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold transition-colors duration-fast ease-out-strong hover:brightness-95 motion-reduce:transition-none compact:gap-2 compact:px-2.5 compact:text-sm',
                      state === 'synced' ? 'justify-center' : 'w-full',
                      presentation.className,
                    )}
                  >
                    <span aria-hidden="true" className="relative size-4 shrink-0">
                      {(Object.keys(PILL) as PillState[]).map((key) => {
                        const Icon = PILL[key].icon;
                        return (
                          <span
                            key={key}
                            data-sync-icon={key}
                            className={cn(
                              'absolute inset-0 transition-[opacity,filter,transform] duration-fast ease-out-strong motion-reduce:transform-none motion-reduce:filter-none motion-reduce:transition-none',
                              key === state
                                ? 'scale-100 opacity-100 blur-0'
                                : 'scale-75 opacity-0 blur-sm',
                            )}
                          >
                            <Icon
                              className={cn(
                                'size-4',
                                key === 'syncing' &&
                                  state === 'syncing' &&
                                  'animate-spin motion-reduce:animate-none',
                              )}
                            />
                          </span>
                        );
                      })}
                    </span>
                    {state !== 'synced' ? (
                      <>
                        <span className="truncate max-[359px]:hidden compact:hidden">
                          {presentation.short}
                        </span>
                        <span className="hidden truncate compact:inline">{label}</span>
                      </>
                    ) : null}
                    {count > 0 ? (
                      <span aria-hidden="true" className="ml-auto tabular-nums compact:hidden">
                        {count > 99 ? '99+' : count}
                      </span>
                    ) : null}
                  </span>
                  {otherClinicChanges > 0 || hasHeldChanges ? (
                    // A quiet marker, not a count: it says "look in the sync center" without inflating
                    // the active clinic's number.
                    <span
                      aria-hidden="true"
                      data-testid="sync-other-clinics-marker"
                      className="absolute left-1.5 top-1.5 h-2 w-2 rounded-full bg-primary"
                    />
                  ) : null}
                </button>
              </TooltipTrigger>
              {/* A tooltip must release its Escape layer before the recovery dialog opens. */}
              {!syncCenterOpen ? <TooltipContent side="bottom">{label}</TooltipContent> : null}
            </Tooltip>
          </TooltipProvider>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void syncNow(clinicId)}
          disabled={!isOnline || syncStatus === 'syncing' || !canSync}
          className="hidden compact:inline-flex"
          aria-label="Sync now"
        >
          <RefreshCw
            aria-hidden="true"
            className={
              syncStatus === 'syncing' ? 'animate-spin motion-reduce:animate-none' : undefined
            }
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
