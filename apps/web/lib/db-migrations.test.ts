import {
  migrateLegacyDiabetesScreening,
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
