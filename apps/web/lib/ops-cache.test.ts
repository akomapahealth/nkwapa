import type { NkwapaDb } from './db';
import { opsCacheKey, readOpsCache, writeOpsCache } from './ops-cache';
import { createFakeSyncDb } from './testing/fake-sync-db';

describe('ops cache', () => {
  const fake = createFakeSyncDb();
  const cacheDb = fake as unknown as NkwapaDb;

  beforeEach(() => fake.ops_cache.rows.clear());

  it('keeps one copy per clinic and view, replaced by the next load', async () => {
    await writeOpsCache(cacheDb, {
      clinicId: 'clinic-1',
      kind: 'today-board',
      date: '2026-03-20',
      data: { n: 1 },
    });
    await writeOpsCache(cacheDb, {
      clinicId: 'clinic-1',
      kind: 'today-board',
      date: '2026-03-21',
      data: { n: 2 },
    });

    expect(fake.ops_cache.rows.size).toBe(1);
    expect(fake.ops_cache.rows.get(opsCacheKey('clinic-1', 'today-board'))).toMatchObject({
      date: '2026-03-21',
      data: { n: 2 },
    });
  });

  it('returns the copy only for the clinic day it was taken on', async () => {
    await writeOpsCache(
      cacheDb,
      { clinicId: 'clinic-1', kind: 'today-board', date: '2026-03-21', data: { n: 2 } },
      new Date('2026-03-21T10:00:00.000Z'),
    );

    await expect(
      readOpsCache(cacheDb, { clinicId: 'clinic-1', kind: 'today-board', date: '2026-03-21' }),
    ).resolves.toMatchObject({ data: { n: 2 }, updatedAt: '2026-03-21T10:00:00.000Z' });
    await expect(
      readOpsCache(cacheDb, { clinicId: 'clinic-1', kind: 'today-board', date: '2026-03-22' }),
    ).resolves.toBeNull();
    await expect(
      readOpsCache(cacheDb, { clinicId: 'clinic-2', kind: 'today-board', date: '2026-03-21' }),
    ).resolves.toBeNull();
  });

  it('never turns a storage failure into a failed load', async () => {
    const broken = {
      ops_cache: {
        put: jest.fn().mockRejectedValue(new Error('QuotaExceededError')),
        get: jest.fn().mockRejectedValue(new Error('blocked')),
      },
    } as unknown as NkwapaDb;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      writeOpsCache(broken, { clinicId: 'c', kind: 'my-assigned', date: 'd', data: {} }),
    ).resolves.toBeUndefined();
    await expect(
      readOpsCache(broken, { clinicId: 'c', kind: 'my-assigned', date: 'd' }),
    ).resolves.toBeNull();
    warn.mockRestore();
  });
});
