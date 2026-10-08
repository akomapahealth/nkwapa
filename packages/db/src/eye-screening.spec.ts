import {
  EYE_STRUCTURES,
  EYE_STRUCTURE_LABELS,
  VISUAL_ACUITY_LABELS,
  VISUAL_ACUITY_VALUES,
  bestAcuity,
  isReducedVision,
  isVisualAcuity,
} from './eye-screening';

describe('eye screening vocabulary', () => {
  it('labels every acuity value and every structure', () => {
    for (const value of VISUAL_ACUITY_VALUES) expect(VISUAL_ACUITY_LABELS[value]).toBeTruthy();
    for (const structure of EYE_STRUCTURES) expect(EYE_STRUCTURE_LABELS[structure]).toBeTruthy();
  });

  it('accepts only values from the chart', () => {
    expect(isVisualAcuity('6/9')).toBe(true);
    expect(isVisualAcuity('20/20')).toBe(false);
    expect(isVisualAcuity('6/10')).toBe(false);
    expect(isVisualAcuity(null)).toBe(false);
  });

  it('flags vision worse than 6/12, and the coarse tests below the chart', () => {
    expect(isReducedVision('6/6')).toBe(false);
    expect(isReducedVision('6/12')).toBe(false);
    expect(isReducedVision('6/18')).toBe(true);
    expect(isReducedVision('CF')).toBe(true);
    expect(isReducedVision('NPL')).toBe(true);
    expect(isReducedVision(null)).toBe(false);
  });

  it('takes the best reading for an eye, ignoring readings not taken', () => {
    expect(bestAcuity('6/36', '6/9', '6/12')).toBe('6/9');
    expect(bestAcuity(null, 'HM', undefined)).toBe('HM');
    expect(bestAcuity(null, undefined)).toBeNull();
  });
});
