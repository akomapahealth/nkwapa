'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, ClipboardList, RefreshCw, Stethoscope } from 'lucide-react';
import { Box } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { apiFetch } from '@/lib/api';
import {
  OPS_DEFAULT_TIMEZONE,
  type ActiveShift,
  type ActiveShiftsResponse,
  type MyAssignmentSummary,
  type MyAssignmentsResponse,
  type ShiftRole,
  formatOpsDate,
  formatOpsDateTime,
  getEligibleShiftRoles,
  getTodayInTimeZone,
  readApiError,
} from '@/lib/ops';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { RouteGuard } from '@/components/RouteGuard';
import {
  AssignedRoleBadge,
  CheckInStatusBadge,
  EmptyStateCard,
  InlineNotice,
  OnlineOnlyBanner,
  OpsMetricCard,
  ShiftControlCard,
} from '@/components/ops/OpsShared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { dataGridSx } from '@/lib/datagrid-theme';

type StaffFilter = 'ALL' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED';

function activeShiftForUser(items: ActiveShift[], userId?: string | null) {
  return items.find((item) => item.userId === userId) ?? null;
}

export default function MyAssignedPage() {
  const router = useRouter();
  const bootstrapCtx = useBootstrap();
  const bootstrap = bootstrapCtx?.bootstrap ?? null;
  const getToken = useAuth();
  const { isOnline } = useSync();

  const clinicId = bootstrap?.activeClinicId ?? bootstrap?.memberships?.[0]?.clinicId ?? null;
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
  const [selectedShiftRole, setSelectedShiftRole] = useState<ShiftRole | ''>('');
  const [statusFilter, setStatusFilter] = useState<StaffFilter>('ALL');
  const [assignmentsData, setAssignmentsData] = useState<MyAssignmentsResponse | null>(null);
  const [shiftsData, setShiftsData] = useState<ActiveShiftsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingShift, setUpdatingShift] = useState(false);
  const [startingIntakeId, setStartingIntakeId] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedShiftRole || eligibleShiftRoles.includes(selectedShiftRole)) {
      if (selectedShiftRole || eligibleShiftRoles.length === 0) {
        return;
      }
    }

    setSelectedShiftRole(eligibleShiftRoles[0] ?? '');
  }, [eligibleShiftRoles, selectedShiftRole]);

  const loadAssignments = useCallback(
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
        const [assignmentsResponse, shiftsResponse] = await Promise.all([
          apiFetch(
            `/clinics/${encodeURIComponent(clinicId)}/my/assignments?date=${encodeURIComponent(selectedDate)}`,
            { getToken, activeClinicId: clinicId },
          ),
          apiFetch(
            `/clinics/${encodeURIComponent(clinicId)}/shifts/active?date=${encodeURIComponent(selectedDate)}`,
            { getToken, activeClinicId: clinicId },
          ),
        ]);

        if (!assignmentsResponse.ok) {
          throw new Error(await readApiError(assignmentsResponse));
        }
        if (!shiftsResponse.ok) {
          throw new Error(await readApiError(shiftsResponse));
        }

        setAssignmentsData((await assignmentsResponse.json()) as MyAssignmentsResponse);
        setShiftsData((await shiftsResponse.json()) as ActiveShiftsResponse);
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

    void loadAssignments();
  }, [clinicId, getToken, isOnline, loadAssignments]);

  const assignments = assignmentsData?.items ?? [];
  const shifts = shiftsData?.items ?? [];
  const timezone = assignmentsData?.timezone ?? shiftsData?.timezone ?? OPS_DEFAULT_TIMEZONE;
  const currentShift = activeShiftForUser(shifts, bootstrap?.userId);

  const filteredAssignments = assignments.filter((assignment) => {
    if (statusFilter === 'ALL') {
      return true;
    }

    return assignment.checkInStatus === statusFilter;
  });

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

      setNotice('Shift started successfully.');
      await loadAssignments({ background: true });
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
      await loadAssignments({ background: true });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdatingShift(false);
    }
  }

  async function handleStartIntake(assignment: MyAssignmentSummary) {
    if (!clinicId || !getToken) {
      return;
    }

    setStartingIntakeId(assignment.id);
    setActionError(null);
    setNotice(null);

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
        <section className="overflow-hidden rounded-[28px] border border-primary/15 bg-gradient-to-br from-primary/15 via-card to-secondary/15 p-6 shadow-xl shadow-primary/5">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary/80">
                Clinic Ops
              </p>
              <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
                My Assigned
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
                A focused worklist for volunteer intake and doctor follow-through.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="rounded-2xl border border-border/80 bg-card/85 px-4 py-3 shadow-sm">
                <Label
                  htmlFor="my-assigned-date"
                  className="text-xs uppercase tracking-[0.2em] text-muted-foreground"
                >
                  Clinic day
                </Label>
                <div className="mt-2 flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  <Input
                    id="my-assigned-date"
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
                onClick={() => void loadAssignments({ background: true })}
                disabled={!isOnline || refreshing || loading}
                className="h-12 rounded-2xl border-border/80 bg-card/85 px-4"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <OpsMetricCard
              label="Assigned today"
              value={assignments.length}
              detail={formatOpsDate(selectedDate, timezone)}
            />
            <OpsMetricCard
              label="Ready for intake"
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
            <OpsMetricCard
              label="In progress"
              value={
                assignments.filter(
                  (assignment) =>
                    assignment.checkInStatus === 'IN_PROGRESS' && Boolean(assignment.encounterId),
                ).length
              }
              detail="Cases with active encounters"
            />
            <OpsMetricCard
              label="Completed"
              value={
                assignments.filter((assignment) => assignment.checkInStatus === 'COMPLETED').length
              }
              detail="Finished clinic flow"
            />
          </div>
        </section>

        {!isOnline ? <OnlineOnlyBanner /> : null}
        {pageError ? <InlineNotice tone="error">{pageError}</InlineNotice> : null}
        {actionError ? <InlineNotice tone="error">{actionError}</InlineNotice> : null}
        {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}

        {loading ? (
          <div className="grid gap-6 xl:grid-cols-[320px,minmax(0,1fr)]">
            <div className="space-y-6">
              <div className="h-64 animate-pulse rounded-[28px] bg-muted" />
              <div className="h-48 animate-pulse rounded-[28px] bg-muted" />
            </div>
            <div className="h-[460px] animate-pulse rounded-[28px] bg-muted" />
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[320px,minmax(0,1fr)]">
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
                    Intake and assignment actions require connectivity in this release, even if the
                    main clinical chart still has offline support elsewhere in the app.
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
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
