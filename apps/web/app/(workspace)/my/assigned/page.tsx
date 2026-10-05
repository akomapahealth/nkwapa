'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { CalendarDays, ClipboardList, RefreshCw, Stethoscope } from 'lucide-react';
import { Box } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { apiFetch } from '@/lib/api';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import {
  OPS_DEFAULT_TIMEZONE,
  type ActiveShiftsResponse,
  type MyAssignmentSummary,
  type MyAssignmentsResponse,
  formatOpsDate,
  formatOpsDateTime,
  getEligibleShiftRoles,
  getTodayInTimeZone,
  readApiError,
} from '@/lib/ops';
import { fetchActiveShifts, fetchMyAssignments } from '@/lib/ops-api';
import { OPS_OFFLINE_SUPPORT, overlayPendingShifts } from '@/lib/ops-offline';
import { useOpsView } from '@/lib/use-ops-view';
import { usePendingOpsWrites } from '@/lib/use-pending-ops-writes';
import { useShiftControls } from '@/lib/use-shift-controls';
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { RouteGuard } from '@/components/RouteGuard';
import {
  AssignedRoleBadge,
  CheckInStatusBadge,
  EmptyStateCard,
  InlineNotice,
  OfflineOpsBanner,
  ShiftControlCard,
  opsOfflineHint,
} from '@/components/ops/OpsShared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { dataGridSx } from '@/lib/datagrid-theme';

type StaffFilter = 'ALL' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED';

interface MyAssignedView {
  assignments: MyAssignmentsResponse;
  shifts: ActiveShiftsResponse;
}

