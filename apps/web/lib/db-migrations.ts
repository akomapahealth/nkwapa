export interface LegacyPulseRecord {
  heartRate?: number;
  pulseBpm?: number;
}

/** Mutates a cached vitals row during the Dexie v4 upgrade. */
export function migrateLegacyPulse(record: LegacyPulseRecord): void {
  if (record.pulseBpm == null && record.heartRate != null) {
    record.pulseBpm = record.heartRate;
  }
  delete record.heartRate;
}
