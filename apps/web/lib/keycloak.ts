/**
 * Keycloak client singleton for OAuth/OIDC authentication.
 * Only initializes on the client (SSR-safe).
 * Init is called once and reused to avoid "A Keycloak can only be initialized once" (React Strict Mode).
 */

import Keycloak from 'keycloak-js';

const KEYCLOAK_CONFIG = {
  url: process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? 'http://localhost:8080',
  realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM ?? 'nkwapa',
  clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'nkwapa-web',
};

let keycloakInstance: Keycloak | null = null;
let initPromise: Promise<boolean> | null = null;

export function getKeycloak(): Keycloak | null {
  if (typeof window === 'undefined') return null;
  if (!keycloakInstance) {
    keycloakInstance = new Keycloak(KEYCLOAK_CONFIG);
  }
  return keycloakInstance;
}

/** Initialize Keycloak once; returns cached promise on subsequent calls (React Strict Mode safe). */
export function initKeycloak(options: Keycloak.KeycloakInitOptions): Promise<boolean> {
  const kc = getKeycloak();
  if (!kc) return Promise.resolve(false);
  if (initPromise) return initPromise;
  initPromise = kc.init(options);
  return initPromise;
}

/** Reset Keycloak state. Call before logout so the next page load gets a fresh init. */
export function resetKeycloak(): void {
  initPromise = null;
  keycloakInstance = null;
}

/**
 * Whether the sign-in server can be reached at all (#206). navigator.onLine stays true on a
 * connected-but-dead network (signal bars, no data), where keycloak-js then waits on its iframe
 * before failing with an error that reads like a sign-in problem. An opaque no-cors request needs
 * no CORS headers and rejects only when the network itself fails; a slow answer still counts as
 * reachable, so a poor connection is never mistaken for none.
 */
export async function canReachKeycloak(): Promise<boolean> {
  // From config, not the instance: keycloak-js fills in its URLs only during init.
  const { url, realm } = KEYCLOAK_CONFIG;
  try {
    await fetch(`${url}/realms/${realm}`, { mode: 'no-cors', cache: 'no-store' });
    return true;
  } catch {
    return false;
  }
}
