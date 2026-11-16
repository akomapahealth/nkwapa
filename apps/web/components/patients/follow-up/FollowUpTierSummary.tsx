'use client';

import {
  FOLLOW_UP_ACTION_LABELS,
  FOLLOW_UP_MISSING_INPUT_LABELS,
  FOLLOW_UP_REASON_LABELS,
} from '@nkwapa/db/follow-up-stratification';
import { InfoHint } from '@/components/ui/info-hint';
import type { FollowUpAssessmentRow } from '@/lib/follow-up';
import { FollowUpTierBadge } from './FollowUpTierBadge';

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="font-medium text-foreground">{title}</p>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The tier in the chart header, with why it is that tier one tap away (#336). The reasons, the
 * next steps and anything missing are the engine's own codes in plain words, never numbers: the
 * thresholds await clinical sign-off (#334) and must not be learned from the screen.
 */
export function FollowUpTierSummary({
  assessment,
  stale,
}: {
  assessment: FollowUpAssessmentRow | null;
  stale: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1" data-testid="follow-up-tier">
      <FollowUpTierBadge tier={assessment?.tier} stale={stale} />
      <InfoHint label="Why this tier" size="sm">
        {assessment ? (
          <div className="space-y-2">
            <List
              title="Because"
              items={assessment.reasons.map((reason) => FOLLOW_UP_REASON_LABELS[reason])}
            />
            <List
              title="Next"
              items={assessment.actions.map((action) => FOLLOW_UP_ACTION_LABELS[action])}
            />
            <List
              title="Not recorded yet"
              items={assessment.missing.map((input) => FOLLOW_UP_MISSING_INPUT_LABELS[input])}
            />
            {stale ? <p>Last known tier. It updates when this device is back online.</p> : null}
          </div>
        ) : (
          <p>No tier yet. One is worked out after the next save to this chart.</p>
        )}
      </InfoHint>
    </span>
  );
}
