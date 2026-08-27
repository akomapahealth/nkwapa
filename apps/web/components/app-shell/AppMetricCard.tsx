'use client';

import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InfoHint } from '@/components/ui/info-hint';
import { cn } from '@/lib/utils';

export function AppMetricCard({
  title,
  value,
  detail,
  hint,
  icon: Icon,
  className,
}: {
  title: string;
  value: number | string;
  detail?: string;
  hint?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <Card className={cn('overflow-hidden border-border/80 bg-card/90', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <CardDescription className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {title}
              </CardDescription>
              {hint ? <InfoHint label={hint} className="-mr-1 h-5 w-5" /> : null}
            </div>
            <CardTitle className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {value}
            </CardTitle>
          </div>
          {Icon ? (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
          ) : null}
        </div>
      </CardHeader>
      {detail ? (
        <CardContent>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}
