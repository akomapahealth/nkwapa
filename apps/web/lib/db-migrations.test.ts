import { migrateLegacyPulse } from './db-migrations';

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
});
