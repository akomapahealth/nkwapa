import { AsyncLocalStorage } from 'node:async_hooks';
import type { OfflineSessionStamp } from '@nkwapa/db';

/**
 * The inbound request's identity, available to any code running during it.
 *
 * Audit events are written by services deep in a call stack, and every one of them needed the
 * request id, caller address, and user agent threaded down to it by hand. Where that threading was
 * missed the service invented a fresh id instead, which silently broke correlation: the writes a
 * single request performed could no longer be tied together, and the caller was unknown. Making it
 * ambient means correctness stops depending on every future call site remembering.
 */
export interface RequestContextValue {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

const storage = new AsyncLocalStorage<RequestContextValue>();

export function runWithRequestContext<T>(value: RequestContextValue, fn: () => T): T {
  return storage.run(value, fn);
}

export function getRequestContext(): RequestContextValue | undefined {
  return storage.getStore();
}

const offlineSessionStorage = new AsyncLocalStorage<OfflineSessionStamp>();

/**
 * Run `fn` as the replay of one write queued in an offline session (#207), so every audit event it
 * causes records the grant, device and unlock method, however deep in a service it is written.
 * Scoped per write, not per request: one push can carry offline and online changes together.
 */
export function runWithOfflineSession<T>(stamp: OfflineSessionStamp, fn: () => T): T {
  return offlineSessionStorage.run(stamp, fn);
}

export function getOfflineSession(): OfflineSessionStamp | undefined {
  return offlineSessionStorage.getStore();
}
