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
