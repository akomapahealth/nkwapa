import { randomInt } from 'crypto';
import type { ResearchScheduleCadence } from '@prisma/client';
import { localHourInTimeZone, todayInTimeZone } from '@nkwapa/db';

/**
 * Run keys and schedule cadence for research exports (#166).
 *
 * A run key is `rx-<clinicKey8>-<period>[-r<n>]`. It is deterministic per clinic and period, so a
 * unique constraint, the BullMQ job id and the storage path derived from it turn a duplicate
 * trigger into a no-op. `clinicKey8` is the start of the HMAC research clinic key, never the
 * clinic's id, so a key is safe to quote in a paper or a ticket.
 */

export const RUN_KEY_PATTERN =
  /^rx-[0-9a-z]{6,8}-(w\d{4}-\d{2}|m\d{4}-\d{2}|a\d{8}-[0-9a-z]{4,6})(-r\d+)?$/;

export interface ScheduleCadence {
  cadence: ResearchScheduleCadence;
  /** ISO day of week, 1 (Monday) to 7. */
  dayOfWeek: number | null;
  /** 1 to 28. */
  dayOfMonth: number | null;
  localHour: number;
}

const DAY_MS = 86_400_000;

function utcDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function addDays(date: string, days: number): string {
  return new Date(utcDate(date).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** ISO weekday of a calendar date: 1 is Monday, 7 is Sunday. */
export function isoWeekday(date: string): number {
  return utcDate(date).getUTCDay() || 7;
}

/**
 * ISO 8601 week of a calendar date. The week belongs to the year its Thursday falls in, which is
 * why 2026-12-31 is week 53 of 2026 and 2027-01-01 is too.
 */
export function isoWeek(date: string): { year: number; week: number } {
  const thursday = utcDate(addDays(date, 4 - isoWeekday(date)));
  const year = thursday.getUTCFullYear();
  const firstOfYear = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday.getTime() - firstOfYear) / DAY_MS / 7) + 1;
  return { year, week };
}

function clinicKeyPrefix(clinicKey: string): string {
  if (!/^[0-9a-f]{8,}$/.test(clinicKey)) {
    throw new Error('A run key needs the research clinic key, not an internal id.');
  }
  return clinicKey.slice(0, 8);
}

/** The key for the scheduled run that fires on `localDate`, in the clinic's own calendar. */
export function scheduledRunKey(
  clinicKey: string,
  cadence: ResearchScheduleCadence,
  localDate: string,
): string {
  const prefix = `rx-${clinicKeyPrefix(clinicKey)}`;
  if (cadence === 'WEEKLY') {
    const { year, week } = isoWeek(localDate);
    return `${prefix}-w${year}-${String(week).padStart(2, '0')}`;
  }
  return `${prefix}-m${localDate.slice(0, 7)}`;
}

/** An ad-hoc run: the day it was asked for plus a short random suffix, since there can be several. */
export function adHocRunKey(clinicKey: string, localDate: string): string {
  const suffix = Array.from({ length: 4 }, () => randomInt(36).toString(36)).join('');
  return `rx-${clinicKeyPrefix(clinicKey)}-a${localDate.replaceAll('-', '')}-${suffix}`;
}

/** Revision `n` (2 or more) of a run: a deliberate rerun of the same period. */
export function revisionRunKey(runKey: string, revision: number): string {
  if (!Number.isInteger(revision) || revision < 2) {
    throw new RangeError('A revision is numbered from 2.');
  }
  return `${baseRunKey(runKey)}-r${revision}`;
}

/** A run key without its revision suffix. */
export function baseRunKey(runKey: string): string {
  return runKey.replace(/-r\d+$/, '');
}

function firesOn(schedule: ScheduleCadence, date: string): boolean {
  return schedule.cadence === 'WEEKLY'
    ? isoWeekday(date) === schedule.dayOfWeek
    : Number(date.slice(8, 10)) === schedule.dayOfMonth;
}

/** The first time the schedule fires strictly after `after`, at its local hour in `timeZone`. */
export function nextRunAt(schedule: ScheduleCadence, timeZone: string, after: Date): Date {
  const today = todayInTimeZone(timeZone, after);
  // Starting a day early covers a zone whose local date is behind the instant's UTC date.
  for (let offset = -1; offset <= 62; offset += 1) {
    const date = addDays(today, offset);
    if (!firesOn(schedule, date)) continue;
    const fire = localHourInTimeZone(date, schedule.localHour, timeZone);
    if (fire.getTime() > after.getTime()) return fire;
  }
  throw new Error('Schedule never fires; its day is out of range.');
}

/**
 * The data range a run fired at `fireAt` covers: from the schedule's coverage start through the
 * last complete local day before it fired.
 */
export function runWindow(
  coverageStartDate: string,
  fireAt: Date,
  timeZone: string,
): { localDate: string; fromDate: string; toDate: string } {
  const localDate = todayInTimeZone(timeZone, fireAt);
  return { localDate, fromDate: coverageStartDate, toDate: addDays(localDate, -1) };
}
