'use client';

import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InfoHint } from '@/components/ui/info-hint';
import { cn } from '@/lib/utils';

interface FormSectionCardProps {
  title: string;
  /** Heading level for the section title. `h2` when the card is a top-level section. */
  titleAs?: 'h2' | 'h3';
  description?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function FormSectionCard({
  title,
  titleAs = 'h3',
  description,
  hint,
  children,
  className,
  contentClassName,
}: FormSectionCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="space-y-2 pb-4">
        <div className="flex items-start gap-2">
          <CardTitle as={titleAs} className="text-lg">
            {title}
          </CardTitle>
          {hint ? <InfoHint label={hint} className="-mt-1" /> : null}
        </div>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className={cn('space-y-4', contentClassName)}>{children}</CardContent>
    </Card>
  );
}
