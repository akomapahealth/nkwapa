'use client';

import Link from 'next/link';
import { BrandWordmark } from '@/components/BrandWordmark';
import { AlertTriangle, Building2, Inbox, Lock, RefreshCw } from 'lucide-react';
import { isValidElement } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import routeBreak from './route-break.module.css';

/**
 * A whole-page wait: session start, access checks, route changes before the shell exists.
 *
 * R7.5: this used to show three "steps" that pulsed in sequence. They were decoration, not
 * progress: nothing told them which step was actually running. It now says one true thing and
 * draws the page's shape, so nothing jumps when the real page arrives.
 */
export function PageSkeleton({
  title = 'Loading',
  description,
  className,
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label={title}
      aria-busy="true"
      className={cn('min-h-[60vh] bg-background px-4 py-8 md:px-6', className)}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="space-y-1">
          <p className="type-label text-foreground">{title}</p>
          {description ? (
            <p className="type-meta max-w-prose text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <SectionSkeleton lines={2} />
        <SectionSkeleton lines={4} />
      </div>
    </div>
  );
}

/**
 * The dashboard's first load, drawn in the shape of what replaces it (#280): the ruled "Needs you
 * now" rows, then the five-figure metric group, so nothing jumps when the data lands. One named
 * status region carries the message; the shapes are hidden from assistive technology.
 */
export function DashboardLoadingState({ clinicName }: { clinicName?: string | null }) {
  const label = clinicName ? `Loading ${clinicName}` : 'Loading clinic dashboard';
  return (
    <div role="status" aria-label={label} aria-busy="true" className="space-y-8">
      <p className="type-meta text-muted-foreground">{label}</p>
      <div aria-hidden="true" className="border-t-2 border-rule-strong pt-4">
        <Skeleton className="h-5 w-40" />
        <ul className="mt-1">
          {Array.from({ length: 3 }).map((_, index) => (
            <li
              key={index}
              className="flex items-center justify-between gap-3 border-b border-rule py-4"
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-64 max-w-full" />
                  <Skeleton className="h-4 w-48 max-w-full" />
                </div>
              </div>
              <Skeleton className="hidden h-11 w-28 shrink-0 rounded-md sm:block" />
            </li>
          ))}
        </ul>
      </div>
      <div aria-hidden="true" className="overflow-hidden border-t-2 border-rule-strong">
        <div className="-mb-px -mr-px grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="border-b border-r border-rule p-4 sm:p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-8 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SectionSkeleton({ lines = 4, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn('space-y-4 border-t border-rule py-5', className)}>
      <div className="space-y-3">
        <Skeleton className="h-5 w-40 max-w-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid gap-3">
        {Array.from({ length: lines }).map((_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
    </div>
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
        'border-y border-rule bg-destructive-surface p-5 text-destructive-ink',
        className,
      )}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-3">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="space-y-1">
            <p className="type-label">{title}</p>
            <p className="type-body">{description}</p>
          </div>
        </div>
        {onRetry ? <RetryAction onRetry={onRetry} label={retryLabel} /> : null}
      </div>
    </div>
  );
}

/**
 * A state that replaces the whole app: a crash, a disabled account, an offline cold start, 404.
 *
 * One white sheet on the canvas, as every page is (R1.1). The title says what happened, the
 * description what is still true and what to do; the actions are the recovery, primary last on
 * wide screens and first on phones, as FormActions orders them (R3.8). R7.5 removed the eyebrow
 * and the decorative "Recovery actions" panel that sat beside the message.
 */
export function FullscreenStatus({
  title,
  description,
  tone = 'neutral',
  icon,
  art,
  detail,
  primaryAction,
  secondaryAction,
}: {
  title: string;
  description: string;
  tone?: 'neutral' | 'danger';
  /** Defaults to a warning sign for danger and none for neutral. */
  icon?: LucideIcon;
  /** A drawing in place of the icon (the 404's route). Decorative: the title says it all. */
  art?: React.ReactNode;
  /** Something true about this device, such as changes waiting to sync. */
  detail?: React.ReactNode;
  primaryAction?: React.ReactNode;
  secondaryAction?: React.ReactNode;
}) {
  const Icon = icon ?? (tone === 'danger' ? AlertTriangle : null);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <BrandWordmark alt="Nkwapa" width={112} height={32} className="mb-6 h-8 w-auto" />
      <section className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
        {art ? (
          <div aria-hidden="true" className="mb-6">
            {art}
          </div>
        ) : Icon ? (
          <span
            className={cn(
              'mb-4 flex h-11 w-11 items-center justify-center rounded-full',
              tone === 'danger'
                ? 'bg-destructive-surface text-destructive-ink'
                : 'bg-selected text-primary',
            )}
          >
            <Icon aria-hidden="true" className="h-5 w-5" />
          </span>
        ) : null}
        <h1 className="type-record-title text-balance text-foreground">{title}</h1>
        <p className="type-body mt-2 max-w-prose text-pretty text-muted-foreground">
          {description}
        </p>
        {detail ? <div className="mt-4">{detail}</div> : null}
        {primaryAction || secondaryAction ? (
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {secondaryAction}
            {primaryAction}
          </div>
        ) : null}
      </section>
    </div>
  );
}

/** The station line running out before the stop that was asked for. See route-break.module.css. */
function RouteBreak() {
  return (
    <div className={routeBreak.route}>
      <span className={routeBreak.line} />
      <span className={routeBreak.gap} />
      <span className={routeBreak.stop} style={{ left: 0 }} />
      <span className={routeBreak.stop} style={{ left: '4.5rem' }} />
      <span className={routeBreak.stop} style={{ left: '9rem' }} />
      <span className={routeBreak.you} />
      <span className={routeBreak.missing} />
    </div>
  );
}

export function NotFoundState() {
  return (
    <FullscreenStatus
      art={<RouteBreak />}
      title="This page couldn't be found"
      description="The link may be out of date, or the page may have moved. Nothing you have saved is affected."
      primaryAction={
        <Button asChild>
          <Link href="/dashboard">Open dashboard</Link>
        </Button>
      }
      secondaryAction={
        <Button asChild variant="outline">
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
  titleAs: Title = 'h3',
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
  /** `h2` where the empty state sits straight under the page's h1, so no level is skipped (#313). */
  titleAs?: 'h2' | 'h3';
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
      <div className={cn('border-y border-rule py-5 text-muted-foreground', className)}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0 text-muted-foreground">{glyph}</span>
          <div>
            <Title className="type-section-title text-foreground">{title}</Title>
            <p className="type-body mt-1">{description}</p>
            {action ? <div className="pt-3">{action}</div> : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 border-y border-rule px-6 py-12 text-center',
        className,
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {glyph}
      </span>
      <div className="space-y-1">
        <Title className="type-section-title text-foreground">{title}</Title>
        <p className="type-body mx-auto max-w-prose text-muted-foreground">{description}</p>
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
            {/* The page heading: every caller renders this state in place of the page (#313). */}
            <h1 className="font-body text-sm font-medium text-foreground">{title}</h1>
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
 * `surface` names the thing in plain language ("the Today board", "this patient chart") and is
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
