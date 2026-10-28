/** Longest range the registry API accepts, in days, inclusive. Mirrors the API's limit. */
export const SCREENED_RANGE_MAX_DAYS = 366;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ScreenedPreset = 'any' | 'today' | 'last7' | 'custom';

export const SCREENED_PRESET_LABELS: Record<ScreenedPreset, string> = {
  any: 'Any time',
  today: 'Today',
  last7: 'Last 7 days',
  custom: 'Custom range',
};

/** One matching screening, as the registry API returns it. */
export interface MatchingScreening {
  date: string;
  completedAt: string | null;
  source: 'REVIEW_STATION' | 'LEGACY_CHECKIN';
  checkInId: string;
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The from/to a preset stands for, given today's clinic-local date. */
export function presetRange(preset: ScreenedPreset, today: string): { from: string; to: string } {
  if (preset === 'today') return { from: today, to: '' };
  if (preset === 'last7') return { from: addDays(today, -6), to: today };
  return { from: '', to: '' };
}

/** Which preset a from/to pair (say, from a shared link) reads as. */
export function presetFor(from: string, to: string, today: string): ScreenedPreset {
  if (!from && !to) return 'any';
  if (from === today && (!to || to === today)) return 'today';
  if (from === addDays(today, -6) && to === today) return 'last7';
  return 'custom';
}

/**
 * The same checks the API makes, so a bad range is explained beside the date fields instead of
 * being sent and refused. `null` means the range can be sent.
 */
export function screenedRangeError(
  from: string,
  to: string,
): { field: 'from' | 'to'; message: string } | null {
  if (!from && !to) return null;
  if (!from) return { field: 'from', message: 'Choose a start date.' };
  if (!to) return null;
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
  if (days < 1) return { field: 'to', message: 'The end date must be on or after the start date.' };
  if (days > SCREENED_RANGE_MAX_DAYS) {
    return { field: 'to', message: `Choose ${SCREENED_RANGE_MAX_DAYS} days or fewer.` };
  }
  return null;
}

const DAY_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "10 Oct 2026". The date is already clinic-local, so it is formatted as-is. */
export function formatScreenedDay(date: string): string {
  return DAY_FORMAT.format(new Date(`${date}T12:00:00Z`));
}

/** "10 Oct 2026", or "1 Oct 2026 and 15 Oct 2026" for a range, for sentences. */
export function describeScreenedRange(from: string, to: string): { single: boolean; text: string } {
  if (!to || to === from) return { single: true, text: formatScreenedDay(from) };
  return { single: false, text: `${formatScreenedDay(from)} and ${formatScreenedDay(to)}` };
}

/** "23 patients screened 10 Oct 2026" or "… screened between X and Y". */
export function screenedCountLine(total: number, from: string, to: string): string {
  const range = describeScreenedRange(from, to);
  const who = `${total} ${total === 1 ? 'patient' : 'patients'}`;
  return range.single ? `${who} screened ${range.text}` : `${who} screened between ${range.text}`;
}

/** A matching screening as one line: its day, and its time or that none was kept. */
export function describeScreening(screening: MatchingScreening, timeZone: string): string {
  const day = formatScreenedDay(screening.date);
  if (!screening.completedAt) return `${day} (time not recorded)`;
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(screening.completedAt));
  return `${day}, ${time}`;
}
