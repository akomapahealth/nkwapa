'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The contents list for the legal pages, marking the section being read. Below `lg` it starts
 * folded behind a button, so the notice itself starts on the first screen of a phone (R6.1).
 */
export function LegalContents({ sections }: { sections: { id: string; title: string }[] }) {
  const [active, setActive] = useState(sections[0]?.id);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // A heading is "being read" once it passes the top fifth of the screen.
    const observer = new IntersectionObserver(
      (entries) => {
        const passed = entries.filter((entry) => entry.isIntersecting);
        if (passed.length) setActive(passed[passed.length - 1].target.id);
      },
      { rootMargin: '0px 0px -80% 0px' },
    );
    sections.forEach(({ id }) => {
      const heading = document.getElementById(id);
      if (heading) observer.observe(heading);
    });
    return () => observer.disconnect();
  }, [sections]);

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="legal-contents-list"
        onClick={() => setOpen(!open)}
        className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-sm text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
      >
        {open ? 'Hide' : 'Show'} all {sections.length} sections
        <ChevronDown
          aria-hidden
          className={cn(
            'h-4 w-4 motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out-strong',
            open && 'rotate-180',
          )}
        />
      </button>
      <ol
        id="legal-contents-list"
        className={cn('mt-3 border-b border-rule', !open && 'max-lg:hidden')}
      >
        {sections.map((section, index) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              onClick={() => setOpen(false)}
              aria-current={active === section.id ? 'location' : undefined}
              className={cn(
                'flex min-h-11 items-baseline gap-3 border-t border-rule px-1 py-3 text-sm leading-snug motion-safe:transition-colors motion-safe:duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active === section.id
                  ? 'bg-muted font-semibold text-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                {String(index + 1).padStart(2, '0')}
              </span>
              {section.title}
            </a>
          </li>
        ))}
      </ol>
    </>
  );
}
