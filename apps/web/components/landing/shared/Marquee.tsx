'use client';

import { cn } from '@/lib/utils';
import { useReducedMotion } from 'framer-motion';

interface MarqueeProps {
  children: React.ReactNode;
  speed?: number;
  pauseOnHover?: boolean;
  className?: string;
}

export function Marquee({ children, speed = 30, pauseOnHover = true, className }: MarqueeProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    /*
      No `role="marquee"`. It is not a real ARIA role -- assistive technology ignores it and axe
      flags it. The content here is decorative repetition of logos already named in the page, so
      it is hidden from the accessibility tree rather than given a role it cannot honour.
    */
    <div className={cn('group relative flex overflow-hidden', className)} aria-hidden="true">
      <div
        className={cn(
          'flex min-w-full shrink-0 items-center justify-around gap-8',
          !prefersReducedMotion && 'animate-marquee',
          pauseOnHover && 'group-hover:[animation-play-state:paused]',
        )}
        style={{ animationDuration: `${speed}s` }}
      >
        {children}
      </div>
      <div
        aria-hidden="true"
        className={cn(
          'flex min-w-full shrink-0 items-center justify-around gap-8',
          !prefersReducedMotion && 'animate-marquee',
          pauseOnHover && 'group-hover:[animation-play-state:paused]',
        )}
        style={{ animationDuration: `${speed}s` }}
      >
        {children}
      </div>
    </div>
  );
}
