'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

/**
 * Update with every release (`gh release list`). A new `version` shows the banner again to anyone
 * who dismissed the previous one.
 */
export const LATEST_RELEASE = {
  version: '1.2',
  label: 'beta',
  date: '2026-10-12',
  summary: 'Register patients who have no ID document, and add or correct an ID later.',
  short: 'Register without an ID.',
};

const DISMISSED_KEY = 'nkwapa.release-banner.dismissed';

export function ReleaseBanner() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      // The server cannot know about the dismissal, so a returning visitor sees one frame of it.
      if (localStorage.getItem(DISMISSED_KEY) === LATEST_RELEASE.version) setDismissed(true);
    } catch {
      // Storage blocked: the banner simply stays.
    }
  }, []);

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, LATEST_RELEASE.version);
    } catch {
      // Storage blocked: dismissed for this visit only.
    }
  };

  const released = new Date(`${LATEST_RELEASE.date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <aside
      data-release-banner
      aria-label="Latest release"
      className="bg-primary text-primary-foreground"
    >
      <div className="landing-container flex h-11 items-center gap-4 text-sm">
        <p className="flex min-w-0 flex-1 items-baseline gap-3 motion-safe:animate-landing-rise">
          <span className="shrink-0 font-heading text-base font-semibold">
            Nkwapa {LATEST_RELEASE.version}
            <span className="hidden font-body text-xs font-medium min-[400px]:inline">
              {' '}
              ({LATEST_RELEASE.label})
            </span>
          </span>
          <span aria-hidden className="h-3 w-px shrink-0 self-center bg-primary-foreground/40" />
          <span className="truncate sm:hidden">{LATEST_RELEASE.short}</span>
          <span className="hidden truncate sm:inline">{LATEST_RELEASE.summary}</span>
          <time dateTime={LATEST_RELEASE.date} className="ml-auto hidden shrink-0 md:inline">
            Released {released}
          </time>
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss the release update"
          className="-mr-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition-[background-color,transform] duration-fast ease-out-strong hover:bg-primary-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-foreground active:scale-[0.97]"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </aside>
  );
}
