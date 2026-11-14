import { journeyProgress, journeySteps } from './onboarding-journey';

const ids = (steps: { id: string }[]) => steps.map((step) => step.id);

describe('journeySteps', () => {
  it('lists the name step only for staff who still need a name', () => {
    expect(ids(journeySteps('staff'))).toEqual(['password', 'accept', 'name', 'start']);
    expect(ids(journeySteps('staff', { needsName: false }))).toEqual([
      'password',
      'accept',
      'start',
    ]);
    expect(ids(journeySteps('patient', { needsName: false }))).toEqual([
      'password',
      'claim',
      'record',
    ]);
  });
});

describe('journeyProgress', () => {
  it('marks earlier steps done and later ones still to do', () => {
    const progress = journeyProgress(journeySteps('staff'), 'accept');
    expect(progress.current).toBe(1);
    expect(progress.states).toEqual(['done', 'current', 'next', 'next']);
  });

  it('falls back to the first step for an id the journey does not have', () => {
    expect(journeyProgress(journeySteps('patient'), 'name').current).toBe(0);
  });
});

describe('the agreement step (#330)', () => {
  it('is listed only for roles that must sign, after the name', () => {
    expect(journeySteps('staff').map((step) => step.id)).not.toContain('agreement');
    expect(journeySteps('staff', { needsAgreement: true }).map((step) => step.id)).toEqual([
      'password',
      'accept',
      'name',
      'agreement',
      'start',
    ]);
  });
});
