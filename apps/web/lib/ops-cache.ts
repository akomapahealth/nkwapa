import type { NkwapaDb, OpsCacheKind, OpsCacheRecord } from './db';

export function opsCacheKey(clinicId: string, kind: OpsCacheKind): string {
  return `${clinicId}|${kind}`;
}

/**
 * Keep the copy of a view that just loaded, replacing the previous one for that clinic.
 *
 * A failure to write is swallowed: the cache is a convenience for the next offline moment, and a
 * full or blocked IndexedDB must not turn a successful load into an error on screen.
 */
export async function writeOpsCache<T>(
  dbInstance: Pick<NkwapaDb, 'ops_cache'>,
  entry: { clinicId: string; kind: OpsCacheKind; date: string; data: T },
  now: Date = new Date(),
): Promise<void> {
  const record: OpsCacheRecord<T> = {
    key: opsCacheKey(entry.clinicId, entry.kind),
    ...entry,
    updatedAt: now.toISOString(),
  };
  try {
    await dbInstance.ops_cache.put(record);
  } catch (error) {
    console.warn('Could not keep an offline copy of this view', error);
  }
}

/**
 * The last copy of a view for a clinic day, or nothing if the device only has another day.
 *
 * `isValid` checks the copy is the shape the caller renders. A copy that fails it (written by an
 * older build, or by another screen under the same kind, #197) is treated as absent and removed,
 * so a device holding one recovers on its next visit instead of crashing on every one.
 */
export async function readOpsCache<T>(
  dbInstance: Pick<NkwapaDb, 'ops_cache'>,
  query: {
    clinicId: string;
    kind: OpsCacheKind;
    date: string;
    isValid?: (data: unknown) => data is T;
  },
): Promise<OpsCacheRecord<T> | null> {
  const key = opsCacheKey(query.clinicId, query.kind);
  try {
    const record = (await dbInstance.ops_cache.get(key)) as OpsCacheRecord<unknown> | undefined;
    if (!record) return null;
    if (query.isValid && !query.isValid(record.data)) {
      await dbInstance.ops_cache.delete(key).catch(() => undefined);
      return null;
    }
    return record.date === query.date ? (record as OpsCacheRecord<T>) : null;
  } catch {
    return null;
  }
}
