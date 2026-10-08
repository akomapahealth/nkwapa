import { Logger } from '@nestjs/common';
import { KeycloakAdminClient, KeycloakAdminError } from './keycloak-admin.client';
import type { KeycloakAdminConfig } from './keycloak-admin.config';
import { KeycloakAdminService } from './keycloak-admin.service';

const CONFIG = {
  readiness: 'ready',
  missing: [],
  baseUrl: 'http://keycloak.test',
  realm: 'nkwapa',
  clientId: 'nkwapa-api',
  clientSecret: 'secret',
  publicClientId: 'nkwapa-web',
  timeoutMs: 5_000,
} satisfies KeycloakAdminConfig;

const INPUT = {
  email: 'patient@nkwapa.local',
  firstName: 'Ama',
  lastName: 'Mensah',
  claimRedirectUri: 'http://localhost:3000/claim-record?continue=1',
  lifespanSeconds: 604_800,
};

type ClientMock = {
  isReady: boolean;
  findUserByEmail: jest.Mock;
  createUser: jest.Mock;
  hasPasswordCredential: jest.Mock;
  executeActionsEmail: jest.Mock;
  setUserEnabled: jest.Mock;
  logoutUser: jest.Mock;
};

function createClient(overrides: Partial<ClientMock> = {}): ClientMock {
  return {
    isReady: true,
    findUserByEmail: jest.fn().mockResolvedValue(null),
    createUser: jest.fn().mockResolvedValue({ id: 'kc-1', email: INPUT.email }),
    hasPasswordCredential: jest.fn().mockResolvedValue(false),
    executeActionsEmail: jest.fn().mockResolvedValue(undefined),
    setUserEnabled: jest.fn().mockResolvedValue('UPDATED'),
    logoutUser: jest.fn().mockResolvedValue('LOGGED_OUT'),
    ...overrides,
  };
}

function service(client: ClientMock): KeycloakAdminService {
  return new KeycloakAdminService(client as unknown as KeycloakAdminClient, CONFIG);
}

describe('KeycloakAdminService.provisionInvitedIdentity', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    jest.restoreAllMocks();
  });

  describe('a patient who has never had an account', () => {
    it('creates the identity and asks for a password and verification', async () => {
      const client = createClient();

      const result = await service(client).provisionInvitedIdentity(INPUT);

      expect(result).toEqual({
        outcome: 'PROVISIONED',
        keycloakUserId: 'kc-1',
        actionsSent: ['UPDATE_PASSWORD', 'VERIFY_EMAIL'],
        failureReason: null,
      });
      expect(client.createUser).toHaveBeenCalledWith({
        email: INPUT.email,
        firstName: 'Ama',
        lastName: 'Mensah',
        requiredActions: ['UPDATE_PASSWORD', 'VERIFY_EMAIL'],
      });
      expect(client.executeActionsEmail).toHaveBeenCalledWith({
        userId: 'kc-1',
        actions: ['UPDATE_PASSWORD', 'VERIFY_EMAIL'],
        redirectUri: INPUT.claimRedirectUri,
        clientId: 'nkwapa-web',
        lifespanSeconds: 604_800,
      });
    });
  });

  /*
    Resending an invite is the case this whole class exists to get right. Staff resend
    routinely -- the patient lost the email, or the clinic is chasing an onboarding list --
    and a resend that reset a password the patient had already chosen would lock them out
    of the account the first email created.
  */
  describe('resending against an identity that already exists', () => {
    it('asks for a password only while none has been chosen', async () => {
      const client = createClient({
        findUserByEmail: jest.fn().mockResolvedValue({ id: 'kc-9', emailVerified: false }),
        hasPasswordCredential: jest.fn().mockResolvedValue(false),
      });

      const result = await service(client).provisionInvitedIdentity(INPUT);

      expect(result.outcome).toBe('EXISTING_PENDING');
      expect(result.keycloakUserId).toBe('kc-9');
      expect(result.actionsSent).toEqual(['UPDATE_PASSWORD', 'VERIFY_EMAIL']);
      expect(client.createUser).not.toHaveBeenCalled();
    });

    it('never asks again once the patient has chosen a password', async () => {
      const client = createClient({
        findUserByEmail: jest.fn().mockResolvedValue({ id: 'kc-9', emailVerified: false }),
        hasPasswordCredential: jest.fn().mockResolvedValue(true),
      });

      const result = await service(client).provisionInvitedIdentity(INPUT);

      expect(result.outcome).toBe('EXISTING_PENDING');
      expect(result.actionsSent).toEqual(['VERIFY_EMAIL']);
      expect(client.executeActionsEmail).toHaveBeenCalledWith(
        expect.objectContaining({ actions: ['VERIFY_EMAIL'] }),
      );
    });

    it('sends nothing at all to a patient whose account already works', async () => {
      const client = createClient({
        findUserByEmail: jest.fn().mockResolvedValue({ id: 'kc-9', emailVerified: true }),
        hasPasswordCredential: jest.fn().mockResolvedValue(true),
      });

      const result = await service(client).provisionInvitedIdentity(INPUT);

      expect(result).toEqual({
        outcome: 'ALREADY_ACTIVE',
        keycloakUserId: 'kc-9',
        actionsSent: [],
        failureReason: null,
      });
      expect(client.executeActionsEmail).not.toHaveBeenCalled();
      expect(client.createUser).not.toHaveBeenCalled();
    });

    it('creates no second identity for the same address', async () => {
      const client = createClient({
        findUserByEmail: jest.fn().mockResolvedValue({ id: 'kc-9', emailVerified: true }),
        hasPasswordCredential: jest.fn().mockResolvedValue(true),
      });

      const subject = service(client);
      await subject.provisionInvitedIdentity(INPUT);
      await subject.provisionInvitedIdentity(INPUT);

      expect(client.createUser).not.toHaveBeenCalled();
    });

    it('reports a disabled identity rather than silently re-enabling it', async () => {
      const client = createClient({
        findUserByEmail: jest
          .fn()
          .mockResolvedValue({ id: 'kc-9', enabled: false, emailVerified: true }),
      });

      const result = await service(client).provisionInvitedIdentity(INPUT);

      expect(result).toMatchObject({
        outcome: 'FAILED',
        keycloakUserId: 'kc-9',
        failureReason: 'IDENTITY_DISABLED',
      });
      expect(client.executeActionsEmail).not.toHaveBeenCalled();
    });
  });

  describe('when Keycloak cannot be reached', () => {
    it('is skipped, not failed, when no credentials are configured', async () => {
      const client = createClient({ isReady: false });

      const result = await service(client).provisionInvitedIdentity(INPUT);

      expect(result).toEqual({
        outcome: 'SKIPPED',
        keycloakUserId: null,
        actionsSent: [],
        failureReason: 'KEYCLOAK_ADMIN_UNCONFIGURED',
      });
      expect(client.findUserByEmail).not.toHaveBeenCalled();
    });

    it.each([
      ['KEYCLOAK_ADMIN_TIMEOUT'],
      ['KEYCLOAK_ADMIN_UNREACHABLE'],
      ['KEYCLOAK_ADMIN_AUTH_FAILED'],
    ])('reports %s without throwing, so the invite still stands', async (code) => {
      const client = createClient({
        findUserByEmail: jest
          .fn()
          .mockRejectedValue(new KeycloakAdminError(code as 'KEYCLOAK_ADMIN_TIMEOUT')),
      });

      const result = await service(client).provisionInvitedIdentity(INPUT);

      expect(result).toMatchObject({ outcome: 'FAILED', failureReason: code });
    });

    it('reduces an unexpected error to a stable code', async () => {
      const client = createClient({
        findUserByEmail: jest.fn().mockRejectedValue(new Error('something odd')),
      });

      const result = await service(client).provisionInvitedIdentity(INPUT);

      expect(result.failureReason).toBe('KEYCLOAK_ADMIN_REQUEST_FAILED');
    });

    it('keeps the patient address out of the failure log', async () => {
      const client = createClient({
        findUserByEmail: jest.fn().mockRejectedValue(new Error(INPUT.email)),
      });

      await service(client).provisionInvitedIdentity(INPUT);

      const logged = warn.mock.calls.map((call) => String(call[0])).join('\n');
      expect(logged).not.toContain(INPUT.email);
    });
  });
});

