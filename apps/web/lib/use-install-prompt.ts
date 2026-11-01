'use client';

import { useSyncExternalStore } from 'react';
import { trackEvent } from '@/lib/analytics';
import {
  createInstallPromptStore,
  type InstallPromptStore,
  type InstallSnapshot,
} from '@/lib/pwa/install-prompt';

const SERVER_SNAPSHOT: InstallSnapshot = {
  platform: 'unsupported',
  isInstalled: false,
  canInstall: false,
};

let store: InstallPromptStore | null = null;

/**
 * One store per page, created as early as the root layout mounts (PwaBoot), because Chromium fires
 * `beforeinstallprompt` once, shortly after load, whether or not the menu has been opened (#206).
 */
export function getInstallPromptStore(): InstallPromptStore | null {
  if (typeof window === 'undefined') return null;
  store ??= createInstallPromptStore(
    {
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
      navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone,
      supportsInstallPrompt: 'onbeforeinstallprompt' in window,
      matchMedia: (query) => window.matchMedia(query),
      addEventListener: (type, listener) => window.addEventListener(type, listener),
    },
    (event, platform) =>
      trackEvent(
        event === 'installed'
          ? 'pwa.app.install'
          : event === 'accept'
            ? 'pwa.install.accept'
            : 'pwa.install.dismiss',
        { platform },
      ),
  );
  return store;
}

const noopSubscribe = () => () => undefined;

export function useInstallPrompt() {
  const current = getInstallPromptStore();
  const snapshot = useSyncExternalStore(
    current?.subscribe ?? noopSubscribe,
    current?.getSnapshot ?? (() => SERVER_SNAPSHOT),
    () => SERVER_SNAPSHOT,
  );
  return {
    ...snapshot,
    promptInstall: () => current?.promptInstall() ?? Promise.resolve('unavailable' as const),
  };
}
