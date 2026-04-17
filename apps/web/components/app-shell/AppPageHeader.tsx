'use client';

import { InfoHint } from '@/components/ui/info-hint';
import { ProgressiveHelp } from '@/components/ui/progressive-help';
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
  hint?: string;
  helpTitle?: string;
  helpText?: React.ReactNode;
  actions?: React.ReactNode;
  badges?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-[30px] border border-primary/15 bg-gradient-to-br from-primary/12 via-card to-secondary/10 p-5 shadow-xl shadow-primary/5 md:p-6',
        className,
      )}
    >
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary/80">
              {eyebrow}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-start gap-2">
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {title}
            </h1>
            {hint ? <InfoHint label={hint} className="mt-1" /> : null}
          </div>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm leading-5 text-muted-foreground sm:text-base">
              {description}
            </p>
          ) : null}
          {helpText ? (
            <div className="mt-3 max-w-2xl">
              <ProgressiveHelp title={helpTitle}>{helpText}</ProgressiveHelp>
            </div>
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
