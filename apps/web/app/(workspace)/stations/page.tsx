'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { ArrowRight, Clock, ListOrdered, MapPin, RefreshCw, UserCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { isWebFeatureEnabled } from '@/lib/feature-flags';
import {
  OPS_DEFAULT_TIMEZONE,
  formatOpsDateTime,
  getEligibleShiftRoles,
  getTodayInTimeZone,
} from '@/lib/ops';
import { fetchActiveShifts } from '@/lib/ops-api';
import { overlayPendingShifts } from '@/lib/ops-offline';
import { useOpsView } from '@/lib/use-ops-view';
import { usePendingOpsWrites } from '@/lib/use-pending-ops-writes';
import { useShiftControls } from '@/lib/use-shift-controls';
import {
  StationRequestError,
  claimStationVisit,
  fetchStationBoard,
  isStationBoard,
  minutesSince,
  patientName,
  setShiftStation,
  usePolling,
  type StationBoard,
  type StationVisit,
} from '@/lib/stations';
import type { ActiveShiftsResponse } from '@/lib/ops';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { RouteGuard } from '@/components/RouteGuard';
import {
  EmptyStateCard,
  InlineNotice,
  OfflineOpsBanner,
  OpsFeedbackNotice,
  ShiftControlCard,
} from '@/components/ops/OpsShared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StationsView {
  board: StationBoard;
  shifts: ActiveShiftsResponse;
}

/** Whether a copy saved on the device is this page's shape, not the manager's bare board (#197). */
function isStationsView(value: unknown): value is StationsView {
  if (typeof value !== 'object' || value === null) return false;
  const view = value as Partial<StationsView>;
  return isStationBoard(view.board) && Array.isArray(view.shifts?.items);
}

/**
 * Where a volunteer works the station line (#167): pick a station, take the next patient waiting
 * there, and pick up anyone already being seen.
 */
