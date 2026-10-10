/*
  First retry fast, later retries patient.

  BullMQ's exponential backoff from 60s made the first retry the dominant delay after a blip that
  had already resolved. A transient failure is usually over in seconds, so try again in five; if it
  is still failing after that, it is not a blip and the longer wait is the right one.

  The producer and the worker both read this file. BullMQ only consults a worker's custom
  `backoffStrategy` for a job whose backoff type it does not know, so the jobs used to be queued
  as `exponential` and this schedule never ran: retries fired at 60s and 120s while the comment
  and the notifications spec both said 5s and 60s.
*/
export const FIRST_RETRY_DELAY_MS = 5_000;
export const LATER_RETRY_DELAY_MS = 60_000;

/** How many times a reminder send is attempted before the row is marked failed. */
export const REMINDER_SEND_ATTEMPTS = 3;

/** A backoff type BullMQ does not define, so it hands the delay to `reminderRetryDelay`. */
export const REMINDER_BACKOFF = { type: 'reminder' } as const;

/** The wait before the next attempt, given how many attempts have been made. */
export function reminderRetryDelay(attemptsMade: number): number {
  return attemptsMade <= 1 ? FIRST_RETRY_DELAY_MS : LATER_RETRY_DELAY_MS;
}
