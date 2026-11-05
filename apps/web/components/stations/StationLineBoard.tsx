'use client';

import { StaleDataNotice } from '@/components/feedback/StaleDataNotice';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { RefreshCw, AlertTriangle, UserX, ClipboardCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { OPS_DEFAULT_TIMEZONE, formatOpsDateTime, getTodayInTimeZone } from '@/lib/ops';
import { useOpsView } from '@/lib/use-ops-view';
import {
  assignableStaff,
  assignStationVisit,
  cancelCheckIn,
  fetchStationBoard,
  isStationBoard,
  minutesSince,
  moveCheckIn,
  patientName,
  releaseStationVisit,
  screenersByUser,
  usePolling,
  withScreener,
  type OnShiftStaff,
  type StationBoard,
  type StationVisit,
} from '@/lib/stations';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { InlineNotice, OfflineOpsBanner } from '@/components/ops/OpsShared';
import { Button } from '@/components/ui/button';
import { LONG_WAIT_MINUTES } from '@/components/dashboard/StationLineLanes';
import { AppActionRow } from '@/components/app-shell/AppActionRow';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Override = { kind: 'assign' | 'move' | 'release' | 'left'; visit: StationVisit };

/** Only assigning needs no reason: it changes who sees the patient, not whether they are seen. */
const needsReason = (override: Override | null) => override?.kind !== 'assign';

/** A fixed scale keeps normal waits readable; a longer wait fills the lane and keeps its real minutes. */
const SCALE_END = 40;
const TICKS = [0, 10, 20, 30, 40];
const share = (minutes: number) => (Math.min(minutes, SCALE_END) / SCALE_END) * 100;
const at = (minutes: number) => `${share(minutes)}%`;

const isLongWait = (visit: StationVisit) =>
  visit.status === 'QUEUED' && minutesSince(visit.queuedAt) > LONG_WAIT_MINUTES;

function visitStatus(visit: StationVisit) {
  if (visit.status === 'IN_PROGRESS') return 'With staff';
  return isLongWait(visit) ? 'Waiting over 20 min' : 'Waiting';
}

/** "Ama O.": the full name stays in the bar's accessible name and its menu. */
function shortName(patient: StationVisit['patient']) {
  const initial = patient.lastName.trim().charAt(0);
  return initial ? `${patient.firstName} ${initial}.` : patient.firstName;
}

/**
 * One patient on a station lane. The bar's length is minutes since queuedAt; it opens a menu with
 * who the patient is with and, for managers on today's board, the per-visit actions.
 */
function PatientBar({
  visit,
  canAct,
  isOnline,
  claimedByName,
  onAction,
}: {
  visit: StationVisit;
  canAct: boolean;
  isOnline: boolean;
  claimedByName: string | null;
  onAction: (kind: Override['kind']) => void;
}) {
  const minutes = minutesSince(visit.queuedAt);
  const withStaff = visit.status === 'IN_PROGRESS';
  const long = isLongWait(visit);
  // Under 20 minutes the bar is at most half the lane, too short to hold the label on a phone.
  const labelInside = Math.min(minutes, SCALE_END) >= LONG_WAIT_MINUTES;
  const label = `${shortName(visit.patient)} ${minutes} min`;
  return (
    <li data-testid="patient-station-row" className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex min-h-11 items-center gap-1.5 rounded-sm text-left text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span
              data-testid="patient-wait-bar"
              data-minutes={minutes}
              className={cn(
                'flex h-6 shrink-0 items-center whitespace-nowrap rounded-sm',
                labelInside && 'px-2',
                withStaff
                  ? 'bg-primary text-primary-foreground'
                  : long
                    ? 'border border-warning bg-warning-surface text-warning-ink'
                    : 'border border-input bg-muted text-foreground',
              )}
              // cqw: a share of the lane's track, whichever row of the wrapped lane the bar sits on.
              style={{ width: `${share(minutes)}cqw` }}
            >
              {labelInside ? <span aria-hidden="true">{label}</span> : null}
            </span>
            {labelInside ? null : (
              <span aria-hidden="true" className="whitespace-nowrap pr-1 text-foreground">
                {label}
              </span>
            )}
            <span className="sr-only">
              {patientName(visit.patient)}, {visitStatus(visit)}, {minutes} min
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="font-normal">
            <span className="block text-sm font-medium">{patientName(visit.patient)}</span>
            <span className="block text-xs text-muted-foreground">{visit.patient.patientCode}</span>
            <span
              className={cn(
                'mt-1 block text-xs tabular-nums',
                long ? 'text-warning-ink' : 'text-muted-foreground',
              )}
            >
              {visitStatus(visit)} · {minutes} min
            </span>
            {withStaff && claimedByName ? (
              <span className="block text-xs text-muted-foreground">With {claimedByName}</span>
            ) : null}
            {withStaff && visit.assignedBy ? (
              <span className="block text-xs text-muted-foreground">
                Assigned by {visit.assignedBy.displayName}
              </span>
            ) : null}
          </DropdownMenuLabel>
          {canAct ? (
            <>
              <DropdownMenuSeparator />
              {visit.status === 'QUEUED' ? (
                <DropdownMenuItem disabled={!isOnline} onSelect={() => onAction('assign')}>
                  Assign
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem disabled={!isOnline} onSelect={() => onAction('move')}>
                Move
              </DropdownMenuItem>
              {withStaff ? (
                <DropdownMenuItem disabled={!isOnline} onSelect={() => onAction('release')}>
                  Release
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem disabled={!isOnline} onSelect={() => onAction('left')}>
                Left
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/stations/visits/${visit.id}`}>Open</Link>
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function staffOptionLabel(member: OnShiftStaff) {
  const role = member.roleAtShift.charAt(0) + member.roleAtShift.slice(1).toLowerCase();
  const load =
    member.activeVisitCount === 0
      ? 'free'
      : `with ${member.activeVisitCount} patient${member.activeVisitCount === 1 ? '' : 's'}`;
  return `${member.user.displayName} (${role}, ${load})`;
}

/**
 * The manager's view of the station line (#167): every station, who is working it, who is waiting
 * and who is being seen. Staff take waiting patients themselves; a manager can also hand a waiting
 * patient to someone on shift, and unblocks the line by moving a patient, releasing a claim
 * someone left open, or recording that a patient left.
 */
export function StationLineBoard() {
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const canManage = perms.includes('*') || perms.includes('OPS.STATION.MANAGE');
  const [tableView, setTableView] = useState(false);
  const [date, setDate] = useState(getTodayInTimeZone());
  const [override, setOverride] = useState<Override | null>(null);
  const [reason, setReason] = useState('');
  const [targetStationId, setTargetStationId] = useState('');
  const [assigneeUserId, setAssigneeUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const view = useOpsView<StationBoard>({
    clinicId,
    kind: 'station-board',
    date,
    errorMessage: 'The station line could not be loaded.',
    fetcher: (token, signal) => fetchStationBoard(clinicId ?? '', date, token, signal),
    isValid: isStationBoard,
  });
  const { isOnline, refresh } = view;
  const isToday = date === getTodayInTimeZone(view.data?.timezone ?? OPS_DEFAULT_TIMEZONE);
  usePolling(refresh, isOnline && isToday && Boolean(clinicId));
  const timezone = view.data?.timezone ?? OPS_DEFAULT_TIMEZONE;
  const screeners = screenersByUser(view.data?.onShift);
  const stations = (view.data?.stations ?? []).filter(
    (station) => station.active || station.visits.length > 0,
  );

  const visits = stations.flatMap((station) => station.visits);
  const longWaits = visits.filter(isLongWait);
  const longestWaitExamples = [...longWaits]
    .sort((a, b) => minutesSince(b.queuedAt) - minutesSince(a.queuedAt))
    .slice(0, 3);
  const longWaitDetail =
    longestWaitExamples
      .map(
        (visit) =>
          `${patientName(visit.patient)}, ${minutesSince(visit.queuedAt)} min at ${visit.station.name}`,
      )
      .join('; ') +
    (longWaits.length > longestWaitExamples.length
      ? `; and ${longWaits.length - longestWaitExamples.length} more.`
      : '');
  const unstaffed = stations.filter((station) => station.active && station.staff.length === 0);
  const unstaffedWaiting = unstaffed
    .flatMap((station) => station.visits)
    .find((visit) => visit.status === 'QUEUED');
  const canAct = canManage && isToday;
  const reviewWaiting = stations
    .filter((station) => station.kind === 'REVIEW')
    .flatMap((station) => station.visits.filter((visit) => visit.status === 'QUEUED'));
  const close = () => {
    setOverride(null);
    setReason('');
    setTargetStationId('');
    setAssigneeUserId('');
  };
  const onShift = view.data?.onShift ?? [];
  const assignOptions = override ? assignableStaff(onShift, override.visit.station.id) : null;

  const apply = useCallback(async () => {
    if (!override || !clinicId || !getToken) return;
    if (needsReason(override) && !reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (override.kind === 'assign') {
        await assignStationVisit(clinicId, override.visit.id, assigneeUserId, getToken);
      } else if (override.kind === 'move') {
        await moveCheckIn(
          clinicId,
          override.visit.checkInId,
          targetStationId,
          reason.trim(),
          getToken,
        );
      } else if (override.kind === 'release') {
        await releaseStationVisit(clinicId, override.visit.id, reason.trim(), getToken, {
          force: true,
        });
      } else {
        await cancelCheckIn(clinicId, override.visit.checkInId, reason.trim(), getToken);
      }
      close();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
      refresh();
    }
  }, [override, clinicId, getToken, reason, targetStationId, assigneeUserId, refresh]);

  return (
    <div className="space-y-6">
      <AppPageHeader
        title="Station line"
        description="Where every checked-in patient is, and who is seeing them."
        actions={
          <div className="flex flex-wrap items-end gap-3">
            {canManage ? (
              <Button asChild variant="outline">
                <Link href="/stations/setup">Set up stations</Link>
              </Button>
            ) : null}
            <Input
              type="date"
              aria-label="Clinic day"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-[180px]"
            />
            <Button
              type="button"
              variant="outline"
              onClick={refresh}
              disabled={!isOnline || view.isRefreshing}
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

      {!isOnline ? (
        <OfflineOpsBanner
          dataAsOf={view.dataAsOf}
          timeZone={timezone}
          unavailable="Assigning and moving patients, and releasing claims"
        />
      ) : view.savedCopyAt ? (
        <StaleDataNotice
          savedAt={view.savedCopyAt}
          isOnline
          onRefresh={refresh}
          isRefreshing={view.isRefreshing}
        />
      ) : null}
      {view.error ? (
        <InlineErrorState
          title="The station line could not be loaded"
          description={view.error}
          onRetry={refresh}
        />
      ) : null}
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}

      {view.isInitialLoading ? (
        <SectionSkeleton lines={6} />
      ) : !view.data ? null : (
        <>
          <section aria-labelledby="station-needs" className="border-t-2 border-rule-strong pt-4">
            <h2 id="station-needs" className="type-section-title">
              Needs you now
            </h2>
            <ul>
              {longWaits.length ? (
                <AppActionRow
                  icon={AlertTriangle}
                  tone="warning"
                  title={`${longWaits.length} patient${longWaits.length === 1 ? '' : 's'} waiting over ${LONG_WAIT_MINUTES} minutes`}
                  detail={longWaitDetail}
                  action={
                    canAct ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!isOnline}
                        onClick={() => setOverride({ kind: 'move', visit: longestWaitExamples[0] })}
                      >
                        Move a patient
                      </Button>
                    ) : (
                      <Button asChild variant="outline">
                        <a href="#patient-station-line">Review waits</a>
                      </Button>
                    )
                  }
                />
              ) : null}
              {unstaffed.length ? (
                <AppActionRow
                  icon={UserX}
                  tone="warning"
                  title={`${unstaffed.length} open station${unstaffed.length === 1 ? ' has' : 's have'} no staff`}
                  detail={unstaffed.map((station) => station.name).join(', ')}
                  action={
                    canAct && unstaffedWaiting ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!isOnline}
                        onClick={() => setOverride({ kind: 'assign', visit: unstaffedWaiting })}
                      >
                        Assign staff
                      </Button>
                    ) : (
                      <Button asChild variant="outline">
                        <a href="#on-shift">View on shift</a>
                      </Button>
                    )
                  }
                />
              ) : null}
              {reviewWaiting.length ? (
                <AppActionRow
                  icon={ClipboardCheck}
                  tone="info"
                  title={`${reviewWaiting.length} patient${reviewWaiting.length === 1 ? '' : 's'} waiting at the review station`}
                  detail="Station review is the next step for these patients."
                  action={
                    <Button asChild variant="outline">
                      <a href="#patient-station-line">View review station</a>
                    </Button>
                  }
                />
              ) : null}
            </ul>
            {!longWaits.length && !unstaffed.length && !reviewWaiting.length ? (
              <p className="py-3 text-sm text-muted-foreground">
                No long waits or unstaffed stations in this line.
              </p>
            ) : null}
          </section>

          <section
            id="patient-station-line"
            aria-labelledby="patient-line-heading"
            className="scroll-mt-24 border-t-2 border-rule-strong pt-4"
          >
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h2 id="patient-line-heading" className="type-section-title">
                Patients at each station
              </h2>
              <p className="text-sm text-muted-foreground">
                Minutes since each patient joined the station queue
              </p>
              <Button
                type="button"
                variant="outline"
                className="ml-auto"
                aria-pressed={tableView}
                onClick={() => setTableView(!tableView)}
              >
                {tableView ? 'Show station line' : 'Show data table'}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Scale from 0 to {SCALE_END} minutes, with gridlines every 10 minutes. The dashed guide
              marks {LONG_WAIT_MINUTES} minutes; longer waits carry a warning. A longer wait runs to
              the end of the scale and its label shows the real minutes.
            </p>
            {tableView ? (
              <div
                role="region"
                aria-label="Station line, exact patient queue times and staffing"
                tabIndex={0}
                className="scroll-region mt-4 overflow-x-auto"
              >
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">
                    Station line, exact patient queue times and staffing
                  </caption>
                  <thead>
                    <tr className="border-b border-rule">
                      <th className="p-3">Station</th>
                      <th className="p-3">Patient</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Minutes since queued</th>
                      <th className="p-3">Staffed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stations.flatMap((station) =>
                      station.visits.map((visit) => (
                        <tr key={visit.id} className="border-b border-rule">
                          <th scope="row" className="p-3 font-normal">
                            {station.name}
                          </th>
                          <td className="p-3">{patientName(visit.patient)}</td>
                          <td className="p-3">{visitStatus(visit)}</td>
                          <td className="p-3 tabular-nums">{minutesSince(visit.queuedAt)}</td>
                          <td className="p-3 tabular-nums">
                            {station.staff.length} of {station.capacity ?? 1}
                          </td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="mt-4 border-t-2 border-foreground">
              {!tableView ? (
                <div
                  aria-hidden="true"
                  className="grid grid-cols-1 gap-x-4 border-b border-rule py-1.5 text-xs tabular-nums text-muted-foreground sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_7rem]"
                >
                  <span className="hidden sm:block">Station</span>
                  <div data-testid="station-minute-scale" className="relative h-4">
                    {TICKS.map((tick) => (
                      <span
                        key={tick}
                        className="absolute -translate-x-1/2 whitespace-nowrap first:translate-x-0 last:-translate-x-full"
                        style={{ left: at(tick) }}
                      >
                        {tick}
                        <span className="hidden sm:inline"> min</span>
                      </span>
                    ))}
                  </div>
                  <span className="hidden text-right sm:block">Staffed</span>
                </div>
              ) : null}
              {stations.map((station) => {
                const stationLongWaits = station.visits.filter(isLongWait).length;
                const open = station.active && station.staff.length === 0;
                return (
                  <section
                    key={station.id}
                    aria-label={station.name}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-rule py-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_7rem]"
                    data-testid="patient-station-lane"
                  >
                    <div className="min-w-0">
                      <h3 className="font-sans text-sm font-medium">{station.name}</h3>
                      <p
                        className={cn(
                          'text-xs',
                          open ? 'text-warning-ink' : 'text-muted-foreground',
                        )}
                      >
                        {station.staff.length
                          ? station.staff
                              .map((member) =>
                                withScreener(member.displayName, member.screenerName),
                              )
                              .join(', ')
                          : 'Nobody at this station'}
                      </p>
                      {stationLongWaits ? (
                        <p className="text-xs text-warning-ink">
                          {stationLongWaits} waiting over {LONG_WAIT_MINUTES} min
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right text-xs tabular-nums sm:order-last">
                      <p>
                        Staffed {station.staff.length} of {station.capacity ?? 1}
                      </p>
                      {station.capacity ? (
                        <p
                          data-testid="station-occupancy"
                          className={
                            (station.inUse ?? 0) >= station.capacity
                              ? 'text-warning-ink'
                              : 'text-muted-foreground'
                          }
                        >
                          {station.inUse ?? 0} of {station.capacity} in use
                        </p>
                      ) : null}
                    </div>
                    {station.visits.length === 0 ? (
                      <p className="col-span-2 text-sm text-muted-foreground sm:col-span-1">
                        Empty
                      </p>
                    ) : tableView ? (
                      <p className="col-span-2 text-sm text-muted-foreground sm:col-span-1">
                        {station.visits.length} patient{station.visits.length === 1 ? '' : 's'}
                      </p>
                    ) : (
                      <div
                        data-testid="patient-wait-track"
                        data-scale={SCALE_END}
                        className="relative col-span-2 [container-type:inline-size] sm:col-span-1"
                      >
                        {TICKS.map((tick) => (
                          <div
                            key={tick}
                            aria-hidden="true"
                            className={cn(
                              'pointer-events-none absolute inset-y-0 border-l',
                              tick === LONG_WAIT_MINUTES
                                ? 'border-dashed border-warning'
                                : 'border-rule',
                            )}
                            style={{ left: at(tick) }}
                          />
                        ))}
                        <ul
                          aria-label={`Patients at ${station.name}`}
                          className="relative flex min-h-11 flex-wrap items-center gap-x-1"
                        >
                          {station.visits.map((visit) => (
                            <PatientBar
                              key={visit.id}
                              visit={visit}
                              canAct={canManage && isToday}
                              isOnline={isOnline}
                              claimedByName={
                                visit.claimedBy
                                  ? withScreener(
                                      visit.claimedBy.displayName,
                                      screeners.get(visit.claimedBy.id),
                                    )
                                  : null
                              }
                              onAction={(kind) => setOverride({ kind, visit })}
                            />
                          ))}
                        </ul>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
            <div
              className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"
              aria-label="Station line legend"
            >
              <span className="inline-flex items-center gap-2">
                <span aria-hidden="true" className="h-3 w-5 rounded-sm bg-primary" />
                With staff
              </span>
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-3 w-5 rounded-sm border border-input bg-muted"
                />
                Waiting
              </span>
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-3 w-5 rounded-sm border border-warning bg-warning-surface"
                />
                Waiting over {LONG_WAIT_MINUTES} min
              </span>
            </div>
          </section>

          <section
            id="on-shift"
            aria-labelledby="on-shift-title"
            className="scroll-mt-24 border-t-2 border-rule-strong pt-4"
          >
            <h2 id="on-shift-title" className="type-section-title">
              On shift
            </h2>
            {onShift.length ? (
              <ul className="mt-2 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
                {onShift.map((member) => (
                  <li key={member.user.id} className="border-b border-rule py-3">
                    <p className="type-label">
                      {withScreener(member.user.displayName, member.screenerName)}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {member.roleAtShift.charAt(0) + member.roleAtShift.slice(1).toLowerCase()} ·{' '}
                      {stations.find((station) => station.id === member.stationId)?.name ??
                        'No station chosen'}{' '}
                      · {member.activeVisitCount} active patients
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-3 text-sm text-muted-foreground">Nobody is on shift.</p>
            )}
          </section>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Times shown in {timezone}.
        {view.dataAsOf ? ` Updated ${formatOpsDateTime(view.dataAsOf, timezone)}.` : ''}
      </p>

      <Dialog open={override !== null} onOpenChange={(open) => (!open ? close() : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {override?.kind === 'assign'
                ? 'Assign patient'
                : override?.kind === 'move'
                  ? 'Move patient'
                  : override?.kind === 'release'
                    ? 'Release claim'
                    : 'Patient left'}
            </DialogTitle>
            <DialogDescription>
              {override ? patientName(override.visit.patient) : ''}.{' '}
              {override?.kind === 'assign'
                ? `They are waiting at ${override.visit.station.name}. The person you choose sees them next, and the assignment is recorded in the audit trail.`
                : 'A reason is recorded in the audit trail.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {override?.kind === 'assign' && assignOptions ? (
              <div className="space-y-2">
                <Label htmlFor="assign-staff">Give to</Label>
                {onShift.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nobody is on shift.</p>
                ) : (
                  <Select value={assigneeUserId} onValueChange={setAssigneeUserId}>
                    <SelectTrigger id="assign-staff">
                      <SelectValue placeholder="Choose someone on shift" />
                    </SelectTrigger>
                    <SelectContent>
                      {assignOptions.atStation.length ? (
                        <SelectGroup>
                          <SelectLabel>At {override.visit.station.name}</SelectLabel>
                          {assignOptions.atStation.map((member) => (
                            <SelectItem key={member.user.id} value={member.user.id}>
                              {staffOptionLabel(member)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ) : null}
                      {assignOptions.elsewhere.length ? (
                        <SelectGroup>
                          <SelectLabel>Elsewhere on shift</SelectLabel>
                          {assignOptions.elsewhere.map((member) => (
                            <SelectItem key={member.user.id} value={member.user.id}>
                              {staffOptionLabel(member)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ) : null}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ) : null}
            {override?.kind === 'move' ? (
              <div className="space-y-2">
                <Label htmlFor="move-station">Send to</Label>
                <Select value={targetStationId} onValueChange={setTargetStationId}>
                  <SelectTrigger id="move-station">
                    <SelectValue placeholder="Choose a station" />
                  </SelectTrigger>
                  <SelectContent>
                    {stations
                      .filter((station) => station.active)
                      .map((station) => (
                        <SelectItem key={station.id} value={station.id}>
                          {station.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {needsReason(override) ? (
              <div className="space-y-2">
                <Label htmlFor="override-reason">Reason</Label>
                <Input
                  id="override-reason"
                  value={reason}
                  maxLength={500}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                busy ||
                (needsReason(override) && !reason.trim()) ||
                (override?.kind === 'move' && !targetStationId) ||
                (override?.kind === 'assign' && !assigneeUserId)
              }
              onClick={() => void apply()}
            >
              {busy ? 'Working…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
