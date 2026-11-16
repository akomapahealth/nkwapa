import type { WhoAmIResponse } from './bootstrap-context';
import {
  CURRENT_WELCOME_TOUR_VERSION,
  shouldOfferWelcomeTour,
  welcomeTourAudience,
  welcomeTourSteps,
} from './welcome-tour';

function bootstrap(overrides: Partial<WhoAmIResponse> = {}): WhoAmIResponse {
  return {
    userId: 'u1',
    keycloakSub: 'sub',
    displayName: 'Ama Mensah',
    memberships: [{ clinicId: 'c1', clinicName: 'Clinic One', roles: ['VOLUNTEER'] }],
    availableClinics: [{ clinicId: 'c1', clinicName: 'Clinic One', zoneCode: null }],
    globalRoles: [],
    activeClinicId: 'c1',
    effectiveRolesForActiveClinic: ['VOLUNTEER'],
    effectivePermissionsForActiveClinic: ['OPS.ASSIGNMENT.READ_SELF', 'OPS.STATION.WORK'],
    onboarding: null,
    welcomeTour: { completedVersion: null },
    ...overrides,
  };
}

describe('shouldOfferWelcomeTour', () => {
  it('offers the tour to someone who has never seen it', () => {
    expect(shouldOfferWelcomeTour(bootstrap())).toBe(true);
  });

  it('does not offer it again once the current version is done', () => {
    expect(
      shouldOfferWelcomeTour(
        bootstrap({ welcomeTour: { completedVersion: CURRENT_WELCOME_TOUR_VERSION } }),
      ),
    ).toBe(false);
  });

  it('offers it again when the tour has moved on since', () => {
    expect(
      shouldOfferWelcomeTour(
        bootstrap({ welcomeTour: { completedVersion: CURRENT_WELCOME_TOUR_VERSION - 1 } }),
      ),
    ).toBe(true);
  });

  it('waits until account onboarding is finished', () => {
    expect(
      shouldOfferWelcomeTour(bootstrap({ onboarding: { state: 'STAFF_INVITE_ACCEPT_REQUIRED' } })),
    ).toBe(false);
  });

  it('never offers it when the API does not report the tour, or before identity loads', () => {
    expect(shouldOfferWelcomeTour(bootstrap({ welcomeTour: undefined }))).toBe(false);
    expect(shouldOfferWelcomeTour(null)).toBe(false);
  });
});

describe('welcomeTourAudience', () => {
  it('is patient only when every role is PATIENT', () => {
    expect(
      welcomeTourAudience(
        bootstrap({ memberships: [{ clinicId: 'c1', clinicName: 'C', roles: ['PATIENT'] }] }),
      ),
    ).toBe('patient');
    expect(
      welcomeTourAudience(
        bootstrap({
          memberships: [{ clinicId: 'c1', clinicName: 'C', roles: ['PATIENT', 'DOCTOR'] }],
        }),
      ),
    ).toBe('staff');
  });
});

