import type { NkwapaDb } from './db';
import type { AppointmentRequestRecord, PortalMeResponse } from './patient-portal';
import {
  PORTAL_CACHE_MAX_AGE_MS,
  clearPortalCache,
  minimiseAppointmentRequests,
  minimisePortalMe,
  portalCacheKey,
  purgePortalCacheExcept,
  readPortalCache,
  resolvePortalView,
  writePortalCache,
} from './portal-cache';
import { createFakeSyncDb } from './testing/fake-sync-db';

describe('portal cache', () => {
  const fake = createFakeSyncDb();
  const cacheDb = fake as unknown as NkwapaDb;
  const now = new Date('2026-10-05T10:00:00.000Z');
  const alice = { userId: 'user-alice', clinicId: 'clinic-1' };
  const bob = { userId: 'user-bob', clinicId: 'clinic-1' };

  beforeEach(() => fake.portal_cache.rows.clear());

  it('keys a copy by account, clinic, view and variant', () => {
    expect(portalCacheKey({ ...alice, view: 'health', variant: '90' })).toBe(
      'user-alice|clinic-1|health|90',
    );
    expect(portalCacheKey({ ...alice, view: 'appointments' })).toBe(
      'user-alice|clinic-1|appointments|',
    );
  });

  it('keeps one copy per account and view, replaced by the next load, with its patient', async () => {
    await writePortalCache(cacheDb, { ...alice, view: 'appointments', patientId: 'p-a', data: 1 });
    await writePortalCache(cacheDb, { ...alice, view: 'appointments', patientId: 'p-a', data: 2 });

    expect(fake.portal_cache.rows.size).toBe(1);
    await expect(
      readPortalCache(cacheDb, { ...alice, view: 'appointments' }),
    ).resolves.toMatchObject({ data: 2, patientId: 'p-a', userId: 'user-alice' });
  });

  it('never returns one account’s copy to another account on the same device', async () => {
    await writePortalCache(
      cacheDb,
      { ...alice, view: 'health', variant: '90', patientId: 'p-a', data: { mine: 'alice' } },
      now,
    );

    await expect(
      readPortalCache(cacheDb, { ...bob, view: 'health', variant: '90' }, now),
    ).resolves.toBeNull();
    await expect(
      readPortalCache(cacheDb, { ...alice, clinicId: 'clinic-2', view: 'health', variant: '90' }),
    ).resolves.toBeNull();
    await expect(
      readPortalCache(cacheDb, { ...alice, view: 'health', variant: '30' }, now),
    ).resolves.toBeNull();
  });

  it('refuses a row whose fields name another owner, whatever its key', async () => {
    const key = portalCacheKey({ ...alice, view: 'overview' });
    await fake.portal_cache.put({ key, ...bob, patientId: 'p-b', view: 'overview', variant: '' });

    await expect(readPortalCache(cacheDb, { ...alice, view: 'overview' })).resolves.toBeNull();
  });

  it('does not write a copy that cannot say whose it is', async () => {
    await writePortalCache(cacheDb, { ...alice, view: 'overview', patientId: null, data: {} });
    await writePortalCache(cacheDb, {
      ...alice,
      userId: '',
      view: 'overview',
      patientId: 'p',
      data: {},
    });

    expect(fake.portal_cache.rows.size).toBe(0);
  });

  it('expires a copy older than a week and removes it', async () => {
    const old = new Date(now.getTime() - PORTAL_CACHE_MAX_AGE_MS - 1);
    await writePortalCache(cacheDb, { ...alice, view: 'overview', patientId: 'p', data: {} }, old);

    await expect(readPortalCache(cacheDb, { ...alice, view: 'overview' }, now)).resolves.toBeNull();
    expect(fake.portal_cache.rows.size).toBe(0);
  });

  it('purges every other account’s copies and expired ones, keeping the current account’s', async () => {
    const old = new Date(now.getTime() - PORTAL_CACHE_MAX_AGE_MS - 1);
    await writePortalCache(cacheDb, { ...alice, view: 'overview', patientId: 'p-a', data: 1 }, now);
    await writePortalCache(cacheDb, { ...alice, view: 'health', patientId: 'p-a', data: 2 }, old);
    await writePortalCache(cacheDb, { ...bob, view: 'overview', patientId: 'p-b', data: 3 }, now);

    await purgePortalCacheExcept(cacheDb, 'user-alice', now);

    expect([...fake.portal_cache.rows.keys()]).toEqual([
      portalCacheKey({ ...alice, view: 'overview' }),
    ]);
  });

  it('clears everything on sign-out', async () => {
    await writePortalCache(cacheDb, { ...alice, view: 'overview', patientId: 'p-a', data: 1 });
    await writePortalCache(cacheDb, { ...bob, view: 'overview', patientId: 'p-b', data: 2 });

    await clearPortalCache(cacheDb);

    expect(fake.portal_cache.rows.size).toBe(0);
  });

  it('never turns a storage failure into a failed load', async () => {
    const broken = {
      portal_cache: {
        put: jest.fn().mockRejectedValue(new Error('QuotaExceededError')),
        get: jest.fn().mockRejectedValue(new Error('blocked')),
        toArray: jest.fn().mockRejectedValue(new Error('blocked')),
        clear: jest.fn().mockRejectedValue(new Error('blocked')),
      },
    } as unknown as NkwapaDb;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      writePortalCache(broken, { ...alice, view: 'overview', patientId: 'p', data: {} }),
    ).resolves.toBeUndefined();
    await expect(readPortalCache(broken, { ...alice, view: 'overview' })).resolves.toBeNull();
    await expect(purgePortalCacheExcept(broken, 'user-alice')).resolves.toBeUndefined();
    await expect(clearPortalCache(broken)).resolves.toBeUndefined();
    warn.mockRestore();
  });

  describe('minimisation', () => {
    it('drops date of birth and sex from the portal profile', () => {
      const me = {
        patient: {
          id: 'p',
          patientCode: 'NK-1',
          firstName: 'Ama',
          lastName: 'Mensah',
          dob: '1980-01-01',
          sex: 'F',
        },
        recommendations: null,
        reminders: [],
      } satisfies PortalMeResponse;

      expect(minimisePortalMe(me).patient).toEqual({
        id: 'p',
        patientCode: 'NK-1',
        firstName: 'Ama',
        lastName: 'Mensah',
        dob: null,
        sex: '',
      });
    });

    it('drops the staff-only patient summary from requests', () => {
      const request = {
        id: 'r',
        patient: { id: 'p', patientCode: 'NK-1', firstName: 'A', lastName: 'M' },
        status: 'REQUESTED',
      } as unknown as AppointmentRequestRecord;

      expect(minimiseAppointmentRequests([request])[0]).not.toHaveProperty('patient');
    });
  });

  describe('resolvePortalView', () => {
    const key = portalCacheKey({ ...alice, view: 'overview' });
    const saved = { key, data: 'saved', updatedAt: now.toISOString() };

    it('prefers a live result', () => {
      expect(resolvePortalView({ key, live: 'live', saved })).toEqual({
        data: 'live',
        savedCopyAt: null,
      });
    });

    it('falls back to the saved copy and says when it is from', () => {
      expect(resolvePortalView({ key, live: null, saved })).toEqual({
        data: 'saved',
        savedCopyAt: now.toISOString(),
      });
    });

    it('never shows a copy read for a different key', () => {
      const other = portalCacheKey({ ...bob, view: 'overview' });
      expect(resolvePortalView({ key: other, live: null, saved })).toEqual({
        data: null,
        savedCopyAt: null,
      });
      expect(resolvePortalView({ key: null, live: null, saved }).data).toBeNull();
    });
  });
});
