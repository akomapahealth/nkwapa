'use client';

import {
  FOLLOW_UP_TIERS,
  FOLLOW_UP_TIER_LABELS,
  type FollowUpTier,
} from '@nkwapa/db/follow-up-stratification';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ANY = '__any__';

export function parseFollowUpTier(value: string | null | undefined): FollowUpTier | '' {
  return (FOLLOW_UP_TIERS as readonly string[]).includes(value ?? '')
    ? (value as FollowUpTier)
    : '';
}

/** One tier to list, or any (#336). Shown only to readers allowed to see tiers. */
export function FollowUpTierFilter({
  id,
  value,
  onChange,
}: {
  id: string;
  value: FollowUpTier | '';
  onChange: (next: FollowUpTier | '') => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Follow-up tier</Label>
      <Select
        value={value || ANY}
        onValueChange={(next) => onChange(next === ANY ? '' : (next as FollowUpTier))}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any tier</SelectItem>
          {FOLLOW_UP_TIERS.map((tier) => (
            <SelectItem key={tier} value={tier}>
              {FOLLOW_UP_TIER_LABELS[tier]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
