import { lineFlagReading, suggestedHandoffNote } from './LineFlags';

jest.mock('@/lib/bootstrap-context', () => ({ useClinicUnits: () => ({ glucoseUnit: 'MG_DL' }) }));

describe('line flag wording (#415)', () => {
  const crisis = { kind: 'REFER_TODAY', source: 'BP', systolic: 184, diastolic: 112 } as const;
  const glucose = { kind: 'REPEAT_AT_REVIEW', source: 'GLUCOSE', glucoseMgDl: 216 } as const;

  it('reads each source in the clinic unit', () => {
    expect(lineFlagReading(crisis, 'MG_DL')).toBe('BP 184/112');
    expect(lineFlagReading(glucose, 'MMOL_L')).toBe('Glucose 12.0 mmol/L');
  });

  it('suggests one note line per flag, and none without a flag', () => {
    expect(suggestedHandoffNote([crisis], 'MG_DL')).toBe('BP 184/112, refer today');
    expect(suggestedHandoffNote([crisis, glucose], 'MG_DL')).toBe(
      'BP 184/112, refer today; Glucose 216 mg/dL, repeat at review',
    );
    expect(suggestedHandoffNote([], 'MG_DL')).toBe('');
  });
});
