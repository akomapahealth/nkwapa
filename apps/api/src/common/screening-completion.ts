import { ScreeningCompletionStatus } from '@prisma/client';

/**
 * The completion date a screening is allowed to keep.
 *
 * A date only survives while the status says the screening happened. If someone corrects
 * "Completed" to "Not completed" or "Patient unsure", the date goes with it, because a date
 * sitting beside "not completed" reads as a fact about a screening that did not take place.
 *
 * Null is always "not recorded", never "not done". The status column answers whether it
 * happened; this one only ever answers when. Deliberately optional even when COMPLETED, since
 * "sometime last year" is a real answer and demanding a date would invite an invented one.
 */
export function screeningCompletionDate(
  status: ScreeningCompletionStatus | undefined,
  value: string | null | undefined,
): Date | null {
  if (status !== ScreeningCompletionStatus.COMPLETED) return null;
  return value ? new Date(value) : null;
}

/**
 * A date-only column as the wire sees it: `YYYY-MM-DD`, or null.
 *
 * Not an ISO timestamp. These columns are `@db.Date` and carry no time, so sending one would
 * invent a midnight that means nothing and invite a timezone to shift it across a day boundary.
 */
export function toDateOnly(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}
