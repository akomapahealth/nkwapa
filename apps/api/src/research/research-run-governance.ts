import type { ResearchScheduleStatus } from '@prisma/client';
import { hasPermissionAtClinic, type ScopedRole } from '../auth/clinic-roles';
import { PERMISSIONS } from '../auth/constants/permissions';

/**
 * Why a run is SKIPPED instead of published (#166). Checked when the run starts, not only when
 * it was scheduled: a director's standing approval says "keep doing this", and each run has to
 * prove that is still true.
 */
export const RESEARCH_SKIP_REASONS = [
  'RESEARCH_DISABLED',
  'SCHEDULE_INACTIVE',
  'REVIEW_EXPIRED',
  'APPROVER_LOST_PERMISSION',
  'BELOW_MINIMUM_COHORT',
] as const;

export type ResearchSkipReason = (typeof RESEARCH_SKIP_REASONS)[number];

/** Governance default; a small de-identified set can still be re-identified within one clinic. */
export const DEFAULT_RESEARCH_MIN_SUBJECTS = 10;

export function researchMinSubjects(): number {
  const configured = Number(process.env.RESEARCH_MIN_SUBJECTS);
  return Number.isInteger(configured) && configured >= 1
    ? configured
    : DEFAULT_RESEARCH_MIN_SUBJECTS;
}

export interface RunGovernanceInput {
  clinicId: string;
  researchEnabled: boolean;
  /** Null for a run no schedule stands behind: a manual export. */
  schedule: {
    status: ResearchScheduleStatus;
    reviewBy: Date | null;
    /** The approving director's roles and whether their account is still active. */
    approver: { isActive: boolean; roles: ScopedRole[] } | null;
  } | null;
  consentedSubjects: number;
  minSubjects: number;
  now: Date;
}

/** The first reason this run must not publish, or null when it may. */
export function runSkipReason(input: RunGovernanceInput): ResearchSkipReason | null {
  if (!input.researchEnabled) return 'RESEARCH_DISABLED';
  const { schedule } = input;
  if (schedule) {
    if (schedule.status !== 'ACTIVE') return 'SCHEDULE_INACTIVE';
    if (!schedule.reviewBy || schedule.reviewBy.getTime() <= input.now.getTime()) {
      return 'REVIEW_EXPIRED';
    }
    const approver = schedule.approver;
    if (
      !approver?.isActive ||
      !hasPermissionAtClinic(approver.roles, input.clinicId, PERMISSIONS.RESEARCH_EXPORT_APPROVE)
    ) {
      return 'APPROVER_LOST_PERMISSION';
    }
  }
  if (input.consentedSubjects < input.minSubjects) return 'BELOW_MINIMUM_COHORT';
  return null;
}
