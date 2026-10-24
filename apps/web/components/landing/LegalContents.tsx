'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/** The contents list for /privacy and /terms, marking the section being read. */
export function LegalContents({ sections }: { sections: { id: string; title: string }[] }) {
  const [active, setActive] = useState(sections[0]?.id);

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
    <ol className="mt-4 border-l border-border">
      {sections.map((section, index) => (
        <li key={section.id}>
          <a
            href={`#${section.id}`}
            aria-current={active === section.id ? 'location' : undefined}
            className={cn(
              '-ml-px flex min-h-11 items-baseline gap-3 border-l-2 py-2 pl-4 text-sm leading-snug transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active === section.id
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-foreground/75 hover:border-foreground/30 hover:text-foreground',
            )}
          >
            <span className="font-heading text-xs font-semibold tabular-nums text-primary">
              {String(index + 1).padStart(2, '0')}
            </span>
            {section.title}
          </a>
        </li>
      ))}
    </ol>
  );
}
