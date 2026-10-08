import {
  emptyEyeForm,
  eyeFormFromRecord,
  eyePayloadFromForm,
  findingKey,
  summarizeEyeScreening,
  type EyeScreeningRecord,
} from './eye-screening';

function record(overrides: Partial<EyeScreeningRecord> = {}): EyeScreeningRecord {
  return {
    id: 'eye-1',
    encounterId: 'enc-1',
    hasEyeComplaint: false,
    complaintHistory: null,
    wearsCorrection: false,
    vaOdUnaided: '6/6',
    vaOsUnaided: '6/6',
    vaOuUnaided: '6/6',
    vaOdAided: null,
    vaOsAided: null,
    vaOuAided: null,
    vaOdPinhole: null,
    vaOsPinhole: null,
    cupDiscRatioOd: 0.3,
    cupDiscRatioOs: null,
    findings: [],
    visionLossCause: null,
    diabeticSignsSeen: false,
    hypertensiveSignsSeen: false,
    referralRecommended: false,
    referralNote: null,
    notes: null,
    author: { id: 'vol-1', displayName: 'Volunteer' },
    version: 1,
    updatedAt: '2026-10-08T10:00:00Z',
    ...overrides,
  };
}

describe('eyePayloadFromForm', () => {
  it('sends untaken readings as null and drops detail of unticked choices', () => {
    const form = {
      ...emptyEyeForm(),
      vaOdUnaided: '6/18' as const,
      cupDiscRatioOs: '0.4',
      complaintHistory: 'left over from an earlier tick',
      referralNote: 'also stale',
    };
    const payload = eyePayloadFromForm(form);
    expect(payload).toMatchObject({
      vaOdUnaided: '6/18',
      vaOsUnaided: null,
      cupDiscRatioOd: null,
      cupDiscRatioOs: 0.4,
      complaintHistory: null,
      referralNote: null,
    });
    expect(payload).not.toHaveProperty('expectedVersion');
  });

  it('keeps a finding note only while the finding is abnormal, in examination order', () => {
    const form = emptyEyeForm();
    form.findings[findingKey('OS', 'MACULA')] = { result: 'ABNORMAL', note: ' Exudates ' };
    form.findings[findingKey('OD', 'CORNEA')] = { result: 'NORMAL', note: 'typed then cleared' };
    expect(eyePayloadFromForm(form, 4)).toMatchObject({
      expectedVersion: 4,
      findings: [
        { eye: 'OD', structure: 'CORNEA', result: 'NORMAL', note: null },
        { eye: 'OS', structure: 'MACULA', result: 'ABNORMAL', note: 'Exudates' },
      ],
    });
  });

  it('round-trips a saved record', () => {
    const saved = record({
      vaOdPinhole: '6/9',
      findings: [{ eye: 'OD', structure: 'LENS', result: 'ABNORMAL', note: 'Opacity' }],
      referralRecommended: true,
      referralNote: 'Cataract review',
    });
    const payload = eyePayloadFromForm(eyeFormFromRecord(saved), saved.version);
    expect(payload).toMatchObject({
      vaOdPinhole: '6/9',
      cupDiscRatioOd: 0.3,
      findings: saved.findings,
      referralNote: 'Cataract review',
    });
  });
});

describe('summarizeEyeScreening', () => {
  it('reports nothing before the eye station has recorded', () => {
    expect(summarizeEyeScreening(null)).toBeNull();
  });

  it('is quiet for normal vision and no findings', () => {
    expect(summarizeEyeScreening(record())).toEqual({
      right: '6/6',
      left: '6/6',
      flag: false,
      detail: '',
    });
  });

  it('takes the best reading per eye and flags what needs a look', () => {
    const summary = summarizeEyeScreening(
      record({
        vaOdUnaided: '6/36',
        vaOdPinhole: '6/12',
        vaOsUnaided: 'CF',
        findings: [{ eye: 'OS', structure: 'OPTIC_DISC', result: 'ABNORMAL', note: null }],
        hypertensiveSignsSeen: true,
        referralRecommended: true,
      }),
    );
    expect(summary).toMatchObject({ right: '6/12', left: 'CF', flag: true });
    expect(summary?.detail).toBe(
      'reduced vision · 1 abnormal finding · hypertensive signs · referral recommended',
    );
  });
});