export default function MyAssignedPage() {
  const router = useRouter();
  const bootstrapCtx = useBootstrap();
  const bootstrap = bootstrapCtx?.bootstrap ?? null;
  const getToken = useAuth();

  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const activeMembership = bootstrap?.memberships?.find(
    (membership) => membership.clinicId === clinicId,
  );
  const eligibleShiftRoles = getEligibleShiftRoles(
    Array.from(
      new Set([
        ...(bootstrap?.effectiveRolesForActiveClinic ?? []),
        ...(activeMembership?.roles ?? []),
      ]),
    ),
  );

  const [selectedDate, setSelectedDate] = useState(getTodayInTimeZone());
  const [statusFilter, setStatusFilter] = useState<StaffFilter>('ALL');
  const [startingIntakeId, setStartingIntakeId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const pendingWrites = usePendingOpsWrites(clinicId);
  const pendingIds = useMemo(() => pendingWrites.map((write) => write.entityId), [pendingWrites]);
  const view = useOpsView<MyAssignedView>({
    clinicId,
    kind: 'my-assigned',
    date: selectedDate,
    errorMessage: 'Your assignments could not be loaded.',
    pendingIds,
    fetcher: async (token, signal) => {
      const options = { clinicId: clinicId ?? '', date: selectedDate, getToken: token, signal };
      const [assignments, shifts] = await Promise.all([
        fetchMyAssignments(options),
        fetchActiveShifts(options),
      ]);
      return { assignments, shifts };
    },
  });
  const { isOnline } = view;

  const assignments = view.data?.assignments.items ?? [];
  const timezone =
    view.data?.assignments.timezone ?? view.data?.shifts.timezone ?? OPS_DEFAULT_TIMEZONE;
  const isToday = selectedDate === getTodayInTimeZone(timezone);
  const shifts = useMemo(
    () =>
      overlayPendingShifts(view.data?.shifts.items ?? [], isToday ? pendingWrites : [], {
        userId: bootstrap?.userId,
        displayName: bootstrap?.displayName,
      }),
    [view.data, isToday, pendingWrites, bootstrap?.userId, bootstrap?.displayName],
  );
  const shiftControls = useShiftControls({
    clinicId,
    userId: bootstrap?.userId,
    shifts,
    eligibleRoles: eligibleShiftRoles,
    onApplied: view.refresh,
  });

  const filteredAssignments = assignments.filter((assignment) => {
    if (statusFilter === 'ALL') {
      return true;
    }

    return assignment.checkInStatus === statusFilter;
  });

  async function handleStartIntake(assignment: MyAssignmentSummary) {
    if (!clinicId || !getToken) {
      return;
    }

    setStartingIntakeId(assignment.id);
    setActionError(null);

    try {
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/checkins/${encodeURIComponent(assignment.patientCheckInId)}/start-intake`,
        {
          method: 'POST',
          getToken,
          activeClinicId: clinicId,
        },
      );

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const payload = (await response.json()) as {
        encounter: { id: string };
      };

      router.push(`/encounters/${payload.encounter.id}`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setStartingIntakeId(null);
    }
  }

  const rows = filteredAssignments.map((assignment) => ({
    ...assignment,
    id: assignment.id,
  }));

  const columns: GridColDef[] = [
    {
      field: 'patientCode',
      headerName: 'Patient',
      minWidth: 230,
      flex: 1,
      valueGetter: (_, row) => `${row.patient.patientCode} · ${row.patient.displayName}`.trim(),
    },
    {
      field: 'checkedInAt',
      headerName: 'Checked In',
      width: 160,
      valueGetter: (_, row) => formatOpsDateTime(row.checkedInAt, timezone),
    },
    {
      field: 'assignedRole',
      headerName: 'My Role',
      width: 120,
      sortable: false,
      renderCell: (params) => (
        <AssignedRoleBadge role={params.row.assignedRole as 'VOLUNTEER' | 'DOCTOR'} />
      ),
    },
    {
      field: 'checkInStatus',
      headerName: 'Status',
      width: 140,
      sortable: false,
      renderCell: (params) => (
        <CheckInStatusBadge
          status={params.row.checkInStatus as MyAssignmentSummary['checkInStatus']}
        />
      ),
    },
    {
      field: 'team',
      headerName: 'Care Team',
      minWidth: 220,
      flex: 1,
      valueGetter: (_, row) =>
        `${row.assignedVolunteer.displayName} / ${row.assignedDoctor.displayName}`,
    },
    {
      field: 'actions',
      headerName: '',
      width: 190,
      sortable: false,
      renderCell: (params) => {
        const assignment = params.row as MyAssignmentSummary;

        if (assignment.assignedRole === 'VOLUNTEER') {
          if (assignment.encounterId) {
            return (
              <Button asChild size="sm">
                <Link href={`/encounters/${assignment.encounterId}`}>Continue</Link>
              </Button>
            );
          }

          return (
            <Button
              size="sm"
              onClick={() => void handleStartIntake(assignment)}
              disabled={!isOnline || startingIntakeId === assignment.id}
              title={opsOfflineHint('startIntake', isOnline)}
            >
              {startingIntakeId === assignment.id ? 'Starting...' : 'Start intake'}
            </Button>
          );
        }

        if (assignment.encounterId) {
          return (
            <Button asChild size="sm" variant="outline">
              <Link href={`/encounters/${assignment.encounterId}`}>Open encounter</Link>
            </Button>
          );
        }

        return <span className="text-xs text-muted-foreground">Waiting for intake</span>;
      },
    },
  ];

  if (!clinicId) {
    return (
      <RouteGuard requiredPermission="OPS.ASSIGNMENT.READ_SELF">
        <div className="p-4">
          <p className="text-muted-foreground">Select a clinic to load your assignments.</p>
        </div>
      </RouteGuard>
    );
  }

  return (
    <RouteGuard requiredPermission="OPS.ASSIGNMENT.READ_SELF">
      <div className="space-y-6">
        <AppPageHeader
          eyebrow="Clinic ops"
          title="My Assigned"
          description="A focused worklist for volunteer intake and doctor follow-through."
          actions={
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="my-assigned-date" className="text-eyebrow text-muted-foreground">
                  Clinic day
                </Label>
                <div className="relative">
                  <CalendarDays
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="my-assigned-date"
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    className="w-[180px] pl-9"
                  />
                </div>
              </div>

              <p className="pb-3 text-sm text-muted-foreground">
                Times shown in <span className="font-medium text-foreground">{timezone}</span>
              </p>

              <Button
                type="button"
                variant="outline"
                onClick={view.refresh}
                disabled={!isOnline || view.isRefreshing || view.isInitialLoading}
                title={isOnline ? undefined : 'Refreshing needs a connection.'}
              >
                <RefreshCw
                  aria-hidden="true"
                  className={view.isRefreshing ? 'animate-spin motion-reduce:animate-none' : ''}
                />
                Refresh
              </Button>
            </div>
          }
        />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AppMetricCard
            title="Assigned today"
            value={assignments.length}
            detail={formatOpsDate(selectedDate, timezone)}
          />
          <AppMetricCard
            title="Ready for intake"
            value={
              assignments.filter(
                (assignment) =>
                  assignment.assignedRole === 'VOLUNTEER' &&
                  assignment.checkInStatus === 'ASSIGNED' &&
                  !assignment.encounterId,
              ).length
            }
            detail="Volunteer-owned intake starts"
          />
          <AppMetricCard
            title="In progress"
            value={
              assignments.filter(
                (assignment) =>
                  assignment.checkInStatus === 'IN_PROGRESS' && Boolean(assignment.encounterId),
              ).length
            }
            detail="Cases with active encounters"
          />
          <AppMetricCard
            title="Completed"
            value={
              assignments.filter((assignment) => assignment.checkInStatus === 'COMPLETED').length
            }
            detail="Finished clinic flow"
          />
        </div>

        {!isOnline ? (
          <OfflineOpsBanner
            savedCopyAt={view.savedCopyAt}
            timeZone={timezone}
            unavailable="Starting intake and refreshing your list"
          />
        ) : view.savedCopyAt ? (
          <InlineNotice tone="warning" live={false}>
            Your live list could not be reached. Showing this device’s copy from{' '}
            {formatOpsDateTime(view.savedCopyAt, timezone)}.
          </InlineNotice>
        ) : null}
        {view.error ? (
          <InlineErrorState
            title="Your assignments could not be loaded"
            description={view.error}
            onRetry={view.refresh}
          />
        ) : null}
        {actionError ? <InlineNotice tone="error">{actionError}</InlineNotice> : null}
        {shiftControls.feedback ? (
          <InlineNotice tone={shiftControls.feedback.tone}>
            {shiftControls.feedback.message}
          </InlineNotice>
        ) : null}

        {view.isInitialLoading ? (
          <div className="grid gap-6 xl:grid-cols-[320px,minmax(0,1fr)]">
            <div className="min-w-0 space-y-6">
              <SectionSkeleton lines={2} />
              <SectionSkeleton lines={2} />
            </div>
            <SectionSkeleton lines={5} />
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[320px,minmax(0,1fr)]">
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
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <ClipboardList className="h-5 w-5 text-primary" />
                    Workflow Notes
                  </CardTitle>
                  <CardDescription className="leading-6">
                    Volunteers start intake and generate the draft encounter. Doctors can enter as
                    soon as intake has begun.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    If you do not see a patient yet, refresh after the manager assigns the care
                    pair.
                  </p>
                  <p>
                    Your shift can be started or ended offline; it syncs when the connection
                    returns. {OPS_OFFLINE_SUPPORT.startIntake.offlineHint}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card className="min-w-0">
              <CardHeader className="space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <Stethoscope className="h-5 w-5 text-primary" />
                      Assigned Patients
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Cases aligned to your current clinic role.
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(['ALL', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED'] as const).map((value) => (
                      <Button
                        key={value}
                        type="button"
                        variant={statusFilter === value ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setStatusFilter(value)}
                        className="rounded-full"
                      >
                        {value === 'ALL'
                          ? 'All'
                          : value === 'IN_PROGRESS'
                            ? 'In Progress'
                            : value.charAt(0) + value.slice(1).toLowerCase()}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredAssignments.length === 0 ? (
                  <EmptyStateCard
                    title="Nothing assigned yet"
                    description="As soon as the manager pairs you to a patient, the case will appear here."
                  />
                ) : (
                  <Box sx={{ height: 460, width: '100%' }} className="overflow-x-auto">
                    <DataGrid
                      rows={rows}
                      columns={columns}
                      disableRowSelectionOnClick
                      pageSizeOptions={[10, 25]}
                      initialState={{
                        pagination: { paginationModel: { pageSize: 10 } },
                      }}
                      sx={dataGridSx}
                    />
                  </Box>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </RouteGuard>
  );
}
