/**
 * Where the sample appointments have to sit so the schedule can actually show them.
 *
 * The staff schedule's week view renders exactly one Monday-start week, the one containing today
 * (`getWeekStart` in `apps/web/app/(workspace)/appointments/page.tsx`). The seed placed its
 * fixtures at `now + 26h` and `now - 48h`, which silently fall outside that week near its edges:
 *
 *   - `now + 26h` crosses into next Monday whenever the suite runs on a Sunday, or after roughly
 *     22:00 on a Saturday. The whole confirmed row then vanishes from the view, and with it the
 *     "Open appointment actions" control that four specs depend on.
 *   - `now - 48h` falls into the previous week on a Monday or Tuesday, taking the terminal rows
 *     with it.
 *
 * Together that is a fixture set which fails for roughly three days out of seven, depending on
 * which specs are looking. It went unnoticed because CI happened to run mid-week; the failure was
 * first seen on a Sunday.
 *
 * These helpers keep the original offsets wherever they are safe and clamp them into the visible
 * week where they are not.
 */

const HOUR_MS = 60 * 60 * 1000;

/** Monday 00:00 UTC of the week containing `reference`, matching the schedule's own arithmetic. */
export function weekStartUtc(reference: Date): Date {
  const start = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()),
  );
  const day = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return start;
}

function atHourOfWeek(reference: Date, dayOffset: number, hour: number): Date {
  const day = weekStartUtc(reference);
  day.setUTCDate(day.getUTCDate() + dayOffset);
  day.setUTCHours(hour, 0, 0, 0);
  return day;
}

/**
 * The confirmed, still-upcoming visit: `reference + 26h`, pulled back to Sunday 21:00 of this week
 * when that would cross into the next one.
 *
 * It stays genuinely in the future for all but the last few hours of a Sunday. Past that it is a
 * past CONFIRMED row, which still renders its lifecycle menu -- the menu is gated on status, not
 * on time -- so the specs hold either way.
 */
export function confirmedVisitStart(reference: Date): Date {
  const preferred = new Date(reference.getTime() + 26 * HOUR_MS);
  const latestInWeek = atHourOfWeek(reference, 6, 21);
  return preferred <= latestInWeek ? preferred : latestInWeek;
}

/**
 * The terminal rows (completed, cancelled, no-show): `reference - 48h`, pushed forward to Monday
 * 01:00 of this week when that would fall into the previous one.
 */
export function terminalVisitStart(reference: Date): Date {
  const preferred = new Date(reference.getTime() - 48 * HOUR_MS);
  const earliestInWeek = atHourOfWeek(reference, 0, 1);
  return preferred >= earliestInWeek ? preferred : earliestInWeek;
}

/** True when `at` falls inside the Monday-start week the schedule would show for `reference`. */
export function isInVisibleWeek(reference: Date, at: Date): boolean {
  const start = weekStartUtc(reference);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return at >= start && at < end;
}
