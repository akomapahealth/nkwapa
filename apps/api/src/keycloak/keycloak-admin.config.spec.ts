import {
  describeKeycloakAdminUnavailability,
  resolveKeycloakAdminConfig,
} from './keycloak-admin.config';

describe('resolveKeycloakAdminConfig', () => {
  const ready = {
    KEYCLOAK_ADMIN_BASE_URL: 'http://localhost:8080',
    KEYCLOAK_ADMIN_CLIENT_SECRET: 'a-secret',
  };

  it('reports ready when the base url and secret are both present', () => {
    const config = resolveKeycloakAdminConfig(ready as NodeJS.ProcessEnv);

    expect(config.readiness).toBe('ready');
    expect(config.missing).toEqual([]);
    expect(config.baseUrl).toBe('http://localhost:8080');
    expect(config.realm).toBe('nkwapa');
    expect(config.clientId).toBe('nkwapa-api');
    expect(config.publicClientId).toBe('nkwapa-web');
  });

  /*
    The redirect a patient comes back on is validated against the browser-facing client's
    allowlist, not the service account's. Getting this wrong fails at the very end of the
    journey, after the patient has already chosen a password.
  */
  it('takes the redirect-validating client from the browser client, not the service account', () => {
    const config = resolveKeycloakAdminConfig({
      ...ready,
      KEYCLOAK_CLIENT_ID: 'nkwapa-web-staging',
      KEYCLOAK_ADMIN_CLIENT_ID: 'nkwapa-api',
    } as NodeJS.ProcessEnv);

    expect(config.publicClientId).toBe('nkwapa-web-staging');
    expect(config.clientId).toBe('nkwapa-api');
  });

  it('falls back to the audience, which staging and production already set', () => {
    const config = resolveKeycloakAdminConfig({
      ...ready,
      KEYCLOAK_AUDIENCE: 'nkwapa-web',
    } as NodeJS.ProcessEnv);

    expect(config.publicClientId).toBe('nkwapa-web');
  });

  it('names the missing variables rather than throwing, so the API still boots', () => {
    const config = resolveKeycloakAdminConfig({} as NodeJS.ProcessEnv);

    expect(config.readiness).toBe('unconfigured');
    expect(config.missing).toEqual(['KEYCLOAK_ADMIN_BASE_URL', 'KEYCLOAK_ADMIN_CLIENT_SECRET']);
  });

  it('never reports a secret value in the missing list', () => {
    const config = resolveKeycloakAdminConfig({
      KEYCLOAK_ADMIN_CLIENT_SECRET: 'a-secret',
    } as NodeJS.ProcessEnv);

    expect(config.missing).toEqual(['KEYCLOAK_ADMIN_BASE_URL']);
    expect(JSON.stringify(config.missing)).not.toContain('a-secret');
  });

  it('falls back to the issuer origin, which every deployment already sets', () => {
    const config = resolveKeycloakAdminConfig({
      KEYCLOAK_ISSUER: 'https://auth.nkwapa.app/realms/nkwapa',
      KEYCLOAK_ADMIN_CLIENT_SECRET: 'a-secret',
    } as NodeJS.ProcessEnv);

    expect(config.readiness).toBe('ready');
    expect(config.baseUrl).toBe('https://auth.nkwapa.app');
  });

  it('prefers an explicit base url over the issuer', () => {
    const config = resolveKeycloakAdminConfig({
      ...ready,
      KEYCLOAK_ISSUER: 'https://auth.nkwapa.app/realms/nkwapa',
    } as NodeJS.ProcessEnv);

    expect(config.baseUrl).toBe('http://localhost:8080');
  });

  it('rejects a base url that is not http(s), rather than trusting it', () => {
    const config = resolveKeycloakAdminConfig({
      KEYCLOAK_ADMIN_BASE_URL: 'file:///etc/passwd',
      KEYCLOAK_ADMIN_CLIENT_SECRET: 'a-secret',
    } as NodeJS.ProcessEnv);

    expect(config.readiness).toBe('unconfigured');
    expect(config.missing).toContain('KEYCLOAK_ADMIN_BASE_URL');
  });

  it('treats a blank secret as absent, not as a secret that happens to be empty', () => {
    const config = resolveKeycloakAdminConfig({
      ...ready,
      KEYCLOAK_ADMIN_CLIENT_SECRET: '   ',
    } as NodeJS.ProcessEnv);

    expect(config.readiness).toBe('unconfigured');
    expect(config.missing).toContain('KEYCLOAK_ADMIN_CLIENT_SECRET');
  });

  it('honours realm and client overrides', () => {
    const config = resolveKeycloakAdminConfig({
      ...ready,
      KEYCLOAK_REALM: 'other',
      KEYCLOAK_ADMIN_CLIENT_ID: 'other-api',
    } as NodeJS.ProcessEnv);

    expect(config.realm).toBe('other');
    expect(config.clientId).toBe('other-api');
  });

  describe('timeout', () => {
    it('defaults to five seconds', () => {
      expect(resolveKeycloakAdminConfig(ready as NodeJS.ProcessEnv).timeoutMs).toBe(5_000);
    });

    it.each([
      ['0', 1_000],
      ['999999', 30_000],
      ['not-a-number', 5_000],
      ['8000', 8_000],
    ])('clamps %s to %d, because it is held open across a transaction', (raw, expected) => {
      const config = resolveKeycloakAdminConfig({
        ...ready,
        KEYCLOAK_ADMIN_TIMEOUT_MS: raw,
      } as NodeJS.ProcessEnv);

      expect(config.timeoutMs).toBe(expected);
    });
  });
});

describe('describeKeycloakAdminUnavailability', () => {
  it('says nothing when the client is ready', () => {
    const config = resolveKeycloakAdminConfig({
      KEYCLOAK_ADMIN_BASE_URL: 'http://localhost:8080',
      KEYCLOAK_ADMIN_CLIENT_SECRET: 'a-secret',
    } as NodeJS.ProcessEnv);

    expect(describeKeycloakAdminUnavailability(config)).toBeNull();
  });

  it('names the variables an operator has to set', () => {
    const config = resolveKeycloakAdminConfig({} as NodeJS.ProcessEnv);

    expect(describeKeycloakAdminUnavailability(config)).toBe(
      'Patient accounts cannot be created automatically until KEYCLOAK_ADMIN_BASE_URL and KEYCLOAK_ADMIN_CLIENT_SECRET are set on the API.',
    );
  });
});
