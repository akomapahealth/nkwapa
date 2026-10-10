import { CLINIC_DEFAULT_TIMEZONE, resolveTimeZone } from './clinic-metadata';

/**
 * Turning a clinic's calendar day into the UTC instants that bound it.
 *
 * A clinic's operational day is a local day: "today's check-ins" means the ones that happened
 * between local midnight and local midnight, in the clinic's own time zone. Timestamps are
 * stored as UTC instants, so answering that question means converting the local day boundaries
 * into instants, which is what this module does.
 *
 * It is deliberately separate from `clinic-metadata.ts`: that module decides whether a time zone
 * is *valid*, this one uses one. It is also deliberately dependency-free -- `Intl` already knows
 * every offset and every daylight-saving transition, so there is nothing here a date library
 * would do better.
 */

/** How far ahead of UTC `timeZone` is at a given instant, in milliseconds. */
function timeZoneOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);

  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  // Some implementations render midnight as hour 24 rather than 0.
  const hour = read('hour') === 24 ? 0 : read('hour');

  const asIfUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    hour,
    read('minute'),
    read('second'),
  );
  return asIfUtc - at.getTime();
}

/**
 * The `YYYY-MM-DD` an instant falls on, in the given zone.
 *
 * Built from parts rather than from a locale's formatted string. `en-CA` happens to render
 * ISO-ish dates today, but that is a locale-data detail, and this value is compared against
 * dates that come off the wire.
 */
function localDate(timeZone: string, at: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);

  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${read('year')}-${read('month')}-${read('day')}`;
}

/** Falls back to the default zone rather than throwing, so a drifted clinic still answers. */
function usableTimeZone(timeZone: string | null | undefined): string {
  const resolved = resolveTimeZone(timeZone);
  return resolved.ok ? resolved.canonical : CLINIC_DEFAULT_TIMEZONE;
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/**
 * The instant a local calendar day begins in `timeZone`.
 *
 * The offset has to be looked up twice. The first lookup uses the wall-clock time read as if it
 * were UTC, which is wrong by exactly the offset; the second uses the instant that guess
 * produced, which is right even when a daylight-saving change falls in between.
 *
 * When a zone springs forward *at* midnight -- Santiago, Havana and Lord Howe all do -- local
 * midnight does not exist that day, and the arithmetic lands an hour into the previous day.
 * The day then starts at the transition instead, which is what the loop below walks forward to.
 */
export function startOfDayInTimeZone(date: string, timeZone: string | null | undefined): Date {
  const zone = usableTimeZone(timeZone);
  const wallClock = Date.parse(`${date}T00:00:00.000Z`);
  if (Number.isNaN(wallClock)) {
    throw new RangeError(`startOfDayInTimeZone: "${date}" is not a YYYY-MM-DD date.`);
  }

  const firstGuess = wallClock - timeZoneOffsetMs(zone, new Date(wallClock));
  let start = new Date(wallClock - timeZoneOffsetMs(zone, new Date(firstGuess)));

  // Transitions land on at least a 15-minute boundary, and no gap is longer than a couple of
  // hours, so this settles in a handful of steps or not at all.
  for (let step = 0; step < 16 && localDate(zone, start) < date; step += 1) {
    start = new Date(start.getTime() + 15 * MINUTE_MS);
  }

  return start;
}

/** Today's `YYYY-MM-DD` in `timeZone`, which is not always today's UTC date. */
export function todayInTimeZone(timeZone: string | null | undefined, now = new Date()): string {
  return localDate(usableTimeZone(timeZone), now);
}

export interface ClinicDayWindow {
  /** The `YYYY-MM-DD` this window covers. */
  date: string;
  /** The zone it was resolved in, canonicalised, after any fallback. */
  timezone: string;
  /** First instant of the local day. */
  start: Date;
  /** Last instant of the local day, inclusive. */
  end: Date;
}

/**
 * The UTC window covering one local day at a clinic.
 *
 * `end` is inclusive -- the final millisecond of the local day -- because the queries that use
 * it are written as `gte: start, lte: end`. It is derived from the *next* day's start rather
 * than by adding 24 hours, so a day shortened or lengthened by a daylight-saving change is
 * still exactly one day.
 */
export function clinicDayWindow(
  date: string | null | undefined,
  timeZone: string | null | undefined,
): ClinicDayWindow {
  const zone = usableTimeZone(timeZone);
  const resolvedDate = date ?? todayInTimeZone(zone);
  const start = startOfDayInTimeZone(resolvedDate, zone);
  const nextDate = new Date(Date.parse(`${resolvedDate}T00:00:00.000Z`) + DAY_MS)
    .toISOString()
    .slice(0, 10);
  const end = new Date(startOfDayInTimeZone(nextDate, zone).getTime() - 1);

  return { date: resolvedDate, timezone: zone, start, end };
}
