'use client';

import { useEffect } from 'react';
import { showToast } from '@/components/ui/toast';
import { createUpdateController } from '@/lib/pwa/update';
import { onSyncStatusChange, type SyncStatus } from '@/lib/sync-status';

/** In `next dev` the worker fights HMR, so it registers only in production unless asked (#206). */
export const serviceWorkerEnabled =
  process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_ENABLE_SW === 'true';

const UPDATE_TOAST_ID = 'pwa-update';

/**
 * Registers the service worker from the root layout, so marketing and sign-in pages warm the shell
 * cache too, not only signed-in workspace pages, and offers a reload when a new version is ready
 * (#206).
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!serviceWorkerEnabled || !('serviceWorker' in navigator)) return;

    // Read from the sync module rather than useSync(): this mounts above the workspace provider.
    let syncStatus: SyncStatus = 'idle';
    const stopTrackingSync = onSyncStatusChange((status) => {
      syncStatus = status;
    });
    const isSyncing = () => syncStatus === 'syncing';

    let cleanup: () => void = () => undefined;
    navigator.serviceWorker
      .register('/service-worker.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        const controller = createUpdateController({
          registration,
          container: navigator.serviceWorker,
          isSyncing,
          onSyncChange: (listener) => onSyncStatusChange(() => listener()),
          reload: () => window.location.reload(),
          onUpdateReady: () =>
            showToast({
              id: UPDATE_TOAST_ID,
              title: 'A new version of Nkwapa is ready',
              description: 'Reload when you have saved what you are working on.',
              tone: 'info',
              durationMs: 0,
              action: {
                label: 'Reload',
                onClick: () => {
                  if (isSyncing()) {
                    showToast({
                      id: UPDATE_TOAST_ID,
                      title: 'Reloading after the sync finishes',
                      tone: 'loading',
                      durationMs: 0,
                    });
                  }
                  controller.applyUpdate();
                },
              },
            }),
        });

        const onVisible = () => {
          if (document.visibilityState === 'visible') controller.checkForUpdate();
        };
        document.addEventListener('visibilitychange', onVisible);
        const interval = window.setInterval(controller.checkForUpdate, 5 * 60 * 1000);
        cleanup = () => {
          document.removeEventListener('visibilitychange', onVisible);
          window.clearInterval(interval);
        };
      })
      .catch((err) => console.warn('SW registration failed:', err));

    return () => {
      stopTrackingSync();
      cleanup();
    };
  }, []);

  return null;
}
