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
      return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'PRECEPTOR':
      return 'border-slate-300 bg-slate-50 text-slate-700';
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

export function OpsMetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card/85 p-4 shadow-sm backdrop-blur-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      {detail ? <p className="mt-1 text-sm text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

export function InlineNotice({
  tone = 'info',
  className,
  children,
}: {
  tone?: 'info' | 'success' | 'error';
  className?: string;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === 'error'
      ? 'border-destructive/25 bg-destructive/10 text-destructive'
      : tone === 'success'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : 'border-primary/20 bg-primary/10 text-foreground';

  return (
    <div className={cn('rounded-2xl border px-4 py-3 text-sm', toneClass, className)}>
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

export function EmptyStateCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-background/80 p-5 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1">{description}</p>
    </div>
  );
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
    <Card
      className={cn(
        'overflow-hidden border-primary/15 bg-gradient-to-br from-primary/10 via-card to-secondary/10 shadow-lg shadow-primary/5',
        className,
      )}
    >
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
            <div className="grid gap-3 rounded-2xl border border-border/80 bg-card/75 p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Checked In As
                </p>
                <div className="mt-2">
                  <ShiftRoleBadge role={currentShift.roleAtShift} />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Started
                </p>
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
