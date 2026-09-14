/**
 * What the process can actually do with Keycloak's Admin API right now.
 *
 * `unconfigured` is not an error. A deployment that has not been given service-account
 * credentials still issues portal invites; it just cannot create the account behind one,
 * and staff are told so on the chart rather than being handed a silent failure.
 */
export type KeycloakAdminReadiness = 'ready' | 'unconfigured';

export interface KeycloakAdminConfig {
  readiness: KeycloakAdminReadiness;
  /** Names of the environment variables still required. Never their values. */
  missing: string[];
  baseUrl: string | null;
  realm: string;
  clientId: string;
  clientSecret: string | null;
  /**
   * The browser-facing client an action-token redirect is validated against. Keycloak
   * checks the redirect URI against this client's allowlist, so it must be the one the web
   * app signs in with, not the service account.
   */
  publicClientId: string;
  /**
   * Provisioning runs inside the request's transaction, which Postgres holds open for the
   * duration. The timeout is therefore a lock-contention budget as much as a network one.
   */
  timeoutMs: number;
}

const DEFAULT_REALM = 'nkwapa';
const DEFAULT_CLIENT_ID = 'nkwapa-api';
const DEFAULT_PUBLIC_CLIENT_ID = 'nkwapa-web';
const DEFAULT_TIMEOUT_MS = 5_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 30_000;

function read(env: NodeJS.ProcessEnv, key: string): string | null {
  const value = env[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toOrigin(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function resolveTimeoutMs(env: NodeJS.ProcessEnv): number {
  const raw = read(env, 'KEYCLOAK_ADMIN_TIMEOUT_MS');
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, parsed));
}

/**
 * Resolve Keycloak admin configuration without throwing.
 *
 * Same contract as resolveEmailConfig, for the same reason: a throw out of a DI factory
 * crash-loops the entire API, including every route that has nothing to do with identity.
 *
 * The base URL falls back to the origin of KEYCLOAK_ISSUER, which every deployment already
 * sets for token validation. Admin calls and token validation always address the same
 * Keycloak, so making operators state it twice only creates a way for the two to disagree.
 */
export function resolveKeycloakAdminConfig(
  env: NodeJS.ProcessEnv = process.env,
): KeycloakAdminConfig {
  const baseUrl =
    toOrigin(read(env, 'KEYCLOAK_ADMIN_BASE_URL')) ?? toOrigin(read(env, 'KEYCLOAK_ISSUER'));
  const clientSecret = read(env, 'KEYCLOAK_ADMIN_CLIENT_SECRET');
  const realm = read(env, 'KEYCLOAK_REALM') ?? DEFAULT_REALM;
  const clientId = read(env, 'KEYCLOAK_ADMIN_CLIENT_ID') ?? DEFAULT_CLIENT_ID;
  const publicClientId =
    read(env, 'KEYCLOAK_CLIENT_ID') ?? read(env, 'KEYCLOAK_AUDIENCE') ?? DEFAULT_PUBLIC_CLIENT_ID;
  const timeoutMs = resolveTimeoutMs(env);

  const missing: string[] = [];
  if (!baseUrl) missing.push('KEYCLOAK_ADMIN_BASE_URL');
  if (!clientSecret) missing.push('KEYCLOAK_ADMIN_CLIENT_SECRET');

  if (missing.length > 0) {
    return {
      readiness: 'unconfigured',
      missing,
      baseUrl,
      realm,
      clientId,
      clientSecret,
      publicClientId,
      timeoutMs,
    };
  }

  return {
    readiness: 'ready',
    missing: [],
    baseUrl,
    realm,
    clientId,
    clientSecret,
    publicClientId,
    timeoutMs,
  };
}

/** The operator-facing sentence, or null when nothing is wrong. */
export function describeKeycloakAdminUnavailability(config: KeycloakAdminConfig): string | null {
  if (config.readiness === 'ready') return null;
  return `Patient accounts cannot be created automatically until ${config.missing.join(' and ')} ${
    config.missing.length === 1 ? 'is' : 'are'
  } set on the API.`;
}
