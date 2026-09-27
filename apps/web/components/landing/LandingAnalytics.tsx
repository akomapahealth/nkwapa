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

  return null;
}
