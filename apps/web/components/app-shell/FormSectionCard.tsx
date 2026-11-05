'use client';

import type { ReactNode } from 'react';
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
  titleAs: Heading = 'h2',
  description,
  hint,
  children,
  className,
  contentClassName,
}: FormSectionCardProps) {
  return (
    <section className={cn('min-w-0 border-t border-rule py-5', className)}>
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Heading className="type-section-title">{title}</Heading>
          {hint ? <InfoHint label={hint} size="sm" /> : null}
        </div>
        {description ? (
          <p className="type-label font-normal text-muted-foreground">{description}</p>
        ) : null}
      </header>
      <div className={cn('mt-4 space-y-4', contentClassName)}>{children}</div>
    </section>
  );
}
