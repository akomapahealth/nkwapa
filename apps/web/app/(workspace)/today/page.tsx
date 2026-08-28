'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
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
  type CheckInSummary,
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
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
import { RouteGuard } from '@/components/RouteGuard';
import {
  CheckInStatusBadge,
  EmptyStateCard,
  InlineNotice,
  OnlineOnlyBanner,
  ShiftControlCard,
  ShiftRoleBadge,
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
import { ProgressiveHelp } from '@/components/ui/progressive-help';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type AssignmentDialogState = {
  mode: 'assign' | 'reassign';
  checkIn: CheckInSummary;
} | null;

const SHIFT_FILTERS: Array<'ALL' | ShiftRole> = ['ALL', 'VOLUNTEER', 'DOCTOR', 'MANAGER'];

function countByRole(items: ActiveShift[], role: ShiftRole) {
  return items.filter((item) => item.roleAtShift === role).length;
}

export default function TodayBoardPage() {
  const bootstrapCtx = useBootstrap();
  const bootstrap = bootstrapCtx?.bootstrap ?? null;
  const getToken = useAuth();
  const { isOnline } = useSync();

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
  const [selectedShiftRole, setSelectedShiftRole] = useState<ShiftRole | ''>('');
  const [shiftsData, setShiftsData] = useState<ActiveShiftsResponse | null>(null);
  const [checkinsData, setCheckinsData] = useState<CheckInsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingShift, setUpdatingShift] = useState(false);
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [assignmentDialog, setAssignmentDialog] = useState<AssignmentDialogState>(null);
  const [selectedVolunteerId, setSelectedVolunteerId] = useState('');
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [reassignReason, setReassignReason] = useState('');

  useEffect(() => {
    if (!selectedShiftRole || eligibleShiftRoles.includes(selectedShiftRole)) {
      if (selectedShiftRole || eligibleShiftRoles.length === 0) {
        return;
      }
    }

    setSelectedShiftRole(eligibleShiftRoles[0] ?? '');
  }, [eligibleShiftRoles, selectedShiftRole]);

  const loadBoard = useCallback(
    async (options?: { background?: boolean }) => {
      if (!clinicId || !getToken) {
        return;
      }

      if (options?.background) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setPageError(null);

      try {
        const [shiftsResponse, checkinsResponse] = await Promise.all([
          apiFetch(
            `/clinics/${encodeURIComponent(clinicId)}/shifts/active?date=${encodeURIComponent(selectedDate)}`,
            { getToken, activeClinicId: clinicId },
          ),
          apiFetch(
            `/clinics/${encodeURIComponent(clinicId)}/checkins?date=${encodeURIComponent(selectedDate)}`,
            { getToken, activeClinicId: clinicId },
          ),
        ]);

        if (!shiftsResponse.ok) {
          throw new Error(await readApiError(shiftsResponse));
        }
        if (!checkinsResponse.ok) {
          throw new Error(await readApiError(checkinsResponse));
        }

        const nextShifts = (await shiftsResponse.json()) as ActiveShiftsResponse;
        const nextCheckins = (await checkinsResponse.json()) as CheckInsResponse;

        setShiftsData(nextShifts);
        setCheckinsData(nextCheckins);
      } catch (error) {
        setPageError(error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [clinicId, getToken, selectedDate],
  );

  useEffect(() => {
    if (!clinicId || !getToken) {
      setLoading(false);
      return;
    }

    if (!isOnline) {
      setLoading(false);
      return;
    }

    void loadBoard();
  }, [clinicId, getToken, isOnline, loadBoard]);

  const shifts = shiftsData?.items ?? [];
  const timezone = checkinsData?.timezone ?? shiftsData?.timezone ?? OPS_DEFAULT_TIMEZONE;
  const checkins = checkinsData?.items ?? [];
  const filteredShifts =
    shiftRoleFilter === 'ALL'
      ? shifts
      : shifts.filter((shift) => shift.roleAtShift === shiftRoleFilter);
  const currentShift = shifts.find((shift) => shift.userId === bootstrap?.userId) ?? null;
  const volunteerOptions = shifts.filter((shift) => shift.roleAtShift === 'VOLUNTEER');
  const doctorOptions = shifts.filter((shift) => shift.roleAtShift === 'DOCTOR');

  const groupedCheckins = CHECKIN_STATUS_ORDER.reduce<Record<CheckInStatus, CheckInSummary[]>>(
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

  function openAssignmentDialog(mode: 'assign' | 'reassign', checkIn: CheckInSummary) {
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

  async function handleShiftCheckIn() {
    if (!clinicId || !getToken || !selectedShiftRole) {
      return;
    }

    setUpdatingShift(true);
    setActionError(null);
    setNotice(null);

    try {
      const response = await apiFetch(`/clinics/${encodeURIComponent(clinicId)}/shifts/check-in`, {
        method: 'POST',
        body: JSON.stringify({ roleAtShift: selectedShiftRole }),
        getToken,
        activeClinicId: clinicId,
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setNotice(`Shift started as ${formatRoleLabel(selectedShiftRole)}.`);
      await loadBoard({ background: true });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdatingShift(false);
    }
  }

  async function handleShiftCheckOut() {
    if (!clinicId || !getToken || !currentShift) {
      return;
    }

    setUpdatingShift(true);
    setActionError(null);
    setNotice(null);

    try {
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/shifts/${encodeURIComponent(currentShift.shiftId)}/check-out`,
        {
          method: 'POST',
          getToken,
          activeClinicId: clinicId,
        },
      );

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setNotice('Shift ended successfully.');
      await loadBoard({ background: true });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdatingShift(false);
    }
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
      await loadBoard({ background: true });
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
        <section className="overflow-hidden rounded-[28px] border border-primary/15 bg-gradient-to-br from-primary/15 via-card to-secondary/15 p-6 shadow-xl shadow-primary/5">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
                Clinic Ops
              </p>
              <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Today Board
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
                Live clinic flow for the selected day.
              </p>
              <div className="mt-3 max-w-2xl">
                <ProgressiveHelp title="How the board updates">
                  Staff check-ins, patient arrivals, and volunteer assignments refresh here so OPS
                  can see who is available and which patients still need a pair.
                </ProgressiveHelp>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="rounded-2xl border border-border/80 bg-card/85 px-4 py-3 shadow-sm">
                <Label
                  htmlFor="today-board-date"
                  className="text-xs uppercase tracking-[0.2em] text-muted-foreground"
                >
                  Clinic day
                </Label>
                <div className="mt-2 flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  <Input
                    id="today-board-date"
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    className="h-8 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-border/80 bg-card/85 px-4 py-3 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Timezone</p>
                <p className="mt-2 text-sm font-medium text-foreground">{timezone}</p>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() => void loadBoard({ background: true })}
                disabled={!isOnline || refreshing || loading}
                className="h-12 rounded-2xl border-border/80 bg-card/85 px-4"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
              value={shifts.length}
              detail={`${countByRole(shifts, 'VOLUNTEER')} volunteers, ${countByRole(shifts, 'DOCTOR')} doctors`}
            />
            <AppMetricCard
              title="Completed today"
              value={groupedCheckins.COMPLETED.length}
              detail={formatOpsDate(selectedDate, timezone)}
            />
          </div>
        </section>

        {!isOnline ? <OnlineOnlyBanner /> : null}
        {pageError ? <InlineNotice tone="error">{pageError}</InlineNotice> : null}
        {actionError ? <InlineNotice tone="error">{actionError}</InlineNotice> : null}
        {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}

        {loading ? (
          <div className="grid gap-6 xl:grid-cols-[360px,minmax(0,1fr)]">
            <div className="space-y-6">
              <div className="h-64 animate-pulse rounded-[28px] bg-muted" />
              <div className="h-96 animate-pulse rounded-[28px] bg-muted" />
            </div>
            <div className="h-[540px] animate-pulse rounded-[28px] bg-muted" />
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[360px,minmax(0,1fr)]">
            <div className="space-y-6">
              <ShiftControlCard
                currentShift={currentShift}
                selectedRole={selectedShiftRole}
                availableRoles={eligibleShiftRoles}
                isOnline={isOnline}
                busy={updatingShift}
                timezone={timezone}
                onSelectedRoleChange={setSelectedShiftRole}
                onCheckIn={() => void handleShiftCheckIn()}
                onCheckOut={() => void handleShiftCheckOut()}
              />

              <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
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
                    <div className="rounded-2xl border border-border bg-background/80 px-3 py-2 text-right">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Total
                      </p>
                      <p className="text-lg font-semibold">{shifts.length}</p>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-2xl border border-border/70 bg-background/80 p-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Volunteers
                      </p>
                      <p className="mt-2 text-2xl font-semibold">
                        {countByRole(shifts, 'VOLUNTEER')}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-background/80 p-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Doctors
                      </p>
                      <p className="mt-2 text-2xl font-semibold">{countByRole(shifts, 'DOCTOR')}</p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-background/80 p-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Managers
                      </p>
                      <p className="mt-2 text-2xl font-semibold">
                        {countByRole(shifts, 'MANAGER')}
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
                        className="rounded-2xl border border-border/80 bg-background/75 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-foreground">{shift.displayName}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Checked in at {formatOpsTime(shift.checkedInAt, timezone)}
                            </p>
                          </div>
                          <ShiftRoleBadge role={shift.roleAtShift} />
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            <section className="space-y-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="font-heading text-2xl font-semibold tracking-tight">
                    Patient Flow
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Arrival-to-intake movement for the clinic day.
                  </p>
                </div>
                <div className="rounded-2xl border border-border/80 bg-card/80 px-4 py-3 text-right shadow-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Queue Total
                  </p>
                  <p className="mt-1 text-xl font-semibold">{checkins.length}</p>
                </div>
              </div>

              {checkins.length === 0 ? (
                <Card className="rounded-[28px] border-dashed border-border/80 bg-card/80 shadow-lg shadow-black/5">
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
                    <Card
                      key={status}
                      className="max-h-[72vh] min-h-[420px] rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5"
                    >
                      <CardHeader className="sticky top-0 z-10 rounded-t-[28px] bg-card/95 backdrop-blur">
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
                              className="rounded-2xl border border-border/80 bg-background/80 p-4 shadow-sm"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                                    {checkIn.patient.patientCode}
                                  </p>
                                  <h3 className="mt-2 text-base font-semibold text-foreground">
                                    {checkIn.patient.displayName}
                                  </h3>
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    Checked in at {formatOpsDateTime(checkIn.checkedInAt, timezone)}
                                  </p>
                                </div>
                                <CheckInStatusBadge status={checkIn.status} />
                              </div>

                              {checkIn.assignmentSummary ? (
                                <div className="mt-4 grid gap-2 rounded-2xl border border-border/70 bg-card/70 p-3">
                                  <div>
                                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                      Volunteer
                                    </p>
                                    <p className="mt-1 text-sm font-medium">
                                      {checkIn.assignmentSummary.assignedVolunteer.displayName}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                      Doctor
                                    </p>
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
                                    disabled={!isOnline}
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
          <DialogContent className="max-w-xl rounded-[28px] border-border/80">
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