describe('welcomeTourSteps', () => {
  const STATION_FLAG = 'NEXT_PUBLIC_FEATURE_STATION_WORKFLOW_ENABLED';
  afterEach(() => {
    delete process.env[STATION_FLAG];
  });

  const ids = (steps: { id: string }[]) => steps.map((step) => step.id);
  const asRole = (role: string, permissions: string[], overrides: Partial<WhoAmIResponse> = {}) =>
    bootstrap({
      memberships: [{ clinicId: 'c1', clinicName: 'Clinic One', roles: [role] }],
      effectiveRolesForActiveClinic: [role],
      effectivePermissionsForActiveClinic: permissions,
      ...overrides,
    });

  const VOLUNTEER = [
    'PATIENT.CREATE',
    'PATIENT.SEARCH',
    'ENCOUNTER.CREATE',
    'OPS.ASSIGNMENT.READ_SELF',
    'OPS.STATION.WORK',
  ];

  it('opens with a welcome naming the role and clinic, and closes on how to reopen it', () => {
    const steps = welcomeTourSteps(asRole('VOLUNTEER', VOLUNTEER));
    expect(steps[0]).toMatchObject({ id: 'welcome', title: 'Welcome to Nkwapa' });
    expect(steps[0].body).toMatch(/Volunteer at Clinic One/);
    expect(steps[0].anchor).toBeUndefined();
    const last = steps[steps.length - 1];
    expect(last.id).toBe('finish');
    expect(last.anchor).toBeUndefined();
    expect(last.tryThis).toMatch(/Take the tour/);
  });

  it('gives a volunteer their clinic day, with My assigned while the station line is off', () => {
    expect(ids(welcomeTourSteps(asRole('VOLUNTEER', VOLUNTEER)))).toEqual([
      'welcome',
      'home',
      'register',
      'assigned',
      'queues',
      'offline',
      'finish',
    ]);
  });

  it('swaps My assigned for Stations when the station line is on', () => {
    process.env[STATION_FLAG] = 'true';
    const steps = welcomeTourSteps(asRole('VOLUNTEER', VOLUNTEER));
    expect(ids(steps)).toContain('stations');
    expect(ids(steps)).not.toContain('assigned');
    expect(steps.find((step) => step.id === 'stations')?.anchor).toBe('nav:/stations');
  });

  it('gives a doctor Needs you now, the lanes, the chart and alerts', () => {
    expect(
      ids(
        welcomeTourSteps(
          asRole('DOCTOR', ['ENCOUNTER.REVIEW', 'DOCTOR.FINALIZE', 'PATIENT.SEARCH']),
        ),
      ),
    ).toEqual(['welcome', 'home', 'queues', 'patients', 'notifications', 'offline', 'finish']);
  });

  it('gives a manager staff, volunteer events and the menu that holds reminders', () => {
    expect(
      ids(
        welcomeTourSteps(
          asRole('MANAGER', ['CLINIC.MANAGE', 'VOLUNTEER.ROSTER.MANAGE', 'REMINDER.READ']),
        ),
      ),
    ).toEqual(['welcome', 'home', 'staff', 'volunteers', 'menu', 'notifications', 'finish']);
  });

  it('gives a director metrics, reports and the audit log', () => {
    expect(
      ids(
        welcomeTourSteps(
          asRole('DIRECTOR', [
            'METRICS.READ',
            'ORGANIZATION.REPORT.READ',
            'AUDIT.READ',
            'CLINIC.MANAGE',
          ]),
        ),
      ),
    ).toEqual(['welcome', 'home', 'metrics', 'report', 'audit', 'staff', 'finish']);
  });

  it('gives a system admin clinics, users, duplicates and data requests', () => {
    expect(
      ids(
        welcomeTourSteps(
          bootstrap({
            globalRoles: ['SYSTEM_ADMIN'],
            memberships: [],
            effectiveRolesForActiveClinic: [],
            effectivePermissionsForActiveClinic: ['*'],
          }),
        ),
      ),
    ).toEqual(['welcome', 'clinic', 'clinics', 'staff', 'duplicates', 'data-requests', 'finish']);
  });

  it('gives a patient the portal tour, with no staff steps', () => {
    const steps = welcomeTourSteps(asRole('PATIENT', []));
    expect(ids(steps)).toEqual(['welcome', 'home', 'health', 'appointments', 'menu', 'finish']);
    expect(steps[0].body).not.toMatch(/signed in as/);
  });

  it('never offers a step whose page this person cannot open', () => {
    // A doctor without patient search is not shown the chart step, nor anyone a dead link.
    expect(ids(welcomeTourSteps(asRole('DOCTOR', ['DOCTOR.FINALIZE'])))).not.toContain('patients');
    expect(ids(welcomeTourSteps(asRole('MANAGER', [])))).toEqual([
      'welcome',
      'home',
      'notifications',
      'finish',
    ]);
  });

  it('adds the clinic picker for someone who can switch, within seven steps', () => {
    const steps = welcomeTourSteps(
      asRole('VOLUNTEER', VOLUNTEER, {
        availableClinics: [
          { clinicId: 'c1', clinicName: 'One', zoneCode: null },
          { clinicId: 'c2', clinicName: 'Two', zoneCode: null },
        ],
      }),
    );
    expect(ids(steps).slice(0, 3)).toEqual(['welcome', 'home', 'clinic']);
    expect(steps.length).toBeLessThanOrEqual(7);
  });

  it('keeps every role between five and seven steps, each saying what to try', () => {
    for (const steps of [
      welcomeTourSteps(asRole('VOLUNTEER', VOLUNTEER)),
      welcomeTourSteps(asRole('DOCTOR', ['ENCOUNTER.REVIEW', 'PATIENT.SEARCH'])),
      welcomeTourSteps(asRole('PATIENT', [])),
      welcomeTourSteps(asRole('DIRECTOR', ['*'])),
    ]) {
      expect(steps.length).toBeGreaterThanOrEqual(5);
      expect(steps.length).toBeLessThanOrEqual(7);
      for (const step of steps) expect(step.tryThis).toBeTruthy();
    }
  });
});
