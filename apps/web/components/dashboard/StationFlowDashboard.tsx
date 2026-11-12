'use client';

import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { StaleDataNotice } from '@/components/feedback/StaleDataNotice';

import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Clock, DoorOpen, Hourglass, LogOut, UserCheck, Users } from 'lucide-react';
import { formatOpsDate } from '@/lib/ops';
import { useAuth } from '@/lib/auth-context';
import { fetchStationMetrics, formatMinutes, type StationMetrics } from '@/lib/stations';
import { AppMetricCard, AppMetricGroup } from '@/components/app-shell/AppMetricCard';
import { EmptyState, InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChartFrame } from './ChartFrame';
import { DashboardSectionHeader } from './DashboardSectionHeader';
import { StationLineLanes } from './StationLineLanes';

/*
  Recharts draws axis ticks as SVG text, out of reach of the `tabular-nums` utility, so the figures
  ask for it here (as DistributionChart does).
*/
const TICK = {
  fontSize: 11,
  fontVariantNumeric: 'tabular-nums' as const,
  fill: 'hsl(var(--muted-foreground))',
};
// Categorical slots in their fixed order; the pair is validated in light and dark (globals.css).
const ARRIVALS = 'hsl(var(--chart-1))';
const COMPLETIONS = 'hsl(var(--chart-2))';

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  color: 'hsl(var(--popover-foreground))',
  fontSize: 12,
};

/**
 * Where the station line is slow, for the people who run it (#24).
 *
 * Built on the station visit timestamps, so each station's wait (joining its queue to being taken)
 * and service time (being taken to being handed on) is measured, not estimated. Everything shown is
 * an aggregate; no patient is named. Clinic-local day boundaries come from the API.
 */
export type StationFlow = ReturnType<typeof useStationFlow>;

/**
 * The station metrics for one clinic day, lifted out of the section so a manager's home can set
 * its figure strip and greeting from the same request (W2). Pass `null` to skip the request.
 */
export function useStationFlow(clinicId: string | null) {
  const getToken = useAuth();
  // Null until chosen: the server then answers for today in the clinic's own timezone.
  const [date, setDate] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<StationMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!getToken || !clinicId) return;
    const controller = new AbortController();
    setLoading(true);
    fetchStationMetrics(clinicId, date, getToken, controller.signal)
      .then((result) => {
        setMetrics(result);
        setError(null);
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        setError(failure instanceof Error ? failure.message : String(failure));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [clinicId, date, getToken, reload]);

  return {
    date,
    setDate,
    metrics,
    error,
    loading,
    retry: () => setReload((count) => count + 1),
  };
}

/** A manager's four figures (pilot `#s-dash-manager`); "still in clinic" goes in the greeting. */
export function stationFlowFigures(metrics: StationMetrics) {
  return [
    { value: metrics.checkIns.total, label: 'checked in' },
    { value: metrics.checkIns.completed, label: 'sessions completed' },
    { value: metrics.checkIns.leftEarly, label: 'left before finishing' },
    {
      value: metrics.timeInClinic.medianMinutes ?? '–',
      unit: metrics.timeInClinic.medianMinutes === null ? undefined : 'min',
      label: 'median time in clinic',
    },
  ];
}

