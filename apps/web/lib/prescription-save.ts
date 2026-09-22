import { ApiError } from '@/lib/api';

/**
 * Whether a failed save may be written to the outbox and replayed.
 *
 * This is the distinction `PrescriptionForm` previously did not draw. A refusal and a
 * dropped connection both arrived as a thrown value, so both were queued, the form reset
 * and the prescriber told the prescription was saved. A queued refusal can only ever
 * collect the same refusal on replay, so the record is lost while reading as recorded.
 *
 * The rule is about whether the server answered, not about what it said. `apiFetch`
 * returns a Response for every answer it receives, however unwelcome, and raises only
 * when nothing came back - a dropped connection or a timeout, both of which carry no
 * status. So an error with a status is the server talking, and is never ours to queue.
 */
export function mayQueueAfterFailure(cause: unknown): boolean {
  return !(cause instanceof ApiError) || cause.status === null;
}

/**
 * Move server-side field errors onto the inputs that display them.
 *
 * Only fields this form actually renders are mapped. Anything else stays out of the
 * field list and is left to the banner, so a validation error on a field the prescriber
 * cannot see never becomes an error with nowhere to appear.
 */
export function mapServerFieldErrors(
  fieldErrors: ReadonlyArray<{ field: string; message: string }>,
  fieldToInput: Readonly<Record<string, string>>,
): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const { field, message } of fieldErrors) {
    const input = fieldToInput[field];
    if (input && !mapped[input]) mapped[input] = message;
  }
  return mapped;
}
