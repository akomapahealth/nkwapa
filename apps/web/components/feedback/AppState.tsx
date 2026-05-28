'use client';

import Link from 'next/link';
import { Activity, AlertTriangle, RefreshCw, ShieldCheck, Stethoscope } from 'lucide-react';
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
        <div className="overflow-hidden rounded-[32px] border border-border/70 bg-card/95 shadow-2xl shadow-black/5">
          <div className="h-1.5 w-full overflow-hidden bg-muted/50">
            <div className="h-full w-1/2 animate-[loading-bar_1.7s_ease-in-out_infinite] bg-primary/80" />
          </div>
          <div className="p-6 md:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-primary/80">
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
                      className="flex items-center gap-2 rounded-2xl border border-border/70 bg-background/75 px-3 py-2 text-xs font-medium text-muted-foreground"
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
                    className="h-24 animate-pulse rounded-2xl border border-border/70 bg-muted/40"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <SectionSkeleton lines={2} className="rounded-[28px] p-6 md:p-8" />
        <SectionSkeleton lines={5} className="rounded-[28px] p-6 md:p-8" />
      </div>
    </div>
  );
}

export function DashboardLoadingState({ clinicName }: { clinicName?: string | null }) {
  return (
    <div className="space-y-5">
      <div className="rounded-[28px] border border-border/70 bg-card/90 p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="h-4 w-36 animate-pulse rounded-full bg-primary/20" />
            <div className="h-7 w-64 max-w-full animate-pulse rounded-full bg-muted/60" />
            <div className="h-4 w-80 max-w-full animate-pulse rounded-full bg-muted/40" />
          </div>
          <div className="inline-flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-medium text-primary">
            <Stethoscope className="h-4 w-4 animate-pulse" />
            {clinicName ? `Loading ${clinicName}` : 'Loading clinic dashboard'}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-2xl border border-border/70 bg-card/80"
          />
        ))}
      </div>

      <SectionSkeleton lines={4} className="rounded-[28px] p-6" />
    </div>
  );
}

export function SectionSkeleton({ lines = 4, className }: { lines?: number; className?: string }) {
  return (
    <Card className={cn('border-border/70 bg-card/90 shadow-lg shadow-black/5', className)}>
      <CardContent className="space-y-4 p-0">
        <div className="space-y-3">
          <div className="h-5 w-40 animate-pulse rounded-full bg-muted/50" />
          <div className="h-4 w-72 animate-pulse rounded-full bg-muted/40" />
        </div>
        <div className="grid gap-3">
          {Array.from({ length: lines }).map((_, index) => (
            <div
              key={index}
              className="h-20 animate-pulse rounded-2xl border border-border/60 bg-muted/35"
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
    <Button onClick={onRetry} variant={variant} className="rounded-2xl">
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
        'rounded-[28px] border border-destructive/20 bg-destructive/5 p-5 text-sm shadow-sm',
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
      <Card className="w-full max-w-3xl overflow-hidden rounded-[32px] border-border/70 bg-card/95 shadow-2xl shadow-black/5">
        <CardContent className="grid gap-0 lg:grid-cols-[1.08fr_0.92fr]">
          <section className="relative overflow-hidden px-6 py-8 md:px-8 md:py-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.14),transparent_35%),radial-gradient(circle_at_bottom_right,hsl(var(--secondary)/0.12),transparent_32%)]" />
            <div className="relative space-y-5">
              <p
                className={cn(
                  'text-xs font-semibold uppercase tracking-[0.28em]',
                  tone === 'danger' ? 'text-destructive/80' : 'text-primary/80',
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
        <Button asChild className="rounded-2xl">
          <Link href="/dashboard">Open dashboard</Link>
        </Button>
      }
      secondaryAction={
        <Button asChild variant="outline" className="rounded-2xl">
          <Link href="/">Back to home</Link>
        </Button>
      }
    />
  );
}