describe('KeycloakAdminService.setIdentityAccess', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('disables the identity and then ends its sessions', async () => {
    const client = createClient();

    await expect(service(client).setIdentityAccess('kc-1', false)).resolves.toEqual({
      outcome: 'APPLIED',
      sessionsEnded: true,
      retryable: false,
      failureReason: null,
    });
    expect(client.setUserEnabled).toHaveBeenCalledWith('kc-1', false);
    expect(client.logoutUser).toHaveBeenCalledWith('kc-1');
    expect(client.setUserEnabled.mock.invocationCallOrder[0]).toBeLessThan(
      client.logoutUser.mock.invocationCallOrder[0],
    );
  });

  it('enables without touching sessions', async () => {
    const client = createClient();

    await expect(service(client).setIdentityAccess('kc-1', true)).resolves.toMatchObject({
      outcome: 'APPLIED',
      sessionsEnded: false,
    });
    expect(client.logoutUser).not.toHaveBeenCalled();
  });

  it('reports a missing identity', async () => {
    const client = createClient({ setUserEnabled: jest.fn().mockResolvedValue('NOT_FOUND') });

    await expect(service(client).setIdentityAccess('gone', false)).resolves.toMatchObject({
      outcome: 'NOT_FOUND',
      failureReason: 'IDENTITY_NOT_FOUND',
    });
  });

  it('skips on a deployment without the service account', async () => {
    const client = createClient({ isReady: false });

    await expect(service(client).setIdentityAccess('kc-1', false)).resolves.toMatchObject({
      outcome: 'SKIPPED',
      failureReason: 'KEYCLOAK_ADMIN_UNCONFIGURED',
    });
    expect(client.setUserEnabled).not.toHaveBeenCalled();
  });

  it.each([
    [new KeycloakAdminError('KEYCLOAK_ADMIN_TIMEOUT'), true],
    [new KeycloakAdminError('KEYCLOAK_ADMIN_UNREACHABLE'), true],
    [new KeycloakAdminError('KEYCLOAK_ADMIN_REQUEST_FAILED', 503), true],
    [new KeycloakAdminError('KEYCLOAK_ADMIN_REQUEST_FAILED', 403), false],
    [new KeycloakAdminError('KEYCLOAK_ADMIN_AUTH_FAILED', 401), false],
  ])('never throws, and marks %s retryable=%s', async (error, retryable) => {
    const client = createClient({ setUserEnabled: jest.fn().mockRejectedValue(error) });

    await expect(service(client).setIdentityAccess('kc-1', false)).resolves.toMatchObject({
      outcome: 'FAILED',
      retryable,
      failureReason: error.code,
    });
  });
});
