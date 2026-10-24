'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trackEvent } from '@/lib/analytics';

/**
 * Tracks landing page views and key interactions.
 * Sent only when analytics is enabled, and only what the shared telemetry catalog allows.
 */
export function LandingAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === '/') {
      trackEvent('landing.page.view');
    }
  }, [pathname]);

  // One delegated listener, so the call-to-action links can stay in server components.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const cta = (event.target as Element | null)?.closest<HTMLElement>('[data-cta]');
      if (cta) trackEvent('landing.cta.click', { target: cta.dataset.cta });
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return null;
}
