import { readFileSync } from 'node:fs';
import { evaluateGlucoseSuspicion, isHypoglycemic } from './diabetes-thresholds';
import {
  cmToFeetInches,
  defaultUnitsForCountry,
  feetInchesToCm,
  formatGlucose,
  formatHba1c,
  formatHeight,
  formatWeight,
  glucoseFromMgDl,
  glucoseToMgDl,
  hba1cFromPercent,
  hba1cToPercent,
  isValidGlucoseEntry,
  MG_DL_COUNTRY_CODES,
  resolveClinicUnits,
  STORED_UNITS,
  US_BODY_COUNTRY_CODES,
  storedValueForEntry,
  weightFromKg,
  weightToKg,
} from './measurement-units';

/** Every value from min to max at this step, built from integers so no float drift creeps in. */
function steps(min: number, max: number, decimals: number): number[] {
  const scale = 10 ** decimals;
  const out: number[] = [];
  for (let i = Math.round(min * scale); i <= Math.round(max * scale); i += 1) out.push(i / scale);
  return out;
}

describe('glucose', () => {
  it('maps the WHO lines onto the approved mg/dL thresholds', () => {
    expect(glucoseToMgDl(7.0, 'MMOL_L')).toBe(126);
    expect(glucoseToMgDl(11.1, 'MMOL_L')).toBe(200);
    expect(glucoseToMgDl(3.9, 'MMOL_L')).toBe(70);
    expect(glucoseToMgDl(126, 'MG_DL')).toBe(126);
  });

  it('classifies mmol/L entries on the right side of each threshold', () => {
    const fasting = (mmol: number) =>
      evaluateGlucoseSuspicion(glucoseToMgDl(mmol, 'MMOL_L'), 'FASTING');
    const random = (mmol: number) =>
      evaluateGlucoseSuspicion(glucoseToMgDl(mmol, 'MMOL_L'), 'RANDOM');
    expect(fasting(6.9)).toBe('NOT_SUSPECTED');
    expect(fasting(7.0)).toBe('SUSPECTED');
    expect(random(11.0)).toBe('NOT_SUSPECTED');
    expect(random(11.1)).toBe('SUSPECTED');
    expect(isHypoglycemic(glucoseToMgDl(3.9, 'MMOL_L'))).toBe(true);
    expect(isHypoglycemic(glucoseToMgDl(4.0, 'MMOL_L'))).toBe(false);
  });

  it('round-trips every 0.1 mmol/L entry through stored mg/dL without drift', () => {
    for (const mmol of steps(0, 33.3, 1)) {
      expect(glucoseFromMgDl(glucoseToMgDl(mmol, 'MMOL_L'), 'MMOL_L')).toBe(mmol);
    }
  });

  it('keeps the top of the mmol/L range inside the stored 0-600 mg/dL bounds', () => {
    expect(glucoseToMgDl(33.3, 'MMOL_L')).toBeLessThanOrEqual(600);
  });

  it('accepts whole mg/dL and 1 dp mmol/L only', () => {
    expect(isValidGlucoseEntry(126, 'MG_DL')).toBe(true);
    expect(isValidGlucoseEntry(126.5, 'MG_DL')).toBe(false);
    expect(isValidGlucoseEntry(7.1, 'MMOL_L')).toBe(true);
    expect(isValidGlucoseEntry(7.15, 'MMOL_L')).toBe(false);
    expect(isValidGlucoseEntry(33.4, 'MMOL_L')).toBe(false);
    expect(isValidGlucoseEntry(-1, 'MMOL_L')).toBe(false);
  });

  it('formats stored mg/dL in either unit', () => {
    expect(formatGlucose(126, 'MMOL_L')).toBe('7.0 mmol/L');
    expect(formatGlucose(126, 'MG_DL')).toBe('126 mg/dL');
    expect(formatGlucose(null, 'MMOL_L')).toBeNull();
  });
});

describe('storedValueForEntry', () => {
  const from = (mgDl: number) => glucoseFromMgDl(mgDl, 'MMOL_L');
  const to = (mmol: number) => glucoseToMgDl(mmol, 'MMOL_L');

  it('keeps a stored mg/dL value the person did not change', () => {
    // 127 mg/dL shows as 7.1 mmol/L; converting 7.1 back would store 128.
    expect(to(from(127))).toBe(128);
    expect(storedValueForEntry(7.1, 127, from, to)).toBe(127);
  });

  it('converts a value the person changed, or one with nothing stored', () => {
    expect(storedValueForEntry(7.2, 127, from, to)).toBe(130);
    expect(storedValueForEntry(7.1, null, from, to)).toBe(128);
  });
});

