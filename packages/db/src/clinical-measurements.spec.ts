import { computeBmi, toCelsius } from './clinical-measurements';

describe('clinical measurement normalization', () => {
  it('converts Fahrenheit to canonical Celsius', () => {
    expect(toCelsius(98.6, 'FAHRENHEIT')).toBe(37);
    expect(toCelsius(37.04, 'CELSIUS')).toBe(37);
  });

  it('computes BMI from canonical kilograms and centimeters', () => {
    expect(computeBmi(70, 170)).toBe(24.2);
    expect(computeBmi(null, 170)).toBeNull();
    expect(computeBmi(70, 0)).toBeNull();
  });
});
