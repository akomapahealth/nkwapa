'use client';

import { AlertCircle, Clock3, Stethoscope } from 'lucide-react';
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

export function OnlineOnlyBanner({ className }: { className?: string }) {
  return (
    <InlineNotice tone="info" className={cn('flex items-start gap-3', className)}>
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">Connectivity required</p>
        <p className="mt-1 text-sm text-current/80">
          OPS views stay online-only in this release. Live assignments, shift updates, and intake
          actions are disabled until the connection returns.
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
  timezone,
  onSelectedRoleChange,
  onCheckIn,
  onCheckOut,
  className,
}: {
  currentShift: ActiveShift | null;
  selectedRole: ShiftRole | '';
  availableRoles: ShiftRole[];
  isOnline: boolean;
  busy?: boolean;
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
          {currentShift ? (
            <Badge variant="finalized" className="shrink-0">
              On Duty
            </Badge>
          ) : (
            <Badge variant="outline" className="shrink-0 bg-card/70">
              Off Duty
            </Badge>
          )}
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

            <Button
              type="button"
              variant="outline"
              onClick={onCheckOut}
              disabled={!isOnline || busy}
              className="w-full"
            >
              {busy
                ? 'Ending shift...'
                : `End shift at ${formatOpsTime(new Date().toISOString(), timezone)}`}
            </Button>
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
              disabled={!selectedRole || !isOnline || busy}
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

        {!isOnline ? (
          <p className="text-xs text-muted-foreground">Shift changes need an active connection.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
