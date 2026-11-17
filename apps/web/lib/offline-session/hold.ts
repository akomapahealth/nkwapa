import type { OfflineGrantClaims } from '@nkwapa/db/offline-grant';
import { keyringEntries, restoreKeyring } from './keys';
import type { UnlockMethod } from './unlock';

/**
 * Keeping an unlocked offline session across page loads (#207), in the service worker's memory.
 *
 * Offline, every in-app navigation is a full page load, which empties this tab's keyring. The
 * worker holds the session's non-extractable keys meanwhile, and the next page asks for them back.
 * Nothing is written to disk. See the worker's `offlineSessionMessage` for when it lets go.
 */

export interface HeldOfflineSession {
  claims: OfflineGrantClaims;
  unlockMethod: UnlockMethod;
}

function worker(): ServiceWorker | null {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.controller;
}

export function holdOfflineSession(session: HeldOfflineSession, idleMs: number): void {
  worker()?.postMessage({
    type: 'OFFLINE_SESSION_HOLD',
    session,
    keys: keyringEntries(),
    idleMs,
  });
}

/** Activity: the held session stays fresh. Also keeps the worker from being stopped while idle. */
export function touchOfflineSession(): void {
  worker()?.postMessage({ type: 'OFFLINE_SESSION_TOUCH' });
}

export function dropOfflineSession(): void {
  worker()?.postMessage({ type: 'OFFLINE_SESSION_DROP' });
}

/** The session the worker still holds, with its keys loaded back into this tab, or null. */
export async function resumeOfflineSession(timeoutMs = 1500): Promise<HeldOfflineSession | null> {
  const controller = worker();
  if (!controller) return null;
  const reply = await new Promise<unknown>((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => resolve(null), timeoutMs);
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timer);
      resolve(event.data);
    };
    controller.postMessage({ type: 'OFFLINE_SESSION_RESUME' }, [channel.port2]);
  });
  if (!reply || typeof reply !== 'object') return null;
  const { session, keys } = reply as { session?: HeldOfflineSession; keys?: unknown };
  if (
    !session?.claims?.userId ||
    (session.unlockMethod !== 'pin' && session.unlockMethod !== 'webauthn')
  ) {
    return null;
  }
  restoreKeyring(keys);
  return session;
}

const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
const HEARTBEAT_MS = 20_000;

/**
 * While a session is open: tell the worker about activity, at most every 20 seconds, and otherwise
 * ping it, since browsers stop an idle worker after about 30 seconds and its memory with it.
 */
export function keepOfflineSessionAlive(): () => void {
  let active = false;
  const mark = () => {
    active = true;
  };
  ACTIVITY.forEach((type) => window.addEventListener(type, mark, { passive: true }));
  const beat = window.setInterval(() => {
    worker()?.postMessage({ type: active ? 'OFFLINE_SESSION_TOUCH' : 'OFFLINE_SESSION_PING' });
    active = false;
  }, HEARTBEAT_MS);
  return () => {
    window.clearInterval(beat);
    ACTIVITY.forEach((type) => window.removeEventListener(type, mark));
  };
}
