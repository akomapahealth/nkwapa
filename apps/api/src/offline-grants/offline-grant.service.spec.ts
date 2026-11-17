import { STAFF_AGREEMENT, verifyOfflineGrant } from '@nkwapa/db';
import { UserRole } from '@prisma/client';
import { AuthController, type ReqUser } from '../auth/auth.controller';
import { OfflineGrantKeysService } from './offline-grant-keys.service';
import { OfflineGrantService, offlineGrantTtlHours } from './offline-grant.service';

const DEVICE = '0b1f5a3e-6a0e-4d4b-9c1d-2f5f4c0a7e11';
const OTHER_DEVICE = '7d3c2b1a-0f9e-4d8c-8b7a-6e5f4d3c2b1a';
const NOW = new Date('2026-11-16T10:00:00.000Z');
const HOUR = 3_600_000;

const clinics = [
  { id: 'clinic-1', name: 'Test Clinic', region: null, zoneCode: 'coastal' },
  { id: 'clinic-2', name: 'Second Clinic', region: null, zoneCode: null },
];

function doctor(extraRoles: ReqUser['roles'] = []): ReqUser {
  return {
    user: { id: 'user-1', keycloakSub: 'sub', displayName: 'Ama Mensah', email: null },
    roles: [
      { clinicId: 'clinic-2', role: UserRole.VOLUNTEER },
      { clinicId: 'clinic-1', role: UserRole.DOCTOR },
      ...extraRoles,
    ],
  };
}

