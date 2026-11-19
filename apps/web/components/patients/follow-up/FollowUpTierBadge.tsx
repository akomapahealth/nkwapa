import { FOLLOW_UP_TIER_LABELS, type FollowUpTier } from '@nkwapa/db/follow-up-stratification';
import { Badge } from '@/components/ui/badge';
import { TIER_PRESENTATION } from '@/lib/follow-up';
import { cn } from '@/lib/utils';

/**
 * A patient's follow-up tier as a tag (#336). Never animated: it sits in every registry row and
 * queue lane, and motion there is noise. A null tier has not been computed yet and reads as
 * "Not yet tiered", which is also what the engine says when it lacks the data.
 */
export function FollowUpTierBadge({
  tier,
  stale = false,
  className,
}: {
  tier: FollowUpTier | null | undefined;
  /** Shown from the last copy this device saw, not a live read. */
  stale?: boolean;
  className?: string;
}) {
  const value = tier ?? 'NOT_TIERED';
  const { variant, icon: Icon } = TIER_PRESENTATION[value];
  return (
    <Badge variant={variant} className={cn(stale && 'opacity-70', className)} data-tier={value}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        <span className="sr-only">Follow-up tier: </span>
        {FOLLOW_UP_TIER_LABELS[value]}
        {stale ? <span className="sr-only"> (last known)</span> : null}
      </span>
    </Badge>
  );
}
