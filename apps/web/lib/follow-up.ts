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
export const FOLLOW_UP_MANAGE = 'FOLLOW_UP.MANAGE';

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

/** Who took an urgent flag, and when (#337). */
export interface UrgentAcknowledgement {
  userId: string;
  displayName: string;
  at: string;
}

/** The open urgent flag while a patient is Urgent. */
export interface UrgentFlag {
  id: string;
  /** URGENT: the tier's own flag. SCREENING_URGENT: a finding today the tier does not count. */
  kind: 'URGENT' | 'SCREENING_URGENT';
  raisedAt: string;
  /** The screening findings in plain words; null for an Urgent tier. */
  detail: string | null;
  /** Reported on a follow-up contact rather than found at screening (#338). */
  reportedOnContact?: boolean;
  acknowledgement: UrgentAcknowledgement | null;
}

export interface FollowUpResponse {
  current: FollowUpAssessmentRow | null;
  history: FollowUpAssessmentRow[];
  /** Absent from an API that predates #337. */
  urgentFlag?: UrgentFlag | null;
}

/**
 * "I'm on it" (#337). Resolves with whoever owns the flag, which is someone else when they
 * pressed first. Throws with a message fit to show when it could not be taken.
 */
export async function acknowledgeUrgentFlag(
  clinicId: string,
  patientId: string,
  getToken: GetToken | undefined,
): Promise<UrgentAcknowledgement> {
  const res = await apiFetch(
    `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/follow-up/acknowledge`,
    { getToken, method: 'POST', activeClinicId: clinicId },
  );
  if (res.status === 409) throw new Error('This patient is no longer urgent.');
  if (res.status === 403) throw new Error('Only staff who take follow-up work can do this here.');
  if (!res.ok) throw new Error(`Could not take this patient (${res.status}). Try again.`);
  return (await res.json()) as UrgentAcknowledgement;
}

/** "Kofi is on it", or "You're on it" for the reader. */
export function acknowledgedLabel(
  ack: { userId: string; displayName: string },
  me?: string | null,
) {
  return ack.userId === me ? "You're on it" : `${ack.displayName || 'A colleague'} is on it`;
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