describe('OfflineGrantService', () => {
  const originalFlag = process.env.FEATURE_OFFLINE_SESSION_ENABLED;
  let rows: Array<Record<string, unknown> & { id: string }>;
  let prisma: Record<string, unknown>;
  const auditService = { logWrite: jest.fn() };
  const clinicService = { findByIds: jest.fn() };
  const keys = new OfflineGrantKeysService();
  let service: OfflineGrantService;

  const matches = (row: Record<string, unknown>, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (key === 'OR') {
        return (value as Record<string, unknown>[]).some((clause) => matches(row, clause));
      }
      if (value && typeof value === 'object' && !(value instanceof Date) && 'gt' in value) {
        return (row[key] as Date) > (value as { gt: Date }).gt;
      }
      return (row[key] ?? null) === value;
    });

  beforeEach(() => {
    process.env.FEATURE_OFFLINE_SESSION_ENABLED = 'true';
    jest.clearAllMocks();
    rows = [];
    clinicService.findByIds.mockResolvedValue(clinics);
    let nextId = 0;
    const offlineGrant = {
      findFirst: jest.fn(async ({ where }) => rows.find((row) => matches(row, where)) ?? null),
      findMany: jest.fn(async ({ where }) => rows.filter((row) => matches(row, where))),
      create: jest.fn(async ({ data }) => {
        nextId += 1;
        const row = {
          id: `00000000-0000-4000-8000-00000000000${nextId}`,
          revokedAt: null,
          revokedReason: null,
          createdAt: NOW,
          ...data,
        };
        rows.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }) => {
        const row = rows.find((candidate) => candidate.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        const hit = rows.filter((row) => matches(row, where));
        hit.forEach((row) => Object.assign(row, data));
        return { count: hit.length };
      }),
    };
    prisma = {
      offlineGrant,
      user: {
        findUnique: jest.fn().mockResolvedValue({
          firstName: 'Ama',
          lastName: 'Mensah',
          staffAgreementVersion: STAFF_AGREEMENT.version,
        }),
      },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
      $executeRaw: jest.fn(),
      detachFromRlsContext: (fn: () => unknown) => fn(),
      withSystemContext: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn(prisma),
    };
    service = new OfflineGrantService(
      prisma as never,
      clinicService as never,
      keys,
      auditService as never,
    );
  });

  afterAll(() => {
    if (originalFlag === undefined) delete process.env.FEATURE_OFFLINE_SESSION_ENABLED;
    else process.env.FEATURE_OFFLINE_SESSION_ENABLED = originalFlag;
  });

  describe('who may hold a grant', () => {
    it('refuses a system admin, even one with clinic seats', async () => {
      await expect(
        service.issue(doctor([{ clinicId: null, role: UserRole.SYSTEM_ADMIN }]), DEVICE, 'ua', NOW),
      ).rejects.toMatchObject({ response: { code: 'OFFLINE_SESSION_NOT_ALLOWED' } });
      expect(rows).toHaveLength(0);
    });

    it('refuses a patient', async () => {
      const patient: ReqUser = {
        ...doctor(),
        roles: [{ clinicId: 'clinic-1', role: UserRole.PATIENT }],
      };
      await expect(service.issue(patient, DEVICE, 'ua', NOW)).rejects.toMatchObject({
        response: { code: 'OFFLINE_SESSION_NOT_ALLOWED' },
      });
    });

    it('refuses an account that has not signed the current agreement', async () => {
      (prisma.user as { findUnique: jest.Mock }).findUnique.mockResolvedValue({
        firstName: 'Ama',
        lastName: 'Mensah',
        staffAgreementVersion: null,
      });
      await expect(service.issue(doctor(), DEVICE, 'ua', NOW)).rejects.toMatchObject({
        response: { code: 'OFFLINE_SESSION_NOT_ALLOWED' },
      });
    });

    it('refuses everyone while the feature is off', async () => {
      process.env.FEATURE_OFFLINE_SESSION_ENABLED = 'false';
      await expect(service.issue(doctor(), DEVICE, 'ua', NOW)).rejects.toMatchObject({
        response: { code: 'OFFLINE_SESSION_DISABLED' },
      });
    });
  });

  describe('issuing', () => {
    it('signs a grant the shared verifier accepts, with memberships whoami would serve', async () => {
      const issued = await service.issue(
        doctor([{ clinicId: 'clinic-1', role: UserRole.PATIENT }]),
        DEVICE,
        'ua',
        NOW,
      );

      const verified = await verifyOfflineGrant(issued.grant, issued.keys, NOW);
      expect(verified).toEqual({ ok: true, claims: issued.claims });
      expect(issued.claims).toMatchObject({
        userId: 'user-1',
        displayName: 'Ama Mensah',
        deviceId: DEVICE,
        globalRoles: [],
        issuedAt: NOW.toISOString(),
        expiresAt: new Date(NOW.getTime() + 72 * HOUR).toISOString(),
      });

      // The same person through whoami: same clinics, same roles, patient seat excluded.
      const whoamiPrisma = {
        user: { findUnique: jest.fn().mockResolvedValue(null) },
        staffInvite: { findMany: jest.fn().mockResolvedValue([]) },
        patientPortalInvite: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const whoami = await new AuthController(
        {
          findByIds: jest.fn().mockResolvedValue(clinics),
          listActiveSwitchableClinics: jest.fn().mockResolvedValue(clinics),
        } as never,
        whoamiPrisma as never,
        auditService as never,
      ).whoami({ user: doctor() });
      expect(
        issued.claims.memberships.map(({ clinicId, clinicName, roles }) => ({
          clinicId,
          clinicName,
          roles,
        })),
      ).toEqual(
        whoami.memberships.map(({ clinicId, clinicName, roles }) => ({
          clinicId,
          clinicName,
          roles,
        })),
      );
      expect(issued.claims.memberships.find((m) => m.clinicId === 'clinic-1')?.roles).toEqual([
        'DOCTOR',
      ]);
      expect(issued.claims.memberships[0]?.permissions).not.toContain('*');
    });

    it('rejects a grant whose claims were edited after signing', async () => {
      const issued = await service.issue(doctor(), DEVICE, 'ua', NOW);
      const [header, , signature] = issued.grant.split('.');
      const edited = Buffer.from(
        JSON.stringify({ ...issued.claims, expiresAt: '2099-01-01T00:00:00.000Z' }),
      ).toString('base64url');
      expect(
        await verifyOfflineGrant(`${header}.${edited}.${signature}`, issued.keys, NOW),
      ).toEqual({ ok: false, reason: 'bad-signature' });
      expect(
        await verifyOfflineGrant(issued.grant, issued.keys, new Date(NOW.getTime() + 73 * HOUR)),
      ).toEqual({ ok: false, reason: 'expired' });
    });

    it('refreshes a live grant in place and keeps its id', async () => {
      const first = await service.issue(doctor(), DEVICE, 'ua', NOW);
      const later = new Date(NOW.getTime() + HOUR);
      const second = await service.issue(doctor(), DEVICE, 'ua', later);
      expect(second.claims.grantId).toBe(first.claims.grantId);
      expect(second.claims.expiresAt).toBe(new Date(later.getTime() + 72 * HOUR).toISOString());
      expect(rows).toHaveLength(1);
      expect(auditService.logWrite).toHaveBeenCalledTimes(1);
    });

    it('starts a new grant after one lapses, without revoking what was recorded under it', async () => {
      const first = await service.issue(doctor(), DEVICE, 'ua', NOW);
      const afterExpiry = new Date(NOW.getTime() + 80 * HOUR);
      const second = await service.issue(doctor(), DEVICE, 'ua', afterExpiry);
      expect(second.claims.grantId).not.toBe(first.claims.grantId);

      const stamp = { grantId: first.claims.grantId, deviceId: DEVICE };
      const insideWindow = new Date(NOW.getTime() + 70 * HOUR).toISOString();
      const outsideWindow = new Date(NOW.getTime() + 75 * HOUR).toISOString();
      expect(await service.refusalFor('user-1', stamp, insideWindow)).toBeNull();
      expect(await service.refusalFor('user-1', stamp, outsideWindow)).toBe(
        'OFFLINE_GRANT_EXPIRED',
      );
    });

    it('derives one data key per person and device, and the same one when asked again', async () => {
      const a = await service.issue(doctor(), DEVICE, 'ua', NOW);
      const again = await service.issue(doctor(), DEVICE, 'ua', NOW);
      const otherDevice = await service.issue(doctor(), OTHER_DEVICE, 'ua', NOW);
      expect(Buffer.from(a.dataKey, 'base64')).toHaveLength(32);
      expect(again.dataKey).toBe(a.dataKey);
      expect(otherDevice.dataKey).not.toBe(a.dataKey);
      expect(keys.deriveDataKey('user-2', DEVICE).toString('base64')).not.toBe(a.dataKey);
    });
  });

  describe('device keys', () => {
    const scopes = (keysByScope: Record<string, string>) => Object.keys(keysByScope).sort();

    it('gives staff their own key and one per clinic they work in, stable per device', () => {
      const first = service.deviceKeys(doctor(), DEVICE);
      expect(scopes(first)).toEqual(['clinic:clinic-1', 'clinic:clinic-2', 'user:user-1']);
      expect(service.deviceKeys(doctor(), DEVICE)).toEqual(first);
      expect(service.deviceKeys(doctor(), OTHER_DEVICE)['clinic:clinic-1']).not.toBe(
        first['clinic:clinic-1'],
      );
      expect(Buffer.from(first['clinic:clinic-1']!, 'base64')).toHaveLength(32);
      // Not the grant's data key: one key never does two jobs.
      expect(first['user:user-1']).not.toBe(
        keys.deriveDataKey('user-1', DEVICE).toString('base64'),
      );
    });

    it('never gives a patient a clinic key, whatever clinic they ask for', () => {
      const patient: ReqUser = {
        ...doctor(),
        roles: [{ role: UserRole.PATIENT, clinicId: 'clinic-1' } as ReqUser['roles'][number]],
      };
      expect(scopes(service.deviceKeys(patient, DEVICE, 'clinic-1'))).toEqual(['user:user-1']);
      expect(scopes(service.deviceKeys(doctor(), DEVICE, 'clinic-9'))).not.toContain(
        'clinic:clinic-9',
      );
    });

    it('gives a system admin the clinic they ask for, and no other', () => {
      const admin: ReqUser = {
        ...doctor(),
        roles: [{ role: UserRole.SYSTEM_ADMIN, clinicId: null } as ReqUser['roles'][number]],
      };
      expect(scopes(service.deviceKeys(admin, DEVICE, 'clinic-9'))).toEqual([
        'clinic:clinic-9',
        'user:user-1',
      ]);
    });

    it('rides along with a grant', async () => {
      const issued = await service.issue(doctor(), DEVICE, 'ua', NOW);
      expect(issued.deviceKeys).toEqual(service.deviceKeys(doctor(), DEVICE));
    });

    it('is refused while the feature is off', () => {
      process.env.FEATURE_OFFLINE_SESSION_ENABLED = 'false';
      expect(() => service.deviceKeys(doctor(), DEVICE)).toThrow();
    });
  });

  describe('refusing pushes', () => {
    const recorded = new Date(NOW.getTime() + HOUR).toISOString();

    it('accepts a write recorded inside a live grant', async () => {
      const { claims } = await service.issue(doctor(), DEVICE, 'ua', NOW);
      expect(
        await service.refusalFor('user-1', { grantId: claims.grantId, deviceId: DEVICE }, recorded),
      ).toBeNull();
    });

    it('treats an unknown grant, another account’s grant or another device as revoked', async () => {
      const { claims } = await service.issue(doctor(), DEVICE, 'ua', NOW);
      const unknown = { grantId: '11111111-1111-4111-8111-111111111111', deviceId: DEVICE };
      expect(await service.refusalFor('user-1', unknown, recorded)).toBe('OFFLINE_GRANT_REVOKED');
      expect(
        await service.refusalFor('user-2', { grantId: claims.grantId, deviceId: DEVICE }, recorded),
      ).toBe('OFFLINE_GRANT_REVOKED');
      expect(
        await service.refusalFor(
          'user-1',
          { grantId: claims.grantId, deviceId: OTHER_DEVICE },
          recorded,
        ),
      ).toBe('OFFLINE_GRANT_REVOKED');
    });

    it('refuses everything under a grant revoked by offboarding, lapsed grants included', async () => {
      const first = await service.issue(doctor(), DEVICE, 'ua', NOW);
      await service.issue(doctor(), DEVICE, 'ua', new Date(NOW.getTime() + 80 * HOUR));
      expect(await service.revokeAllForUser('user-1', 'DEACTIVATED')).toBe(2);
      expect(
        await service.refusalFor(
          'user-1',
          { grantId: first.claims.grantId, deviceId: DEVICE },
          recorded,
        ),
      ).toBe('OFFLINE_GRANT_REVOKED');
      expect(await service.listLive('user-1', NOW)).toEqual([]);
    });

    it('refuses a write recorded after expiry, or with no recorded time', async () => {
      const { claims } = await service.issue(doctor(), DEVICE, 'ua', NOW);
      const stamp = { grantId: claims.grantId, deviceId: DEVICE };
      expect(
        await service.refusalFor(
          'user-1',
          stamp,
          new Date(NOW.getTime() + 73 * HOUR).toISOString(),
        ),
      ).toBe('OFFLINE_GRANT_EXPIRED');
      expect(await service.refusalFor('user-1', stamp, undefined)).toBe('OFFLINE_GRANT_EXPIRED');
    });

    it('lets a person revoke one of their own devices, and only their own', async () => {
      const { claims } = await service.issue(doctor(), DEVICE, 'ua', NOW);
      await expect(
        service.revokeOwn('user-2', claims.grantId, 'DEVICE_REVOKED', null),
      ).rejects.toThrow('not found');
      await service.revokeOwn('user-1', claims.grantId, 'SIGN_OUT', 'clinic-1');
      expect(
        await service.refusalFor('user-1', { grantId: claims.grantId, deviceId: DEVICE }, recorded),
      ).toBe('OFFLINE_GRANT_REVOKED');
    });
  });

  it('clamps the lifetime to 1 to 168 hours', () => {
    expect(offlineGrantTtlHours(undefined)).toBe(72);
    expect(offlineGrantTtlHours('nonsense')).toBe(72);
    expect(offlineGrantTtlHours('0')).toBe(1);
    expect(offlineGrantTtlHours('1000')).toBe(168);
    expect(offlineGrantTtlHours('24')).toBe(24);
  });
});
