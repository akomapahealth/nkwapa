const mockVitalsPut = jest.fn().mockResolvedValue(undefined);
const mockTobaccoPut = jest.fn().mockResolvedValue(undefined);
const mockOutboxAdd = jest.fn().mockResolvedValue(undefined);
const mockTransaction = jest.fn(async (...args: unknown[]) => {
  const callback = args.at(-1) as () => Promise<void>;
  await callback();
});

jest.mock('./db', () => ({
  db: {
    vitals: { put: mockVitalsPut },
    tobacco_screenings: { put: mockTobaccoPut },
    outbox: { add: mockOutboxAdd },
    transaction: mockTransaction,
  },
}));

import {
  derivedBmi,
  saveClinicalMeasurementsOffline,
  validateClinicalMeasurements,
  type TobaccoFormValues,
  type VitalsFormValues,
} from './clinical-measurements';

const vitals: VitalsFormValues = {
  systolicBp: '120',
  diastolicBp: '80',
  bpSite: 'LEFT_ARM',
  bpSiteOther: '',
  patientPosition: 'SITTING',
  patientPositionOther: '',
  cuffSize: 'ADULT',
  cuffSizeOther: '',
  pulseBpm: '72',
  temperatureValue: '98.6',
  temperatureUnit: 'FAHRENHEIT',
  temperatureSource: 'ORAL',
  temperatureSourceOther: '',
  respiratoryRate: '16',
  spo2Percent: '98',
  weightKg: '70',
  heightCm: '170',
  notes: '',
};

const tobacco: TobaccoFormValues = {
  smokingStatus: 'NEVER',
  smokelessTobaccoStatus: 'NOT_ASSESSED',
  passiveExposure: 'NO',
  readinessToQuit: 'NOT_APPLICABLE',
  counselingGiven: 'NO',
};

describe('clinical measurement offline helpers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('validates relationships and derives BMI', () => {
    expect(validateClinicalMeasurements(vitals, tobacco)).toEqual({});
    expect(derivedBmi(vitals)).toBe(24.2);

    expect(validateClinicalMeasurements({ ...vitals, diastolicBp: '' }, tobacco)).toMatchObject({
      systolicBp: expect.any(String),
      diastolicBp: expect.any(String),
    });
    expect(
      validateClinicalMeasurements(
        { ...vitals, temperatureSource: '', temperatureValue: '98.6' },
        tobacco,
      ),
    ).toMatchObject({ temperatureSource: expect.any(String) });
  });

  it('writes vitals, tobacco, and one bundle mutation in a single Dexie transaction', async () => {
    const result = await saveClinicalMeasurementsOffline({
      clinicId: 'clinic-1',
      encounterId: 'encounter-1',
      vitalsId: 'vitals-1',
      tobaccoScreeningId: 'tobacco-1',
      vitals,
      tobacco,
      markTobaccoReviewed: true,
    });

    expect(result.errors).toEqual({});
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockVitalsPut).toHaveBeenCalledWith(
      expect.objectContaining({ temperatureCelsius: 37, bmi: 24.2 }),
    );
    expect(mockTobaccoPut).toHaveBeenCalledWith(expect.objectContaining({ reviewPending: true }));
    expect(mockOutboxAdd).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'encounter_vitals_bundle' }),
    );
  });
});
