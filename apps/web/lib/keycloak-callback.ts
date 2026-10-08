/*
  Kept apart from lib/keycloak.ts so it can be tested: keycloak-js ships as ESM only, which the
  web unit tests do not load.
*/

/**
 * Whether this page load is Keycloak handing back after sign-in: the authorization response
 * (`code` and `state`) in the URL fragment, keycloak-js's default response mode, or the query.
 *
 * On that load the code is exchanged for tokens directly, so silent SSO never runs, and the
 * third-party-cookie probe that configuring it triggers is two round trips for nothing (#172).
 */
export function isKeycloakCallback(location: { hash: string; search: string }): boolean {
  const params = (raw: string) => new URLSearchParams(raw.replace(/^[#?]/, ''));
  return [params(location.hash), params(location.search)].some(
    (candidate) => candidate.has('code') && candidate.has('state'),
  );
}