export function StationFlowDashboard({
  flow,
  showFigures = true,
}: {
  flow: StationFlow;
  /** False on a manager's home, where the figure strip under the greeting already has them. */
  showFigures?: boolean;
}) {
  const { isOnline } = useSync();
  const { date, setDate, metrics, error, loading, retry } = flow;

  const bottleneck = metrics?.stations.find(
    (station) => station.stationId === metrics.bottleneckStationId,
  );
  // Stations someone has been taken at; the scale is the longest wait + service among them.
  const timed = (metrics?.stations ?? []).filter((station) => station.wait.medianMinutes !== null);
  const scale = Math.max(
    1,
    ...timed.map((s) => (s.wait.medianMinutes ?? 0) + (s.service.medianMinutes ?? 0)),
  );

  return (
    <section className="space-y-6" aria-labelledby="station-flow-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div id="station-flow-heading">
          <DashboardSectionHeader
            title="Station flow"
            subtitle={
              metrics
                ? `${metrics.live ? 'Today so far' : formatOpsDate(metrics.date, metrics.timezone)}, clinic time (${metrics.timezone}).${
                    metrics.lowVolume && metrics.checkIns.total > 0
                      ? ' Few patients that day, so read the times as examples, not trends.'
                      : ''
                  }`
                : undefined
            }
            hint="How long patients waited at each station and how long they were with someone, measured from when they joined a station's queue, were taken, and were handed on."
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="station-flow-date">Clinic day</Label>
          <Input
            id="station-flow-date"
            type="date"
            value={date ?? metrics?.date ?? ''}
            onChange={(event) => event.target.value && setDate(event.target.value)}
            className="w-[180px]"
          />
        </div>
      </div>

      {!isOnline ? <StaleDataNotice isOnline={false} /> : null}
      {/* Right now first: who is waiting where, before the day's aggregates. */}
      {metrics?.live && !error ? (
        <StationLineLanes stations={metrics.stations} onShiftNow={metrics.staffing.onShiftNow} />
      ) : null}

      {error ? (
        <InlineErrorState
          title="Station flow could not be loaded"
          description={error}
          onRetry={retry}
        />
      ) : loading && !metrics ? (
        <SectionSkeleton lines={4} />
      ) : metrics && metrics.checkIns.total === 0 ? (
        <EmptyState
          density="compact"
          icon={Users}
          title="No check-ins on this day"
          description="Wait times appear here once patients are checked in to the station line."
        />
      ) : metrics ? (
        <>
          {showFigures ? (
            <AppMetricGroup className="sm:grid-cols-2 xl:grid-cols-5">
              <AppMetricCard title="Checked in" value={metrics.checkIns.total} icon={UserCheck} />
              <AppMetricCard
                title="Sessions completed"
                value={metrics.checkIns.completed}
                icon={DoorOpen}
              />
              <AppMetricCard
                title={metrics.live ? 'Still in clinic' : 'Never closed'}
                value={metrics.checkIns.inClinicNow}
                hint={
                  metrics.live
                    ? 'Checked in and not yet through review.'
                    : 'Checked in that day and never completed or marked as left.'
                }
                icon={Hourglass}
              />
              <AppMetricCard
                title="Left before finishing"
                value={metrics.checkIns.leftEarly}
                icon={LogOut}
              />
              <AppMetricCard
                title="Median time in clinic"
                value={formatMinutes(metrics.timeInClinic.medianMinutes)}
                detail={
                  metrics.timeInClinic.n
                    ? `From check-in to the end of review, across ${metrics.timeInClinic.n} completed session${
                        metrics.timeInClinic.n === 1 ? '' : 's'
                      }.`
                    : 'No session has finished yet.'
                }
                icon={Clock}
              />
            </AppMetricGroup>
          ) : null}

          {bottleneck ? (
            // A ruled warning band, like encounter sign-off: the one place a manager should look.
            <p
              className="flex items-start gap-3 border-y-2 border-warning py-3 text-sm"
              data-testid="station-flow-bottleneck"
            >
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0 text-warning-ink"
              />
              <span className="max-w-[75ch]">
                <span className="font-semibold">Longest wait: {bottleneck.name}.</span> Half of the{' '}
                {bottleneck.wait.n} patients waited {formatMinutes(bottleneck.wait.medianMinutes)}{' '}
                or more to be taken, and 1 in 10 waited over{' '}
                {formatMinutes(bottleneck.wait.p90Minutes)}.
                {metrics.bottleneckConstraint === 'CAPACITY'
                  ? ` At its busiest every place there was in use (${bottleneck.peakInUse} of ${bottleneck.capacity}), so the wait was for space or equipment, not just staff.`
                  : metrics.bottleneckConstraint === 'STAFFING'
                    ? ` It never filled (at most ${bottleneck.peakInUse} of ${bottleneck.capacity} places in use), so the wait was for someone to take them.`
                    : ''}
              </span>
            </p>
          ) : null}

          <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
            {/*
              Time as length (MASTER 12): wait then service, side by side on one scale, values
              written beside each name so neither colour carries the reading alone (pilot).
            */}
            <section aria-labelledby="station-times-heading" className="min-w-0">
              <h3 id="station-times-heading" className="type-section-title text-foreground">
                Wait and service time at each station
              </h3>
              <p className="type-meta mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-chart-2" />
                  Median wait
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-chart-1" />
                  Median time with patient
                </span>
              </p>
              {timed.length === 0 ? (
                <p className="type-body mt-3 border-t border-rule pt-3 text-muted-foreground">
                  Nobody has been taken yet.
                </p>
              ) : (
                <ul className="mt-3 border-t border-rule" data-testid="station-times">
                  {timed.map((station) => {
                    const wait = station.wait.medianMinutes ?? 0;
                    const service = station.service.medianMinutes ?? 0;
                    return (
                      <li
                        key={station.stationId}
                        className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 border-b border-rule py-3"
                      >
                        <span className="type-label flex min-w-0 flex-wrap items-center gap-2 text-foreground">
                          {station.name}
                          {station.stationId === metrics.bottleneckStationId ? (
                            <Badge variant="warning">Longest wait</Badge>
                          ) : null}
                        </span>
                        <span className="type-meta text-right tabular-nums text-muted-foreground">
                          {formatMinutes(station.wait.medianMinutes)} ·{' '}
                          {formatMinutes(station.service.medianMinutes)}
                        </span>
                        <span aria-hidden="true" className="col-span-2 flex h-2 gap-0.5">
                          <span
                            className="station-time-bar rounded-sm bg-chart-2"
                            style={{ width: `${(wait / scale) * 100}%` }}
                          />
                          <span
                            className="station-time-bar rounded-sm bg-chart-1"
                            style={{ width: `${(service / scale) * 100}%` }}
                          />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <ChartFrame
              title="Arrivals and completions by hour"
              columns={['Hour', 'Checked in', 'Completed']}
              rows={metrics.hourly.map((row) => ({
                label: row.hour,
                values: [row.checkedIn, row.completed],
              }))}
              hasData={metrics.hourly.length > 0}
              empty={null}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={metrics.hourly}
                  barGap={2}
                  margin={{ top: 4, right: 8, bottom: 4, left: -16 }}
                >
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="hour" tick={TICK} />
                  <YAxis tick={TICK} allowDecimals={false} />
                  <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={TOOLTIP_STYLE} />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    // Text wears text ink; the swatch beside it carries the series colour.
                    formatter={(value) => (
                      <span style={{ color: 'hsl(var(--foreground))' }}>{value}</span>
                    )}
                  />
                  <Bar
                    dataKey="checkedIn"
                    name="Checked in"
                    fill={ARRIVALS}
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="completed"
                    name="Completed"
                    fill={COMPLETIONS}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          </div>

          <section className="border-t-2 border-rule-strong pt-3">
            <h3 className="type-label pt-2.5 text-foreground">By station</h3>
            <div
              role="region"
              aria-label="By station"
              tabIndex={0}
              className="scroll-region mt-2 overflow-x-auto"
            >
              <table className="w-full min-w-[720px] text-sm" data-testid="station-flow-table">
                <caption className="sr-only">Wait and service time at each station</caption>
                <thead>
                  <tr className="border-b border-rule text-left text-xs text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Station
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">
                      Seen
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">
                      Median wait
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">
                      9 in 10 waited under
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">
                      Median time with patient
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">
                      Busiest, of capacity
                    </th>
                    {metrics.live ? (
                      <>
                        <th scope="col" className="py-2 pr-3 text-right font-medium">
                          Waiting now
                        </th>
                        <th scope="col" className="py-2 pr-3 text-right font-medium">
                          Longest waiting
                        </th>
                        <th scope="col" className="py-2 text-right font-medium">
                          Staff now
                        </th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {metrics.stations.map((station) => {
                    const isBottleneck = station.stationId === metrics.bottleneckStationId;
                    return (
                      <tr key={station.stationId} className="border-b border-rule last:border-0">
                        <th scope="row" className="py-2 pr-3 text-left font-medium">
                          <span className="flex flex-wrap items-center gap-2">
                            {station.name}
                            {isBottleneck ? <Badge variant="warning">Longest wait</Badge> : null}
                            {!station.active ? <Badge variant="secondary">Closed</Badge> : null}
                          </span>
                        </th>
                        <td className="py-2 pr-3 text-right">
                          {station.seen}
                          {station.skipped ? (
                            <span className="text-muted-foreground">
                              {' '}
                              · {station.skipped} skipped
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {formatMinutes(station.wait.medianMinutes)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {formatMinutes(station.wait.p90Minutes)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {formatMinutes(station.service.medianMinutes)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {station.capacity
                            ? `${station.peakInUse ?? 0} of ${station.capacity}`
                            : '–'}
                        </td>
                        {metrics.live ? (
                          <>
                            <td className="py-2 pr-3 text-right">{station.waitingNow}</td>
                            <td className="py-2 pr-3 text-right">
                              {formatMinutes(station.longestCurrentWaitMinutes)}
                            </td>
                            <td className="py-2 text-right">{station.staffNow}</td>
                          </>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}
