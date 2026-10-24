'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { CONTACT_EMAIL, CONTACT_HREF } from './links';

/**
 * Update with every release. The notes are written for clinic staff, not developers: say what
 * someone can now do or what stopped going wrong, and leave out internal changes. A new `version`
 * shows the banner again to anyone who dismissed the previous one.
 */
export const LATEST_RELEASE = {
  version: '1.2.0',
  date: '2026-10-12',
  notes: [
    {
      heading: 'New',
      items: [
        {
          lead: 'Register a patient who has no ID document.',
          text: 'Choose “No ID document” at registration. Their name, date of birth and phone number are then used to spot a possible duplicate record.',
        },
        {
          lead: 'Add or correct an ID later.',
          text: 'An ID can be added to a record after registration, or fixed if it was entered wrongly. Each change asks for a reason and is kept in the record’s history.',
        },
      ],
    },
    {
      heading: 'Improved',
      items: [
        {
          lead: 'Imported screening visits are flagged for review.',
          text: 'Visits brought in from a screening spreadsheet are now marked for a doctor to review when a reading needs attention, such as low blood sugar or very high blood pressure.',
        },
      ],
    },
    {
      heading: 'Fixed',
      items: [
        {
          lead: 'Duplicate IDs no longer fail silently.',
          text: 'Registering an ID that was already on another record used to stop with no message. Nkwapa now shows the record that already has it.',
        },
      ],
    },
  ],
};

const DISMISSED_KEY = 'nkwapa.release-banner.dismissed';

const released = new Date(`${LATEST_RELEASE.date}T00:00:00Z`).toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

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

  return (
    <aside
      data-release-banner
      aria-label="Latest release"
      className="bg-primary text-primary-foreground"
    >
      <div className="landing-container flex h-11 items-center gap-4 text-sm">
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              className="group flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-sm text-left motion-safe:animate-landing-rise focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-foreground"
            >
              <span className="truncate">
                <span data-release-version className="font-heading text-base font-semibold">
                  Nkwapa {LATEST_RELEASE.version}
                </span>{' '}
                is out now.
              </span>
              <span className="hidden shrink-0 items-center gap-1 font-semibold underline decoration-primary-foreground/50 underline-offset-4 transition-colors duration-fast group-hover:decoration-primary-foreground sm:inline-flex">
                See what&apos;s new
                <ArrowRight
                  aria-hidden
                  className="h-3.5 w-3.5 transition-transform duration-fast ease-out-strong group-hover:translate-x-0.5"
                />
              </span>
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-xl gap-0 p-0">
            <div className="flex items-start justify-between gap-4 border-b border-border bg-accent px-6 pb-6 pt-7 sm:px-8">
              <div>
                <DialogTitle className="font-heading text-3xl font-semibold leading-tight">
                  What&apos;s new in Nkwapa {LATEST_RELEASE.version}
                </DialogTitle>
                <DialogDescription className="mt-2 text-sm text-foreground/75">
                  Released {released}
                </DialogDescription>
              </div>
              <DialogClose asChild>
                <Button variant="ghost" size="icon" aria-label="Close" className="-mr-3 -mt-2">
                  <X aria-hidden />
                </Button>
              </DialogClose>
            </div>

            <div className="space-y-8 px-6 py-7 sm:px-8">
              {LATEST_RELEASE.notes.map((group) => (
                <section key={group.heading}>
                  <h3 className="text-eyebrow text-primary">{group.heading}</h3>
                  <ul className="mt-3 border-t border-border">
                    {group.items.map((item) => (
                      <li key={item.lead} className="border-b border-border py-4">
                        <p className="font-semibold text-foreground">{item.lead}</p>
                        <p className="mt-1 leading-relaxed text-muted-foreground">{item.text}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              <p className="text-sm text-muted-foreground">
                Questions about this release? Write to{' '}
                <a
                  href={CONTACT_HREF}
                  className="rounded-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {CONTACT_EMAIL}
                </a>
                .
              </p>
            </div>
          </DialogContent>
        </Dialog>

        <span aria-hidden className="hidden h-3 w-px shrink-0 bg-primary-foreground/40 md:block" />
        <time dateTime={LATEST_RELEASE.date} className="hidden shrink-0 md:inline">
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
