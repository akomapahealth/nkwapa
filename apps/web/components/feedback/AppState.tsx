'use client';

import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Building2,
  Inbox,
  Lock,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react';
import { isValidElement } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function PageSkeleton({
  title = 'Preparing your workspace',
  description = 'Loading clinic context, recent activity, and the safest next actions for this page.',
  steps = ['Secure session', 'Clinic context', 'Workspace data'],
  className,
}: {
  title?: string;
  description?: string;
  steps?: string[];
  className?: string;
}) {
  return (
    <div className={cn('min-h-[60vh] bg-clinical-grid px-4 py-8 md:px-6', className)}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card/95">
          <div className="h-1.5 w-full overflow-hidden bg-muted/50">
            <div className="h-full w-1/2 animate-[loading-bar_1.7s_ease-in-out_infinite] bg-primary/80" />
          </div>
          <div className="p-6 md:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-3">
                <div className="text-eyebrow inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-primary">
                  <Activity className="h-3.5 w-3.5 animate-pulse" />
                  Loading
                </div>
                <div className="space-y-2">
                  <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                    {title}
                  </h1>
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                    {description}
                  </p>
                </div>
                <div className="grid max-w-xl gap-2 pt-2 sm:grid-cols-3">
                  {steps.map((step, index) => (
                    <div
                      key={step}
                      className="flex items-center gap-2 rounded-md border border-border/70 bg-background/75 px-3 py-2 text-xs font-medium text-muted-foreground"
                    >
                      <span
                        className="h-2 w-2 rounded-full bg-primary"
                        style={{ animation: `pulse 1.4s ease-in-out ${index * 160}ms infinite` }}
                      />
                      <span className="truncate">{step}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:w-[420px]">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-24 animate-pulse rounded-md border border-border/70 bg-muted/40"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <SectionSkeleton lines={2} className="rounded-lg p-6 md:p-8" />
        <SectionSkeleton lines={5} className="rounded-lg p-6 md:p-8" />
      </div>
    </div>
  );
}

export function DashboardLoadingState({ clinicName }: { clinicName?: string | null }) {
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border/70 bg-card/90 p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="h-4 w-36 animate-pulse rounded-full bg-primary/20" />
            <div className="h-7 w-64 max-w-full animate-pulse rounded-full bg-muted/60" />
            <div className="h-4 w-80 max-w-full animate-pulse rounded-full bg-muted/40" />
          </div>
          <div className="inline-flex items-center gap-3 rounded-md border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-medium text-primary">
            <Stethoscope className="h-4 w-4 animate-pulse" />
            {clinicName ? `Loading ${clinicName}` : 'Loading clinic dashboard'}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-md border border-border/70 bg-card/80"
          />
        ))}
      </div>

      <SectionSkeleton lines={4} className="rounded-lg p-6" />
    </div>
  );
}

