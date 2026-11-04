'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, X } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { Release, ReleaseGroup } from '@/lib/release-notes';
import { cn } from '@/lib/utils';
import { CONTACT_EMAIL, CONTACT_HREF } from './links';

const DISMISSED_KEY = 'nkwapa.release-banner.dismissed';

// Each kind of change keeps one colour next to its name, so a reader can scan for "Fixed".
const TONES: Record<string, string> = {
  New: 'bg-secondary',
  Improved: 'bg-primary',
  Fixed: 'bg-foreground',
};
const DEFAULT_TONE = TONES.Improved;
/** A release longer than this opens with each group cut to PREVIEW items and a "Show all" toggle. */
const CAP_ABOVE = 8;
const PREVIEW = 3;

function formatDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Announces the latest release (lib/release-notes.ts, refreshed every five minutes from GitHub). When the
 * release has plain-language notes, the announcement opens them. A new version shows the banner
 * again to anyone who dismissed the previous one.
 */
export function ReleaseBanner({ release }: { release: Release }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      // The server cannot know about the dismissal, so a returning visitor sees one frame of it.
      if (localStorage.getItem(DISMISSED_KEY) === release.version) setDismissed(true);
    } catch {
      // Storage blocked: the banner simply stays.
    }
  }, [release.version]);

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, release.version);
    } catch {
      // Storage blocked: dismissed for this visit only.
    }
  };

  const released = formatDate(release.date);
  const headline = release.groups[0]?.items[0]?.lead;
  const announcement = (
    <>
      <span className="min-w-0 truncate">
        <span data-release-version className="font-heading text-base font-semibold">
          Nkwapa {release.version}
        </span>{' '}
        is out now.
        {headline && <span className="hidden text-primary-foreground lg:inline"> {headline}</span>}
      </span>
    </>
  );

  return (
    <aside
      data-release-banner
      aria-label="Latest release"
      className="bg-primary text-primary-foreground"
    >
      <div className="landing-container flex h-11 items-center gap-4 text-sm">
        {release.groups.length === 0 ? (
          <p className="flex min-w-0 flex-1 items-center gap-3 motion-safe:animate-landing-rise">
            {announcement}
          </p>
        ) : (
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="group flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-sm text-left motion-safe:animate-landing-rise focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-foreground"
              >
                {announcement}
                <span className="hidden shrink-0 items-center gap-1 font-semibold underline decoration-primary-foreground/50 underline-offset-4 transition-colors duration-fast group-hover:decoration-primary-foreground sm:inline-flex">
                  See what&apos;s new
                  <ArrowRight
                    aria-hidden
                    className="h-3.5 w-3.5 transition-transform duration-fast ease-out-strong group-hover:translate-x-0.5"
                  />
                </span>
              </button>
            </DialogTrigger>
            <WhatsNew release={release} released={released} />
          </Dialog>
        )}

        <span aria-hidden className="hidden h-3 w-px shrink-0 bg-primary-foreground/40 md:block" />
        <time dateTime={release.date} className="hidden shrink-0 md:inline">
          Released {released}
        </time>
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

function WhatsNew({ release, released }: { release: Release; released: string }) {
  const changes = release.groups.reduce((sum, group) => sum + group.items.length, 0);
  const summary = release.groups
    .map((group) => `${group.items.length} ${group.heading.toLowerCase()}`)
    .join(', ');
  const capped = changes > CAP_ABOVE;

  return (
    <DialogContent className="flex max-w-2xl flex-col gap-0 overflow-hidden p-0">
      <header className="relative shrink-0 bg-primary px-6 pb-6 pt-7 text-primary-foreground sm:px-8">
        <DialogTitle className="pr-12 font-heading font-semibold">
          <span className="block font-body text-sm font-semibold">What&apos;s new in Nkwapa</span>{' '}
          <span className="mt-2 block text-5xl leading-none tracking-[-0.03em] sm:text-6xl">
            {release.version}
          </span>
        </DialogTitle>
        <DialogDescription className="mt-4 text-sm text-primary-foreground">
          Released {released}
          <span aria-hidden> · </span>
          <span className="sr-only">, </span>
          {changes} {changes === 1 ? 'change' : 'changes'}: {summary}
        </DialogDescription>
        <DialogClose
          aria-label="Close"
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-md transition-[background-color,transform] duration-fast ease-out-strong hover:bg-primary-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-foreground active:scale-[0.97]"
        >
          <X className="h-4 w-4" aria-hidden />
        </DialogClose>
      </header>

      {/* The only part that scrolls, so the title and the way out stay put on a long release. */}
      <div
        tabIndex={0}
        role="region"
        aria-label="Changes in this release"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-8"
      >
        <div className="space-y-8">
          {release.groups.map((group) => (
            <ReleaseGroupList key={group.heading} group={group} capped={capped} />
          ))}
        </div>
      </div>

      <footer className="flex shrink-0 flex-col gap-x-6 gap-y-1 border-t border-border px-6 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>
          Questions?{' '}
          <a
            href={CONTACT_HREF}
            className="inline-flex min-h-11 items-center rounded-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {CONTACT_EMAIL}
          </a>
        </p>
        {release.url && (
          <a
            href={release.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 rounded-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Technical notes on GitHub
            <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
      </footer>
    </DialogContent>
  );
}

function ReleaseGroupList({ group, capped }: { group: ReleaseGroup; capped: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const hidden = capped ? group.items.length - PREVIEW : 0;
  const items = hidden > 0 && !expanded ? group.items.slice(0, PREVIEW) : group.items;

  return (
    <section>
      <h3 className="flex items-center gap-3 border-b-2 border-foreground pb-2 font-heading text-xl font-semibold">
        <span
          aria-hidden
          className={cn('h-2.5 w-2.5 rounded-full', TONES[group.heading] ?? DEFAULT_TONE)}
        />
        {group.heading}
        <span className="font-body text-sm font-medium tabular-nums text-muted-foreground">
          {group.items.length}
        </span>
      </h3>
      <ul id={listId} className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.lead} className="py-3">
            <p className="font-semibold leading-snug text-foreground">{item.lead}</p>
            {item.text && <p className="mt-1 leading-relaxed text-muted-foreground">{item.text}</p>}
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          ref={toggle}
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => {
            setExpanded(!expanded);
            // Collapsing pulls the button up past where the reader was; keep it, and focus, in view.
            if (expanded)
              requestAnimationFrame(() => toggle.current?.scrollIntoView({ block: 'nearest' }));
          }}
          className="mt-1 inline-flex min-h-11 items-center rounded-sm text-sm font-semibold text-primary underline decoration-primary/40 underline-offset-4 transition-colors duration-fast hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded
            ? 'Show fewer'
            : `Show all ${group.items.length} ${group.heading.toLowerCase()}`}
        </button>
      )}
    </section>
  );
}
