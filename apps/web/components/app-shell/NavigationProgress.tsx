'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * A 2px bar across the top while an in-app link is loading its page.
 *
 * Without it, clicking a sidebar item on clinic wifi did nothing visible until the next page was
 * ready, and people clicked again. It starts on the click of a same-origin link to a different
 * path and stops when the path changes. It is out of flow, so it cannot move the page.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setPending(false);
  }, [pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank') return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      setPending(true);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  // Never stuck: a navigation that is cancelled or fails still clears the bar.
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setPending(false), 10_000);
    return () => window.clearTimeout(timer);
  }, [pending]);

  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-[130] h-0.5 overflow-hidden transition-opacity duration-fast',
        pending ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div className="h-full w-1/4 animate-refresh-sweep bg-primary" />
    </div>
  );
}
