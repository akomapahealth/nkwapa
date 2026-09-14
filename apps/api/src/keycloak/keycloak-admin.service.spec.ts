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
};

function createClient(overrides: Partial<ClientMock> = {}): ClientMock {
  return {
    isReady: true,
    findUserByEmail: jest.fn().mockResolvedValue(null),
    createUser: jest.fn().mockResolvedValue({ id: 'kc-1', email: INPUT.email }),
    hasPasswordCredential: jest.fn().mockResolvedValue(false),
    executeActionsEmail: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function service(client: ClientMock): KeycloakAdminService {
  return new KeycloakAdminService(client as unknown as KeycloakAdminClient, CONFIG);
}

describe('KeycloakAdminService.provisionPortalIdentity', () => {
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

      const result = await service(client).provisionPortalIdentity(INPUT);

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

      const result = await service(client).provisionPortalIdentity(INPUT);

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

      const result = await service(client).provisionPortalIdentity(INPUT);

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

      const result = await service(client).provisionPortalIdentity(INPUT);

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
      await subject.provisionPortalIdentity(INPUT);
      await subject.provisionPortalIdentity(INPUT);

      expect(client.createUser).not.toHaveBeenCalled();
    });

    it('reports a disabled identity rather than silently re-enabling it', async () => {
      const client = createClient({
        findUserByEmail: jest
          .fn()
          .mockResolvedValue({ id: 'kc-9', enabled: false, emailVerified: true }),
      });

      const result = await service(client).provisionPortalIdentity(INPUT);

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

      const result = await service(client).provisionPortalIdentity(INPUT);

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

      const result = await service(client).provisionPortalIdentity(INPUT);

      expect(result).toMatchObject({ outcome: 'FAILED', failureReason: code });
    });

    it('reduces an unexpected error to a stable code', async () => {
      const client = createClient({
        findUserByEmail: jest.fn().mockRejectedValue(new Error('something odd')),
      });

      const result = await service(client).provisionPortalIdentity(INPUT);

      expect(result.failureReason).toBe('KEYCLOAK_ADMIN_REQUEST_FAILED');
    });

    it('keeps the patient address out of the failure log', async () => {
      const client = createClient({
        findUserByEmail: jest.fn().mockRejectedValue(new Error(INPUT.email)),
      });

      await service(client).provisionPortalIdentity(INPUT);

      const logged = warn.mock.calls.map((call) => String(call[0])).join('\n');
      expect(logged).not.toContain(INPUT.email);
    });
  });
});
