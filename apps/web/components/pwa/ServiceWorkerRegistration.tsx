'use client';

import { useEffect } from 'react';

/** In `next dev` the worker fights HMR, so it registers only in production unless asked (#206). */
export const serviceWorkerEnabled =
  process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_ENABLE_SW === 'true';

/**
 * Registers the service worker from the root layout, so marketing and sign-in pages warm the shell
 * cache too, not only signed-in workspace pages (#206).
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!serviceWorkerEnabled || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/service-worker.js', { scope: '/', updateViaCache: 'none' })
      .catch((err) => console.warn('SW registration failed:', err));
  }, []);

  return null;
}
