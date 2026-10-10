'use client';

import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Clock, DoorOpen, Hourglass, LogOut, UserCheck, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { fetchStationMetrics, formatMinutes, type StationMetrics } from '@/lib/stations';
import { AppMetricCard, AppMetricGroup } from '@/components/app-shell/AppMetricCard';
import { EmptyState, InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DashboardSectionHeader } from './DashboardSectionHeader';

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
export function StationFlowDashboard({ clinicId }: { clinicId: string }) {
  const getToken = useAuth();
  // Null until chosen: the server then answers for today in the clinic's own timezone.
  const [date, setDate] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<StationMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!getToken) return;
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

  const bottleneck = metrics?.stations.find(
    (station) => station.stationId === metrics.bottleneckStationId,
  );
  const waitChart = (metrics?.stations ?? [])
    .filter((station) => station.wait.medianMinutes !== null)
    .map((station) => ({ name: station.name, median: station.wait.medianMinutes ?? 0 }));

  return (
    <section className="space-y-6" aria-labelledby="station-flow-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div id="station-flow-heading">
          <DashboardSectionHeader
            title="Station flow"
            subtitle={
              metrics
                ? `${metrics.live ? 'Today so far' : metrics.date}, clinic time (${metrics.timezone}).${
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

      {error ? (
        <InlineErrorState
          title="Station flow could not be loaded"
          description={error}
          onRetry={() => setReload((count) => count + 1)}
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

          {bottleneck ? (
            <p
              className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
              data-testid="station-flow-bottleneck"
            >
              <span className="font-semibold">Longest wait: {bottleneck.name}.</span> Half of the{' '}
              {bottleneck.wait.n} patients waited {formatMinutes(bottleneck.wait.medianMinutes)} or
              more to be taken, and 1 in 10 waited over {formatMinutes(bottleneck.wait.p90Minutes)}.
              {metrics.bottleneckConstraint === 'CAPACITY'
                ? ` At its busiest every place there was in use (${bottleneck.peakInUse} of ${bottleneck.capacity}), so the wait was for space or equipment, not just staff.`
                : metrics.bottleneckConstraint === 'STAFFING'
                  ? ` It never filled (at most ${bottleneck.peakInUse} of ${bottleneck.capacity} places in use), so the wait was for someone to take them.`
                  : ''}
            </p>
          ) : null}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">By station</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm" data-testid="station-flow-table">
                <caption className="sr-only">Wait and service time at each station</caption>
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
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
                      <tr key={station.stationId} className="border-b last:border-0">
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
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Median wait by station</CardTitle>
              </CardHeader>
              <CardContent>
                {waitChart.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nobody has been taken yet.</p>
                ) : waitChart.every((row) => row.median === 0) ? (
                  <p className="text-sm text-muted-foreground">
                    Every station took its patients within a minute, so there is nothing to compare.
                  </p>
                ) : (
                  <div
                    className="w-full"
                    style={{ height: Math.max(160, waitChart.length * 44) }}
                    role="img"
                    aria-label={`Median wait by station: ${waitChart
                      .map((row) => `${row.name} ${formatMinutes(row.median)}`)
                      .join(', ')}.`}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={waitChart}
                        layout="vertical"
                        margin={{ top: 4, right: 56, bottom: 4, left: 8 }}
                      >
                        <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
                        <XAxis type="number" tick={TICK} unit=" min" allowDecimals={false} />
                        <YAxis type="category" dataKey="name" tick={TICK} width={140} />
                        <Tooltip
                          cursor={{ fill: 'hsl(var(--muted))' }}
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(value) => [formatMinutes(Number(value)), 'Median wait']}
                        />
                        <Bar dataKey="median" fill={ARRIVALS} radius={[0, 4, 4, 0]} barSize={18}>
                          <LabelList
                            dataKey="median"
                            position="right"
                            formatter={(value: unknown) => formatMinutes(Number(value))}
                            style={{ ...TICK, fill: 'hsl(var(--foreground))' }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Arrivals and completions by hour
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div
                  className="h-[240px] w-full"
                  role="img"
                  aria-label="Patients checked in and sessions completed in each clinic hour. The same figures are in the table below."
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
                      <Tooltip
                        cursor={{ fill: 'hsl(var(--muted))' }}
                        contentStyle={TOOLTIP_STYLE}
                      />
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
                </div>
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">
                    Show as a table
                  </summary>
                  <table className="mt-2 w-full tabular-nums">
                    <caption className="sr-only">Arrivals and completions by hour</caption>
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th scope="col" className="py-1 font-medium">
                          Hour
                        </th>
                        <th scope="col" className="py-1 text-right font-medium">
                          Checked in
                        </th>
                        <th scope="col" className="py-1 text-right font-medium">
                          Completed
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.hourly.map((row) => (
                        <tr key={row.hour}>
                          <th scope="row" className="py-1 text-left font-normal">
                            {row.hour}
                          </th>
                          <td className="py-1 text-right">{row.checkedIn}</td>
                          <td className="py-1 text-right">{row.completed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </CardContent>
            </Card>
          </div>

          {metrics.live && metrics.staffing.onShiftNow !== null ? (
            <p className="text-sm text-muted-foreground">
              {metrics.staffing.onShiftNow} staff on shift now.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
