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
            {/* Inline, so the help follows the label's last line when a narrow card wraps it. */}
            <CardDescription className="text-eyebrow text-muted-foreground">
              {hint ? <TitleWithHint title={title} hint={hint} /> : title}
            </CardDescription>
            <CardTitle className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-foreground sm:text-3xl">
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

/**
 * The label's last word and its help icon never part: a narrow card wraps the label, and an icon
 * left alone on the next line reads as belonging to the number below it.
 */
function TitleWithHint({ title, hint }: { title: string; hint: string }) {
  const split = title.lastIndexOf(' ');
  const head = split === -1 ? '' : title.slice(0, split + 1);
  const tail = split === -1 ? title : title.slice(split + 1);
  return (
    <>
      {head ? <span className="align-middle">{head}</span> : null}
      <span className="whitespace-nowrap">
        <span className="align-middle">{tail}</span>
        <InfoHint label={hint} size="sm" className="ml-1" />
      </span>
    </>
  );
}
