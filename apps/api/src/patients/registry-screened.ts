import { BadRequestException } from '@nestjs/common';
import { clinicDayWindow } from '@nkwapa/db';

/** Longest completed-screening range the registry accepts, in days, inclusive. */
export const SCREENED_RANGE_MAX_DAYS = 366;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ScreenedRange {
  from: string;
  to: string;
}

/** The UTC instants a clinic-local day range covers; `end` is inclusive. */
export interface ScreenedWindow extends ScreenedRange {
  timezone: string;
  start: Date;
  end: Date;
}

function invalid(code: string, field: string, message: string): BadRequestException {
  return new BadRequestException({ code, message, fieldErrors: [{ field, message }] });
}

function isCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Checks `screenedFrom` / `screenedTo` before anything is queried. Only `from` means that one
 * day. The DTO has already checked the YYYY-MM-DD shape; this catches 2026-02-30 and bad ranges.
 */
export function parseScreenedRange(
  from: string | undefined,
  to: string | undefined,
): ScreenedRange | undefined {
  if (!from && !to) return undefined;
  if (!from) {
    throw invalid(
      'SCREENED_FROM_REQUIRED',
      'screenedFrom',
      'Choose a start date for the screened range.',
    );
  }
  if (!isCalendarDate(from)) {
    throw invalid('INVALID_DATE', 'screenedFrom', 'That start date does not exist.');
  }
  if (to && !isCalendarDate(to)) {
    throw invalid('INVALID_DATE', 'screenedTo', 'That end date does not exist.');
  }
  const end = to ?? from;
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
  if (days < 1) {
    throw invalid(
      'INVALID_DATE_RANGE',
      'screenedTo',
      'The start date must be on or before the end date.',
    );
  }
  if (days > SCREENED_RANGE_MAX_DAYS) {
    throw invalid(
      'DATE_RANGE_TOO_LONG',
      'screenedTo',
      `Choose ${SCREENED_RANGE_MAX_DAYS} days or fewer.`,
    );
  }
  return { from, to: end };
}

/** First instant of `from` to the last instant of `to`, both in the clinic's timezone. */
export function screenedWindow(range: ScreenedRange, timeZone: string): ScreenedWindow {
  const first = clinicDayWindow(range.from, timeZone);
  return {
    ...range,
    timezone: first.timezone,
    start: first.start,
    end: clinicDayWindow(range.to, timeZone).end,
  };
}
