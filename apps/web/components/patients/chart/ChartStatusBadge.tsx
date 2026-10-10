'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * One vocabulary for every state the chart shows, so a draft encounter, a pending
 * cosign, and a locked record read the same way on every tab.
 */
export type ChartState =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'FINALIZED'
  | 'PENDING_COSIGN'
  | 'COSIGNED'
  | 'AMENDED'
  | 'CURRENT'
  | 'HISTORICAL'
  | 'LOCKED';

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'draft' | 'review' | 'finalized';

const STATE_PRESENTATION: Record<ChartState, { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: 'Draft', variant: 'draft' },
  IN_REVIEW: { label: 'In review', variant: 'review' },
  FINALIZED: { label: 'Finalized', variant: 'finalized' },
  PENDING_COSIGN: { label: 'Pending cosign', variant: 'review' },
  COSIGNED: { label: 'Cosigned', variant: 'finalized' },
  AMENDED: { label: 'Amended', variant: 'secondary' },
  CURRENT: { label: 'Current', variant: 'default' },
  HISTORICAL: { label: 'Historical', variant: 'outline' },
  LOCKED: { label: 'Locked', variant: 'outline' },
};

export function chartStateLabel(state: ChartState): string {
  return STATE_PRESENTATION[state].label;
}

export function ChartStatusBadge({ state, className }: { state: ChartState; className?: string }) {
  const presentation = STATE_PRESENTATION[state];
  return (
    <Badge variant={presentation.variant} className={className}>
      {presentation.label}
    </Badge>
  );
}

/**
 * Marks a record the reader cannot change. Announced to assistive technology rather
 * than relying on the padlock glyph alone.
 */
export function ChartLockedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border/80 px-2 py-0.5 text-xs text-muted-foreground',
        className,
      )}
    >
      <span className="sr-only">This record is </span>Locked
    </span>
  );
}