export default function StationsPage() {
  const router = useRouter();
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const userId = bootstrap?.userId ?? '';
  const enabled = isWebFeatureEnabled('stationWorkflow');
  const activeMembership = bootstrap?.memberships?.find((m) => m.clinicId === clinicId);
  const eligibleShiftRoles = getEligibleShiftRoles(
    Array.from(
      new Set([
        ...(bootstrap?.effectiveRolesForActiveClinic ?? []),
        ...(activeMembership?.roles ?? []),
      ]),
    ),
  );

  const [date] = useState(getTodayInTimeZone());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const pendingWrites = usePendingOpsWrites(clinicId);
  const pendingIds = useMemo(() => pendingWrites.map((write) => write.entityId), [pendingWrites]);
  const view = useOpsView<StationsView>({
    clinicId: enabled ? clinicId : null,
    kind: 'station-workspace',
    date,
    errorMessage: 'The station line could not be loaded.',
    pendingIds,
    fetcher: async (token, signal) => {
      const [board, shifts] = await Promise.all([
        fetchStationBoard(clinicId ?? '', date, token, signal),
        fetchActiveShifts({ clinicId: clinicId ?? '', date, getToken: token, signal }),
      ]);
      return { board, shifts };
    },
    isValid: isStationsView,
  });
  const { isOnline, refresh } = view;
  usePolling(refresh, enabled && isOnline && Boolean(clinicId));

  const timezone = view.data?.board?.timezone ?? OPS_DEFAULT_TIMEZONE;
  const stations = useMemo(
    () => (view.data?.board?.stations ?? []).filter((station) => station.active),
    [view.data],
  );
  const shifts = useMemo(
    () =>
      overlayPendingShifts(view.data?.shifts?.items ?? [], pendingWrites, {
        userId: bootstrap?.userId,
        displayName: bootstrap?.displayName,
      }),
    [view.data, pendingWrites, bootstrap?.userId, bootstrap?.displayName],
  );
  const shiftControls = useShiftControls({
    clinicId,
    userId: bootstrap?.userId,
    shifts,
    eligibleRoles: eligibleShiftRoles,
    onApplied: refresh,
  });
  const currentShift = shiftControls.currentShift;

  const myStation = stations.find((station) =>
    station.staff.some((member) => member.id === userId),
  );
  const myPatients = stations.flatMap((station) =>
    station.visits.filter(
      (visit) => visit.status === 'IN_PROGRESS' && visit.claimedBy?.id === userId,
    ),
  );
  const queue = myStation?.visits ?? [];

  const chooseStation = useCallback(
    async (stationId: string | null) => {
      if (!clinicId || !getToken || !currentShift) return;
      setBusyId(stationId ?? 'none');
      setActionError(null);
      try {
        await setShiftStation(clinicId, currentShift.shiftId, stationId, getToken);
        refresh();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : String(error));
      } finally {
        setBusyId(null);
      }
    },
    [clinicId, getToken, currentShift, refresh],
  );

  const claim = useCallback(
    async (visit: StationVisit) => {
      if (!clinicId || !getToken) return;
      setBusyId(visit.id);
      setActionError(null);
      try {
        await claimStationVisit(clinicId, visit.id, getToken);
        router.push(`/stations/visits/${visit.id}`);
      } catch (error) {
        // Someone else got there first, or the patient moved on: say so and show the line as it is.
        setActionError(error instanceof Error ? error.message : String(error));
        if (error instanceof StationRequestError) refresh();
      } finally {
        setBusyId(null);
      }
    },
    [clinicId, getToken, router, refresh],
  );

  if (!enabled) {
    return (
      <RouteGuard requiredPermission="OPS.STATION.READ" requiresClinic>
        <EmptyStateCard
          title="Stations are not turned on"
          description="This clinic assigns patients from the Today board."
        />
      </RouteGuard>
    );
  }

  return (
    <RouteGuard requiredPermission="OPS.STATION.READ" requiresClinic>
      <div className="space-y-6">
        <AppPageHeader
          eyebrow="Clinic ops"
          title="Stations"
          description="Take the next patient at your station, record what the station measures, and hand them on."
          actions={
            <Button
              type="button"
              variant="outline"
              onClick={refresh}
              disabled={!isOnline || view.isRefreshing || view.isInitialLoading}
              title={isOnline ? undefined : 'Refreshing needs a connection.'}
            >
              <RefreshCw
                aria-hidden="true"
                className={view.isRefreshing ? 'animate-spin motion-reduce:animate-none' : ''}
              />
              Refresh
            </Button>
          }
        />

        {!isOnline ? (
          <OfflineOpsBanner
            dataAsOf={view.dataAsOf}
            timeZone={timezone}
            unavailable="Taking a patient, handing one on and choosing a station"
          />
        ) : view.savedCopyAt ? (
          <InlineNotice tone="warning" live={false}>
            The live line could not be reached. Showing this device’s copy from{' '}
            {formatOpsDateTime(view.savedCopyAt, timezone)}.
          </InlineNotice>
        ) : null}
        {view.error ? (
          <InlineErrorState
            title="The station line could not be loaded"
            description={view.error}
            onRetry={refresh}
          />
        ) : null}
        {actionError ? <InlineNotice tone="error">{actionError}</InlineNotice> : null}
        <OpsFeedbackNotice feedback={shiftControls.feedback} />

        {view.isInitialLoading ? (
          <div className="grid gap-6 xl:grid-cols-[320px,minmax(0,1fr)]">
            <SectionSkeleton lines={3} />
            <SectionSkeleton lines={6} />
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[320px,minmax(0,1fr)]">
            <div className="min-w-0 space-y-6">
              <ShiftControlCard
                currentShift={currentShift}
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
                    <MapPin className="h-5 w-5 text-primary" aria-hidden="true" />
                    My station
                  </CardTitle>
                  <CardDescription>
                    {currentShift
                      ? myStation
                        ? `You are working at ${myStation.name}.`
                        : 'Choose where you are working today.'
                      : 'Start your shift to choose a station.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2">
                  {stations.map((station) => {
                    const selected = myStation?.id === station.id;
                    return (
                      <Button
                        key={station.id}
                        type="button"
                        variant={selected ? 'default' : 'outline'}
                        className="justify-between"
                        aria-pressed={selected}
                        disabled={!currentShift || !isOnline || busyId !== null}
                        onClick={() => void chooseStation(selected ? null : station.id)}
                      >
                        <span>{station.name}</span>
                        <span className="text-xs opacity-80">
                          {station.visits.filter((v) => v.status === 'QUEUED').length} waiting
                        </span>
                      </Button>
                    );
                  })}
                </CardContent>
              </Card>
            </div>

            <div className="min-w-0 space-y-6">
              {myPatients.length ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <UserCheck className="h-5 w-5 text-primary" aria-hidden="true" />
                      With you now
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {myPatients.map((visit) => (
                      <div
                        key={visit.id}
                        className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="font-medium">{patientName(visit.patient)}</p>
                          <p className="text-sm text-muted-foreground">
                            {visit.patient.patientCode} · {visit.station.name}
                          </p>
                        </div>
                        <Button asChild size="sm">
                          <Link href={`/stations/visits/${visit.id}`}>
                            Continue <ArrowRight aria-hidden="true" />
                          </Link>
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : null}

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <ListOrdered className="h-5 w-5 text-primary" aria-hidden="true" />
                    {myStation ? `${myStation.name} queue` : 'Station queue'}
                  </CardTitle>
                  <CardDescription>
                    Oldest first. The line refreshes every few seconds while this page is open.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {!myStation ? (
                    <EmptyStateCard
                      title="No station chosen"
                      description="Choose your station to see who is waiting there."
                    />
                  ) : queue.length === 0 ? (
                    <EmptyStateCard
                      title="Nobody is waiting"
                      description="Patients appear here as soon as the previous station hands them on."
                    />
                  ) : (
                    queue.map((visit) => (
                      <QueueRow
                        key={visit.id}
                        visit={visit}
                        userId={userId}
                        timezone={timezone}
                        canClaim={Boolean(currentShift) && isOnline && busyId === null}
                        busy={busyId === visit.id}
                        onClaim={() => void claim(visit)}
                      />
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">The whole line</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  {stations.map((station) => (
                    <div key={station.id} className="rounded-lg border p-3">
                      <p className="text-sm font-medium">{station.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {station.visits.filter((v) => v.status === 'QUEUED').length} waiting ·{' '}
                        {station.visits.filter((v) => v.status === 'IN_PROGRESS').length} being seen
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {station.staff.length
                          ? station.staff.map((member) => member.displayName).join(', ')
                          : 'Nobody at this station'}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </RouteGuard>
  );
}

function QueueRow({
  visit,
  userId,
  timezone,
  canClaim,
  busy,
  onClaim,
}: {
  visit: StationVisit;
  userId: string;
  timezone: string;
  canClaim: boolean;
  busy: boolean;
  onClaim: () => void;
}) {
  const taken = visit.status === 'IN_PROGRESS';
  const mine = taken && visit.claimedBy?.id === userId;
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between',
        taken && !mine && 'bg-muted/40',
      )}
    >
      <div className="min-w-0 space-y-1">
        <p className="font-medium">
          {patientName(visit.patient)}{' '}
          <span className="text-sm font-normal text-muted-foreground">
            {visit.patient.patientCode}
          </span>
        </p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          Waiting {minutesSince(visit.queuedAt)} min · checked in{' '}
          {formatOpsDateTime(visit.checkedInAt, timezone)}
        </p>
        {visit.previous ? (
          <p className="text-sm">
            <span className="text-muted-foreground">
              From {visit.previous.station.name}
              {visit.previous.completedBy ? ` (${visit.previous.completedBy.displayName})` : ''}:
            </span>{' '}
            {visit.previous.handoffNote ?? 'no hand-off note'}
          </p>
        ) : null}
        {visit.endReason && visit.status === 'QUEUED' ? (
          <p className="text-xs text-muted-foreground">Returned to the queue: {visit.endReason}</p>
        ) : null}
      </div>
      {taken ? (
        mine ? (
          <Button asChild size="sm">
            <Link href={`/stations/visits/${visit.id}`}>Continue</Link>
          </Button>
        ) : (
          <Badge variant="secondary">With {visit.claimedBy?.displayName ?? 'someone'}</Badge>
        )
      ) : (
        <Button size="sm" onClick={onClaim} disabled={!canClaim}>
          {busy ? 'Taking…' : 'Take patient'}
        </Button>
      )}
    </div>
  );
}
