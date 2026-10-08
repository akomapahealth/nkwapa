import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpsertEyeScreeningDto } from './eye-screening.dto';

function validPayload(): Record<string, unknown> {
  return {
    hasEyeComplaint: false,
    wearsCorrection: false,
    vaOdUnaided: '6/9',
    vaOsUnaided: '6/12',
    vaOuUnaided: '6/9',
    cupDiscRatioOd: 0.3,
    cupDiscRatioOs: 0.35,
    findings: [
      { eye: 'OD', structure: 'CORNEA', result: 'NORMAL' },
      { eye: 'OS', structure: 'OPTIC_DISC', result: 'ABNORMAL', note: 'Pale disc' },
    ],
    diabeticSignsSeen: false,
    hypertensiveSignsSeen: false,
    referralRecommended: false,
  };
}

const errorsFor = async (payload: Record<string, unknown>) =>
  (await validate(plainToInstance(UpsertEyeScreeningDto, payload))).map((e) => e.property);

describe('UpsertEyeScreeningDto', () => {
  it('accepts a full examination', async () => {
    expect(await errorsFor(validPayload())).toEqual([]);
  });

  it('accepts readings that were not taken, as null or absent', async () => {
    expect(
      await errorsFor({ ...validPayload(), vaOdUnaided: null, cupDiscRatioOd: null, findings: [] }),
    ).toEqual([]);
    const withoutLeft = validPayload();
    delete withoutLeft.vaOsUnaided;
    expect(await errorsFor(withoutLeft)).toEqual([]);
  });

  it.each(['CF', 'HM', 'PL', 'NPL', '6/60'])('accepts %s', async (value) => {
    expect(await errorsFor({ ...validPayload(), vaOdAided: value })).toEqual([]);
  });

  it.each(['20/20', '6/10', '', 'blind'])('refuses acuity %p', async (value) => {
    expect(await errorsFor({ ...validPayload(), vaOdUnaided: value })).toEqual(['vaOdUnaided']);
  });

  it.each([-0.1, 1.2, 0.333])('refuses cup-to-disc ratio %p', async (value) => {
    expect(await errorsFor({ ...validPayload(), cupDiscRatioOs: value })).toEqual([
      'cupDiscRatioOs',
    ]);
  });

  it('refuses a finding for an unknown structure or eye', async () => {
    expect(
      await errorsFor({
        ...validPayload(),
        findings: [{ eye: 'OU', structure: 'RETINA', result: 'NORMAL' }],
      }),
    ).toEqual(['findings']);
  });
});
