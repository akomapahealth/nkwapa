/**
 * Asks the browser to keep this site's storage, the outbox included, when space runs low (#206).
 * Asked after every sign-in rather than only when installed: the outbox needs it either way, and
 * Chromium grants it silently for installed or engaged sites without a prompt. Safari also keeps an
 * app added to the Home Screen out of its seven-day eviction.
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export interface StorageDiagnostics {
  /** null when the browser cannot say. */
  persisted: boolean | null;
  usageBytes: number | null;
  quotaBytes: number | null;
}

/** For the sync center, so support can see why a device lost queued work. */
export async function getStorageDiagnostics(): Promise<StorageDiagnostics> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
  const [persisted, estimate] = await Promise.all([
    storage?.persisted?.().catch(() => null) ?? null,
    storage?.estimate?.().catch(() => null) ?? null,
  ]);
  return {
    persisted,
    usageBytes: estimate?.usage ?? null,
    quotaBytes: estimate?.quota ?? null,
  };
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'unknown';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
