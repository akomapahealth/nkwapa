/**
 * Where one run of a queued job sits in its retry budget.
 *
 * A worker that records a failure on every attempt shows an operator a failure that is still being
 * retried; one that records none leaves the row looking healthy after the last attempt gave up.
 * Both workers need the same answer to "is this the last try?", so it is computed once here.
 */
export interface JobAttempt {
  /** Attempts already made before this one. */
  attemptsMade: number;
  maxAttempts: number;
}

/**
 * Read for callers outside the queue, and for jobs queued before a retry budget was set: one
 * attempt is the honest reading of that, and matches how those jobs always behaved.
 */
export const SINGLE_FINAL_ATTEMPT: JobAttempt = { attemptsMade: 0, maxAttempts: 1 };

/**
 * Read defensively: a worker outlives the shape of what is already queued, and a job missing an
 * option should not crash on it.
 */
export function jobAttempt(job: {
  attemptsMade?: number;
  opts?: { attempts?: number };
}): JobAttempt {
  return {
    attemptsMade: job.attemptsMade ?? 0,
    maxAttempts: job.opts?.attempts ?? 1,
  };
}

/** Whether the queue will run this job again if this attempt fails. */
export function hasAttemptsLeft(attempt: JobAttempt): boolean {
  return attempt.attemptsMade + 1 < attempt.maxAttempts;
}
