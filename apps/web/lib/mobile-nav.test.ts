import { getMobileNavigation } from './mobile-nav';
import type { WhoAmIResponse } from './bootstrap-context';

const bootstrap = (permissions: string[], clinicId: string | null = 'clinic-1') =>
  ({
    userId: 'synthetic-user',
    keycloakSub: 'synthetic-sub',
    displayName: 'Synthetic user',
    globalRoles: [],
    activeClinicId: clinicId,
    memberships: [{ clinicId: 'clinic-1', clinicName: 'Synthetic clinic', roles: ['DOCTOR'] }],
    effectiveRolesForActiveClinic: ['DOCTOR'],
    effectivePermissionsForActiveClinic: permissions,
    onboarding: null,
  }) as WhoAmIResponse;

describe('phone navigation partitions authorized destinations', () => {
  const original = process.env.NEXT_PUBLIC_FEATURE_STATION_WORKFLOW_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_FEATURE_STATION_WORKFLOW_ENABLED;
    else process.env.NEXT_PUBLIC_FEATURE_STATION_WORKFLOW_ENABLED = original;
  });

  it.each([
    ['true', ['/dashboard', '/stations', '/queues', '/patients']],
    ['false', ['/dashboard', '/my/assigned', '/queues', '/patients']],
  ])('keeps the fixed priority with station flag %s', (flag, expected) => {
    process.env.NEXT_PUBLIC_FEATURE_STATION_WORKFLOW_ENABLED = flag;
    const nav = getMobileNavigation(
      bootstrap([
        'OPS.STATION.WORK',
        'OPS.ASSIGNMENT.READ_SELF',
        'ENCOUNTER.READ',
        'PATIENT.SEARCH',
        'APPOINTMENT.READ',
        'PATIENT.CREATE',
        'REMINDER.READ',
      ]),
    );
    expect(nav.primary.map((item) => item.href)).toEqual(expected);
    expect(nav.more.flatMap((section) => section.items.map((item) => item.href))).toEqual([
      '/appointments',
      '/patients/new',
    ]);
    expect(nav.utilities.map((item) => item.href)).toEqual(['/notifications']);
  });

  it('does not fill missing permissions with unauthorized tabs', () => {
    const nav = getMobileNavigation(bootstrap([]));
    expect(nav.primary.map((item) => item.href)).toEqual(['/dashboard']);
    expect(nav.more).toEqual([]);
    expect(nav.utilities).toEqual([]);
  });

  it('retains authorized clinic-dependent controls without an active clinic', () => {
    const nav = getMobileNavigation(bootstrap(['PATIENT.SEARCH', 'PATIENT.CREATE'], null));
    expect(nav.primary.map((item) => [item.href, item.requiresClinic])).toEqual([
      ['/dashboard', undefined],
      ['/patients', true],
    ]);
    expect(nav.more.flatMap((section) => section.items.map((item) => item.href))).toEqual([
      '/patients/new',
    ]);
  });
});