describe('weight and height', () => {
  it('round-trips every 0.1 lb from 1 to 1500 lb through stored kg', () => {
    for (const lb of steps(1, 1500, 1)) {
      expect(weightFromKg(weightToKg(lb, 'US'), 'US')).toBe(lb);
    }
  });

  it('round-trips every 0.1 in height through stored cm', () => {
    for (const totalInches of steps(8, 118, 1)) {
      const feet = Math.floor(totalInches / 12);
      const inches = Math.round((totalInches - feet * 12) * 10) / 10;
      expect(cmToFeetInches(feetInchesToCm(feet, inches))).toEqual({ feet, inches });
    }
  });

  it('leaves metric values alone', () => {
    expect(weightToKg(70.25, 'METRIC')).toBe(70.25);
    expect(weightFromKg(70.25, 'METRIC')).toBe(70.3);
    expect(formatHeight(170, 'METRIC')).toBe('170 cm');
  });

  it('carries 12 inches up to the next foot', () => {
    expect(cmToFeetInches(182.88)).toEqual({ feet: 6, inches: 0 });
    expect(cmToFeetInches(182.85)).toEqual({ feet: 6, inches: 0 });
  });

  it('formats in the clinic unit', () => {
    expect(formatWeight(70, 'US')).toBe('154.3 lb');
    expect(formatWeight(70, 'METRIC')).toBe('70 kg');
    expect(formatHeight(170, 'US')).toBe('5 ft 6.9 in');
  });
});

describe('HbA1c', () => {
  it('converts the diagnostic line, 6.5 % = 48 mmol/mol', () => {
    expect(hba1cFromPercent(6.5, 'MMOL_MOL')).toBe(48);
    expect(formatHba1c(6.5, 'MMOL_MOL')).toBe('48 mmol/mol');
    expect(formatHba1c(6.5, 'PERCENT')).toBe('6.5%');
  });

  it('round-trips every whole mmol/mol from 0 to 200 through stored %', () => {
    for (const mmol of steps(0, 200, 0)) {
      expect(hba1cFromPercent(hba1cToPercent(mmol, 'MMOL_MOL'), 'MMOL_MOL')).toBe(mmol);
    }
  });
});

describe('clinic units', () => {
  it('defaults Ghana to mmol/L, metric and %', () => {
    expect(defaultUnitsForCountry('GH')).toEqual({
      glucoseUnit: 'MMOL_L',
      bodyUnit: 'METRIC',
      hba1cUnit: 'PERCENT',
    });
  });

  it('defaults the US to mg/dL and US body units', () => {
    expect(defaultUnitsForCountry('us')).toEqual({
      glucoseUnit: 'MG_DL',
      bodyUnit: 'US',
      hba1cUnit: 'PERCENT',
    });
  });

  it('falls back to the stored units when a source has none or junk', () => {
    expect(resolveClinicUnits(undefined)).toEqual(STORED_UNITS);
    expect(resolveClinicUnits({ glucoseUnit: 'MMOL_L', bodyUnit: 'stone' })).toEqual({
      ...STORED_UNITS,
      glucoseUnit: 'MMOL_L',
    });
  });
});

describe('the units migration', () => {
  it('backfills the same country lists the code defaults from', () => {
    const sql = readFileSync(
      `${__dirname}/../prisma/migrations/20261105130000_clinic_measurement_units/migration.sql`,
      'utf8',
    );
    const listFor = (column: string) => {
      const match = new RegExp(`SET "${column}" = '[A-Z_]+'\\s+WHERE [^;]+? IN \\(([^)]+)\\)`).exec(
        sql,
      );
      return match?.[1].split(',').map((code) => code.trim().replace(/'/g, ''));
    };
    expect(listFor('glucoseUnit')).toEqual([...MG_DL_COUNTRY_CODES]);
    expect(listFor('bodyUnit')).toEqual([...US_BODY_COUNTRY_CODES]);
  });
});
