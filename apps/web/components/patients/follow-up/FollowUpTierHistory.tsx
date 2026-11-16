'use client';

import {
  FOLLOW_UP_MOVEMENT_TRIGGER_LABELS,
  FOLLOW_UP_REASON_LABELS,
} from '@nkwapa/db/follow-up-stratification';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { RelativeTime } from '@/components/app-shell/RelativeTime';
import type { FollowUpAssessmentRow } from '@/lib/follow-up';
import { FollowUpTierBadge } from './FollowUpTierBadge';

/** How the tier moved over time, newest first (#336). */
export function FollowUpTierHistory({ history }: { history: FollowUpAssessmentRow[] }) {
  if (history.length === 0) return null;
  return (
    <section aria-labelledby="follow-up-history-heading" className="space-y-3">
      <h2 id="follow-up-history-heading" className="type-section-title">
        Follow-up tier history
      </h2>
      <ol className="divide-y divide-border rounded-lg border border-border">
        {history.map((row) => (
          <li key={row.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3">
            <FollowUpTierBadge tier={row.tier} />
            {row.movement === 'UP' || row.movement === 'DOWN' ? (
              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                {row.movement === 'UP' ? (
                  <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {row.movement === 'UP' ? 'Moved up' : 'Moved down'}
                {row.movementTrigger
                  ? `: ${FOLLOW_UP_MOVEMENT_TRIGGER_LABELS[row.movementTrigger]}`
                  : null}
              </span>
            ) : null}
            <span className="ml-auto text-sm text-muted-foreground">
              <RelativeTime value={row.computedAt} />
            </span>
            {row.reasons.length > 0 ? (
              <p className="basis-full text-sm text-muted-foreground">
                {row.reasons.map((reason) => FOLLOW_UP_REASON_LABELS[reason]).join(' · ')}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
