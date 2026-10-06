import type { SyncStatus } from './sync';

/**
 * When to try again by itself after a pass that did not finish the queue.
 *
 * A failed pass told the clinician "Sync will try again shortly", and a refused-but-retryable
 * change "will be retried", yet nothing scheduled either: the queue moved only when the
 * connection dropped and came back, the clinic changed, or someone pressed Sync now. On clinic
 * wifi that stays nominally online while the API is down, that was never.
 *
 * Retries back off so a server that is struggling is not hammered by every open tab, and stop at
 * five minutes apart rather than giving up, because the work is still on the device waiting.
 */
export const AUTOMATIC_SYNC_RETRY_DELAYS_MS = [10_000, 30_000, 60_000, 120_000, 300_000] as const;

/**
 * The wait before the next automatic pass, or null when the last pass needs no follow-up.
 *
 * `attention` is deliberately excluded: those changes wait on the clinician, and re-sending them
 * would only spend the rate limit on an answer that cannot change.
 *
 * @param consecutive How many automatic retries have already been scheduled since the last pass
 * that left nothing to retry.
 */
export function automaticSyncRetryDelay(status: SyncStatus, consecutive: number): number | null {
  if (status !== 'error' && status !== 'retrying') return null;
  const index = Math.min(Math.max(consecutive, 0), AUTOMATIC_SYNC_RETRY_DELAYS_MS.length - 1);
  return AUTOMATIC_SYNC_RETRY_DELAYS_MS[index];
}
