'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, ChevronRight, RefreshCw, Users } from 'lucide-react';
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
import { AppActionRow } from '@/components/app-shell/AppActionRow';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import {
  EmptyState,
  InlineErrorState,
  SectionSkeleton,
  SelectClinicState,
} from '@/components/feedback/AppState';
import { SegmentedControl } from '@/components/app-shell/SegmentedControl';
import { cn } from '@/lib/utils';
import styles from './today-board.module.css';
import { RouteGuard } from '@/components/RouteGuard';
import {
  InlineNotice,
  OfflineOpsBanner,
  OpsFeedbackNotice,
  PendingSyncBadge,
  ShiftControlCard,
  ShiftRoleBadge,
  opsOfflineHint,
} from '@/components/ops/OpsShared';
import { Button } from '@/components/ui/button';
import {
  RecordSection,
  RecordSectionContent,
  RecordSectionDescription,
  RecordSectionHeader,
  RecordSectionTitle,
} from '@/components/patients/RecordSection';
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
const SHIFT_FILTER_LABELS: Record<ShiftRole, string> = {
  VOLUNTEER: 'Volunteers',
  DOCTOR: 'Doctors',
  MANAGER: 'Managers',
};

/** Group headings say what the manager does next, not the enum. */
const STATUS_HEADINGS: Record<CheckInStatus, string> = {
  WAITING: 'Waiting for a pair',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In intake',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};
const STATUS_EMPTY: Record<CheckInStatus, string> = {
  WAITING: 'Nobody is waiting for a pair.',
  ASSIGNED: 'No one is assigned and waiting to start.',
  IN_PROGRESS: 'No one is in intake.',
  COMPLETED: 'No one has finished yet.',
  CANCELLED: 'No cancellations.',
};

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
        <SelectClinicState surface="The Today Board" />
      </RouteGuard>
    );
  }

  const waiting = groupedCheckins.WAITING.length;
  const dayLabel = formatOpsDate(selectedDate, timezone);

  function renderCheckIn(checkIn: BoardCheckIn) {
    const pair = checkIn.assignmentSummary;
    return (
      <li key={checkIn.id}>
        <article
          className={cn(styles.row, checkIn.pendingSync && styles.rowPending)}
          data-pending-sync={checkIn.pendingSync}
          aria-labelledby={`checkin-${checkIn.id}`}
        >
          <div className="min-w-0">
            <p id={`checkin-${checkIn.id}`} className="type-label truncate text-foreground">
              {checkIn.patient.displayName}
            </p>
            <p className="type-label mt-0.5 font-normal text-muted-foreground">
              <span className="font-mono tabular-nums" translate="no">
                {checkIn.patient.patientCode}
              </span>
              {' · '}
              <span className="tabular-nums">
                In at{' '}
                <time dateTime={checkIn.checkedInAt}>
                  {formatOpsTime(checkIn.checkedInAt, timezone)}
                </time>
              </span>
            </p>
            {checkIn.notes ? (
              <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">{checkIn.notes}</p>
            ) : null}
          </div>

          {pair ? (
            <dl className={styles.pair}>
              <dt>Volunteer</dt>
              <dd>{pair.assignedVolunteer.displayName}</dd>
              <dt>Doctor</dt>
              <dd>{pair.assignedDoctor.displayName}</dd>
            </dl>
          ) : (
            <span aria-hidden="true" className={styles.spacer} />
          )}

          <div className={styles.rowActions}>
            {checkIn.pendingSync ? <PendingSyncBadge state={checkIn.pendingSync} /> : null}
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
            {checkIn.status === 'ASSIGNED' && canManageAssignments && pair ? (
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
            <Button asChild size="sm" variant="ghost">
              {checkIn.encounterId ? (
                <Link href={`/encounters/${checkIn.encounterId}`}>
                  View encounter
                  <ArrowRight aria-hidden="true" />
                </Link>
              ) : (
                <Link href={`/clinics/${clinicId}/patients/${checkIn.patient.id}`}>
                  View patient
                  <ArrowRight aria-hidden="true" />
                </Link>
              )}
            </Button>
          </div>
        </article>
      </li>
    );
  }

  return (
    <RouteGuard requiredPermission="OPS.CHECKIN.READ">
      <div className="space-y-6">
        <AppPageHeader
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
                    aria-describedby="today-board-timezone"
                    className="w-[180px] pl-9"
                  />
                </div>
              </div>

              {/* Context for the date beside it, not a metric or a second control. */}
              <p id="today-board-timezone" className="text-sm text-muted-foreground sm:pb-2.5">
                Times in <span className="font-medium text-foreground">{timezone}</span>
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

        {/* Only real waiting work earns this row; a zero is already in the counts below. */}
        {!board.isInitialLoading && waiting > 0 && canManageAssignments ? (
          <section aria-labelledby="today-needs" className="border-t-2 border-rule-strong pt-4">
            <h2 id="today-needs" className="type-section-title">
              Needs you now
            </h2>
            <ul>
              <AppActionRow
                icon={Users}
                tone="info"
                title={`${waiting} ${waiting === 1 ? 'patient is' : 'patients are'} waiting for a pair`}
                detail="Pair each new arrival with a volunteer and a doctor who are on shift."
                action={
                  <Button asChild variant="outline">
                    <a href="#today-waiting">Go to waiting patients</a>
                  </Button>
                }
              />
            </ul>
          </section>
        ) : null}

        <AppMetricGroup className="sm:grid-cols-2 xl:grid-cols-4">
          <AppMetricCard
            title="Waiting for a pair"
            value={waiting}
            detail="New arrivals not yet assigned"
          />
          <AppMetricCard
            title="Active assignments"
            value={groupedCheckins.ASSIGNED.length + groupedCheckins.IN_PROGRESS.length}
            detail="Assigned or in intake"
          />
          <AppMetricCard
            title="Staff on duty"
            value={onDuty.length}
            detail={`${countByRole(onDuty, 'VOLUNTEER')} volunteers, ${countByRole(onDuty, 'DOCTOR')} doctors`}
          />
          <AppMetricCard
            title="Completed"
            value={groupedCheckins.COMPLETED.length}
            detail={dayLabel}
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
          <div className={styles.workGrid} role="status" aria-live="polite" aria-busy="true">
            <span className="sr-only">Loading the Today Board</span>
            <SectionSkeleton lines={8} />
            <div className="space-y-6">
              <SectionSkeleton lines={2} />
              <SectionSkeleton lines={4} />
            </div>
          </div>
        ) : (
          <div id="today-work" className={cn(styles.workGrid, 'scroll-mt-24')}>
            {/* The manager's work first: who has arrived and who still needs a pair. */}
            <RecordSection aria-labelledby="today-flow">
              <RecordSectionHeader>
                <RecordSectionTitle id="today-flow">Patient flow</RecordSectionTitle>
                <RecordSectionDescription>
                  Arrival to intake on {dayLabel}.{' '}
                  {checkins.length === 1
                    ? '1 patient checked in.'
                    : `${checkins.length} patients checked in.`}
                </RecordSectionDescription>
              </RecordSectionHeader>
              <RecordSectionContent className={styles.flow}>
                {checkins.length === 0 && !board.data ? null : checkins.length === 0 ? (
                  <EmptyState
                    titleAs="h3"
                    icon={Users}
                    title="No patient check-ins yet"
                    description="Check a patient in from search or their record, and they appear here."
                  />
                ) : (
                  <div className="space-y-6">
                    {visibleStatuses.map((status) => {
                      const items = groupedCheckins[status];
                      const headingId = `today-${status.toLowerCase()}`;
                      const list = (
                        <ul className="border-t border-rule">{items.map(renderCheckIn)}</ul>
                      );
                      // Finished rows are history; on a long day they would push the live work away.
                      if ((status === 'COMPLETED' || status === 'CANCELLED') && items.length > 0) {
                        return (
                          <details key={status} className={styles.group}>
                            <summary className={cn('type-label', styles.summary)}>
                              <ChevronRight aria-hidden="true" className={styles.chevron} />
                              <span id={headingId}>{STATUS_HEADINGS[status]}</span>
                              <span className="tabular-nums text-muted-foreground">
                                {items.length}
                              </span>
                            </summary>
                            {list}
                          </details>
                        );
                      }
                      return (
                        <section
                          key={status}
                          id={status === 'WAITING' ? 'today-waiting' : undefined}
                          aria-labelledby={headingId}
                          className={cn(styles.group, 'scroll-mt-24')}
                        >
                          <h3 id={headingId} className={cn('type-label', styles.groupHeading)}>
                            {STATUS_HEADINGS[status]}
                            <span className="tabular-nums text-muted-foreground">
                              {items.length}
                            </span>
                          </h3>
                          {items.length === 0 ? (
                            <p className="border-t border-rule py-3 text-sm text-muted-foreground">
                              {STATUS_EMPTY[status]}
                            </p>
                          ) : (
                            list
                          )}
                        </section>
                      );
                    })}
                  </div>
                )}
              </RecordSectionContent>
            </RecordSection>

            <div className="min-w-0 space-y-6">
              <ShiftControlCard
                ruled
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

              <RecordSection aria-labelledby="today-staff">
                <RecordSectionHeader>
                  <RecordSectionTitle id="today-staff">Staff on duty</RecordSectionTitle>
                  <RecordSectionDescription>
                    {onDuty.length === 1 ? '1 person' : `${onDuty.length} people`} on shift,{' '}
                    {dayLabel}.
                  </RecordSectionDescription>
                </RecordSectionHeader>
                <RecordSectionContent className="space-y-3">
                  <SegmentedControl
                    label="Show staff by role"
                    value={shiftRoleFilter}
                    onChange={setShiftRoleFilter}
                    className="sm:grid-cols-2"
                    options={SHIFT_FILTERS.map((value) => ({
                      value,
                      label:
                        value === 'ALL'
                          ? `All · ${onDuty.length}`
                          : `${SHIFT_FILTER_LABELS[value]} · ${countByRole(onDuty, value)}`,
                    }))}
                  />
                  {filteredShifts.length === 0 && !board.data ? null : filteredShifts.length ===
                    0 ? (
                    <p className="border-t border-rule py-3 text-sm text-muted-foreground">
                      {shiftRoleFilter === 'ALL'
                        ? 'No staff checked in. The list fills as people start their shifts.'
                        : `No ${SHIFT_FILTER_LABELS[shiftRoleFilter].toLowerCase()} on shift.`}
                    </p>
                  ) : (
                    <ul className="border-t border-rule">
                      {filteredShifts.map((shift) => (
                        <li
                          key={shift.shiftId}
                          className="flex items-center justify-between gap-3 border-b border-rule py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="type-label truncate text-foreground">
                              {shift.displayName}
                            </p>
                            <p className="type-label font-normal tabular-nums text-muted-foreground">
                              Since{' '}
                              <time dateTime={shift.checkedInAt}>
                                {formatOpsTime(shift.checkedInAt, timezone)}
                              </time>
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
                        </li>
                      ))}
                    </ul>
                  )}
                </RecordSectionContent>
              </RecordSection>
            </div>
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
          <DialogContent variant="form" className="max-w-xl">
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
