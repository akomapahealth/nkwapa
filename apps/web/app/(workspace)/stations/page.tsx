'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, RefreshCw } from 'lucide-react';
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
  ageInYears,
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

  const stationPicker = (
    <Sheet open={stationSheetOpen} onOpenChange={setStationSheetOpen}>
      <SheetTrigger asChild>
        <Button
          ref={stationTrigger}
          variant="ghost"
          disabled={!canUseStation}
          className="h-auto max-w-full gap-2 whitespace-normal px-2 text-left"
        >
          {myStation ? (
            <>
              <span className="text-sm font-normal text-muted-foreground">Station</span>
              <span className="min-w-0 break-words font-semibold">{myStation.name}</span>
            </>
          ) : (
            <span className="min-w-0 break-words font-semibold">Choose station</span>
          )}
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
              onClick={() => void chooseStation(myStation?.id === station.id ? null : station.id)}
            >
              <span className="min-w-0 break-words">
                {station.name}
                {myStation?.id === station.id ? ' · you' : ''}
              </span>
              <span className="shrink-0 text-xs">
                {station.visits.filter((visit) => visit.status === 'QUEUED').length} waiting
              </span>
            </Button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );

  const refreshButton = (
    <Button
      type="button"
      variant="outline"
      className="bg-card"
      onClick={refresh}
      disabled={!isOnline || view.isRefreshing || view.isInitialLoading}
      title={isOnline ? undefined : 'Refreshing needs a connection.'}
    >
      <RefreshCw
        aria-hidden="true"
        className={view.isRefreshing ? 'animate-spin motion-reduce:animate-none' : ''}
      />
      <span className="sr-only compact:not-sr-only">Refresh</span>
    </Button>
  );

  // Queue positions count only the patients still waiting; someone being seen has no place in line.
  let position = nextPatient ? 1 : 0;

  return (
    <RouteGuard requiredPermission="OPS.STATION.READ" requiresClinic>
      <div
        className={cn(
          'flex min-w-0 flex-col gap-6 [&_h1]:font-body [&_h2]:font-body [&_h3]:font-body',
          // Room for the phone's fixed Take button, so the last row is never under it.
          currentShift && myStation && nextPatient && 'pb-24 compact:pb-0',
        )}
        data-testid="station-workspace"
      >
        {/* The duty strip and the "Next at" eyebrow carry the page visually, as in the pilot. */}
        <h1 className="sr-only">Stations</h1>
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
            station={stationPicker}
            refresh={refreshButton}
            screener={myScreener}
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
        {closedNotice ? <InlineNotice tone="warning">{closedNotice}</InlineNotice> : null}
        {currentShift && (currentShift.pendingSync || currentShift.pendingCheckOut) ? (
          <InlineNotice tone="info" live={false}>
            Your shift change still needs to sync. Station choices and taking patients need a
            server-confirmed active shift.
          </InlineNotice>
        ) : null}
        {myPatients.length ? (
          <section aria-labelledby="station-with-you" className="flex flex-col gap-1">
            <h2
              id="station-with-you"
              className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
            >
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
                    <span className="font-mono">{visit.patient.patientCode}</span> ·{' '}
                    {visit.station.name}
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
        {currentShift && !myStation && view.data ? (
          <section
            aria-labelledby="station-none"
            className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border p-5"
          >
            <h2 id="station-none" className="text-lg font-semibold">
              No station yet
            </h2>
            <p className="text-sm text-muted-foreground">
              Choose where you are working today. The patients waiting there will show here.
            </p>
            <Button disabled={!canUseStation} onClick={() => setStationSheetOpen(true)}>
              Choose your station
            </Button>
          </section>
        ) : null}
        {currentShift && myStation ? (
          <>
            <div className="grid min-w-0 gap-8 tablet:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <section aria-labelledby="station-next" className="min-w-0">
                <h2
                  id="station-next"
                  className="mb-3 break-words text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                >
                  Next at {myStation.name}
                </h2>
                {nextPatient ? (
                  <NextPatientTicket
                    visit={nextPatient}
                    canClaim={canClaim}
                    busy={busyId === nextPatient.id}
                    onClaim={() => void claim(nextPatient)}
                  />
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
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 border-b border-rule-strong pb-2">
                  <h2 id="station-queue" className="text-lg font-semibold">
                    Also waiting here
                  </h2>
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Oldest first
                  </span>
                </div>
                {otherPatients.length ? (
                  <ol>
                    {otherPatients.map((visit) => (
                      <QueueRow
                        key={visit.id}
                        visit={visit}
                        position={visit.status === 'QUEUED' ? ++position : null}
                        userId={userId}
                        holderScreener={
                          visit.claimedBy ? (screeners.get(visit.claimedBy.id) ?? null) : null
                        }
                        canClaim={canClaim}
                        busy={busyId === visit.id}
                        onClaim={() => void claim(visit)}
                      />
                    ))}
                  </ol>
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
                  onClick={() => void claim(nextPatient)}
                  aria-label={
                    busyId === nextPatient.id
                      ? undefined
                      : `Take ${patientName(nextPatient.patient)}`
                  }
                  className="h-auto min-h-12 w-full py-3 shadow-md"
                >
                  {/* One line, ellipsed: a long name must not grow the button over the page. */}
                  <span className="min-w-0 truncate">
                    {busyId === nextPatient.id
                      ? 'Taking…'
                      : `Take ${patientName(nextPatient.patient)}`}
                  </span>
                  <ArrowRight aria-hidden="true" />
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
        {view.data && currentShift ? (
          <section aria-labelledby="station-line" className="station-line">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-rule-strong pb-2">
              <h2 id="station-line" className="text-lg font-semibold">
                The whole line
              </h2>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Refreshes while open
              </p>
            </div>
            <ol className="station-route">
              {stations.map((station) => {
                const waiting = station.visits.filter((v) => v.status === 'QUEUED').length;
                const seen = station.visits.filter((v) => v.status === 'IN_PROGRESS').length;
                const mine = myStation?.id === station.id;
                return (
                  <li key={station.id} aria-current={mine ? 'location' : undefined}>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'station-route-stop',
                        waiting + seen > 0 && 'station-route-stop-busy',
                        mine && 'station-route-stop-mine',
                      )}
                    />
                    <div className="min-w-0">
                      <p className="flex items-baseline gap-1.5">
                        <span
                          className={cn(
                            'font-mono text-2xl font-semibold tabular-nums leading-none',
                            waiting === 0 && 'text-muted-foreground',
                          )}
                        >
                          {waiting}
                        </span>{' '}
                        <span className="text-sm text-muted-foreground">waiting</span>
                      </p>
                      <p className="mt-2 break-words text-sm font-semibold">
                        {station.name}
                        {mine ? ' · you' : ''}
                      </p>
                      {seen ? (
                        <p className="mt-1 text-sm text-muted-foreground">{seen} being seen</p>
                      ) : null}
                      <p className="mt-1 break-words text-sm text-muted-foreground">
                        {station.staff.length
                          ? station.staff
                              .map((member) =>
                                withScreener(member.displayName, member.screenerName),
                              )
                              .join(', ')
                          : 'Nobody at this station'}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}
        {currentShift && clinicId && getToken && canWork ? (
          <section aria-labelledby="screener-heading" className="border-t border-border pt-5">
            <h2 id="screener-heading" className="mb-1 text-lg font-semibold">
              Who is working on this account?
            </h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Change this when someone without an account screens on yours.
            </p>
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
      </div>
    </RouteGuard>
  );
}

/** Minutes on the meter: the same 40-minute scale and 20-minute warning as the station line. */
const METER_SCALE = 40;

function WaitMeter({ minutes }: { minutes: number }) {
  const long = minutes > LONG_WAIT_MINUTES;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted-foreground">Waiting</span>
        <span className={cn('font-semibold tabular-nums', long && 'text-warning-ink')}>
          {minutes} min{long ? ' · Waiting over 20 min' : ''}
        </span>
      </div>
      <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', long ? 'bg-warning' : 'bg-primary')}
          style={{ width: `${Math.min(100, (minutes / METER_SCALE) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function NextPatientTicket({
  visit,
  canClaim,
  busy,
  onClaim,
}: {
  visit: StationVisit;
  canClaim: boolean;
  busy: boolean;
  onClaim: () => void;
}) {
  const age = ageInYears(visit.patient.dob);
  const previous = visit.previous;
  return (
    <article
      aria-label="Next patient"
      className="flex min-w-0 overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="flex w-16 shrink-0 flex-col items-center justify-center gap-1 border-r-2 border-dashed border-mint-line bg-deep py-5 text-white compact:w-24">
        <span className="text-[0.6875rem] uppercase tracking-[0.12em] text-white/80">Queue</span>
        <span className="font-mono text-3xl text-secondary">01</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 compact:p-5">
        {previous ? (
          <p>
            <span className="inline-block break-words rounded bg-info-surface px-2 py-1 text-xs font-semibold text-info-ink">
              {previous.station.name} done
            </span>
          </p>
        ) : null}
        <div className="min-w-0">
          <h3 className="break-words text-2xl font-semibold">{patientName(visit.patient)}</h3>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            <span className="font-mono">{visit.patient.patientCode}</span>
            {age !== null ? ` · ${age} yrs` : ''}
          </p>
        </div>
        <WaitMeter minutes={minutesSince(visit.queuedAt)} />
        {previous?.completedBy || previous?.handoffNote ? (
          <div className="space-y-1 text-sm">
            {previous.completedBy ? (
              <p className="break-words text-muted-foreground">
                Handed on by{' '}
                {performerLabel(previous.completedBy.displayName, previous.performedByName)}
              </p>
            ) : null}
            {previous.handoffNote ? (
              <p className="break-words border-l-2 border-primary pl-3">{previous.handoffNote}</p>
            ) : null}
          </div>
        ) : null}
        {visit.endReason ? (
          <p className="text-sm text-muted-foreground">Returned to the queue: {visit.endReason}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!canClaim} onClick={onClaim} className="hidden compact:inline-flex">
            {busy ? 'Taking…' : 'Take patient'}
            <ArrowRight aria-hidden="true" />
          </Button>
          <Button asChild variant="outline">
            <Link href={`/patients/${visit.patient.id}`}>Open chart</Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

function QueueRow({
  visit,
  position,
  userId,
  holderScreener,
  canClaim,
  busy,
  onClaim,
}: {
  visit: StationVisit;
  /** Place in line, counting the next patient as 1; null while someone is seeing them. */
  position: number | null;
  userId: string;
  /** Who is really screening on the holder's account, if not them (#227). */
  holderScreener: string | null;
  canClaim: boolean;
  busy: boolean;
  onClaim: () => void;
}) {
  const taken = visit.status === 'IN_PROGRESS';
  const mine = taken && visit.claimedBy?.id === userId;
  const minutes = minutesSince(visit.queuedAt);
  const long = !taken && minutes > LONG_WAIT_MINUTES;
  return (
    <li
      className={cn(
        'grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 border-b border-border px-2 py-3',
        long && 'bg-warning-surface',
        taken && !mine && 'bg-muted/40',
      )}
    >
      <span className="pt-0.5 font-mono text-sm text-muted-foreground">
        {position !== null ? String(position).padStart(2, '0') : ''}
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="break-words font-semibold">{patientName(visit.patient)}</p>
        <p className="break-words font-mono text-xs text-muted-foreground">
          {visit.patient.patientCode}
        </p>
        {visit.previous?.handoffNote ? (
          <p className="break-words pt-1 text-sm">
            <span className="text-muted-foreground">Note: </span>
            {visit.previous.handoffNote}
          </p>
        ) : null}
        {visit.endReason && visit.status === 'QUEUED' ? (
          <p className="text-xs text-muted-foreground">Returned to the queue: {visit.endReason}</p>
        ) : null}
      </div>
      <div className="flex flex-col items-end gap-2">
        <span className={cn('text-sm tabular-nums', long && 'font-semibold text-warning-ink')}>
          {long ? 'Waiting over 20 min · ' : ''}
          {minutes} min
        </span>
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
          <Button size="sm" variant="outline" onClick={onClaim} disabled={!canClaim}>
            {busy ? 'Taking…' : 'Take patient'}
          </Button>
        )}
      </div>
    </li>
  );
}
