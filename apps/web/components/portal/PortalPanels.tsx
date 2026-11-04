'use client';

import type { ReactNode } from 'react';
import { RecordSection } from '@/components/patients/RecordSection';
import { cn } from '@/lib/utils';

export const PORTAL_HERO_GRID = 'grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]';

export function PortalHero({
  title,
  description,
  clinicName,
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: string;
  clinicName?: string | null;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div className={cn('min-w-0 space-y-4', className)}>
      <div className="space-y-2">
        <h2 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          {title}
        </h2>
        {clinicName ? <p className="text-sm text-muted-foreground">{clinicName}</p> : null}
        {description ? (
          <p className="max-w-prose text-base leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children ? <div className={contentClassName}>{children}</div> : null}
    </div>
  );
}

export function PortalPanel({
  title,
  description,
  action,
  headingLevel: Heading = 'h2',
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: ReactNode;
  /** A control that belongs beside the heading rather than inside the panel body. */
  action?: ReactNode;
  /**
   * `h2` for a panel that sits directly under the page title, `h3` for one nested inside another
   * titled section. Only the level moves; the type stays the same, because the size of a heading
   * is a visual decision and its level is a structural one.
   */
  headingLevel?: 'h2' | 'h3';
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <RecordSection className={className}>
      <div className={cn('py-3', action && 'flex flex-wrap items-start justify-between gap-3')}>
        <div className="space-y-1.5">
          <Heading className="type-section-title text-foreground">{title}</Heading>
          {description ? (
            <p className="text-sm leading-6 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children ? <div className={contentClassName}>{children}</div> : null}
    </RecordSection>
  );
}

/**
 * A labelled value inside a panel: patient code, next follow-up, a follow-up count.
 *
 * `tabular-nums` is not optional here. These tiles carry dates and counts a patient reads down a
 * column and compares week to week, and proportional digits make that comparison harder than it
 * needs to be.
 */
export function PortalFact({
  label,
  value,
  detail,
  className,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn('border-b border-border py-3', className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn('mt-2 text-sm font-medium tabular-nums text-foreground', valueClassName)}>
        {value}
      </p>
      {detail ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

/**
 * A confirmed visit, on the success token rather than on raw emerald.
 *
 * The two screens that showed this each hardcoded `emerald-*` plus a `dark:` variant to patch it.
 * The tint-and-ink pair resolves in both themes on its own, so there is no `dark:` utility here
 * and there must not be one added.
 */
export function PortalConfirmedVisit({
  title,
  startsAt,
  endsAt,
  icon,
}: {
  title: string;
  startsAt: string;
  endsAt: string;
  icon: ReactNode;
}) {
  return (
    <div className="border-t border-success/30 py-3 text-success-ink">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="font-medium">{title}</h3>
      </div>
      <p className="mt-2 text-sm tabular-nums">{startsAt}</p>
      <p className="text-sm tabular-nums">Ends {endsAt}</p>
    </div>
  );
}
