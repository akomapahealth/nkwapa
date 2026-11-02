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

/**
 * The station line right now, one lane per open station. A lane's bar is the longest current
 * wait, minutes since that patient joined the station's queue (`queuedAt`), on a labelled scale.
 * Past 20 minutes it takes the warning tokens and says so in words, and a station nobody is
 * staffing says that too, so neither depends on colour. Aggregates only; no patient is named.
 */
export function StationLineLanes({ stations }: { stations: StationMetrics['stations'] }) {
  const open = stations.filter((station) => station.active);
  if (open.length === 0) return null;

  const end = scaleEnd(Math.max(0, ...open.map((s) => s.longestCurrentWaitMinutes ?? 0)));
  const step = end <= 60 ? 10 : 30;
  const ticks = Array.from({ length: end / step + 1 }, (_, index) => index * step);
  const at = (minutes: number) => `${(Math.min(minutes, end) / end) * 100}%`;

  return (
    <section aria-labelledby="station-line-now" className="border-t-2 border-rule-strong pt-3">
      <h3 id="station-line-now" className="type-label pt-2.5 text-foreground">
        Station line now
      </h3>
      <p className="type-label mt-1 font-normal text-muted-foreground">
        Bars show the longest current wait at each station, from when the patient joined its queue.
      </p>
      <ul className="mt-2">
        {open.map((station) => {
          const longest = station.longestCurrentWaitMinutes ?? 0;
          const waiting = station.waitingNow ?? 0;
          const long = waiting > 0 && longest > LONG_WAIT_MINUTES;
          const unstaffed = station.staffNow === 0;
          return (
            <li
              key={station.stationId}
              className="grid gap-x-4 gap-y-1.5 border-b border-rule py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-center"
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
                  <p className="type-label mt-0.5 flex flex-wrap gap-x-3 text-warning-ink">
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
              {/* The words above carry the reading; the bar is the same figure drawn. */}
              <div aria-hidden="true" className="relative h-3 rounded-sm bg-muted">
                <div
                  className={cn(
                    'absolute inset-y-0 left-0 rounded-sm',
                    long ? 'bg-warning' : 'bg-chart-1',
                  )}
                  style={{ width: waiting ? at(longest) : '0%' }}
                />
                <div
                  className="absolute -inset-y-1 border-l border-dashed border-foreground/50"
                  style={{ left: at(LONG_WAIT_MINUTES) }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {/* The scale, aligned with the bars' column. */}
      <div className="grid gap-x-4 pt-1.5 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <span className="hidden sm:block" />
        <div aria-hidden="true" className="relative h-5 text-xs tabular-nums text-muted-foreground">
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
      </div>
      <p className="sr-only">
        Scale from 0 to {end} minutes; the dashed line marks {LONG_WAIT_MINUTES} minutes.
      </p>
    </section>
  );
}
