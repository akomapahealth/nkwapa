/**
 * Keycloak client singleton for OAuth/OIDC authentication.
 * Only initializes on the client (SSR-safe).
 * Init is called once and reused to avoid "A Keycloak can only be initialized once" (React Strict Mode).
 */

import Keycloak from 'keycloak-js';

let keycloakInstance: Keycloak | null = null;
let initPromise: Promise<boolean> | null = null;

export function getKeycloak(): Keycloak | null {
  if (typeof window === 'undefined') return null;
  if (!keycloakInstance) {
    const url = process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? 'http://localhost:8080';
    const realm = process.env.NEXT_PUBLIC_KEYCLOAK_REALM ?? 'nkwapa';
    const clientId = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'nkwapa-web';
    keycloakInstance = new Keycloak({ url, realm, clientId });
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
