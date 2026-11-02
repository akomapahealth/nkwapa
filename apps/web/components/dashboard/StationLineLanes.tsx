'use client';

import { AlertTriangle, UserX } from 'lucide-react';
import { formatMinutes, type StationMetrics } from '@/lib/stations';
import { cn } from '@/lib/utils';

/** Past this, a wait is long enough that a manager should step in (MASTER.md section 12). */
export const LONG_WAIT_MINUTES = 20;

/** The scale's end: at least 30 minutes, rounded up to the next 10 past the longest wait. */
function scaleEnd(longest: number) {
  return Math.max(30, Math.ceil(longest / 10) * 10);
}

const LANE_GRID = 'sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_4.5rem]';

/**
 * The station line right now, one lane per open station. A lane's bar is the longest current
 * wait, minutes since that patient joined the station's queue (`queuedAt`), on a labelled scale.
 * Past 20 minutes it takes the warning tokens and says so in words, and a station nobody is
 * staffing says that too, so neither depends on colour. Aggregates only; no patient is named.
 */
export function StationLineLanes({
  stations,
  onShiftNow,
}: {
  stations: StationMetrics['stations'];
  onShiftNow: number | null;
}) {
  const open = stations.filter((station) => station.active);
  if (open.length === 0) return null;

  const end = scaleEnd(Math.max(0, ...open.map((s) => s.longestCurrentWaitMinutes ?? 0)));
  const step = end <= 60 ? 10 : 30;
  const ticks = Array.from({ length: end / step + 1 }, (_, index) => index * step);
  const at = (minutes: number) => `${(Math.min(minutes, end) / end) * 100}%`;

  return (
    <section aria-labelledby="station-line-now" className="border-t-2 border-rule-strong pt-3">
      <div className="flex flex-wrap items-baseline gap-x-3 pt-2.5">
        <h3 id="station-line-now" className="type-label text-foreground">
          Station line now
        </h3>
        <p className="type-label font-normal text-muted-foreground">
          longest wait at each station, from when the patient joined its queue
        </p>
      </div>

      {/* Column heads and the scale, aligned with the bars' column. */}
      <div
        aria-hidden="true"
        className={cn(
          'mt-3 hidden border-b border-rule pb-1.5 text-xs text-muted-foreground sm:grid sm:gap-x-4',
          LANE_GRID,
        )}
      >
        <span>Station</span>
        <div className="relative h-4 whitespace-nowrap tabular-nums">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
              style={{ left: at(tick) }}
            >
              {tick} min
            </span>
          ))}
        </div>
        <span className="text-right">Staffed</span>
      </div>

      <ul>
        {open.map((station) => {
          const longest = station.longestCurrentWaitMinutes ?? 0;
          const waiting = station.waitingNow ?? 0;
          const long = waiting > 0 && longest > LONG_WAIT_MINUTES;
          const unstaffed = station.staffNow === 0;
          const staffed =
            station.staffNow === null ? null : `${station.staffNow} of ${station.capacity ?? 1}`;
          return (
            <li
              key={station.stationId}
              className={cn(
                'grid gap-x-4 gap-y-1.5 border-b border-rule py-3 sm:items-center',
                LANE_GRID,
              )}
              data-testid="station-lane"
            >
              <div className="min-w-0">
                <p className="type-label truncate text-foreground">{station.name}</p>
                <p className="type-label font-normal text-muted-foreground">
                  {waiting === 0
                    ? 'No one waiting'
                    : `${waiting} waiting, longest ${formatMinutes(longest)}`}
                </p>
                {long || unstaffed ? (
                  <p className="type-label mt-0.5 flex flex-wrap gap-x-3 font-normal text-warning-ink">
                    {long ? (
                      <span className="inline-flex items-center gap-1">
                        <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
                        Over {LONG_WAIT_MINUTES} minutes
                      </span>
                    ) : null}
                    {unstaffed ? (
                      <span className="inline-flex items-center gap-1">
                        <UserX aria-hidden="true" className="h-3.5 w-3.5" />
                        No one staffing
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </div>
              {/* The words beside it carry the reading; the bar is the same figure drawn. */}
              <div aria-hidden="true" className="relative h-7 sm:h-auto sm:self-stretch">
                {ticks.map((tick) => (
                  <div
                    key={tick}
                    className={cn(
                      'absolute -inset-y-1 border-l sm:-inset-y-3',
                      tick === LONG_WAIT_MINUTES ? 'border-dashed border-warning' : 'border-rule',
                    )}
                    style={{ left: at(tick) }}
                  />
                ))}
                {waiting ? (
                  <div
                    className={cn(
                      'absolute left-0 top-1/2 flex h-6 -translate-y-1/2 items-center overflow-hidden whitespace-nowrap rounded-sm px-2 text-xs tabular-nums',
                      long
                        ? 'border border-warning bg-warning-surface text-warning-ink'
                        : 'bg-primary text-primary-foreground',
                    )}
                    style={{ width: at(Math.max(longest, end / 15)) }}
                  >
                    {formatMinutes(longest)}
                  </div>
                ) : null}
              </div>
              <p className="type-label font-normal tabular-nums text-muted-foreground sm:text-right">
                {staffed ? (
                  <>
                    <span className="sm:sr-only">Staffed </span>
                    {staffed}
                  </>
                ) : null}
              </p>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span aria-hidden="true" className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm bg-primary" />
          Longest wait
        </span>
        <span aria-hidden="true" className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm border border-warning bg-warning-surface" />
          Over {LONG_WAIT_MINUTES} minutes
        </span>
        {onShiftNow !== null ? <span>{onShiftNow} staff on shift now.</span> : null}
      </div>
      <p className="sr-only">
        Scale from 0 to {end} minutes; the dashed line marks {LONG_WAIT_MINUTES} minutes.
      </p>
    </section>
  );
}
