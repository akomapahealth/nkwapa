'use client';

import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InfoHint } from '@/components/ui/info-hint';
import { cn } from '@/lib/utils';

interface FormSectionCardProps {
  title: string;
  description?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function FormSectionCard({
  title,
  description,
  hint,
  children,
  className,
  contentClassName,
}: FormSectionCardProps) {
  return (
    <Card className={cn('rounded-lg border-border/80 bg-card/90', className)}>
      <CardHeader className="space-y-2 pb-4">
        <div className="flex items-start gap-2">
          <CardTitle className="text-lg">{title}</CardTitle>
          {hint ? <InfoHint label={hint} className="-mt-1" /> : null}
        </div>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className={cn('space-y-4', contentClassName)}>{children}</CardContent>
    </Card>
  );
}
