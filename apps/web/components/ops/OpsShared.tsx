'use client';

import { AlertTriangle, Clock3, CloudOff, RefreshCw, Stethoscope } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/feedback/AppState';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import type { OutboxSyncState } from '@/lib/db';
import {
  OPS_OFFLINE_SUPPORT,
  PENDING_SYNC_LABEL,
  type OpsAction,
  type WithPendingSync,
} from '@/lib/ops-offline';
import { cn } from '@/lib/utils';
import {
  type ActiveShift,
  type CheckInStatus,
  type ShiftRole,
  formatOpsDateTime,
  formatOpsTime,
  formatRoleLabel,
  formatStatusLabel,
} from '@/lib/ops';

function shiftRoleTone(role: ShiftRole) {
  switch (role) {
    case 'VOLUNTEER':
      return 'border-primary/25 bg-primary/10 text-primary';
    case 'DOCTOR':
      return 'border-info/25 bg-info/10 text-info-ink';
    case 'MANAGER':
      return 'border-secondary/35 bg-secondary/15 text-foreground';
    default:
      return '';
  }
}

function statusVariant(status: CheckInStatus) {
  switch (status) {
    case 'WAITING':
      return 'warning';
    case 'ASSIGNED':
      return 'secondary';
    case 'IN_PROGRESS':
      return 'review';
    case 'COMPLETED':
      return 'finalized';
    case 'CANCELLED':
      return 'destructive';
    default:
      return 'outline';
  }
}

export function ShiftRoleBadge({ role, className }: { role: ShiftRole; className?: string }) {
  return (
    <Badge variant="outline" className={cn(shiftRoleTone(role), className)}>
      {formatRoleLabel(role)}
    </Badge>
  );
}

export function AssignedRoleBadge({
  role,
  className,
}: {
  role: 'VOLUNTEER' | 'DOCTOR';
  className?: string;
}) {
  return <ShiftRoleBadge role={role} className={className} />;
}

export function CheckInStatusBadge({
  status,
  className,
}: {
  status: CheckInStatus;
  className?: string;
}) {
  return (
    <Badge variant={statusVariant(status)} className={className}>
      {formatStatusLabel(status)}
    </Badge>
  );
}

export function InlineNotice({
  tone = 'info',
  className,
  children,
  live = true,
}: {
  tone?: 'info' | 'success' | 'warning' | 'error';
  className?: string;
  children: React.ReactNode;
  /**
   * Set false for a notice that is part of the page on first paint rather than a response to
   * something the user just did. Announcing static explanatory copy on load is noise.
   */
  live?: boolean;
}) {
  const toneClass =
    tone === 'error'
      ? 'border-destructive/25 bg-destructive/10 text-destructive-ink'
      : tone === 'success'
        ? 'border-success/25 bg-success/10 text-success-ink'
        : // A degraded configuration is not a failed action. Rendering it as an error
          // makes real errors easier to ignore.
          tone === 'warning'
          ? 'border-warning/25 bg-warning/10 text-warning-ink'
          : 'border-primary/20 bg-primary/10 text-foreground';

  /*
    This is where a failed save reports itself on more than a dozen forms, and it had no role and
    no live region, so a screen-reader user pressed Save and heard nothing at all -- the button
    kept focus and the explanation appeared silently somewhere else on the page.

    `alert` is assertive and interrupts, which is right for a failure and wrong for a
    confirmation; `status` is polite and waits for a pause.
  */
  const liveProps = live
    ? tone === 'error'
      ? ({ role: 'alert' } as const)
      : ({ role: 'status', 'aria-live': 'polite' } as const)
    : {};

  return (
    <div {...liveProps} className={cn('rounded-lg border px-4 py-3 text-sm', toneClass, className)}>
      {children}
    </div>
  );
}

const PENDING_TONE: Record<OutboxSyncState, string> = {
  pending: 'border-transparent bg-info/12 text-info-ink',
  retrying: 'border-transparent bg-info/12 text-info-ink',
  blocked: 'border-transparent bg-warning/12 text-warning-ink',
};

const PENDING_ICON = { pending: Clock3, retrying: RefreshCw, blocked: AlertTriangle } as const;

/**
 * Marks a row that exists on this device but not yet on the server.
 *
 * A change that needs attention is a button: the sync center is where it is resolved, and a
 * badge that only says "something is wrong" with nowhere to go is a dead end.
 */
