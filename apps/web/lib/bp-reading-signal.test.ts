import { bpReadingSignal } from './bp-reading-signal';

describe('BP reading presentation guard', () => {
  it.each([
    ['', ''],
    [null, 80],
    [190, ''],
    [' ', 80],
    ['abc', 80],
    [Infinity, 80],
    [301, 80],
    [39, 20],
    [120, 201],
    [120, 19],
    [80, 120],
    [120, 120],
  ])('does not give a reassuring category for incomplete/invalid %p / %p', (sys, dia) => {
    expect(bpReadingSignal(sys, dia)).toBeNull();
  });
  it.each([
    [119, 79, 'NORMAL'],
    [120, 79, 'ELEVATED'],
    [129, 79, 'ELEVATED'],
    [130, 79, 'STAGE1'],
    [119, 80, 'STAGE1'],
    [140, 80, 'STAGE2'],
    [130, 90, 'STAGE2'],
    [180, 80, 'CRISIS'],
    [160, 120, 'CRISIS'],
  ])('keeps the existing shared category for %p / %p', (sys, dia, category) => {
    expect(bpReadingSignal(sys, dia)?.category).toBe(category);
  });
  it('retains a separate low-BP flag, including a low diastolic alongside high systolic', () => {
    expect(bpReadingSignal('85', '55')).toMatchObject({ systolic: 85, diastolic: 55, low: true });
    expect(bpReadingSignal(150, 55)).toMatchObject({ category: 'STAGE2', low: true });
  });
});
