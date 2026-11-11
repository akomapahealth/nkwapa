'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, Clock, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { isWebFeatureEnabled } from '@/lib/feature-flags';
import {
  OPS_DEFAULT_TIMEZONE,
  formatOpsDateTime,
  getEligibleShiftRoles,
  getTodayInTimeZone,
  hasPermission,
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
  performerLabel,
  screenersByUser,
  setShiftStation,
  usePolling,
  withScreener,
  type StationBoard,
  type StationVisit,
} from '@/lib/stations';
import type { ActiveShiftsResponse } from '@/lib/ops';
import { LONG_WAIT_MINUTES } from '@/components/dashboard/StationLineLanes';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { RouteGuard } from '@/components/RouteGuard';
import { ScreenerControl } from '@/components/stations/ScreenerControl';
import {
  EmptyStateCard,
  InlineNotice,
  OfflineOpsBanner,
  OpsFeedbackNotice,
} from '@/components/ops/OpsShared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { StationShiftStrip } from '@/components/stations/StationShiftStrip';
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

  const [date] = useState(getTodayInTimeZone);
  const [stationSheetOpen, setStationSheetOpen] = useState(false);
  const stationTrigger = useRef<HTMLButtonElement>(null);
  const [wideSheet, setWideSheet] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 600px)');
    const update = () => setWideSheet(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const actionInFlight = useRef(false);
  const [awaitingShift, setAwaitingShift] = useState<'start' | 'end' | null>(null);
  const permissions = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const canWork = hasPermission(permissions, 'OPS.STATION.WORK');
  const canWriteShift = hasPermission(permissions, 'OPS.SHIFT.WRITE');
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
  useEffect(() => {
    if (!shiftControls.feedback) return;
    if (
      shiftControls.feedback.tone === 'error' ||
      (awaitingShift === 'start' && currentShift) ||
      (awaitingShift === 'end' && (!currentShift || currentShift.pendingCheckOut))
    )
      setAwaitingShift(null);
  }, [awaitingShift, shiftControls.feedback, currentShift]);
  const knownShift = Boolean(view.data || currentShift);
  const shiftDisabled =
    !canWriteShift ||
    !shiftControls.canSubmit ||
    shiftControls.busy ||
    view.isRefreshing ||
    awaitingShift !== null;
  const canUseStation =
    Boolean(currentShift && !currentShift.pendingSync && !currentShift.pendingCheckOut) &&
    canWork &&
    isOnline &&
    !view.isRefreshing &&
    busyId === null &&
    awaitingShift === null;

  const myStation = stations.find((station) =>
    station.staff.some((member) => member.id === userId),
  );

  // Closing a station clears it from everyone's shift (#228). Remember the last one seen, so a
  // volunteer whose station vanishes is told why rather than just asked to choose again.
  // shortcut: only while this page stays open; a reload after the closure shows no notice, which
  // is fine until volunteers report missing it (then return the reason from the shift API).
  const [seenStation, setSeenStation] = useState<{ id: string; name: string } | null>(null);
  const [closedNotice, setClosedNotice] = useState<string | null>(null);
  if (myStation && myStation.id !== seenStation?.id) {
    setSeenStation({ id: myStation.id, name: myStation.name });
    setClosedNotice(null);
  } else if (!myStation && seenStation && view.data) {
    const closed = view.data.board.stations.some(
      (station) => station.id === seenStation.id && !station.active,
    );
    setClosedNotice(closed ? `${seenStation.name} was closed. Choose another station.` : null);
    setSeenStation(null);
  }
  const myPatients = stations.flatMap((station) =>
    station.visits.filter(
      (visit) => visit.status === 'IN_PROGRESS' && visit.claimedBy?.id === userId,
    ),
  );
  const queue = myStation?.visits ?? [];
  const nextPatient = queue.find((visit) => visit.status === 'QUEUED') ?? null;
  const otherPatients = queue.filter((visit) => visit.id !== nextPatient?.id);
  const inUse = myStation?.inUse ?? queue.filter((visit) => visit.status === 'IN_PROGRESS').length;
  const atCapacity = myStation?.capacity !== undefined && inUse >= myStation.capacity;
  const canClaim = canUseStation;

  const screeners = screenersByUser(view.data?.board?.onShift);
  const myScreener = screeners.get(userId) ?? null;

  const chooseStation = useCallback(
    async (stationId: string | null) => {
      if (!clinicId || !getToken || !currentShift || !canUseStation || actionInFlight.current)
        return;
      actionInFlight.current = true;
      setBusyId(stationId ?? 'none');
      setActionError(null);
      try {
        await setShiftStation(clinicId, currentShift.shiftId, stationId, getToken);
        setStationSheetOpen(false);
        refresh();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : String(error));
        if (error instanceof StationRequestError) refresh();
      } finally {
        actionInFlight.current = false;
        setBusyId(null);
      }
    },
    [clinicId, getToken, currentShift, canUseStation, refresh],
  );

  const claim = useCallback(
    async (visit: StationVisit) => {
      if (!clinicId || !getToken || !canClaim || actionInFlight.current) return;
      actionInFlight.current = true;
      setBusyId(visit.id);
      setActionError(null);
      let navigating = false;
      try {
        await claimStationVisit(clinicId, visit.id, getToken);
        navigating = true;
        router.push(`/stations/visits/${visit.id}`);
      } catch (error) {
        // Someone else got there first, or the patient moved on: say so and show the line as it is.
        setActionError(error instanceof Error ? error.message : String(error));
        if (error instanceof StationRequestError) refresh();
      } finally {
        // A successful claim remains locked while the client navigation commits.
        if (!navigating) {
          actionInFlight.current = false;
          setBusyId(null);
        }
      }
    },
    [clinicId, getToken, router, canClaim, refresh],
  );

  if (!enabled) {
    return (
      <RouteGuard requiredPermission="OPS.STATION.READ" requiresClinic>
        {/* The page keeps its heading with the flag off (#313). */}
        <div className="space-y-6">
          <AppPageHeader title="Stations" />
          <InlineNotice tone="info" live={false}>
            Stations are not turned on. This clinic assigns patients from the Today board.
          </InlineNotice>
        </div>
      </RouteGuard>
    );
  }

  return (
    <RouteGuard requiredPermission="OPS.STATION.READ" requiresClinic>
      <div
        className="flex min-w-0 flex-col gap-6 [&_h1]:font-body [&_h2]:font-body [&_h3]:font-body"
        data-testid="station-workspace"
      >
        <AppPageHeader
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
        {view.refreshError ? (
          <InlineErrorState
            title="The station line refresh is affected"
            description={view.refreshError}
            onRetry={refresh}
          />
        ) : null}
        {actionError ? <InlineNotice tone="error">{actionError}</InlineNotice> : null}
        <OpsFeedbackNotice feedback={shiftControls.feedback} />
        {view.isInitialLoading ? (
          <SectionSkeleton lines={3} />
        ) : !knownShift ? (
          <InlineNotice tone="info">
            Shift status is unavailable. Load the station line before starting or ending a shift.
          </InlineNotice>
        ) : (
          <StationShiftStrip
            controls={shiftControls}
            roles={eligibleShiftRoles}
            timezone={timezone}
            disabled={shiftDisabled}
            onStart={() => {
              setAwaitingShift('start');
              shiftControls.checkIn();
            }}
            onEnd={() => {
              setAwaitingShift('end');
              shiftControls.checkOut();
            }}
          />
        )}
        {knownShift && !canWriteShift ? (
          <p className="text-sm text-muted-foreground">This account cannot start or end shifts.</p>
        ) : null}
        {currentShift ? (
          <>
            <div className="flex flex-col gap-3 compact:flex-row compact:items-center compact:justify-between">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold">My station</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {myStation
                    ? `You are working at ${myStation.name}.`
                    : 'Choose where you are working today.'}
                </p>
              </div>
              <Sheet open={stationSheetOpen} onOpenChange={setStationSheetOpen}>
                <SheetTrigger asChild>
                  <Button
                    ref={stationTrigger}
                    variant="outline"
                    disabled={!canUseStation}
                    className="h-auto max-w-full whitespace-normal text-left"
                  >
                    <span className="min-w-0 break-words">
                      {myStation ? `Change station: ${myStation.name}` : 'Choose station'}
                    </span>
                    <ChevronDown aria-hidden="true" />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side={wideSheet ? 'right' : 'bottom'}
                  onCloseAutoFocus={(event) => {
                    // The selected station is reconciling, so its trigger may still be disabled.
                    if (stationTrigger.current?.disabled) {
                      event.preventDefault();
                      document.getElementById('main-content')?.focus();
                    }
                  }}
                  className={cn(
                    'flex flex-col bg-card p-0 pb-[env(safe-area-inset-bottom)]',
                    wideSheet ? 'w-full sm:max-w-md' : 'max-h-[85dvh] rounded-t-xl',
                  )}
                >
                  <SheetHeader className="px-5 pb-4 pr-20 text-left">
                    <SheetTitle className="font-body">Choose your station</SheetTitle>
                    <SheetDescription>
                      Choose where you are working today. Changes need a connection.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="flex min-h-0 flex-col gap-2 overflow-y-auto px-5 pb-6">
                    {actionError ? <InlineNotice tone="error">{actionError}</InlineNotice> : null}
                    {!stations.length ? (
                      <p className="text-sm text-muted-foreground">No stations are open.</p>
                    ) : null}
                    {stations.map((station) => (
                      <Button
                        key={station.id}
                        variant="outline"
                        aria-pressed={myStation?.id === station.id}
                        disabled={!canUseStation}
                        className={cn(
                          'h-auto min-h-11 justify-between gap-4 whitespace-normal py-3 text-left',
                          myStation?.id === station.id && 'border-primary bg-selected',
                        )}
                        onClick={() =>
                          void chooseStation(myStation?.id === station.id ? null : station.id)
                        }
                      >
                        <span className="min-w-0 break-words">
                          {station.name}
                          {myStation?.id === station.id ? ' · you' : ''}
                        </span>
                        <span className="shrink-0 text-xs">
                          {station.visits.filter((visit) => visit.status === 'QUEUED').length}{' '}
                          waiting
                        </span>
                      </Button>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
            {closedNotice ? <InlineNotice tone="warning">{closedNotice}</InlineNotice> : null}
            {currentShift.pendingSync || currentShift.pendingCheckOut ? (
              <InlineNotice tone="info" live={false}>
                Your shift change still needs to sync. Station choices and taking patients need a
                server-confirmed active shift.
              </InlineNotice>
            ) : null}
          </>
        ) : null}
        {myPatients.length ? (
          <section aria-labelledby="station-with-you" className="flex flex-col gap-3">
            <h2 id="station-with-you" className="text-xl font-semibold">
              With you now
            </h2>
            {myPatients.map((visit) => (
              <div
                key={visit.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3"
              >
                <div className="min-w-0">
                  <p className="break-words font-semibold">{patientName(visit.patient)}</p>
                  <p className="break-words text-sm text-muted-foreground">
                    {visit.patient.patientCode} · {visit.station.name}
                  </p>
                </div>
                <Button asChild>
                  <Link href={`/stations/visits/${visit.id}`}>
                    Continue
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            ))}
          </section>
        ) : null}
        {currentShift && myStation ? (
          <>
            <div className="grid min-w-0 gap-8 tablet:grid-cols-2">
              <section aria-labelledby="station-next" className="min-w-0">
                <h2 id="station-next" className="mb-3 text-xl font-semibold">
                  Next at {myStation.name}
                </h2>
                {nextPatient ? (
                  <article
                    aria-label="Next patient"
                    className="flex min-w-0 overflow-hidden rounded-lg border border-border"
                  >
                    <div className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-dashed border-mint-line bg-deep py-5 text-white compact:w-20">
                      <span className="text-xs">Queue</span>
                      <span className="font-mono text-2xl">01</span>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 compact:p-5">
                      <div>
                        <h3 className="break-words text-2xl font-semibold">
                          {patientName(nextPatient.patient)}
                        </h3>
                        <p className="mt-1 break-words font-mono text-sm text-muted-foreground">
                          {nextPatient.patient.patientCode}
                        </p>
                      </div>
                      <p
                        className={cn(
                          'text-sm',
                          minutesSince(nextPatient.queuedAt) > LONG_WAIT_MINUTES
                            ? 'text-warning-ink'
                            : 'text-muted-foreground',
                        )}
                      >
                        Waiting {minutesSince(nextPatient.queuedAt)} min
                        {minutesSince(nextPatient.queuedAt) > LONG_WAIT_MINUTES
                          ? ' · Waiting over 20 min'
                          : ''}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Checked in {formatOpsDateTime(nextPatient.checkedInAt, timezone)}
                      </p>
                      {nextPatient.previous ? (
                        <p className="break-words text-sm">
                          From {nextPatient.previous.station.name}
                          {nextPatient.previous.completedBy
                            ? ` (${performerLabel(nextPatient.previous.completedBy.displayName, nextPatient.previous.performedByName)})`
                            : ''}
                          : {nextPatient.previous.handoffNote ?? 'no hand-off note'}
                        </p>
                      ) : null}
                      {nextPatient.endReason ? (
                        <p className="text-sm text-muted-foreground">
                          Returned to the queue: {nextPatient.endReason}
                        </p>
                      ) : null}
                      <Button
                        disabled={!canClaim}
                        onClick={() => void claim(nextPatient)}
                        className="hidden compact:inline-flex"
                      >
                        {busyId === nextPatient.id ? 'Taking…' : 'Take patient'}
                        <ArrowRight aria-hidden="true" />
                      </Button>
                    </div>
                  </article>
                ) : (
                  <EmptyStateCard
                    title="Nobody is waiting"
                    description="Patients appear here as soon as the previous station hands them on."
                  />
                )}
                {myStation.capacity !== undefined ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {inUse} of {myStation.capacity} places in use.
                    {atCapacity ? ' This station is at capacity.' : ''}
                  </p>
                ) : null}
              </section>
              <section aria-labelledby="station-queue" className="min-w-0">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="station-queue" className="text-xl font-semibold">
                    {myStation.name} queue
                  </h2>
                  <span className="text-sm text-muted-foreground">Oldest first</span>
                </div>
                {otherPatients.length ? (
                  otherPatients.map((visit) => (
                    <QueueRow
                      key={visit.id}
                      visit={visit}
                      userId={userId}
                      holderScreener={
                        visit.claimedBy ? (screeners.get(visit.claimedBy.id) ?? null) : null
                      }
                      timezone={timezone}
                      canClaim={canClaim}
                      busy={busyId === visit.id}
                      onClaim={() => void claim(visit)}
                    />
                  ))
                ) : (
                  <p className="py-3 text-sm text-muted-foreground">
                    {nextPatient
                      ? 'Nobody else is waiting at your station.'
                      : 'Nobody is waiting at your station.'}
                  </p>
                )}
              </section>
            </div>
            {nextPatient ? (
              <div
                data-testid="station-take-action"
                className="fixed bottom-[calc(var(--workspace-bottom-nav-height,3.75rem)+env(safe-area-inset-bottom)+1rem)] left-4 right-24 z-30 compact:hidden"
              >
                <Button
                  disabled={!canClaim}
                  aria-label={`Take patient: ${patientName(nextPatient.patient)}`}
                  onClick={() => void claim(nextPatient)}
                  className="h-auto min-h-12 w-full whitespace-normal py-3 text-left"
                >
                  <span className="min-w-0 break-words">
                    {busyId === nextPatient.id ? 'Taking…' : 'Take patient'}
                  </span>
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
        {currentShift && clinicId && getToken && canWork ? (
          <section aria-labelledby="screener-heading" className="border-t border-border pt-5">
            <h2 id="screener-heading" className="mb-3 text-lg font-semibold">
              Who is working on this account?
            </h2>
            <fieldset disabled={!canUseStation} className="min-w-0">
              <legend className="sr-only">Screener details</legend>
              <ScreenerControl
                clinicId={clinicId}
                shiftId={currentShift.shiftId}
                screenerName={myScreener}
                isOnline={isOnline}
                getToken={getToken}
                onSaved={refresh}
              />
            </fieldset>
          </section>
        ) : null}
        {view.data && currentShift ? (
          <section
            aria-labelledby="station-line"
            className="station-line border-t border-border pt-5"
          >
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="station-line" className="text-xl font-semibold">
                The whole line
              </h2>
              <p className="text-sm text-muted-foreground">Refreshes while open</p>
            </div>
            <ol className="station-route">
              {stations.map((station) => (
                <li
                  key={station.id}
                  aria-current={myStation?.id === station.id ? 'location' : undefined}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'station-route-stop',
                      myStation?.id === station.id && 'station-route-stop-mine',
                    )}
                  />
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold">
                      {station.name}
                      {myStation?.id === station.id ? ' · you' : ''}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {station.visits.filter((v) => v.status === 'QUEUED').length} waiting ·{' '}
                      {station.visits.filter((v) => v.status === 'IN_PROGRESS').length} being seen
                    </p>
                    <p className="mt-1 break-words text-sm text-muted-foreground">
                      {station.staff.length
                        ? station.staff
                            .map((member) => withScreener(member.displayName, member.screenerName))
                            .join(', ')
                        : 'Nobody at this station'}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    </RouteGuard>
  );
}

function QueueRow({
  visit,
  userId,
  holderScreener,
  timezone,
  canClaim,
  busy,
  onClaim,
}: {
  visit: StationVisit;
  userId: string;
  /** Who is really screening on the holder's account, if not them (#227). */
  holderScreener: string | null;
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
        'flex flex-col gap-3 border-b border-border py-4 sm:flex-row sm:items-start sm:justify-between',
        !taken && minutesSince(visit.queuedAt) > LONG_WAIT_MINUTES && 'bg-warning-surface',
        taken && !mine && 'bg-muted/40',
      )}
    >
      <div className="min-w-0 space-y-1">
        <p className="break-words font-medium">
          {patientName(visit.patient)}{' '}
          <span className="text-sm font-normal text-muted-foreground">
            {visit.patient.patientCode}
          </span>
        </p>
        <p className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {!taken && minutesSince(visit.queuedAt) > LONG_WAIT_MINUTES
            ? 'Waiting over 20 min'
            : 'Waiting'}{' '}
          {minutesSince(visit.queuedAt)} min · checked in{' '}
          {formatOpsDateTime(visit.checkedInAt, timezone)}
        </p>
        {visit.previous ? (
          <p className="text-sm">
            <span className="text-muted-foreground">
              From {visit.previous.station.name}
              {visit.previous.completedBy
                ? ` (${performerLabel(visit.previous.completedBy.displayName, visit.previous.performedByName)})`
                : ''}
              :
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
          <Badge variant="secondary">
            With{' '}
            {visit.claimedBy
              ? withScreener(visit.claimedBy.displayName, holderScreener)
              : 'someone'}
          </Badge>
        )
      ) : (
        <Button size="sm" onClick={onClaim} disabled={!canClaim}>
          {busy ? 'Taking…' : 'Take patient'}
        </Button>
      )}
    </div>
  );
}
