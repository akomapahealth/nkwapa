'use client';

import type { ReactNode } from 'react';
import type { useShiftControls } from '@/lib/use-shift-controls';
import { formatOpsTime, formatRoleLabel, type ShiftRole } from '@/lib/ops';
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
import { cn } from '@/lib/utils';

/**
 * The duty strip at the top of Stations (Phase W1, pilot `#s-station`): duty state, since when,
 * the station picker and End shift in one band, so the next patient sits right under it.
 * Today and My Assigned keep their existing shift card.
 */
export function StationShiftStrip({
  controls,
  roles,
  timezone,
  disabled,
  onStart,
  onEnd,
  station,
  refresh,
  screener,
}: {
  controls: ReturnType<typeof useShiftControls>;
  roles: readonly ShiftRole[];
  timezone: string;
  disabled: boolean;
  onStart: () => void;
  onEnd: () => void;
  /** The station picker trigger, shown on duty. */
  station?: ReactNode;
  refresh?: ReactNode;
  /** Who the account is recording as, when it is not the account holder. */
  screener?: string | null;
}) {
  const shift = controls.currentShift;
  return (
    <section
      aria-label="Your shift"
      className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg border border-border bg-mint px-4 py-3 compact:px-5"
      data-testid="station-shift"
    >
      <div
        className={cn(
          'flex min-w-0 flex-col gap-x-3 gap-y-0.5 compact:flex-row compact:flex-wrap compact:items-center',
          // On a phone the status and its time stack beside the buttons; the picker takes row two.
          shift && 'flex-1 compact:flex-none',
        )}
      >
        <p className="flex items-center gap-2 font-semibold">
          <span
            aria-hidden="true"
            className={cn(
              'h-2.5 w-2.5 rounded-full',
              shift ? 'bg-success' : 'border-2 border-muted-foreground',
            )}
          />
          {shift ? 'On Duty' : 'Off Duty'}
        </p>
        <p className="text-sm text-muted-foreground">
          {shift ? (
            <>
              {/* A phone has no room for the role; it is in the header under the clinic name. */}
              <span className="hidden compact:inline">{formatRoleLabel(shift.roleAtShift)} · </span>
              since {formatOpsTime(shift.checkedInAt, timezone)}
              {screener ? ` · recording as ${screener}` : ''}
            </>
          ) : (
            'Start your shift, then choose where you are working today.'
          )}
        </p>
      </div>
      {shift && station ? (
        <div className="order-last -ml-2 w-full min-w-0 compact:order-none compact:w-auto">
          {station}
        </div>
      ) : null}
      <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
        {shift?.pendingSync ? (
          <PendingSyncBadge state={shift.pendingSync} className="min-h-11" />
        ) : null}
        {refresh}
        {shift?.pendingCheckOut ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Shift end saved on this device.</span>
            <PendingSyncBadge state={shift.pendingCheckOut} className="min-h-11" />
          </div>
        ) : shift ? (
          <Button variant="outline" disabled={disabled} onClick={onEnd}>
            {controls.busy ? 'Ending shift…' : 'End shift'}
          </Button>
        ) : null}
      </div>
      {!shift ? (
        roles.length ? (
          <div className="flex w-full flex-col gap-3 compact:flex-row compact:items-end">
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
                  <SelectTrigger id="station-shift-role" className="bg-card">
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
          <p className="w-full text-sm text-muted-foreground">
            No shift role available for this account.
          </p>
        )
      ) : null}
    </section>
  );
}
