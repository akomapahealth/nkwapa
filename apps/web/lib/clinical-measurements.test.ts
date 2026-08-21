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

  describe('temperature is queued in a shape the server will accept', () => {
    // apps/api/src/sync/clinical-measurements.service.ts requires temperature value, unit,
    // and source to be all present or all absent. Sending the form's default unit next to an
    // empty temperature produced a mutation the server rejected with VALIDATION_ERROR on
    // every retry. lib/sync.ts only removes an outbox row on APPLIED, so that one bad
    // mutation made the queue permanently undrainable and the pending counter never cleared.
    const queuedVitals = () => {
      const call = mockOutboxAdd.mock.calls.at(-1)?.[0] as { payloadJson: string };
      return (JSON.parse(call.payloadJson) as { vitals: Record<string, unknown> }).vitals;
    };

    it('omits the unit when no temperature was recorded', async () => {
      await saveClinicalMeasurementsOffline({
        clinicId: 'clinic-1',
        encounterId: 'encounter-1',
        vitalsId: 'vitals-1',
        tobaccoScreeningId: 'tobacco-1',
        vitals: { ...vitals, temperatureValue: '', temperatureSource: '' },
        tobacco,
      });

      const queued = queuedVitals();
      expect(queued.temperatureValue).toBeNull();
      expect(queued.temperatureUnit).toBeNull();
      expect(queued.temperatureSource).toBeNull();
    });

    it('keeps value, unit, and source together when a temperature was recorded', async () => {
      await saveClinicalMeasurementsOffline({
        clinicId: 'clinic-1',
        encounterId: 'encounter-1',
        vitalsId: 'vitals-1',
        tobaccoScreeningId: 'tobacco-1',
        vitals,
        tobacco,
      });

      const queued = queuedVitals();
      expect(queued.temperatureValue).toBe(98.6);
      expect(queued.temperatureUnit).toBe('FAHRENHEIT');
      expect(queued.temperatureSource).toBe('ORAL');
    });

    it('queues an otherwise empty vitals form with every optional field absent', async () => {
      const empty: VitalsFormValues = {
        systolicBp: '',
        diastolicBp: '',
        bpSite: '',
        bpSiteOther: '',
        patientPosition: '',
        patientPositionOther: '',
        cuffSize: '',
        cuffSizeOther: '',
        pulseBpm: '',
        temperatureValue: '',
        temperatureUnit: 'CELSIUS',
        temperatureSource: '',
        temperatureSourceOther: '',
        respiratoryRate: '',
        spo2Percent: '',
        weightKg: '',
        heightCm: '',
        notes: '',
      };

      const result = await saveClinicalMeasurementsOffline({
        clinicId: 'clinic-1',
        encounterId: 'encounter-1',
        vitalsId: 'vitals-1',
        tobaccoScreeningId: 'tobacco-1',
        vitals: empty,
        tobacco,
      });

      expect(result.errors).toEqual({});
      const queued = queuedVitals();
      // Each paired group must be wholly absent, matching the server's pairing rules.
      expect(queued.systolicBp).toBeNull();
      expect(queued.diastolicBp).toBeNull();
      expect(queued.temperatureValue).toBeNull();
      expect(queued.temperatureUnit).toBeNull();
      expect(queued.temperatureSource).toBeNull();
    });
  });
});
