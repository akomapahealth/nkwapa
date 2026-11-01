import { UserRole } from '@prisma/client';
import {
  researchMinSubjects,
  runSkipReason,
  type RunGovernanceInput,
} from './research-run-governance';

const NOW = new Date('2026-11-01T03:00:00Z');
const CLINIC = 'clinic-1';

function input(overrides: Partial<RunGovernanceInput> = {}): RunGovernanceInput {
  return {
    clinicId: CLINIC,
    researchEnabled: true,
    schedule: {
      status: 'ACTIVE',
      reviewBy: new Date('2027-10-01T00:00:00Z'),
      approver: { isActive: true, roles: [{ clinicId: CLINIC, role: UserRole.DIRECTOR }] },
    },
    consentedSubjects: 25,
    minSubjects: 10,
    now: NOW,
    ...overrides,
  };
}

describe('research run governance', () => {
  it('lets a run publish when every check holds', () => {
    expect(runSkipReason(input())).toBeNull();
  });

  it('skips when research was turned off after the schedule was approved', () => {
    expect(runSkipReason(input({ researchEnabled: false }))).toBe('RESEARCH_DISABLED');
  });

  it.each(['PAUSED', 'PENDING_APPROVAL', 'EXPIRED', 'REVOKED'] as const)(
    'skips when the schedule is %s',
    (status) => {
      const base = input();
      expect(runSkipReason({ ...base, schedule: { ...base.schedule!, status } })).toBe(
        'SCHEDULE_INACTIVE',
      );
    },
  );

  it('skips once the standing approval is past its review date', () => {
    const base = input();
    expect(runSkipReason({ ...base, schedule: { ...base.schedule!, reviewBy: NOW } })).toBe(
      'REVIEW_EXPIRED',
    );
  });

  it('skips when the approving director no longer holds the approval permission here', () => {
    const base = input();
    const elsewhere = { isActive: true, roles: [{ clinicId: 'other', role: UserRole.DIRECTOR }] };
    expect(runSkipReason({ ...base, schedule: { ...base.schedule!, approver: elsewhere } })).toBe(
      'APPROVER_LOST_PERMISSION',
    );
  });

  it('skips when the approving director was deactivated', () => {
    const base = input();
    const approver = { ...base.schedule!.approver!, isActive: false };
    expect(runSkipReason({ ...base, schedule: { ...base.schedule!, approver } })).toBe(
      'APPROVER_LOST_PERMISSION',
    );
  });

  it('skips a cohort below the minimum, for manual runs too', () => {
    expect(runSkipReason(input({ consentedSubjects: 9 }))).toBe('BELOW_MINIMUM_COHORT');
    expect(runSkipReason(input({ schedule: null, consentedSubjects: 9 }))).toBe(
      'BELOW_MINIMUM_COHORT',
    );
    expect(runSkipReason(input({ consentedSubjects: 10 }))).toBeNull();
  });

  it('reads the minimum from the environment, defaulting to 10', () => {
    const original = process.env.RESEARCH_MIN_SUBJECTS;
    delete process.env.RESEARCH_MIN_SUBJECTS;
    expect(researchMinSubjects()).toBe(10);
    process.env.RESEARCH_MIN_SUBJECTS = '2';
    expect(researchMinSubjects()).toBe(2);
    process.env.RESEARCH_MIN_SUBJECTS = 'zero';
    expect(researchMinSubjects()).toBe(10);
    if (original === undefined) delete process.env.RESEARCH_MIN_SUBJECTS;
    else process.env.RESEARCH_MIN_SUBJECTS = original;
  });
});
