'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, X } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { Release } from '@/lib/release-notes';
import { cn } from '@/lib/utils';
import { CONTACT_EMAIL, CONTACT_HREF } from './links';

const DISMISSED_KEY = 'nkwapa.release-banner.dismissed';

// Each kind of change keeps one colour, so a reader can scan for "Fixed" without reading.
const TONES: Record<string, { mark: string; rule: string }> = {
  New: { mark: 'bg-secondary', rule: 'border-secondary' },
  Improved: { mark: 'bg-primary', rule: 'border-primary' },
  Fixed: { mark: 'bg-foreground', rule: 'border-foreground/60' },
};
const DEFAULT_TONE = TONES.Improved;

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
      <span className="shrink-0 rounded-sm bg-secondary px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-secondary-foreground">
        New
      </span>
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
  let order = 0;

  return (
    <DialogContent className="max-w-3xl gap-0 p-0 sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] sm:overflow-hidden">
      {/* Over the teal panel on phones, over the notes beside it on wider screens. */}
      <DialogClose
        aria-label="Close"
        className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-md text-primary-foreground transition-[background-color,transform] duration-fast ease-out-strong hover:bg-primary-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] sm:text-foreground sm:hover:bg-accent"
      >
        <X className="h-4 w-4" aria-hidden />
      </DialogClose>
      <div className="relative flex flex-col justify-between gap-10 overflow-hidden bg-primary px-7 pb-8 pt-9 text-primary-foreground sm:px-9 sm:pb-10 sm:pt-11">
        <DialogTitle className="font-heading font-semibold">
          <span className="block font-body text-sm font-semibold">What&apos;s new in Nkwapa</span>{' '}
          <span className="mt-5 block overflow-hidden pb-2">
            <span className="block text-[4.5rem] leading-[0.9] tracking-[-0.04em] motion-safe:animate-landing-rise sm:text-[6rem]">
              {release.version}
            </span>
          </span>
        </DialogTitle>

        <div>
          {/* The page's heartbeat motif: one pulse along the trace. */}
          <svg
            aria-hidden
            viewBox="0 0 240 40"
            preserveAspectRatio="none"
            className="h-10 w-full fill-none stroke-current"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M0 22H104l6-14 8 28 7-24 5 10H240" className="opacity-30" />
            <path
              d="M0 22H104l6-14 8 28 7-24 5 10H240"
              pathLength={100}
              className="landing-scroll-pulse text-secondary"
            />
          </svg>
          <DialogDescription className="mt-5 text-sm text-primary-foreground">
            Released {released}
            <span aria-hidden> · </span>
            <span className="sr-only">, </span>
            {changes} {changes === 1 ? 'change' : 'changes'} for clinic teams
          </DialogDescription>
          <p className="mt-1 text-sm text-primary-foreground">{summary}</p>
        </div>
      </div>

      <div className="px-7 pb-8 pt-9 sm:max-h-[calc(100dvh-2rem)] sm:overflow-y-auto sm:px-9 sm:pb-10 sm:pt-11">
        <div className="space-y-9">
          {release.groups.map((group) => {
            const tone = TONES[group.heading] ?? DEFAULT_TONE;
            return (
              <section key={group.heading}>
                <h3 className="flex items-center gap-3 font-heading text-xl font-semibold">
                  <span aria-hidden className={cn('h-2.5 w-2.5 rounded-full', tone.mark)} />
                  {group.heading}
                  <span className="font-body text-sm font-medium text-muted-foreground">
                    {group.items.length}
                  </span>
                </h3>
                <ul className="mt-4 space-y-5">
                  {group.items.map((item) => (
                    <li
                      key={item.lead}
                      className={cn('border-l-2 pl-4 motion-safe:animate-landing-rise', tone.rule)}
                      style={{ animationDelay: `${120 + order++ * 70}ms` }}
                    >
                      <p className="font-semibold leading-snug text-foreground">{item.lead}</p>
                      {item.text && (
                        <p className="mt-1.5 leading-relaxed text-muted-foreground">{item.text}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <p className="mt-10 border-t border-border pt-5 text-sm text-muted-foreground">
          Questions about this release? Write to{' '}
          <a
            href={CONTACT_HREF}
            className="rounded-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
        {release.url && (
          <a
            href={release.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex min-h-11 items-center gap-1 rounded-sm text-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Technical release notes on GitHub
            <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
      </div>
    </DialogContent>
  );
}
