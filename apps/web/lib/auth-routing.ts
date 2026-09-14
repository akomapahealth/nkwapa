import type { WhoAmIResponse } from './bootstrap-context';

export function getSafeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/')) {
    return null;
  }

  if (next.startsWith('//') || next === '/login') {
    return null;
  }

  return next;
}

export function buildLoginHref(next: string | null | undefined): string {
  const safeNext = getSafeNextPath(next);
  if (!safeNext) {
    return '/login';
  }

  const params = new URLSearchParams({ next: safeNext });
  return `/login?${params.toString()}`;
}

export function getDefaultWorkspacePath(bootstrap: WhoAmIResponse | null): string {
  const requiresPatientClaim = bootstrap?.onboarding?.state === 'PATIENT_CLAIM_REQUIRED';
  if (requiresPatientClaim) {
    return '/claim-record';
  }

  const roles = bootstrap?.effectiveRolesForActiveClinic ?? bootstrap?.globalRoles ?? [];
  const isPatientOnly = roles.length === 1 && roles[0] === 'PATIENT';
  return isPatientOnly ? '/portal' : '/dashboard';
}

export function getPostAuthPath(
  bootstrap: WhoAmIResponse | null,
  next: string | null | undefined,
): string {
  const defaultPath = getDefaultWorkspacePath(bootstrap);
  if (defaultPath === '/claim-record') {
    /*
      A pending claim still outranks wherever the visitor was headed -- but not its own
      query string. Returning the bare path here dropped the marker that says this patient
      has just set a password, so they arrived at the claim form with no acknowledgement of
      the step they had completed a moment earlier, on the one journey the marker exists for.
    */
    const safeNext = getSafeNextPath(next);
    return safeNext && safeNext.split('?')[0] === defaultPath ? safeNext : defaultPath;
  }

  return getSafeNextPath(next) ?? defaultPath;
}

/**
 * The marker Keycloak sends a patient back with after they set their password.
 *
 * Mirrors PORTAL_CLAIM_CONTINUE_QUERY on the API, which builds the redirect URI.
 */
export const AUTH_CONTINUE_PARAM = 'continue';

/**
 * Whether to start sign-in without waiting for the visitor to click.
 *
 * A patient who has just chosen their password in Keycloak arrives back here holding a live
 * SSO session, and we bounce them to a page asking them to sign in. Worse, the silent
 * check-sso that would have spotted the session runs in an iframe, which the third-party
 * cookie defaults in Safari and Firefox block outright -- so for most patients it is not
 * even a redundant click, it is the only way through, on a page that gives no hint that
 * clicking is safe.
 *
 * A top-level redirect is not subject to those cookie rules, so this returns them to a
 * signed-in app in one hop with nothing to read.
 *
 * Gated on an explicit marker rather than applied to every unauthenticated arrival. Auto
 * redirecting anyone who lands on /login would change how every deep link in the product
 * behaves, and a sign-in page that navigates on its own is hostile to someone who arrived
 * there deliberately.
 */
export function shouldAutoContinue(next: string | null | undefined): boolean {
  const safeNext = getSafeNextPath(next);
  if (!safeNext) {
    return false;
  }

  const query = safeNext.indexOf('?');
  if (query === -1) {
    return false;
  }

  return new URLSearchParams(safeNext.slice(query + 1)).get(AUTH_CONTINUE_PARAM) === '1';
}