export function SectionSkeleton({ lines = 4, className }: { lines?: number; className?: string }) {
  return (
    <Card className={cn('border-border/70 bg-card/90', className)}>
      <CardContent className="space-y-4 p-0">
        <div className="space-y-3">
          <div className="h-5 w-40 animate-pulse rounded-full bg-muted/50" />
          <div className="h-4 w-72 animate-pulse rounded-full bg-muted/40" />
        </div>
        <div className="grid gap-3">
          {Array.from({ length: lines }).map((_, index) => (
            <div
              key={index}
              className="h-20 animate-pulse rounded-md border border-border/60 bg-muted/35"
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function RetryAction({
  onRetry,
  label = 'Try again',
  variant = 'default',
}: {
  onRetry: () => void;
  label?: string;
  variant?: 'default' | 'outline';
}) {
  return (
    <Button onClick={onRetry} variant={variant} className="rounded-md">
      <RefreshCw className="h-4 w-4" />
      {label}
    </Button>
  );
}

export function InlineErrorState({
  title = "We couldn't load this view",
  description,
  onRetry,
  retryLabel,
  className,
}: {
  title?: string;
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-destructive/20 bg-destructive/5 p-5 text-sm shadow-sm',
        className,
      )}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">{title}</p>
            <p className="leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
        {onRetry ? <RetryAction onRetry={onRetry} label={retryLabel} /> : null}
      </div>
    </div>
  );
}

export function FullscreenStatus({
  eyebrow = 'Nkwapa',
  title,
  description,
  tone = 'neutral',
  primaryAction,
  secondaryAction,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  tone?: 'neutral' | 'danger';
  primaryAction?: React.ReactNode;
  secondaryAction?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-clinical-grid p-6">
      <Card className="w-full max-w-3xl overflow-hidden rounded-xl border-border/70 bg-card/95">
        <CardContent className="grid gap-0 lg:grid-cols-[1.08fr_0.92fr]">
          <section className="relative overflow-hidden px-6 py-8 md:px-8 md:py-10">
            <div className="relative space-y-5">
              <p
                className={cn(
                  'text-eyebrow',
                  tone === 'danger' ? 'text-destructive' : 'text-primary',
                )}
              >
                {eyebrow}
              </p>
              <div className="space-y-2">
                <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                  {title}
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                  {description}
                </p>
              </div>
            </div>
          </section>

          <section className="border-t border-border/70 bg-background/70 px-6 py-8 md:px-8 lg:border-l lg:border-t-0">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="flex items-center gap-2 text-2xl">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Recovery actions
              </CardTitle>
              <CardDescription>
                Choose the safest next step to recover without losing your place.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 px-0 pb-0">
              {primaryAction}
              {secondaryAction}
            </CardContent>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}

export function NotFoundState() {
  return (
    <FullscreenStatus
      eyebrow="Page status"
      title="This page couldn't be found"
      description="The address may be outdated, or the page may have moved after a clinic or portal update."
      primaryAction={
        <Button asChild className="rounded-md">
          <Link href="/dashboard">Open dashboard</Link>
        </Button>
      }
      secondaryAction={
        <Button asChild variant="outline" className="rounded-md">
          <Link href="/">Back to home</Link>
        </Button>
      }
    />
  );
}

/**
 * "There is nothing here yet", not "something went wrong".
 *
 * Kept visually distinct from InlineErrorState on purpose: an empty queue at the start of a
 * clinic day is the normal case, and dressing it in destructive colour trains staff to read
 * a calm system as a broken one. Neutral surface, no alarm colour, no retry.
 */
/**
 * The title is an <h3>, not a styled paragraph.
 *
 * An empty region is still a region, and a screen-reader user navigating by heading needs to
 * land on "No visits yet" the same way a sighted user's eye does. Three e2e specs assert it by
 * role for exactly that reason.
 */
export function EmptyState({
  title,
  description,
  icon = Inbox,
  action,
  density = 'comfortable',
  className,
}: {
  title: string;
  /** What the reader can do about it, in plain language. Not an apology. */
  description: string;
  /**
   * A Lucide component. A rendered element is also accepted so the older `EmptyStateCard`
   * call sites can be moved across one group at a time rather than in one sweep.
   */
  icon?: LucideIcon | React.ReactElement;
  action?: React.ReactNode;
  /**
   * `comfortable` owns a whole panel: centred, generous, the only thing on screen.
   * `compact` sits inside something else -- a board column, a card, a dialog -- where a centred
   * 12-unit block would push the real content off the fold.
   *
   * Six shapes used to exist for this across the app. Two densities is the honest number,
   * because an empty queue column and an empty page are not the same message.
   */
  density?: 'comfortable' | 'compact';
  className?: string;
}) {
  /*
    `isValidElement`, not `typeof icon === 'function'`.

    Lucide icons are built with React.forwardRef, so they are objects rather than functions. A
    function check therefore falls through and tries to render the component object itself as a
    child, which throws "Objects are not valid as a React child" and takes the whole route down.
    Asking whether it is already an element is the question that actually distinguishes the two.
  */
  let glyph: React.ReactNode;
  if (isValidElement(icon)) {
    glyph = icon;
  } else {
    const IconComponent = icon as LucideIcon;
    glyph = <IconComponent aria-hidden="true" className="h-5 w-5" />;
  }

  if (density === 'compact') {
    return (
      <div
        className={cn(
          'rounded-lg border border-dashed border-border bg-muted/30 p-5 text-sm text-muted-foreground',
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0 text-muted-foreground">{glyph}</span>
          <div>
            <h3 className="font-medium text-foreground">{title}</h3>
            <p className="mt-1 leading-6">{description}</p>
            {action ? <div className="pt-3">{action}</div> : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center',
        className,
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {glyph}
      </span>
      <div className="space-y-1">
        <h3 className="font-medium text-foreground">{title}</h3>
        <p className="mx-auto max-w-prose text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

/**
 * Permission and tenant-scope refusals.
 *
 * Deliberately NOT an error state and deliberately without a retry control. Issue #22 requires
 * that fallbacks never disguise a permission or clinic-scope problem as a transient failure:
 * offering "Try again" on a wall the user cannot pass teaches them to hammer it, and hides the
 * real fix, which is asking an administrator or switching clinic.
 *
 * Never name the record the user was denied. On a patient route, saying which patient they may
 * not see is itself a disclosure.
 */
export function NoAccessState({
  title = 'You do not have access to this',
  description = 'Your current role and active clinic do not include this record. Switch clinic if you expected it elsewhere, or ask an administrator to review your access.',
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card px-6 py-8 text-sm shadow-sm',
        className,
      )}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-3">
          <Lock aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">{title}</p>
            <p className="max-w-prose leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

/**
 * "This page needs a clinic, and you have not picked one."
 *
 * Ten routes each hand-rolled this as `<div className="p-4"><p className="text-muted-foreground">
 * Select a clinic to …</p></div>`: no heading, no icon, no way to act, and ten different
 * sentences for one situation. It is also not an error and not a permission refusal, which is
 * why it neither borrows destructive colour nor offers a retry.
 *
 * `surface` names the thing in plain language ("the Today Board", "this patient chart") and is
 * folded into one sentence, so callers cannot drift into ten phrasings again.
 */
export function SelectClinicState({
  surface,
  action,
  className,
}: {
  surface: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <EmptyState
      icon={Building2}
      title="Select a clinic first"
      description={`${surface} is scoped to one clinic, so it needs to know which clinic you are working in. Choose one in the header to continue.`}
      action={action}
      className={className}
    />
  );
}
