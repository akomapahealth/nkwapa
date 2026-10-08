'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, RefreshCw, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { apiFetch } from '@/lib/api';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import {
  CHECKIN_STATUS_ORDER,
  OPS_DEFAULT_TIMEZONE,
  type ActiveShift,
  type ActiveShiftsResponse,
  type CheckInStatus,
  type CheckInsResponse,
  type ShiftRole,
  formatOpsDate,
  formatOpsDateTime,
  formatOpsTime,
  formatRoleLabel,
  getEligibleShiftRoles,
  getTodayInTimeZone,
  hasPermission,
  readApiError,
} from '@/lib/ops';
import { fetchActiveShifts, fetchCheckIns } from '@/lib/ops-api';
import {
  overlayPendingCheckIns,
  overlayPendingShifts,
  type WithPendingSync,
} from '@/lib/ops-offline';
import type { CheckInSummary } from '@/lib/ops';
import { useOpsView } from '@/lib/use-ops-view';
import { usePendingOpsWrites } from '@/lib/use-pending-ops-writes';
import { useShiftControls } from '@/lib/use-shift-controls';
import { AppMetricCard, AppMetricGroup } from '@/components/app-shell/AppMetricCard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { RouteGuard } from '@/components/RouteGuard';
import {
  CheckInStatusBadge,
  EmptyStateCard,
  InlineNotice,
  OfflineOpsBanner,
  OpsFeedbackNotice,
  PendingSyncBadge,
  ShiftControlCard,
  ShiftRoleBadge,
  opsOfflineHint,
} from '@/components/ops/OpsShared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { StationLineBoard } from '@/components/stations/StationLineBoard';
import { isWebFeatureEnabled } from '@/lib/feature-flags';

type BoardCheckIn = WithPendingSync<CheckInSummary>;

type AssignmentDialogState = {
  mode: 'assign' | 'reassign';
  checkIn: BoardCheckIn;
} | null;

interface TodayBoard {
  shifts: ActiveShiftsResponse;
  checkIns: CheckInsResponse;
}

const SHIFT_FILTERS: Array<'ALL' | ShiftRole> = ['ALL', 'VOLUNTEER', 'DOCTOR', 'MANAGER'];

function countByRole(items: ActiveShift[], role: ShiftRole) {
  return items.filter((item) => item.roleAtShift === role).length;
}

/**
 * In the station line (#167) nobody assigns patients; the board shows the line instead. The flag
 * is inlined at build time, so this choice never changes during a render.
 */
export default function TodayPage() {
  if (isWebFeatureEnabled('stationWorkflow')) {
    return (
      <RouteGuard requiredPermission="OPS.STATION.READ" requiresClinic>
        <StationLineBoard />
      </RouteGuard>
    );
  }
  return <TodayBoardPage />;
}

