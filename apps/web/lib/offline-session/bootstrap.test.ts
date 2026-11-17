/** @jest-environment jsdom */
import type { OfflineGrantClaims } from '@nkwapa/db/offline-grant';
import { canUseOfflineAccess, rememberClinicUnits, whoamiFromGrant } from './bootstrap';

const claims: OfflineGrantClaims = {
  grantId: 'grant-1',
  userId: 'user-1',
  displayName: 'Ama Mensah',
  deviceId: 'device-1',
  globalRoles: [],
  memberships: [
    {
      clinicId: 'clinic-a',
      clinicName: 'Akim',
      roles: ['VOLUNTEER'],
      permissions: ['VITALS.WRITE'],
    },
    { clinicId: 'clinic-b', clinicName: 'Bono', roles: ['DOCTOR'], permissions: ['PLAN.WRITE'] },
  ],
  issuedAt: '2026-11-17T08:00:00.000Z',
  expiresAt: '2026-11-20T08:00:00.000Z',
};

describe('offline session identity (#207)', () => {
  beforeEach(() => localStorage.clear());

  it('serves the grant in whoami’s shape, with the asked-for clinic’s roles and permissions', () => {
    const identity = whoamiFromGrant(claims, 'clinic-b');
    expect(identity).toMatchObject({
      userId: 'user-1',
      displayName: 'Ama Mensah',
      globalRoles: [],
      activeClinicId: 'clinic-b',
      effectiveRolesForActiveClinic: ['DOCTOR'],
      effectivePermissionsForActiveClinic: ['PLAN.WRITE'],
      onboarding: null,
      source: 'offline-grant',
    });
  });

  it('never opens a clinic the grant does not hold', () => {
    const identity = whoamiFromGrant(claims, 'clinic-elsewhere');
    expect(identity.activeClinicId).toBe('clinic-a');
    expect(identity.effectivePermissionsForActiveClinic).toEqual(['VITALS.WRITE']);
  });

  it('keeps each clinic’s units from the last online sign-in', () => {
    rememberClinicUnits({
      memberships: [
        {
          clinicId: 'clinic-b',
          clinicName: 'Bono',
          roles: [],
          units: { glucose: 'mg/dL' } as never,
        },
      ],
    });
    const identity = whoamiFromGrant(claims, 'clinic-b');
    expect(identity.memberships.find((m) => m.clinicId === 'clinic-b')?.units).toEqual({
      glucose: 'mg/dL',
    });
    expect(identity.memberships.find((m) => m.clinicId === 'clinic-a')?.units).toBeNull();
  });

  it('offers offline access to clinic staff only', () => {
    const staff = {
      globalRoles: [],
      memberships: [{ clinicId: 'a', clinicName: 'A', roles: ['MANAGER'] }],
    };
    expect(canUseOfflineAccess(staff)).toBe(true);
    expect(canUseOfflineAccess({ ...staff, globalRoles: ['SYSTEM_ADMIN'] })).toBe(false);
    expect(
      canUseOfflineAccess({
        globalRoles: [],
        memberships: [{ clinicId: 'a', clinicName: 'A', roles: ['PATIENT'] }],
      }),
    ).toBe(false);
    expect(canUseOfflineAccess(null)).toBe(false);
  });
});
