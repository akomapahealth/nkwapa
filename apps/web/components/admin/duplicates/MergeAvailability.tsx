'use client';

import { describeMergeAvailability, type DuplicateCandidate } from '@/lib/patient-duplicates';
import { InlineNotice } from '@/components/ops/OpsShared';
import { Badge } from '@/components/ui/badge';

/**
 * A pair's merge status as a badge, with the reason as its accessible description.
 *
 * Shown only when merge is refused: "can be merged" on every ordinary row would be noise, and the
 * absence of this badge already says it.
 */
export function MergeUnavailableBadge({ candidate }: { candidate: DuplicateCandidate }) {
  const availability = describeMergeAvailability(candidate);
  if (availability.available) return null;
  return (
    <Badge variant="outline" title={availability.reason ?? undefined}>
      {availability.label}
    </Badge>
  );
}

/** Why the pair cannot be merged and what to do instead, for the comparison panel. */
export function MergeUnavailableNotice({
  candidate,
  investigation = false,
}: {
  candidate: DuplicateCandidate;
  /** On the investigation screen the next step is a policy decision, not a queue action. */
  investigation?: boolean;
}) {
  const availability = describeMergeAvailability(candidate);
  if (availability.available) return null;
  return (
    <InlineNotice tone="warning" live={false}>
      <span className="font-medium">{availability.reason ?? 'These charts cannot be merged.'}</span>{' '}
      {investigation
        ? 'Consolidating charts across clinics is not supported yet. This pair is counted toward the cross-clinic burden so that decision can be made with real numbers.'
        : availability.recovery}
    </InlineNotice>
  );
}
