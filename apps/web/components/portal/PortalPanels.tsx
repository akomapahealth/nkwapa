'use client';

import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * One hero ratio for the whole portal.
 *
 * Five screens laid out the same two-column hero at five different ratios -- 1.3/0.9, 1.35/0.95,
 * 1.15/0.85 twice, and 1.1/0.9 -- so the right-hand column moved every time a patient changed
 * page. Import this instead of writing another one.
 */
export const PORTAL_HERO_GRID = 'grid gap-4 lg:grid-cols-[1.2fr_0.8fr]';

/**
 * Real headings, not `CardTitle`.
 *
 * `CardTitle` renders a `div`, so the portal shipped with almost no heading structure: a screen
 * reader user could not navigate it at all. The staff chart panels already make the same choice
 * for the same reason (see components/patients/PatientTrendsPanel.tsx). `PortalLayout` owns the
 * page's single `<h1>`, so every panel and hero here is an `<h2>`, and anything nested inside one
 * -- an `EmptyState`, a sub-label -- is an `<h3>`.
 */
export function PortalHero({
  eyebrow,
  title,
  description,
  clinicName,
  children,
  className,
  contentClassName,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  clinicName?: string | null;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            {eyebrow}
          </Badge>
          {clinicName ? (
            <Badge variant="outline" className="rounded-full border-border px-3 py-1">
              {clinicName}
            </Badge>
          ) : null}
        </div>
        <div className="space-y-2">
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {title}
          </h2>
          {description ? (
            <CardDescription className="max-w-2xl text-sm leading-6 md:text-base">
              {description}
            </CardDescription>
          ) : null}
        </div>
      </CardHeader>
      {children ? <CardContent className={contentClassName}>{children}</CardContent> : null}
    </Card>
  );
}

export function PortalPanel({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: ReactNode;
  /** A control that belongs beside the heading rather than inside the panel body. */
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader
        className={cn(action && 'gap-3 space-y-0 md:flex-row md:items-start md:justify-between')}
      >
        <div className="space-y-1.5">
          <h2 className="font-heading text-lg font-semibold leading-none tracking-tight text-foreground">
            {title}
          </h2>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </CardHeader>
      {children ? <CardContent className={contentClassName}>{children}</CardContent> : null}
    </Card>
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
    <div className={cn('rounded-lg border border-border bg-background p-4', className)}>
      <p className="text-eyebrow text-muted-foreground">{label}</p>
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
    <div className="rounded-lg border border-success/30 bg-success/12 p-4 text-success-ink">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="font-medium">{title}</h3>
      </div>
      <p className="mt-2 text-sm tabular-nums">{startsAt}</p>
      <p className="text-sm tabular-nums">Ends {endsAt}</p>
    </div>
  );
}
