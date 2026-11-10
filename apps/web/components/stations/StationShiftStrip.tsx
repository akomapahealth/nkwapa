'use client';

import type { useShiftControls } from '@/lib/use-shift-controls';
import { formatOpsDateTime, formatRoleLabel, type ShiftRole } from '@/lib/ops';
import { PendingSyncBadge } from '@/components/ops/OpsShared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Stations presentation only. Today and My Assigned keep their existing shift card. */
export function StationShiftStrip({
  controls,
  roles,
  timezone,
  disabled,
  onStart,
  onEnd,
}: {
  controls: ReturnType<typeof useShiftControls>;
  roles: readonly ShiftRole[];
  timezone: string;
  disabled: boolean;
  onStart: () => void;
  onEnd: () => void;
}) {
  const shift = controls.currentShift;
  return (
    <section
      aria-label="Your shift"
      className="flex flex-wrap items-center gap-3 border-y border-border py-4"
      data-testid="station-shift"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-semibold">{shift ? 'On Duty' : 'Off Duty'}</p>
        <p className="text-sm text-muted-foreground">
          {shift
            ? `${formatRoleLabel(shift.roleAtShift)} · Started ${formatOpsDateTime(shift.checkedInAt, timezone)}`
            : 'Start your shift, then choose where you are working today.'}
        </p>
      </div>
      {shift?.pendingSync ? (
        <PendingSyncBadge state={shift.pendingSync} className="min-h-11" />
      ) : null}
      {shift?.pendingCheckOut ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Shift end saved on this device.</span>
          <PendingSyncBadge state={shift.pendingCheckOut} className="min-h-11" />
        </div>
      ) : shift ? (
        <Button variant="outline" disabled={disabled} onClick={onEnd}>
          {controls.busy ? 'Ending shift…' : 'End shift'}
        </Button>
      ) : roles.length ? (
        <div className="flex w-full flex-col gap-3 compact:w-auto compact:flex-row compact:items-end">
          {roles.length === 1 ? (
            <p className="self-start text-sm compact:self-center">
              Role for this shift: {formatRoleLabel(roles[0])}
            </p>
          ) : (
            <div className="flex min-w-0 flex-col gap-1">
              <Label htmlFor="station-shift-role">Role for this shift</Label>
              <Select
                value={controls.selectedRole}
                onValueChange={(role) => controls.setSelectedRole(role as ShiftRole)}
                disabled={disabled}
              >
                <SelectTrigger id="station-shift-role">
                  <SelectValue placeholder="Choose a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {roles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {formatRoleLabel(role)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          )}
          <Button disabled={disabled || !controls.selectedRole} onClick={onStart}>
            {controls.busy ? 'Starting shift…' : 'Start shift'}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No shift role available for this account.</p>
      )}
    </section>
  );
}
