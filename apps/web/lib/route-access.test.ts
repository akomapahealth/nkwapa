import {
  BOOTSTRAP_RETRY_DELAYS_MS,
  getBootstrapRetryDelay,
  resolveRouteAccess,
} from './route-access';
import type { WhoAmIResponse } from './bootstrap-context';

function bootstrapWith(permissions: string[], globalRoles: string[] = []): WhoAmIResponse {
  return {
    userId: 'user-1',
    keycloakSub: 'sub-1',
    displayName: 'Ama Director',
    memberships: [{ clinicId: 'clinic-1', clinicName: 'Nkwapa Clinic', roles: ['DIRECTOR'] }],
    availableClinics: [{ clinicId: 'clinic-1', clinicName: 'Nkwapa Clinic' }],
    globalRoles,
    activeClinicId: 'clinic-1',
    effectiveRolesForActiveClinic: ['DIRECTOR'],
    effectivePermissionsForActiveClinic: permissions,
    onboarding: null,
  } as WhoAmIResponse;
}

const base = { requiredPermission: 'DASHBOARD.READ' };

describe('resolveRouteAccess', () => {
  describe('when identity is known', () => {
    it('allows a role holding the permission', () => {
      expect(
        resolveRouteAccess({
          ...base,
          bootstrap: bootstrapWith(['DASHBOARD.READ']),
          isLoading: false,
          error: null,
        }),
      ).toBe('allowed');
    });

    it('allows a system admin through the wildcard', () => {
      expect(
        resolveRouteAccess({
          ...base,
          bootstrap: bootstrapWith(['*'], ['SYSTEM_ADMIN']),
          isLoading: false,
          error: null,
        }),
      ).toBe('allowed');
    });

    it('denies a role genuinely lacking the permission', () => {
      expect(
        resolveRouteAccess({
          ...base,
          bootstrap: bootstrapWith(['PATIENT.READ']),
          isLoading: false,
          error: null,
        }),
      ).toBe('denied');
    });

    it('answers from known identity even while a refresh is in flight', () => {
      // Switching clinics refetches whoami; the page must not flash an access error.
      expect(
        resolveRouteAccess({
          ...base,
          bootstrap: bootstrapWith(['DASHBOARD.READ']),
          isLoading: true,
          error: null,
        }),
      ).toBe('allowed');
    });
  });

  describe('when identity is not known yet', () => {
    it('reports resolving while the first load is in flight', () => {
      expect(resolveRouteAccess({ ...base, bootstrap: null, isLoading: true, error: null })).toBe(
        'resolving',
      );
    });

    // This is the regression that stranded users on a false "no access" page: bootstrap
    // never completed, nothing was loading, and no error had been recorded.
    it('reports resolving, never denied, when nothing has completed and there is no error', () => {
      expect(resolveRouteAccess({ ...base, bootstrap: null, isLoading: false, error: null })).toBe(
        'resolving',
      );
    });

    it('reports the route unavailable when bootstrap failed transiently', () => {
      expect(
        resolveRouteAccess({
          ...base,
          bootstrap: null,
          isLoading: false,
          error: 'The request took too long to complete.',
          errorStatus: null,
        }),
      ).toBe('unavailable');
    });

    it.each([500, 429, 503])('treats a %i failure as unavailable, not denied', (status) => {
      expect(
        resolveRouteAccess({
          ...base,
          bootstrap: null,
          isLoading: false,
          error: 'Server error',
          errorStatus: status,
        }),
      ).toBe('unavailable');
    });

    it.each([401, 403])('treats a %i as an expired session, not a permission problem', (status) => {
      expect(
        resolveRouteAccess({
          ...base,
          bootstrap: null,
          isLoading: false,
          error: 'Unauthorized',
          errorStatus: status,
        }),
      ).toBe('session-expired');
    });

    it('never reports denied without an identity to base it on', () => {
      const states = [
        resolveRouteAccess({ ...base, bootstrap: null, isLoading: true, error: null }),
        resolveRouteAccess({ ...base, bootstrap: null, isLoading: false, error: null }),
        resolveRouteAccess({ ...base, bootstrap: null, isLoading: false, error: 'x' }),
        resolveRouteAccess({
          ...base,
          bootstrap: null,
          isLoading: false,
          error: 'x',
          errorStatus: 401,
        }),
      ];
      expect(states).not.toContain('denied');
    });
  });
});

describe('getBootstrapRetryDelay', () => {
  it('backs off across the configured attempts', () => {
    expect(getBootstrapRetryDelay(0, true)).toBe(BOOTSTRAP_RETRY_DELAYS_MS[0]);
    expect(getBootstrapRetryDelay(1, true)).toBe(BOOTSTRAP_RETRY_DELAYS_MS[1]);
    expect(getBootstrapRetryDelay(2, true)).toBe(BOOTSTRAP_RETRY_DELAYS_MS[2]);
  });

  it('stops once the attempts are exhausted', () => {
    expect(getBootstrapRetryDelay(BOOTSTRAP_RETRY_DELAYS_MS.length, true)).toBeNull();
    expect(getBootstrapRetryDelay(99, true)).toBeNull();
  });

  it('does not retry a failure that retrying cannot fix', () => {
    expect(getBootstrapRetryDelay(0, false)).toBeNull();
  });

  it('rejects nonsense attempt counts rather than retrying forever', () => {
    expect(getBootstrapRetryDelay(-1, true)).toBeNull();
    expect(getBootstrapRetryDelay(1.5, true)).toBeNull();
  });
});
