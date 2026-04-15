'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trackEvent } from '@/lib/analytics';

/**
 * Tracks landing page views and key interactions.
 * Wire to your analytics provider via trackEvent in lib/analytics.ts.
 */
export function LandingAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === '/') {
      trackEvent({
        name: 'landing_page_view',
        properties: { path: pathname },
      });
    }
  }, [pathname]);

  return null;
}
