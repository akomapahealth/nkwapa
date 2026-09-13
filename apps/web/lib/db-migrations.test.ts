import {
  migrateLegacyDiabetesInterview,
  migrateLegacyDiabetesScreening,
  migrateLegacyHypertensionAssessment,
  migrateLegacyPulse,
  stripStoredNationalIdSecrets,
  type LegacyDiabetesScreeningRecord,
} from './db-migrations';

describe('Dexie clinical measurement migrations', () => {
  it('preserves a legacy heart rate as pulse bpm', () => {
    const record = { heartRate: 72 };

    migrateLegacyPulse(record);

    expect(record).toEqual({ pulseBpm: 72 });
  });

  it('does not replace a newer pulse value with the compatibility field', () => {
    const record = { heartRate: 64, pulseBpm: 70 };

    migrateLegacyPulse(record);

    expect(record).toEqual({ pulseBpm: 70 });
  });

  it('structures recognized legacy diabetes symptoms and preserves collection context', () => {
    const record: LegacyDiabetesScreeningRecord = {
      symptomsJson: '["Polyuria","Blurred vision"]',
      createdAt: '2026-08-10T10:00:00.000Z',
    };

    migrateLegacyDiabetesScreening(record);

    expect(record).toEqual({
      symptomsJson: '["Polyuria","Blurred vision"]',
      symptoms: ['POLYURIA', 'BLURRED_VISION'],
      legacySymptomsUnmapped: false,
      createdAt: '2026-08-10T10:00:00.000Z',
      collectedAt: '2026-08-10T10:00:00.000Z',
    });
  });

  it('flags malformed legacy diabetes symptoms without deleting the raw value', () => {
    const record: LegacyDiabetesScreeningRecord = { symptomsJson: '{not-json' };

    migrateLegacyDiabetesScreening(record);

    expect(record.symptomsJson).toBe('{not-json');
    expect(record.symptoms).toEqual([]);
    expect(record.legacySymptomsUnmapped).toBe(true);
    expect(record.collectedAt).toEqual(expect.any(String));
  });
});

describe('offline national id cleanup', () => {
  it('removes the encrypted national id and its hash from a cached record', () => {
    const record = {
      id: 'patient-1',
      firstName: 'Ama',
      nationalIdLast4: '1234',
      nationalIdCiphertext: 'cipher',
      nationalIdHash: 'hash',
    };

    stripStoredNationalIdSecrets(record);

    expect(record).not.toHaveProperty('nationalIdCiphertext');
    expect(record).not.toHaveProperty('nationalIdHash');
    // The last four digits stay: they are what a clinician reads back to confirm identity.
    expect(record.nationalIdLast4).toBe('1234');
    expect(record.firstName).toBe('Ama');
  });

  it('leaves a record that never held them untouched', () => {
    const record = { id: 'patient-2', nationalIdLast4: null };
    stripStoredNationalIdSecrets(record);
    expect(record).toEqual({ id: 'patient-2', nationalIdLast4: null });
  });
});

describe('migrateLegacyHypertensionAssessment', () => {
  /*
    An unanswered question and an answered "no" have to stay distinguishable.

    A cached row from before the interview has none of the new fields. Leaving them undefined would
    rehydrate as a patient who denied every symptom, and the generated note would say so.
  */
  it('fills the new fields with their unanswered values', () => {
    const record = { classification: 'STAGE1', createdAt: '2026-03-01T09:30:00.000Z' };
    migrateLegacyHypertensionAssessment(record);

    expect(record).toMatchObject({
      hypertensionStatus: 'NOT_ASSESSED',
      currentSymptoms: [],
      urgentReviewRequired: false,
      urgentReviewReasons: [],
      reviewReasons: [],
    });
  });

  /*
    Mirrors the server migration.

    From this release the server derives a classification from the encounter's vitals. A cached row
    that did not claim an override would have its clinician-entered finding replaced on the next
    save, silently.
  */
  it('treats an existing classification as a clinician override', () => {
    const record = { classification: 'STAGE1', createdAt: '2026-03-01T09:30:00.000Z' };
    migrateLegacyHypertensionAssessment(record);

    expect(record).toMatchObject({
      classification: 'STAGE1',
      derivedClassification: 'STAGE1',
      classificationOverridden: true,
    });
  });

  it('dates the record from its own creation, not from the upgrade', () => {
    const record = { createdAt: '2026-03-01T09:30:00.000Z' };
    migrateLegacyHypertensionAssessment(record);
    expect(record).toMatchObject({ collectedAt: '2026-03-01T09:30:00.000Z' });
  });

  it('leaves an already-migrated row alone', () => {
    const record = {
      classification: 'NORMAL',
      derivedClassification: 'STAGE2',
      classificationOverridden: false,
      collectedAt: '2026-09-01T00:00:00.000Z',
      createdAt: '2026-03-01T09:30:00.000Z',
      currentSymptoms: ['CHEST_PAIN'],
    };
    migrateLegacyHypertensionAssessment(record);

    expect(record).toMatchObject({
      derivedClassification: 'STAGE2',
      classificationOverridden: false,
      collectedAt: '2026-09-01T00:00:00.000Z',
      currentSymptoms: ['CHEST_PAIN'],
    });
  });
});

describe('migrateLegacyDiabetesInterview', () => {
  it('fills the new fields with their unanswered values', () => {
    const record = { glucoseMgDl: 100, glucoseType: 'FASTING' };
    migrateLegacyDiabetesInterview(record);

    expect(record).toMatchObject({
      diabetesStatus: 'NOT_ASSESSED',
      urgentSymptoms: [],
      urgentReviewRequired: false,
      phq2Interest: 'NOT_ASSESSED',
      currentFootWound: 'NOT_ASSESSED',
    });
  });

  /*
    Recomputed rather than left blank, so an offline chart is honest about history before the next
    sync arrives. It runs the same shared function the server does.
  */
  it('classifies a cached reading from its own timing', () => {
    const suspected = { glucoseMgDl: 130, glucoseType: 'FASTING' };
    migrateLegacyDiabetesInterview(suspected);
    expect(suspected).toMatchObject({ derivedSuspicion: 'SUSPECTED' });

    const negative = { glucoseMgDl: 100, glucoseType: 'FASTING' };
    migrateLegacyDiabetesInterview(negative);
    expect(negative).toMatchObject({ derivedSuspicion: 'NOT_SUSPECTED' });
  });

  /* An unknown context is never classified, offline or on the server. */
  it('leaves a reading with no timing unclassified', () => {
    const record = { glucoseMgDl: 400, glucoseType: 'UNKNOWN' };
    migrateLegacyDiabetesInterview(record);
    expect(record).toMatchObject({ derivedSuspicion: 'NOT_ASSESSED' });
  });

  it('leaves an already-migrated row alone', () => {
    const record = {
      glucoseMgDl: 130,
      glucoseType: 'FASTING',
      derivedSuspicion: 'NOT_SUSPECTED',
      urgentSymptoms: ['VOMITING'],
      phq2Positive: true,
    };
    migrateLegacyDiabetesInterview(record);
    expect(record).toMatchObject({
      derivedSuspicion: 'NOT_SUSPECTED',
      urgentSymptoms: ['VOMITING'],
      phq2Positive: true,
    });
  });
});
