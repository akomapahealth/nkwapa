import {
  cmToHeightEntry,
  convertGlucoseText,
  glucoseEntryError,
  glucoseTextToMgDl,
  hba1cEntryError,
  hba1cTextToPercent,
  heightEntryError,
  heightEntryToCm,
  kgToWeightText,
  mgDlToGlucoseText,
  percentToHba1cText,
  weightEntryError,
  weightTextToKg,
} from './measurement-entry';

describe('glucose entry', () => {
  it('stores an mmol/L reading as whole mg/dL', () => {
    expect(glucoseTextToMgDl('7.0', 'MMOL_L')).toBe(126);
    expect(glucoseTextToMgDl('126', 'MG_DL')).toBe(126);
    expect(glucoseTextToMgDl('', 'MMOL_L')).toBeNull();
  });

  it('keeps an unedited stored value instead of re-converting its rounded display', () => {
    expect(mgDlToGlucoseText(127, 'MMOL_L')).toBe('7.1');
    expect(glucoseTextToMgDl('7.1', 'MMOL_L', 127)).toBe(127);
    expect(glucoseTextToMgDl('7.1', 'MMOL_L')).toBe(128);
  });

  it('explains what each unit accepts', () => {
    expect(glucoseEntryError('7.15', 'MMOL_L')).toMatch(/one decimal place/);
    expect(glucoseEntryError('126.5', 'MG_DL')).toMatch(/whole number/);
    expect(glucoseEntryError('abc', 'MMOL_L')).not.toBeNull();
    expect(glucoseEntryError('7.1', 'MMOL_L')).toBeNull();
    expect(glucoseTextToMgDl('7.15', 'MMOL_L')).toBeNull();
  });

  it('shows the same reading when the unit is switched', () => {
    expect(convertGlucoseText('7.0', 'MMOL_L', 'MG_DL')).toBe('126');
    expect(convertGlucoseText('126', 'MG_DL', 'MMOL_L')).toBe('7');
    // A stored 127 switched to mg/dL is still 127, not the 128 its rounded 7.1 would give.
    expect(convertGlucoseText('7.1', 'MMOL_L', 'MG_DL', 127)).toBe('127');
    expect(convertGlucoseText('7.', 'MMOL_L', 'MG_DL')).toBe('7.');
  });
});

describe('HbA1c entry', () => {
  it('stores mmol/mol as % and shows % as mmol/mol', () => {
    expect(hba1cTextToPercent('48', 'MMOL_MOL')).toBe(6.54);
    expect(percentToHba1cText(6.5, 'MMOL_MOL')).toBe('48');
    expect(hba1cTextToPercent('48', 'MMOL_MOL', 6.5)).toBe(6.5);
    expect(hba1cTextToPercent('6.5', 'PERCENT')).toBe(6.5);
  });

  it('rejects a fractional or out-of-range mmol/mol', () => {
    expect(hba1cEntryError('48.5', 'MMOL_MOL')).toMatch(/whole number/);
    expect(hba1cEntryError('201', 'MMOL_MOL')).not.toBeNull();
    expect(hba1cTextToPercent('48.5', 'MMOL_MOL')).toBeNull();
  });
});

describe('weight entry', () => {
  it('stores lb as kg to 2 dp and leaves kg alone', () => {
    expect(weightTextToKg('154.3', 'US')).toBe(69.99);
    expect(weightTextToKg('70', 'METRIC')).toBe(70);
    expect(kgToWeightText(69.99, 'US')).toBe('154.3');
    expect(weightTextToKg('154.3', 'US', 70)).toBe(70);
  });

  it('holds lb to the stored kg bounds', () => {
    expect(weightEntryError('2000', 'US')).toMatch(/lb/);
    expect(weightEntryError('154', 'US')).toBeNull();
    expect(weightEntryError('800', 'METRIC')).toMatch(/kg/);
  });
});

describe('height entry', () => {
  it('stores feet and inches as cm, treating an empty part as zero', () => {
    expect(heightEntryToCm({ cm: '', feet: '5', inches: '7' }, 'US')).toBe(170.18);
    expect(heightEntryToCm({ cm: '', feet: '6', inches: '' }, 'US')).toBe(182.88);
    expect(heightEntryToCm({ cm: '', feet: '', inches: '' }, 'US')).toBeNull();
    expect(heightEntryToCm({ cm: '170', feet: '', inches: '' }, 'METRIC')).toBe(170);
  });

  it('keeps an unedited stored height', () => {
    const shown = cmToHeightEntry(170);
    expect(shown).toMatchObject({ feet: '5', inches: '6.9' });
    expect(heightEntryToCm(shown, 'US', 170)).toBe(170);
  });

  it('rejects 12 inches or more and heights outside the stored bounds', () => {
    expect(heightEntryError({ cm: '', feet: '5', inches: '12' }, 'US')).not.toBeNull();
    expect(heightEntryError({ cm: '', feet: '12', inches: '0' }, 'US')).not.toBeNull();
    expect(heightEntryError({ cm: '', feet: '5', inches: '7' }, 'US')).toBeNull();
    expect(heightEntryError({ cm: '10', feet: '', inches: '' }, 'METRIC')).not.toBeNull();
  });
});
