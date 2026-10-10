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
  const ids = (steps: { id: string }[]) => steps.map((step) => step.id);

  it('gives staff a start step, navigation, clinic, offline and help', () => {
    expect(ids(welcomeTourSteps(bootstrap(), { stationWorkflow: false }))).toEqual([
      'welcome',
      'start',
      'navigation',
      'clinic',
      'offline',
      'help',
    ]);
  });

  it('points each person at a page they can actually open', () => {
    const start = (b: WhoAmIResponse, stationWorkflow: boolean) =>
      welcomeTourSteps(b, { stationWorkflow }).find((step) => step.id === 'start')?.title;

    expect(start(bootstrap(), false)).toMatch(/My Assigned/);
    expect(start(bootstrap(), true)).toMatch(/Stations/);
    expect(
      start(bootstrap({ effectivePermissionsForActiveClinic: ['OPS.CHECKIN.READ'] }), true),
    ).toMatch(/Today board/);
    expect(start(bootstrap({ effectivePermissionsForActiveClinic: ['*'] }), false)).toMatch(
      /Today board/,
    );
    expect(start(bootstrap({ effectivePermissionsForActiveClinic: [] }), false)).toMatch(
      /dashboard/,
    );
  });

  it('mentions switching clinics only to someone who can', () => {
    const clinic = (b: WhoAmIResponse) =>
      welcomeTourSteps(b, { stationWorkflow: false }).find((step) => step.id === 'clinic')?.body;

    expect(clinic(bootstrap())).not.toMatch(/switch/i);
    expect(
      clinic(
        bootstrap({
          availableClinics: [
            { clinicId: 'c1', clinicName: 'One', zoneCode: null },
            { clinicId: 'c2', clinicName: 'Two', zoneCode: null },
          ],
        }),
      ),
    ).toMatch(/switch/i);
  });

  it('gives a patient the portal tour, with no staff steps', () => {
    const steps = welcomeTourSteps(
      bootstrap({ memberships: [{ clinicId: 'c1', clinicName: 'C', roles: ['PATIENT'] }] }),
      { stationWorkflow: true },
    );
    expect(ids(steps)).toEqual(['welcome', 'health', 'appointments', 'help']);
  });
});
