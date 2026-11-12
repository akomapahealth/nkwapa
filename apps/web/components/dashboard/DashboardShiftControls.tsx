'use client';

import { useEffect, useMemo, useState } from 'react';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import {
  formatOpsDateTime,
  formatRoleLabel,
  getEligibleShiftRoles,
  getTodayInTimeZone,
  hasPermission,
  OPS_DEFAULT_TIMEZONE,
  type ActiveShiftsResponse,
  type ShiftRole,
} from '@/lib/ops';
import { fetchActiveShifts } from '@/lib/ops-api';
import { overlayPendingShifts } from '@/lib/ops-offline';
import { useOpsView } from '@/lib/use-ops-view';
import { usePendingOpsWrites } from '@/lib/use-pending-ops-writes';
import { useShiftControls } from '@/lib/use-shift-controls';
import { usePolling } from '@/lib/stations';
import { InlineErrorState } from '@/components/feedback/AppState';
import { OpsFeedbackNotice, PendingSyncBadge } from '@/components/ops/OpsShared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DashboardIllustration } from './DashboardIllustration';

function isShifts(value: unknown): value is ActiveShiftsResponse {
  if (!value || typeof value !== 'object') return false;
  const shifts = value as Partial<ActiveShiftsResponse>;
  return (
    typeof shifts.date === 'string' &&
    typeof shifts.timezone === 'string' &&
    Array.isArray(shifts.items)
  );
}

/** Mounted only with the station flag, an active clinic and shift-read permission. */
export function DashboardShiftControls() {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const permissions = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const canWrite = hasPermission(permissions, 'OPS.SHIFT.WRITE');
  const membership = bootstrap?.memberships?.find((item) => item.clinicId === clinicId);
  const eligibleRoles = getEligibleShiftRoles(
    Array.from(
      new Set([...(bootstrap?.effectiveRolesForActiveClinic ?? []), ...(membership?.roles ?? [])]),
    ),
  );
  const [date] = useState(getTodayInTimeZone);
  const [awaitingChange, setAwaitingChange] = useState<'start' | 'end' | null>(null);
  const pending = usePendingOpsWrites(clinicId);
  const pendingIds = useMemo(() => pending.map((write) => write.entityId), [pending]);
  const view = useOpsView<ActiveShiftsResponse>({
    clinicId,
    kind: 'dashboard-shifts',
    date,
    pendingIds,
    isValid: isShifts,
    errorMessage: 'Your shift status could not be loaded.',
    fetcher: (getToken, signal) =>
      fetchActiveShifts({ clinicId: clinicId!, date, getToken, signal }),
  });
  usePolling(view.refresh, view.isOnline && Boolean(clinicId));
  const shifts = useMemo(
    () =>
      overlayPendingShifts(view.data?.items ?? [], pending, {
        userId: bootstrap?.userId,
        displayName: bootstrap?.displayName,
      }),
    [view.data, pending, bootstrap?.userId, bootstrap?.displayName],
  );
  const controls = useShiftControls({
    clinicId,
    userId: bootstrap?.userId,
    shifts,
    eligibleRoles,
    onApplied: view.refresh,
  });
  const shift = controls.currentShift;
  const timezone = view.data?.timezone ?? OPS_DEFAULT_TIMEZONE;
  // Missing/failed reads are unknown, never evidence that this person is off duty.
  const known = Boolean(view.data || shift);
  // Hold the action until its read/overlay catches up, then release it. A later external
  // shift change must not reapply a lock from an old success message.
  useEffect(() => {
    if (!controls.feedback) return;
    if (
      controls.feedback.tone === 'error' ||
      (awaitingChange === 'start' && shift) ||
      (awaitingChange === 'end' && (!shift || shift.pendingCheckOut))
    )
      setAwaitingChange(null);
  }, [awaitingChange, controls.feedback, shift]);
  const disabled =
    !canWrite ||
    !controls.canSubmit ||
    controls.busy ||
    view.isRefreshing ||
    awaitingChange !== null;

  return (
    <section aria-label="Your shift" className="min-w-0 space-y-3" data-testid="dashboard-shift">
      {!known ? (
        view.isInitialLoading ? (
          <p role="status" className="text-sm">
            Loading your shift status…
          </p>
        ) : (
          <InlineErrorState
            title="Shift status unavailable"
            description={
              view.error ?? 'Connect to load your shift status before starting or ending a shift.'
            }
            onRetry={view.isOnline ? view.refresh : undefined}
          />
        )
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <span className="font-semibold">{shift ? 'On duty' : 'Off duty'}</span>
            {shift ? (
              <span>
                {formatRoleLabel(shift.roleAtShift)} · Started{' '}
                {formatOpsDateTime(shift.checkedInAt, timezone)}
              </span>
            ) : null}
            {shift?.pendingSync ? (
              <PendingSyncBadge
                state={shift.pendingSync}
                className={
                  shift.pendingSync === 'blocked' ? 'min-h-11 min-w-11 justify-center' : undefined
                }
              />
            ) : null}
          </div>
          {view.savedCopyAt || !view.isOnline ? (
            <p className="text-sm text-muted-foreground">
              Showing this device’s shift status
              {view.dataAsOf ? ` from ${formatOpsDateTime(view.dataAsOf, timezone)}` : ''}. Changes
              saved offline still need to sync.
            </p>
          ) : null}
          {!canWrite ? (
            <p className="text-sm text-muted-foreground">
              This account cannot start or end shifts.
            </p>
          ) : shift?.pendingCheckOut ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Shift end saved on this device.</span>
              <PendingSyncBadge
                state={shift.pendingCheckOut}
                className={
                  shift.pendingCheckOut === 'blocked'
                    ? 'min-h-11 min-w-11 justify-center'
                    : undefined
                }
              />
            </div>
          ) : shift ? (
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => {
                setAwaitingChange('end');
                controls.checkOut();
              }}
            >
              {controls.busy ? 'Ending shift…' : 'End shift'}
            </Button>
          ) : eligibleRoles.length ? (
            <div className="flex flex-col gap-3 compact:flex-row compact:items-end">
              {eligibleRoles.length === 1 ? (
                <p className="text-sm">Role for this shift: {formatRoleLabel(eligibleRoles[0])}</p>
              ) : (
                <div className="min-w-0 space-y-1 compact:w-56">
                  <Label htmlFor="dashboard-shift-role">Role for this shift</Label>
                  <Select
                    value={controls.selectedRole}
                    onValueChange={(role) => controls.setSelectedRole(role as ShiftRole)}
                    disabled={disabled}
                  >
                    <SelectTrigger id="dashboard-shift-role">
                      <SelectValue placeholder="Choose a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleRoles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {formatRoleLabel(role)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button
                disabled={disabled || !controls.selectedRole}
                onClick={() => {
                  setAwaitingChange('start');
                  controls.checkIn();
                }}
              >
                {controls.busy ? 'Starting shift…' : 'Start shift'}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No shift role available. This account does not currently have a clinic role that can
              be checked in for OPS scheduling.
            </p>
          )}
        </>
      )}
      <div className="flex items-center gap-2">
        {controls.feedback?.tone === 'success' &&
        controls.feedback.message.startsWith('Shift started') ? (
          <div className="h-16 w-16 shrink-0">
            <DashboardIllustration kind="checklist" />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <OpsFeedbackNotice feedback={controls.feedback} />
        </div>
      </div>
      {view.refreshError ? (
        <InlineErrorState
          title="Shift refresh is affected"
          description={view.refreshError}
          onRetry={view.refresh}
        />
      ) : null}
    </section>
  );
}