function TodayBoardPage() {
  const bootstrapCtx = useBootstrap();
  const bootstrap = bootstrapCtx?.bootstrap ?? null;
  const getToken = useAuth();

  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const activeMembership = bootstrap?.memberships?.find(
    (membership) => membership.clinicId === clinicId,
  );
  const permissions = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const rolePool = Array.from(
    new Set([
      ...(bootstrap?.effectiveRolesForActiveClinic ?? []),
      ...(activeMembership?.roles ?? []),
    ]),
  );
  const eligibleShiftRoles = getEligibleShiftRoles(rolePool);
  const canManageAssignments = hasPermission(permissions, 'OPS.ASSIGNMENT.MANAGE');

  const [selectedDate, setSelectedDate] = useState(getTodayInTimeZone());
  const [shiftRoleFilter, setShiftRoleFilter] = useState<ShiftRole | 'ALL'>('ALL');
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [assignmentDialog, setAssignmentDialog] = useState<AssignmentDialogState>(null);
  const [selectedVolunteerId, setSelectedVolunteerId] = useState('');
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [reassignReason, setReassignReason] = useState('');

  const pendingWrites = usePendingOpsWrites(clinicId);
  const pendingIds = useMemo(() => pendingWrites.map((write) => write.entityId), [pendingWrites]);
  const board = useOpsView<TodayBoard>({
    clinicId,
    kind: 'today-board',
    date: selectedDate,
    errorMessage: 'The board could not be loaded.',
    pendingIds,
    fetcher: async (token, signal) => {
      const options = { clinicId: clinicId ?? '', date: selectedDate, getToken: token, signal };
      const [shifts, checkIns] = await Promise.all([
        fetchActiveShifts(options),
        fetchCheckIns(options),
      ]);
      return { shifts, checkIns };
    },
  });
  const { isOnline } = board;

  const timezone =
    board.data?.checkIns.timezone ?? board.data?.shifts.timezone ?? OPS_DEFAULT_TIMEZONE;
  // Queued shift changes are about today; drawing them on another day's roster would be wrong.
  const isToday = selectedDate === getTodayInTimeZone(timezone);
  const shifts = useMemo(
    () =>
      overlayPendingShifts(board.data?.shifts.items ?? [], isToday ? pendingWrites : [], {
        userId: bootstrap?.userId,
        displayName: bootstrap?.displayName,
      }),
    [board.data, isToday, pendingWrites, bootstrap?.userId, bootstrap?.displayName],
  );
  const checkins: BoardCheckIn[] = useMemo(
    () =>
      overlayPendingCheckIns(board.data?.checkIns.items ?? [], pendingWrites, {
        clinicId: clinicId ?? '',
        date: selectedDate,
        timezone,
      }),
    [board.data, pendingWrites, clinicId, selectedDate, timezone],
  );

  const shiftControls = useShiftControls({
    clinicId,
    userId: bootstrap?.userId,
    shifts,
    eligibleRoles: eligibleShiftRoles,
    onApplied: board.refresh,
  });

  const onDuty = shifts.filter((shift) => !shift.pendingCheckOut);
  const filteredShifts =
    shiftRoleFilter === 'ALL'
      ? shifts
      : shifts.filter((shift) => shift.roleAtShift === shiftRoleFilter);
  // Only shifts the server knows about can be assigned; a queued one would be refused.
  const assignable = shifts.filter((shift) => !shift.pendingSync && !shift.pendingCheckOut);
  const volunteerOptions = assignable.filter((shift) => shift.roleAtShift === 'VOLUNTEER');
  const doctorOptions = assignable.filter((shift) => shift.roleAtShift === 'DOCTOR');

  const groupedCheckins = CHECKIN_STATUS_ORDER.reduce<Record<CheckInStatus, BoardCheckIn[]>>(
    (accumulator, status) => {
      accumulator[status] = checkins.filter((item) => item.status === status);
      return accumulator;
    },
    {
      WAITING: [],
      ASSIGNED: [],
      IN_PROGRESS: [],
      COMPLETED: [],
      CANCELLED: [],
    },
  );

  const visibleStatuses = CHECKIN_STATUS_ORDER.filter(
    (status) => status !== 'CANCELLED' || groupedCheckins.CANCELLED.length > 0,
  );

  function openAssignmentDialog(mode: 'assign' | 'reassign', checkIn: BoardCheckIn) {
    setActionError(null);
    setNotice(null);
    setAssignmentDialog({ mode, checkIn });
    setSelectedVolunteerId(
      checkIn.assignmentSummary?.assignedVolunteer.id ?? volunteerOptions[0]?.userId ?? '',
    );
    setSelectedDoctorId(
      checkIn.assignmentSummary?.assignedDoctor.id ?? doctorOptions[0]?.userId ?? '',
    );
    setReassignReason('');
  }

  async function handleAssignmentSave() {
    if (!clinicId || !getToken || !assignmentDialog) {
      return;
    }

    if (!selectedVolunteerId || !selectedDoctorId) {
      setActionError('Choose both a volunteer and a doctor before saving.');
      return;
    }

    if (assignmentDialog.mode === 'reassign' && !reassignReason.trim()) {
      setActionError('A reason is required when reassigning a patient.');
      return;
    }

    setSavingAssignment(true);
    setActionError(null);
    setNotice(null);

    try {
      const path =
        assignmentDialog.mode === 'assign'
          ? `/clinics/${encodeURIComponent(clinicId)}/assignments`
          : `/clinics/${encodeURIComponent(clinicId)}/assignments/${encodeURIComponent(
              assignmentDialog.checkIn.assignmentSummary?.id ?? '',
            )}/reassign`;

      const body =
        assignmentDialog.mode === 'assign'
          ? {
              patientCheckInId: assignmentDialog.checkIn.id,
              assignedVolunteerId: selectedVolunteerId,
              assignedDoctorId: selectedDoctorId,
            }
          : {
              assignedVolunteerId: selectedVolunteerId,
              assignedDoctorId: selectedDoctorId,
              reason: reassignReason.trim(),
            };

      const response = await apiFetch(path, {
        method: assignmentDialog.mode === 'assign' ? 'POST' : 'PATCH',
        body: JSON.stringify(body),
        getToken,
        activeClinicId: clinicId,
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setNotice(
        assignmentDialog.mode === 'assign'
          ? `${assignmentDialog.checkIn.patient.displayName} assigned successfully.`
          : `${assignmentDialog.checkIn.patient.displayName} reassigned successfully.`,
      );
      setAssignmentDialog(null);
      setReassignReason('');
      board.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingAssignment(false);
    }
  }

  if (!clinicId) {
    return (
      <RouteGuard requiredPermission="OPS.CHECKIN.READ">
        <div className="p-4">
          <p className="text-muted-foreground">Select a clinic to load the Today Board.</p>
        </div>
      </RouteGuard>
    );
  }

  return (
    <RouteGuard requiredPermission="OPS.CHECKIN.READ">
      <div className="space-y-6">
        <AppPageHeader
          eyebrow="Clinic ops"
          title="Today Board"
          description="Live clinic flow for the selected day."
          helpTitle="How the board updates"
          helpText="Staff check-ins, patient arrivals, and volunteer assignments refresh here so OPS can see who is available and which patients still need a pair."
          actions={
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="today-board-date" className="text-eyebrow text-muted-foreground">
                  Clinic day
                </Label>
                <div className="relative">
                  <CalendarDays
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="today-board-date"
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    className="w-[180px] pl-9"
                  />
                </div>
              </div>

              {/* The timezone is context for the date beside it, not a metric. It was a boxed
                  tile the same size as the date picker, which made a read-only label look like
                  a second control. */}
              <p className="pb-3 text-sm text-muted-foreground">
                Times shown in <span className="font-medium text-foreground">{timezone}</span>
              </p>

              <Button
                type="button"
                variant="outline"
                onClick={board.refresh}
                disabled={!isOnline || board.isRefreshing || board.isInitialLoading}
                title={isOnline ? undefined : 'Refreshing needs a connection.'}
              >
                <RefreshCw
                  aria-hidden="true"
                  className={board.isRefreshing ? 'animate-spin motion-reduce:animate-none' : ''}
                />
                Refresh
              </Button>
            </div>
          }
        />

        <AppMetricGroup className="sm:grid-cols-2 xl:grid-cols-4">
          <AppMetricCard
            title="Patients waiting"
            value={groupedCheckins.WAITING.length}
            detail="New arrivals ready for assignment"
          />
          <AppMetricCard
            title="Active assignments"
            value={groupedCheckins.ASSIGNED.length + groupedCheckins.IN_PROGRESS.length}
            detail="Assigned or currently in intake"
          />
          <AppMetricCard
            title="Staff on duty"
            value={onDuty.length}
            detail={`${countByRole(onDuty, 'VOLUNTEER')} volunteers, ${countByRole(onDuty, 'DOCTOR')} doctors`}
          />
          <AppMetricCard
            title="Completed today"
            value={groupedCheckins.COMPLETED.length}
            detail={formatOpsDate(selectedDate, timezone)}
          />
        </AppMetricGroup>

        {!isOnline ? (
          <OfflineOpsBanner
            dataAsOf={board.dataAsOf}
            timeZone={timezone}
            unavailable="Assigning patients and refreshing the board"
          />
        ) : board.savedCopyAt ? (
          <InlineNotice tone="warning" live={false}>
            The live board could not be reached. Showing this device’s copy from{' '}
            {formatOpsDateTime(board.savedCopyAt, timezone)}.
          </InlineNotice>
        ) : null}
        {board.error ? (
          <InlineErrorState
            title="The board could not be loaded"
            description={board.error}
            onRetry={board.refresh}
          />
        ) : null}
        {actionError ? <InlineNotice tone="error">{actionError}</InlineNotice> : null}
        {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}
        <OpsFeedbackNotice feedback={shiftControls.feedback} />

        {board.isInitialLoading ? (
          <div
            className="grid gap-6 xl:grid-cols-[360px,minmax(0,1fr)]"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <span className="sr-only">Loading the Today Board</span>
            <div className="space-y-6">
              <SectionSkeleton lines={2} />
              <SectionSkeleton lines={3} />
            </div>
            <SectionSkeleton lines={6} />
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[360px,minmax(0,1fr)]">
            <div className="min-w-0 space-y-6">
              <ShiftControlCard
                currentShift={shiftControls.currentShift}
                selectedRole={shiftControls.selectedRole}
                availableRoles={eligibleShiftRoles}
                isOnline={isOnline}
                busy={shiftControls.busy}
                disabled={!shiftControls.canSubmit}
                timezone={timezone}
                onSelectedRoleChange={shiftControls.setSelectedRole}
                onCheckIn={shiftControls.checkIn}
                onCheckOut={shiftControls.checkOut}
              />

              <Card>
                <CardHeader className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-xl">
                        <Users className="h-5 w-5 text-primary" />
                        Staff On Duty
                      </CardTitle>
                      <CardDescription className="mt-1">
                        Active shifts for {formatOpsDate(selectedDate, timezone)}.
                      </CardDescription>
                    </div>
                    <div className="rounded-lg border border-border bg-background px-3 py-2 text-right">
                      <p className="text-eyebrow text-muted-foreground">Total</p>
                      <p className="text-lg font-semibold">{onDuty.length}</p>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-lg border border-border bg-background p-3">
                      <p className="text-eyebrow text-muted-foreground">Volunteers</p>
                      <p className="mt-2 text-2xl font-semibold">
                        {countByRole(onDuty, 'VOLUNTEER')}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-background p-3">
                      <p className="text-eyebrow text-muted-foreground">Doctors</p>
                      <p className="mt-2 text-2xl font-semibold">{countByRole(onDuty, 'DOCTOR')}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-background p-3">
                      <p className="text-eyebrow text-muted-foreground">Managers</p>
                      <p className="mt-2 text-2xl font-semibold">
                        {countByRole(onDuty, 'MANAGER')}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {SHIFT_FILTERS.map((value) => (
                      <Button
                        key={value}
                        type="button"
                        variant={shiftRoleFilter === value ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setShiftRoleFilter(value)}
                        className="rounded-full"
                      >
                        {value === 'ALL' ? 'All roles' : formatRoleLabel(value)}
                      </Button>
                    ))}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {filteredShifts.length === 0 ? (
                    <EmptyStateCard
                      title="No staff checked in"
                      description="The roster will populate as staff start their shifts."
                    />
                  ) : (
                    filteredShifts.map((shift) => (
                      <div
                        key={shift.shiftId}
                        className="rounded-lg border border-border bg-background p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                              {shift.displayName}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Checked in at {formatOpsTime(shift.checkedInAt, timezone)}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1.5">
                            <ShiftRoleBadge role={shift.roleAtShift} />
                            {shift.pendingSync ? (
                              <PendingSyncBadge state={shift.pendingSync} />
                            ) : shift.pendingCheckOut ? (
                              <PendingSyncBadge
                                state={shift.pendingCheckOut}
                                label={
                                  shift.pendingCheckOut === 'blocked'
                                    ? 'Shift end needs attention'
                                    : 'Ending · pending sync'
                                }
                              />
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            <section className="min-w-0 space-y-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="font-heading text-2xl font-semibold tracking-tight">
                    Patient Flow
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Arrival-to-intake movement for the clinic day.
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card px-4 py-3 text-right">
                  <p className="text-eyebrow text-muted-foreground">Queue Total</p>
                  <p className="mt-1 text-xl font-semibold">{checkins.length}</p>
                </div>
              </div>

              {checkins.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="flex min-h-[260px] items-center justify-center p-10">
                    <EmptyStateCard
                      title="No patient check-ins yet"
                      description="Once patients are checked in from search or patient detail, they will appear here in real time."
                    />
                  </CardContent>
                </Card>
              ) : (
                <div className="grid auto-cols-[minmax(280px,1fr)] grid-flow-col gap-4 overflow-x-auto pb-2">
                  {visibleStatuses.map((status) => (
                    <Card key={status} className="max-h-[72vh] min-h-[420px]">
                      <CardHeader className="sticky top-0 z-10 rounded-t-lg bg-card">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <CardTitle className="text-lg">
                              {status === 'IN_PROGRESS' ? 'In Progress' : formatRoleLabel(status)}
                            </CardTitle>
                            <CardDescription className="mt-1">
                              {groupedCheckins[status].length} patient
                              {groupedCheckins[status].length === 1 ? '' : 's'}
                            </CardDescription>
                          </div>
                          <CheckInStatusBadge status={status} />
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3 overflow-y-auto pb-6">
                        {groupedCheckins[status].length === 0 ? (
                          <EmptyStateCard
                            title="Nothing here"
                            description={`No ${formatRoleLabel(status).toLowerCase()} check-ins at the moment.`}
                          />
                        ) : (
                          groupedCheckins[status].map((checkIn) => (
                            <article
                              key={checkIn.id}
                              className={
                                checkIn.pendingSync
                                  ? 'rounded-lg border border-dashed border-info/40 bg-info/5 p-4'
                                  : 'rounded-lg border border-border bg-background p-4'
                              }
                              data-pending-sync={checkIn.pendingSync}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-eyebrow font-mono text-primary">
                                    {checkIn.patient.patientCode}
                                  </p>
                                  <h3 className="mt-2 text-base font-semibold text-foreground">
                                    {checkIn.patient.displayName}
                                  </h3>
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    Checked in at {formatOpsDateTime(checkIn.checkedInAt, timezone)}
                                  </p>
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-1.5">
                                  <CheckInStatusBadge status={checkIn.status} />
                                  {checkIn.pendingSync ? (
                                    <PendingSyncBadge state={checkIn.pendingSync} />
                                  ) : null}
                                </div>
                              </div>

                              {checkIn.assignmentSummary ? (
                                <div className="mt-4 grid gap-2 rounded-lg border border-border bg-card p-3">
                                  <div>
                                    <p className="text-eyebrow text-muted-foreground">Volunteer</p>
                                    <p className="mt-1 text-sm font-medium">
                                      {checkIn.assignmentSummary.assignedVolunteer.displayName}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-eyebrow text-muted-foreground">Doctor</p>
                                    <p className="mt-1 text-sm font-medium">
                                      {checkIn.assignmentSummary.assignedDoctor.displayName}
                                    </p>
                                  </div>
                                </div>
                              ) : null}

                              {checkIn.notes ? (
                                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                                  {checkIn.notes}
                                </p>
                              ) : null}

                              <div className="mt-5 flex flex-wrap gap-2">
                                {checkIn.status === 'WAITING' && canManageAssignments ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => openAssignmentDialog('assign', checkIn)}
                                    disabled={!isOnline || Boolean(checkIn.pendingSync)}
                                    title={
                                      checkIn.pendingSync
                                        ? 'This check-in can be assigned once it has synced.'
                                        : opsOfflineHint('assign', isOnline)
                                    }
                                  >
                                    Assign
                                  </Button>
                                ) : null}

                                {checkIn.status === 'ASSIGNED' &&
                                canManageAssignments &&
                                checkIn.assignmentSummary ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openAssignmentDialog('reassign', checkIn)}
                                    disabled={!isOnline}
                                    title={opsOfflineHint('reassign', isOnline)}
                                  >
                                    Reassign
                                  </Button>
                                ) : null}

                                {checkIn.encounterId ? (
                                  <Button asChild size="sm" variant="outline">
                                    <Link href={`/encounters/${checkIn.encounterId}`}>
                                      View encounter
                                      <ArrowRight className="h-4 w-4" />
                                    </Link>
                                  </Button>
                                ) : (
                                  <Button asChild size="sm" variant="ghost">
                                    <Link
                                      href={`/clinics/${clinicId}/patients/${checkIn.patient.id}`}
                                    >
                                      View patient
                                      <ArrowRight className="h-4 w-4" />
                                    </Link>
                                  </Button>
                                )}
                              </div>
                            </article>
                          ))
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        <Dialog
          open={assignmentDialog !== null}
          onOpenChange={(open) => {
            if (!open) {
              setAssignmentDialog(null);
              setReassignReason('');
            }
          }}
        >
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="font-heading text-2xl">
                {assignmentDialog?.mode === 'reassign' ? 'Reassign patient' : 'Assign patient'}
              </DialogTitle>
              <DialogDescription className="leading-6">
                {assignmentDialog ? (
                  <>
                    {assignmentDialog.checkIn.patient.patientCode} ·{' '}
                    {assignmentDialog.checkIn.patient.displayName}
                  </>
                ) : null}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              {volunteerOptions.length === 0 || doctorOptions.length === 0 ? (
                <InlineNotice tone="error">
                  At least one active volunteer shift and one active doctor shift are required
                  before a patient can be assigned.
                </InlineNotice>
              ) : null}

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="assignment-volunteer">Volunteer</Label>
                  <Select value={selectedVolunteerId} onValueChange={setSelectedVolunteerId}>
                    <SelectTrigger id="assignment-volunteer">
                      <SelectValue placeholder="Select volunteer" />
                    </SelectTrigger>
                    <SelectContent>
                      {volunteerOptions.map((shift) => (
                        <SelectItem key={shift.shiftId} value={shift.userId}>
                          {shift.displayName} · {formatOpsTime(shift.checkedInAt, timezone)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="assignment-doctor">Doctor</Label>
                  <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId}>
                    <SelectTrigger id="assignment-doctor">
                      <SelectValue placeholder="Select doctor" />
                    </SelectTrigger>
                    <SelectContent>
                      {doctorOptions.map((shift) => (
                        <SelectItem key={shift.shiftId} value={shift.userId}>
                          {shift.displayName} · {formatOpsTime(shift.checkedInAt, timezone)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {assignmentDialog?.mode === 'reassign' ? (
                <div className="space-y-2">
                  <Label htmlFor="assignment-reason">Reason (required)</Label>
                  <Textarea
                    id="assignment-reason"
                    value={reassignReason}
                    onChange={(event) => setReassignReason(event.target.value)}
                    placeholder="Explain why the patient is moving to a new pairing."
                  />
                </div>
              ) : null}
            </div>

            <DialogFooter className="mt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAssignmentDialog(null)}
                disabled={savingAssignment}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleAssignmentSave()}
                disabled={
                  savingAssignment ||
                  volunteerOptions.length === 0 ||
                  doctorOptions.length === 0 ||
                  !isOnline
                }
              >
                {savingAssignment
                  ? assignmentDialog?.mode === 'reassign'
                    ? 'Reassigning...'
                    : 'Assigning...'
                  : assignmentDialog?.mode === 'reassign'
                    ? 'Reassign patient'
                    : 'Assign patient'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RouteGuard>
  );
}
