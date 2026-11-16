import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDot,
  Circle,
  OctagonAlert,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import type {
  FollowUpAction,
  FollowUpMissingInput,
  FollowUpMovementDirection,
  FollowUpMovementTrigger,
  FollowUpReason,
  FollowUpTier,
} from '@nkwapa/db/follow-up-stratification';
import type { BadgeProps } from '@/components/ui/badge';
import { apiFetch, type GetToken } from '@/lib/api';
import { isWebFeatureEnabled } from '@/lib/feature-flags';
import { hasPermission } from '@/lib/ops';

export const FOLLOW_UP_READ = 'FOLLOW_UP.READ';

/** Whether this reader sees tiers: the flag is on and they hold FOLLOW_UP.READ at the clinic. */
export function canSeeFollowUpTier(permissions: readonly string[]): boolean {
  return (
    isWebFeatureEnabled('followUpStratification') && hasPermission([...permissions], FOLLOW_UP_READ)
  );
}

/**
 * Every tier carries a glyph as well as a colour, so it reads in greyscale, to colour-blind staff,
 * and on a sunlit phone. Colours are the status tokens, so dark mode comes for free.
 */
export const TIER_PRESENTATION: Record<
  FollowUpTier,
  { variant: NonNullable<BadgeProps['variant']>; icon: LucideIcon }
> = {
  URGENT: { variant: 'destructive', icon: OctagonAlert },
  HIGH: { variant: 'severe', icon: TriangleAlert },
  MODERATE: { variant: 'warning', icon: CircleAlert },
  LOW_MODERATE: { variant: 'review', icon: CircleDot },
  STABLE: { variant: 'finalized', icon: CircleCheck },
  LOW: { variant: 'secondary', icon: Circle },
  NOT_TIERED: { variant: 'outline', icon: CircleDashed },
};

export interface FollowUpAssessmentRow {
  id: string;
  tier: FollowUpTier;
  reasons: FollowUpReason[];
  missing: FollowUpMissingInput[];
  actions: FollowUpAction[];
  cvdRiskPercent: number | null;
  atTarget: boolean | null;
  previousTier: FollowUpTier | null;
  movement: FollowUpMovementDirection;
  movementTrigger: FollowUpMovementTrigger | null;
  computedAt: string;
}

export interface FollowUpResponse {
  current: FollowUpAssessmentRow | null;
  history: FollowUpAssessmentRow[];
}

export async function fetchFollowUp(
  clinicId: string,
  patientId: string,
  getToken: GetToken,
  signal: AbortSignal,
): Promise<FollowUpResponse> {
  const res = await apiFetch(
    `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/follow-up`,
    { getToken, signal },
  );
  if (!res.ok) throw new Error(`Follow-up tier request failed (${res.status})`);
  return (await res.json()) as FollowUpResponse;
}
