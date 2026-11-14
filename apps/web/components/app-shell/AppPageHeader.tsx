'use client';

import { InfoHint } from '@/components/ui/info-hint';
import { cn } from '@/lib/utils';

export function AppPageHeader({
  context,
  breadcrumbs,
  title,
  count,
  description,
  hint,
  helpTitle,
  helpText,
  actions,
  badges,
  className,
}: {
  /**
   * Facts the title cannot carry, such as the station a visit is at. Never a category label: the
   * uppercase kicker above page titles was retired in R7.1 (MASTER section 4.4).
   */
  context?: string;
  breadcrumbs?: React.ReactNode;
  title: string;
  /**
   * How many records the page lists, beside the title as in the R0 pilot ("Patients 38"). Leave
   * it out until the total is known: a guessed or loading count is worse than none.
   */
  count?: number;
  /** One short line (under ~70 characters) that changes what the reader does next. */
  description?: React.ReactNode;
  /** One sentence of help, shown in a bubble beside the title. */
  hint?: string;
  /** A short name for longer help; the bubble's heading when `helpText` is set. */
  helpTitle?: string;
  /**
   * Longer help, also in the bubble. A page header never expands in place: content a user must
   * read to work safely is not header help, and goes in a ProgressiveHelp in the page body.
   */
  helpText?: React.ReactNode;
  actions?: React.ReactNode;
  badges?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        // On the canvas, not in a box. Type and space carry the hierarchy (W3 polish): a hairline
        // under the header doubled up with the group rule of the first section below it.
        'pb-1 pt-1',
        className,
      )}
    >
      {breadcrumbs ? <div className="mb-2">{breadcrumbs}</div> : null}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          {context ? <p className="text-sm text-muted-foreground">{context}</p> : null}
          {/*
            The title and its help flow as one line of text. The trigger is inline and
            `align-middle`, so it sits on the title's last line at the middle of its x-height,
            whatever the title wraps to. As a flex sibling with `items-start` and a hand-tuned
            `mt-1` it lined up with nothing, and wrapped onto a line of its own on phones.
          */}
          <div className={cn('type-page-title', context && 'mt-1')}>
            <h1 className="inline align-middle text-foreground">{title}</h1>
            {count !== undefined ? (
              // Beside the h1, not in it: the page's name stays "Patients", the total is read after.
              <span className="ml-2 align-middle font-mono text-sm font-normal tabular-nums tracking-normal text-muted-foreground">
                <span className="sr-only">Total </span>
                {count.toLocaleString('en-GB')}
              </span>
            ) : null}
            {helpText ? (
              <InfoHint label={helpTitle ?? 'How this page works'} className="ml-2">
                <div className="space-y-2">
                  {hint ? <p>{hint}</p> : null}
                  <div>{helpText}</div>
                </div>
              </InfoHint>
            ) : hint ? (
              <InfoHint label={hint} className="ml-2" />
            ) : null}
          </div>
          {description ? (
            <p className="type-body mt-1.5 max-w-2xl text-pretty text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 compact:gap-3 lg:justify-end">
          {/* Own row: in the phone column a bare tag stretched to the full width like a bar. */}
          {badges ? (
            <div className="flex basis-full flex-wrap items-center gap-2 lg:basis-auto">
              {badges}
            </div>
          ) : null}
          {actions}
        </div>
      </div>
    </section>
  );
}
