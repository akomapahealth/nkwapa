/**
 * Sync status broadcast, split from lib/sync.ts so code mounted outside the workspace (the service
 * worker update flow, #206) can listen without pulling Dexie into every page.
 *
 * - `retrying`: the pass completed, but some changes stayed queued because the server said they
 *   could still succeed later. Nothing needs the clinician.
 * - `attention`: the pass completed, but some changes are blocked until the clinician retries,
 *   opens the record, or discards them. Inbound data still arrived.
 * - `error`: the pass itself failed, so nothing was confirmed either way.
 */
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'retrying' | 'attention' | 'error';

export type SyncStatusListener = (status: SyncStatus, message?: string, detail?: string) => void;

const listeners: Set<SyncStatusListener> = new Set();

export function onSyncStatusChange(listener: SyncStatusListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyStatus(status: SyncStatus, message?: string, detail?: string) {
  listeners.forEach((fn) => fn(status, message, detail));
}
