import { buildLoginHref, getSafeNextPath, shouldAutoContinue } from './auth-routing';

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
