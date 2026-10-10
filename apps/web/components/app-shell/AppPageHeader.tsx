'use client';

import { InfoHint } from '@/components/ui/info-hint';
import { cn } from '@/lib/utils';

export function AppPageHeader({
  eyebrow,
  title,
  description,
  hint,
  helpTitle,
  helpText,
  actions,
  badges,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
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
        // On the canvas, not in a box. Every page opened with a bordered card around its own
        // title, which made the title one more panel among the panels below it. Type and space
        // carry the hierarchy now; a hairline separates the header from the work.
        'border-b border-border/70 pb-5 pt-1 md:pb-6',
        className,
      )}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          {eyebrow ? <p className="text-eyebrow text-primary">{eyebrow}</p> : null}
          {/*
            The title and its help flow as one line of text. The trigger is inline and
            `align-middle`, so it sits on the title's last line at the middle of its x-height,
            whatever the title wraps to. As a flex sibling with `items-start` and a hand-tuned
            `mt-1` it lined up with nothing, and wrapped onto a line of its own on phones.
          */}
          <div className="mt-2 font-heading text-3xl sm:text-4xl">
            <h1 className="inline align-middle font-semibold tracking-tight text-foreground">
              {title}
            </h1>
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
            <p className="mt-2 max-w-2xl text-sm leading-5 text-muted-foreground sm:text-base">
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          {badges}
          {actions}
        </div>
      </div>
    </section>
  );
}
