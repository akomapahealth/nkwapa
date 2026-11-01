'use client';

import { useEffect } from 'react';
import { trackEvent } from '@/lib/analytics';
import { getInstallPromptStore } from '@/lib/use-install-prompt';

/**
 * Mounted once in the root layout (#206). Creates the install store before Chromium's one-time
 * `beforeinstallprompt` can fire, and counts launches of the installed app.
 */
export function PwaBoot() {
  useEffect(() => {
    const store = getInstallPromptStore();
    if (!store) return;
    const source = new URLSearchParams(window.location.search).get('source');
    const { platform, isInstalled } = store.getSnapshot();
    if (source === 'pwa' || source === 'pwa-shortcut') {
      trackEvent('pwa.app.launch', { platform, source });
    } else if (isInstalled) {
      trackEvent('pwa.app.launch', { platform, source: 'standalone' });
    }
  }, []);

  return null;
}
