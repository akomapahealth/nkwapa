'use client';

import { useEffect } from 'react';

const minutes = Number(process.env.NEXT_PUBLIC_OFFLINE_IDLE_LOCK_MINUTES);
/** R2: 10 minutes without input by default. */
export const IDLE_LOCK_MS = (Number.isFinite(minutes) && minutes > 0 ? minutes : 10) * 60_000;

const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/** Call `lock` after `idleMs` with no input, while `active`. */
export function useIdleLock(active: boolean, lock: () => void, idleMs = IDLE_LOCK_MS): void {
  useEffect(() => {
    if (!active) return;
    let timer = window.setTimeout(lock, idleMs);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(lock, idleMs);
    };
    ACTIVITY.forEach((type) => window.addEventListener(type, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      ACTIVITY.forEach((type) => window.removeEventListener(type, reset));
    };
  }, [active, idleMs, lock]);
}
