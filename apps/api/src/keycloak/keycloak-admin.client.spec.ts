import { Logger } from '@nestjs/common';
import { KeycloakAdminClient, KeycloakAdminError } from './keycloak-admin.client';
import type { KeycloakAdminConfig } from './keycloak-admin.config';

const SECRET = 'super-secret-value';

const readyConfig: KeycloakAdminConfig = {
  readiness: 'ready',
  missing: [],
  baseUrl: 'http://keycloak.test',
  realm: 'nkwapa',
  clientId: 'nkwapa-api',
  clientSecret: SECRET,
  timeoutMs: 5_000,
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function tokenResponse(accessToken = 'token-1', expiresIn = 300): Response {
  return jsonResponse({ access_token: accessToken, expires_in: expiresIn });
}

describe('KeycloakAdminClient', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    warn.mockRestore();
    jest.restoreAllMocks();
  });

  function client(config: Partial<KeycloakAdminConfig> = {}): KeycloakAdminClient {
    return new KeycloakAdminClient({ ...readyConfig, ...config });
  }

  function urlsCalled(): string[] {
    return fetchMock.mock.calls.map(([url]) => String(url));
  }

  describe('authentication', () => {
    it('uses a client_credentials grant against the realm token endpoint', async () => {
      fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse([]));

      await client().findUserByEmail('patient@nkwapa.local');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://keycloak.test/realms/nkwapa/protocol/openid-connect/token');
      const body = new URLSearchParams(String(init.body));
      expect(body.get('grant_type')).toBe('client_credentials');
      expect(body.get('client_id')).toBe('nkwapa-api');
      expect(body.get('client_secret')).toBe(SECRET);
    });

    it('reuses a cached token instead of authenticating per call', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(jsonResponse([]))
        .mockResolvedValueOnce(jsonResponse([]));

      const subject = client();
      await subject.findUserByEmail('a@nkwapa.local');
      await subject.findUserByEmail('b@nkwapa.local');

      const tokenCalls = urlsCalled().filter((url) => url.endsWith('/token'));
      expect(tokenCalls).toHaveLength(1);
    });

    it('re-authenticates when the cached token is already inside its expiry margin', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse('token-1', 10))
        .mockResolvedValueOnce(jsonResponse([]))
        .mockResolvedValueOnce(tokenResponse('token-2', 300))
        .mockResolvedValueOnce(jsonResponse([]));

      const subject = client();
      await subject.findUserByEmail('a@nkwapa.local');
      await subject.findUserByEmail('b@nkwapa.local');

      expect(urlsCalled().filter((url) => url.endsWith('/token'))).toHaveLength(2);
    });

    it('raises an auth failure, not a generic one, when the grant is rejected', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'invalid_client' }, 401));

      await expect(client().findUserByEmail('a@nkwapa.local')).rejects.toMatchObject({
        code: 'KEYCLOAK_ADMIN_AUTH_FAILED',
      });
    });

    it('refuses to call anything when the config is unconfigured', async () => {
      const subject = client({ readiness: 'unconfigured', clientSecret: null });

      await expect(subject.findUserByEmail('a@nkwapa.local')).rejects.toMatchObject({
        code: 'KEYCLOAK_ADMIN_UNCONFIGURED',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('the secret never escapes', () => {
    it('is absent from every log line and thrown message when a request fails', async () => {
      fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => `boom ${SECRET}`,
      } as Response);

      const error = await client()
        .findUserByEmail('patient@nkwapa.local')
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(KeycloakAdminError);
      expect(String((error as Error).message)).not.toContain(SECRET);

      const logged = warn.mock.calls.map((call) => String(call[0])).join('\n');
      expect(logged).not.toContain(SECRET);
    });

    it('keeps the patient address out of the logs as well', async () => {
      fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => 'User patient@nkwapa.local could not be read',
      } as Response);

      await client()
        .findUserByEmail('patient@nkwapa.local')
        .catch(() => undefined);

      const logged = warn.mock.calls.map((call) => String(call[0])).join('\n');
      expect(logged).not.toContain('patient@nkwapa.local');
      expect(logged).toContain('[redacted-email]');
    });
  });

  describe('findUserByEmail', () => {
    it('queries exactly and matches case-insensitively', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(jsonResponse([{ id: 'u1', email: 'Patient@Nkwapa.Local' }]));

      const found = await client().findUserByEmail('patient@nkwapa.local');

      expect(found?.id).toBe('u1');
      expect(urlsCalled()[1]).toContain('exact=true');
    });

    it('returns null when nothing matches', async () => {
      fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse([]));

      await expect(client().findUserByEmail('patient@nkwapa.local')).resolves.toBeNull();
    });

    it('ignores a near-miss the filter let through', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(jsonResponse([{ id: 'u1', email: 'someone-else@nkwapa.local' }]));

      await expect(client().findUserByEmail('patient@nkwapa.local')).resolves.toBeNull();
    });
  });

  describe('createUser', () => {
    it('creates a disabled-verification identity carrying the required actions', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(jsonResponse({}, 201))
        .mockResolvedValueOnce(jsonResponse([{ id: 'u1', email: 'patient@nkwapa.local' }]));

      const created = await client().createUser({
        email: 'patient@nkwapa.local',
        firstName: 'Ama',
        lastName: null,
        requiredActions: ['UPDATE_PASSWORD', 'VERIFY_EMAIL'],
      });

      expect(created.id).toBe('u1');
      const body = JSON.parse(String(fetchMock.mock.calls[1][1].body));
      expect(body).toMatchObject({
        username: 'patient@nkwapa.local',
        email: 'patient@nkwapa.local',
        enabled: true,
        emailVerified: false,
        firstName: 'Ama',
        requiredActions: ['UPDATE_PASSWORD', 'VERIFY_EMAIL'],
      });
      expect(body).not.toHaveProperty('lastName');
      // Asserting the address here would hand a verified identity to whoever typed it in.
      expect(body.emailVerified).toBe(false);
    });

    it('treats a 409 as the concurrent invite it almost always is', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(jsonResponse({ errorMessage: 'User exists' }, 409))
        .mockResolvedValueOnce(jsonResponse([{ id: 'u1', email: 'patient@nkwapa.local' }]));

      await expect(
        client().createUser({
          email: 'patient@nkwapa.local',
          requiredActions: ['UPDATE_PASSWORD'],
        }),
      ).resolves.toMatchObject({ id: 'u1' });
    });

    it('fails when the created user cannot be read back', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(jsonResponse({}, 201))
        .mockResolvedValueOnce(jsonResponse([]));

      await expect(
        client().createUser({
          email: 'patient@nkwapa.local',
          requiredActions: ['UPDATE_PASSWORD'],
        }),
      ).rejects.toMatchObject({ code: 'KEYCLOAK_ADMIN_REQUEST_FAILED' });
    });
  });

  describe('hasPasswordCredential', () => {
    it.each([
      [[{ type: 'password' }], true],
      [[{ type: 'otp' }], false],
      [[], false],
    ])('reads %j as %s', async (credentials, expected) => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(jsonResponse(credentials));

      await expect(client().hasPasswordCredential('u1')).resolves.toBe(expected);
    });
  });

  describe('executeActionsEmail', () => {
    it('passes the client, redirect and lifespan Keycloak needs to build the link', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(jsonResponse(undefined, 204));

      await client().executeActionsEmail({
        userId: 'u1',
        actions: ['UPDATE_PASSWORD', 'VERIFY_EMAIL'],
        redirectUri: 'http://localhost:3000/claim-record?continue=1',
        clientId: 'nkwapa-web',
        lifespanSeconds: 604_800,
      });

      const [url, init] = fetchMock.mock.calls[1];
      const query = new URL(String(url)).searchParams;
      expect(String(url)).toContain('/users/u1/execute-actions-email');
      expect(query.get('client_id')).toBe('nkwapa-web');
      expect(query.get('redirect_uri')).toBe('http://localhost:3000/claim-record?continue=1');
      expect(query.get('lifespan')).toBe('604800');
      expect(JSON.parse(String(init.body))).toEqual(['UPDATE_PASSWORD', 'VERIFY_EMAIL']);
      expect(init.method).toBe('PUT');
    });
  });

  describe('transport failures', () => {
    it('retries once when a cached token has been revoked under us', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse('stale'))
        .mockResolvedValueOnce(jsonResponse({}, 401))
        .mockResolvedValueOnce(tokenResponse('fresh'))
        .mockResolvedValueOnce(jsonResponse([{ id: 'u1', email: 'a@nkwapa.local' }]));

      await expect(client().findUserByEmail('a@nkwapa.local')).resolves.toMatchObject({
        id: 'u1',
      });
      expect(urlsCalled().filter((url) => url.endsWith('/token'))).toHaveLength(2);
    });

    it('gives up after one retry, so a rejected credential is not a loop', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse('stale'))
        .mockResolvedValueOnce(jsonResponse({}, 401))
        .mockResolvedValueOnce(tokenResponse('fresh'))
        .mockResolvedValueOnce(jsonResponse({}, 401));

      await expect(client().findUserByEmail('a@nkwapa.local')).rejects.toMatchObject({
        code: 'KEYCLOAK_ADMIN_REQUEST_FAILED',
        status: 401,
      });
      expect(urlsCalled().filter((url) => url.endsWith('/token'))).toHaveLength(2);
    });

    it('distinguishes a timeout from an unreachable host', async () => {
      const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
      fetchMock.mockRejectedValueOnce(timeout);

      await expect(client().findUserByEmail('a@nkwapa.local')).rejects.toMatchObject({
        code: 'KEYCLOAK_ADMIN_TIMEOUT',
      });

      fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      await expect(client().findUserByEmail('a@nkwapa.local')).rejects.toMatchObject({
        code: 'KEYCLOAK_ADMIN_UNREACHABLE',
      });
    });
  });
});