export function PendingSyncBadge({
  state,
  label,
  className,
}: {
  state: OutboxSyncState;
  /** Overrides the default wording, e.g. "Ending · pending sync". */
  label?: string;
  className?: string;
}) {
  const { setSyncCenterOpen } = useSync();
  const Icon = PENDING_ICON[state];
  const text = label ?? PENDING_SYNC_LABEL[state];
  const classes = cn(
    'inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold',
    PENDING_TONE[state],
    className,
  );

  if (state === 'blocked') {
    return (
      <button
        type="button"
        onClick={() => setSyncCenterOpen(true)}
        className={cn(
          classes,
          'transition-colors hover:bg-warning/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
        data-testid="ops-pending-badge"
        data-state={state}
      >
        <Icon aria-hidden="true" className="h-3 w-3" />
        {text}
      </button>
    );
  }

  return (
    <span className={classes} data-testid="ops-pending-badge" data-state={state}>
      <Icon
        aria-hidden="true"
        className={cn(
          'h-3 w-3',
          state === 'retrying' && 'animate-spin [animation-duration:2s] motion-reduce:animate-none',
        )}
      />
      {text}
    </span>
  );
}

/** Why an action is unavailable right now, for the `title` and helper text of its control. */
export function opsOfflineHint(action: OpsAction, isOnline: boolean): string | undefined {
  return isOnline || OPS_OFFLINE_SUPPORT[action].offline
    ? undefined
    : OPS_OFFLINE_SUPPORT[action].offlineHint;
}

/**
 * What still works while the connection is down, and what the screen is showing.
 *
 * It replaced a banner that called every operations view online-only. Shift and check-in changes
 * now queue, so saying nothing works would teach people not to try the things that do.
 */
export function OfflineOpsBanner({
  savedCopyAt,
  timeZone,
  unavailable,
  className,
}: {
  /** When the copy on screen was loaded, if it is this device's saved copy. */
  savedCopyAt: string | null;
  timeZone: string;
  /** The actions on this screen that need a connection. */
  unavailable: string;
  className?: string;
}) {
  return (
    <InlineNotice tone="warning" live={false} className={cn('flex items-start gap-3', className)}>
      <CloudOff aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 space-y-1" data-testid="ops-offline-banner">
        <p className="font-medium">You are offline</p>
        <p className="text-sm text-current/80">
          Starting or ending a shift and checking in patients still work. They are saved on this
          device and sync automatically. {unavailable} need a connection.
        </p>
        <p className="text-xs text-current/70">
          {savedCopyAt
            ? `Showing this device’s copy from ${formatOpsDateTime(savedCopyAt, timeZone)}.`
            : 'No saved copy of this day on this device yet.'}
        </p>
      </div>
    </InlineNotice>
  );
}

/**
 * Compact empty state.
 *
 * Kept as a name because 23 call sites use it, but it no longer has an implementation of its
 * own: it is `EmptyState` at compact density. Prefer importing `EmptyState` directly in new
 * code; this alias exists so the call sites can move a group at a time.
 */
export function EmptyStateCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  /** Optional leading glyph. Several panels had hand-rolled an icon variant of this card. */
  icon?: React.ReactElement;
}) {
  return <EmptyState density="compact" title={title} description={description} icon={icon} />;
}

export function ShiftControlCard({
  currentShift,
  selectedRole,
  availableRoles,
  isOnline,
  busy,
  disabled,
  timezone,
  onSelectedRoleChange,
  onCheckIn,
  onCheckOut,
  className,
}: {
  currentShift: WithPendingSync<ActiveShift> | null;
  selectedRole: ShiftRole | '';
  availableRoles: readonly ShiftRole[];
  isOnline: boolean;
  busy?: boolean;
  /** Nobody is signed in to attribute the change to yet. */
  disabled?: boolean;
  timezone: string;
  onSelectedRoleChange: (value: ShiftRole) => void;
  onCheckIn: () => void;
  onCheckOut: () => void;
  className?: string;
}) {
  const hasShiftRole = availableRoles.length > 0;

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Stethoscope className="h-4 w-4 text-primary" />
              Shift Status
            </CardTitle>
            <CardDescription className="mt-1">
              Start or end your clinic availability for the day.
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {currentShift ? (
              <Badge variant="finalized">On Duty</Badge>
            ) : (
              <Badge variant="outline" className="bg-card/70">
                Off Duty
              </Badge>
            )}
            {currentShift?.pendingSync ? (
              <PendingSyncBadge state={currentShift.pendingSync} />
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentShift ? (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-lg border border-border/80 bg-card/75 p-4 sm:grid-cols-2">
              <div>
                <p className="text-eyebrow text-muted-foreground">Checked In As</p>
                <div className="mt-2">
                  <ShiftRoleBadge role={currentShift.roleAtShift} />
                </div>
              </div>
              <div>
                <p className="text-eyebrow text-muted-foreground">Started</p>
                <p className="mt-2 flex items-center gap-2 text-sm font-medium text-foreground">
                  <Clock3 className="h-4 w-4 text-muted-foreground" />
                  {formatOpsDateTime(currentShift.checkedInAt, timezone)}
                </p>
              </div>
            </div>

            {currentShift.pendingCheckOut ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border p-3">
                <p className="text-sm text-muted-foreground">Shift end saved on this device.</p>
                <PendingSyncBadge state={currentShift.pendingCheckOut} />
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={onCheckOut}
                disabled={busy || disabled}
                className="w-full"
              >
                {busy
                  ? 'Ending shift...'
                  : `End shift at ${formatOpsTime(new Date().toISOString(), timezone)}`}
              </Button>
            )}
          </div>
        ) : hasShiftRole ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ops-shift-role">Role for this shift</Label>
              <Select
                value={selectedRole}
                onValueChange={(value) => onSelectedRoleChange(value as ShiftRole)}
              >
                <SelectTrigger id="ops-shift-role" className="bg-card/80">
                  <SelectValue placeholder="Choose a role" />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map((role) => (
                    <SelectItem key={role} value={role}>
                      {formatRoleLabel(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              onClick={onCheckIn}
              disabled={!selectedRole || busy || disabled}
              className="w-full"
            >
              {busy
                ? 'Starting shift...'
                : `Start ${selectedRole ? formatRoleLabel(selectedRole).toLowerCase() : 'shift'}`}
            </Button>
          </div>
        ) : (
          <EmptyStateCard
            title="No shift role available"
            description="This account does not currently have a clinic role that can be checked in for OPS scheduling."
          />
        )}

        {!isOnline && hasShiftRole ? (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <CloudOff aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {currentShift
              ? OPS_OFFLINE_SUPPORT.shiftCheckOut.offlineHint
              : OPS_OFFLINE_SUPPORT.shiftCheckIn.offlineHint}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
