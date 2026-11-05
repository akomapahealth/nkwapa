'use client';

import { StatusLabel } from '@/components/ui/status-label';
import { statusLabel } from '@/lib/status-presentation';
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

const STATE_PRESENTATION: Record<ChartState, { variant: BadgeVariant }> = {
  DRAFT: { variant: 'draft' },
  IN_REVIEW: { variant: 'review' },
  FINALIZED: { variant: 'finalized' },
  PENDING_COSIGN: { variant: 'review' },
  COSIGNED: { variant: 'finalized' },
  AMENDED: { variant: 'secondary' },
  CURRENT: { variant: 'default' },
  HISTORICAL: { variant: 'outline' },
  LOCKED: { variant: 'outline' },
};

export function chartStateLabel(state: ChartState): string {
  return statusLabel(state);
}

export function ChartStatusBadge({ state, className }: { state: ChartState; className?: string }) {
  const presentation = STATE_PRESENTATION[state];
  return <StatusLabel value={state} variant={presentation.variant} className={className} />;
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
