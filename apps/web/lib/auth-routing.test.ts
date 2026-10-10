import {
  buildLoginHref,
  getDefaultWorkspacePath,
  getOnboardingPath,
  getPostAuthPath,
  getSafeNextPath,
  shouldAutoContinue,
} from './auth-routing';
import type { WhoAmIResponse } from './bootstrap-context';

const CLAIMANT = {
  onboarding: { state: 'PATIENT_CLAIM_REQUIRED', pendingInvites: [] },
} as unknown as WhoAmIResponse;

const STAFF = { effectiveRolesForActiveClinic: ['DOCTOR'] } as unknown as WhoAmIResponse;

describe('shouldAutoContinue', () => {
  /*
    The whole point of the marker. A patient who has just chosen their password in Keycloak
    comes back holding a live SSO session and is shown a page asking them to sign in; the
    silent check-sso that would have noticed the session runs in an iframe, which Safari and
    Firefox block by default. A top-level redirect is the only reliable way through.
  */
  it('continues for a patient returning from Keycloak', () => {
    expect(shouldAutoContinue('/claim-record?continue=1')).toBe(true);
  });

  /*
    The end-to-end contract with the API, which builds the redirect URI Keycloak sends the
    patient back on. If either side changes its spelling the journey ends on a sign-in page
    the patient has no reason to think is safe to click -- and nothing else would fail.
  */
  it('survives the round trip from the redirect URI the API issues', () => {
    const redirectUri = 'https://app.nkwapa.app/claim-record?continue=1';
    const { pathname, search } = new URL(redirectUri);

    const loginHref = buildLoginHref(`${pathname}${search}`);
    expect(loginHref).toBe('/login?next=%2Fclaim-record%3Fcontinue%3D1');

    const next = new URLSearchParams(loginHref.split('?')[1]).get('next');
    expect(shouldAutoContinue(next)).toBe(true);
    expect(getSafeNextPath(next)).toBe('/claim-record?continue=1');
  });

  /*
    Everything below is a path that must keep behaving exactly as it does today. Auto
    redirecting every unauthenticated arrival would change how every deep link in the
    product behaves, and a sign-in page that navigates on its own is hostile to someone
    who arrived there deliberately.
  */
  it.each([
    ['no next at all', null],
    ['an empty next', ''],
    ['an ordinary deep link', '/dashboard'],
    ['the claim route without the marker', '/claim-record'],
    ['a different query', '/claim-record?foo=1'],
    ['the marker with another value', '/claim-record?continue=0'],
    ['the marker with no value', '/claim-record?continue'],
    ['a lookalike parameter', '/claim-record?continued=1'],
  ])('waits for a click given %s', (_label, next) => {
    expect(shouldAutoContinue(next)).toBe(false);
  });

  // getSafeNextPath is what stops an open redirect; the marker must not route around it.
  it.each([
    ['an absolute URL', 'https://evil.example/claim-record?continue=1'],
    ['a protocol-relative URL', '//evil.example/claim-record?continue=1'],
    ['a path that does not start with a slash', 'claim-record?continue=1'],
  ])('refuses to continue to %s', (_label, next) => {
    expect(shouldAutoContinue(next)).toBe(false);
    expect(getSafeNextPath(next)).toBeNull();
  });

  it('continues on any route carrying the marker, not only the claim route', () => {
    expect(shouldAutoContinue('/portal?continue=1')).toBe(true);
  });

  it('finds the marker alongside other parameters', () => {
    expect(shouldAutoContinue('/claim-record?foo=bar&continue=1')).toBe(true);
  });
});

describe('getPostAuthPath', () => {
  /*
    A pending claim outranks wherever the visitor was headed, which is why this function
    overrides `next` at all. It must not override its own query string too: the marker that
    says a patient has just set a password rides there, and dropping it landed them on the
    claim form with no acknowledgement of the step they had just completed.
  */
  it('keeps the marker when the destination is the claim route either way', () => {
    expect(getPostAuthPath(CLAIMANT, '/claim-record?continue=1')).toBe('/claim-record?continue=1');
  });

  it('still overrides a destination that is not the claim route', () => {
    expect(getPostAuthPath(CLAIMANT, '/dashboard')).toBe('/claim-record');
    expect(getPostAuthPath(CLAIMANT, '/portal?continue=1')).toBe('/claim-record');
  });

  it('falls back to the bare route when there is no next', () => {
    expect(getPostAuthPath(CLAIMANT, null)).toBe('/claim-record');
  });

  it('refuses a next that only looks like the claim route', () => {
    expect(getPostAuthPath(CLAIMANT, '//evil.example/claim-record?continue=1')).toBe(
      '/claim-record',
    );
    expect(getPostAuthPath(CLAIMANT, '/claim-record-evil?continue=1')).toBe('/claim-record');
  });

  it('leaves everyone without a pending claim exactly as they were', () => {
    expect(getPostAuthPath(STAFF, '/patients')).toBe('/patients');
    expect(getPostAuthPath(STAFF, null)).toBe('/dashboard');
  });
});

describe('staff invitation onboarding', () => {
  const INVITEE = {
    onboarding: { state: 'STAFF_INVITE_ACCEPT_REQUIRED' },
    pendingStaffInvites: [{ id: 'invite-1' }],
  } as unknown as WhoAmIResponse;

  it('holds an account with no role on the acceptance page', () => {
    expect(getOnboardingPath(INVITEE)).toBe('/accept-invite');
    expect(getDefaultWorkspacePath(INVITEE)).toBe('/accept-invite');
  });

  it('outranks wherever the invitee was headed', () => {
    expect(getPostAuthPath(INVITEE, '/patients')).toBe('/accept-invite');
  });

  // Same contract as the patient journey: the marker says a password was just chosen.
  it('keeps the continue marker the API puts on the redirect', () => {
    expect(getPostAuthPath(INVITEE, '/accept-invite?continue=1')).toBe('/accept-invite?continue=1');
    expect(shouldAutoContinue('/accept-invite?continue=1')).toBe(true);
  });

  // A colleague invited to a second clinic is offered it, not sent away from their work.
  it('does not hold an existing staff member who also has an invitation', () => {
    const colleague = {
      ...STAFF,
      onboarding: null,
      pendingStaffInvites: [{ id: 'invite-2' }],
    } as unknown as WhoAmIResponse;
    expect(getOnboardingPath(colleague)).toBeNull();
    expect(getPostAuthPath(colleague, '/patients')).toBe('/patients');
  });

  it('leaves the patient claim path unchanged', () => {
    expect(getOnboardingPath(CLAIMANT)).toBe('/claim-record');
  });
});
