const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:3000'];

export function getAllowedCorsOrigins() {
  const raw = process.env.CORS_ALLOWED_ORIGINS?.trim();
  if (!raw) {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getRateLimitValue(
  envKey: string,
  fallback: number,
  { min = 1, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {},
) {
  const raw = process.env[envKey];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

/**
 * Settings production must not start without. Unset, the API would quietly accept tokens minted
 * for any client in the realm (KEYCLOAK_AUDIENCE) or trust a client-written X-Forwarded-For for
 * rate limits and audit addresses (CLIENT_IP_HEADER). Outside production both stay optional.
 */
export function assertProductionConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return;
  const missing = ['KEYCLOAK_AUDIENCE', 'CLIENT_IP_HEADER'].filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Refusing to start: ${missing.join(' and ')} must be set in production (deploy/env/production.api.env.example)`,
    );
  }
}
