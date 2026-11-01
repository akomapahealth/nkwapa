import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { createKeycloakAdminServiceMock } from '../testing/keycloak-admin-fixtures';
import { UserProfileService } from './user-profile.service';

describe('UserProfileService.updateName', () => {
  const STORED = {
    id: 'user-1',
    email: 'mensah@clinic.org',
    keycloakSub: 'kc-sub-1',
    firstName: null,
    middleInitial: null,
    lastName: null,
    displayName: 'mensah@clinic.org',
  };
  const CONTEXT = { actorUserId: 'user-1', source: 'SELF' as const, requestId: 'req-1' };

  function setup(stored: Record<string, unknown> | null = STORED) {
    const tx = {
      user: {
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: object }) => ({ ...STORED, ...stored, ...data })),
      },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(stored) },
      $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const audit = { logWrite: jest.fn().mockResolvedValue(undefined) };
    const keycloak = createKeycloakAdminServiceMock();
    const service = new UserProfileService(prisma as never, audit as never, keycloak as never);
    return { service, tx, audit, keycloak };
  }

  beforeEach(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('derives the display name, audits once and pushes the names to Keycloak', async () => {
    const { service, tx, audit, keycloak } = setup();

    const result = await service.updateName(
      'user-1',
      { firstName: ' Ama ', middleInitial: 'k.', lastName: 'Mensah' },
      CONTEXT,
    );

    expect(result).toEqual({
      userId: 'user-1',
      firstName: 'Ama',
      middleInitial: 'K',
      lastName: 'Mensah',
      displayName: 'Ama K. Mensah',
    });
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          firstName: 'Ama',
          middleInitial: 'K',
          lastName: 'Mensah',
          displayName: 'Ama K. Mensah',
        },
      }),
    );
    expect(audit.logWrite).toHaveBeenCalledTimes(1);
    const [event, client] = audit.logWrite.mock.calls[0];
    expect(client).toBe(tx);
    expect(event).toMatchObject({ action: 'USER.NAME.UPDATE', entityId: 'user-1' });
    expect(JSON.parse(event.beforeJson)).toMatchObject({
      displayName: 'mensah@clinic.org',
      source: 'SELF',
    });
    expect(JSON.parse(event.afterJson)).toMatchObject({
      displayName: 'Ama K. Mensah',
      source: 'SELF',
    });
    expect(keycloak.updateIdentityNames).toHaveBeenCalledWith('kc-sub-1', {
      firstName: 'Ama',
      lastName: 'Mensah',
    });
  });

  it('accepts names with diacritics, hyphens and apostrophes', async () => {
    const { service } = setup();

    await expect(
      service.updateName(
        'user-1',
        { firstName: 'Abena Adɔma', lastName: "O'Neil-Mensah" },
        CONTEXT,
      ),
    ).resolves.toMatchObject({ displayName: "Abena Adɔma O'Neil-Mensah" });
  });

  it.each([
    [{ firstName: '', lastName: 'Mensah' }, 'firstName'],
    [{ firstName: 'Ama', lastName: '1234' }, 'lastName'],
    [{ firstName: 'mensah@clinic.org', lastName: 'Mensah' }, 'firstName'],
    [{ firstName: 'Ama', lastName: 'a'.repeat(121) }, 'lastName'],
  ])('refuses %j with a field error on %s and writes nothing', async (input, field) => {
    const { service, tx, audit } = setup();

    const error = await service.updateName('user-1', input, CONTEXT).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'VALIDATION_ERROR',
      fieldErrors: [expect.objectContaining({ field })],
    });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(audit.logWrite).not.toHaveBeenCalled();
  });

  it('is a no-op when the name is unchanged', async () => {
    const { service, tx, audit, keycloak } = setup({
      ...STORED,
      firstName: 'Ama',
      lastName: 'Mensah',
      displayName: 'Ama Mensah',
    });

    await service.updateName('user-1', { firstName: 'Ama', lastName: 'Mensah' }, CONTEXT);

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(audit.logWrite).not.toHaveBeenCalled();
    expect(keycloak.updateIdentityNames).not.toHaveBeenCalled();
  });

  it('keeps the save when Keycloak fails, and records the failure for admins', async () => {
    const { service, audit, keycloak } = setup();
    keycloak.updateIdentityNames.mockResolvedValue({
      outcome: 'FAILED',
      sessionsEnded: false,
      retryable: true,
      failureReason: 'KEYCLOAK_ADMIN_TIMEOUT',
    });

    await expect(
      service.updateName('user-1', { firstName: 'Ama', lastName: 'Mensah' }, CONTEXT),
    ).resolves.toMatchObject({ displayName: 'Ama Mensah' });

    expect(audit.logWrite.mock.calls.map(([event]) => event.action)).toEqual([
      'USER.NAME.UPDATE',
      'USER.NAME.KEYCLOAK_SYNC',
    ]);
    expect(JSON.parse(audit.logWrite.mock.calls[1][0].afterJson)).toMatchObject({
      outcome: 'FAILED',
      failureReason: 'KEYCLOAK_ADMIN_TIMEOUT',
    });
  });

  it('404s an unknown user', async () => {
    const { service } = setup(null);

    await expect(
      service.updateName('nobody', { firstName: 'Ama', lastName: 'Mensah' }, CONTEXT),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('UserProfileService.updatePhone', () => {
  const CONTEXT = { actorUserId: 'user-1', source: 'SELF' as const, requestId: 'req-1' };

  function setup(phoneE164: string | null = null) {
    const tx = { user: { update: jest.fn().mockResolvedValue({}) } };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1', phoneE164 }) },
      $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const audit = { logWrite: jest.fn().mockResolvedValue(undefined) };
    const service = new UserProfileService(
      prisma as never,
      audit as never,
      createKeycloakAdminServiceMock() as never,
    );
    return { service, tx, audit };
  }

  it('stores a local Ghana number as E.164 and audits only its last four digits', async () => {
    const { service, tx, audit } = setup();

    await expect(service.updatePhone('user-1', '024 123 4567', CONTEXT)).resolves.toEqual({
      userId: 'user-1',
      phoneE164: '+233241234567',
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { phoneE164: '+233241234567' },
    });
    const event = audit.logWrite.mock.calls[0][0];
    expect(event.action).toBe('USER.PHONE.UPDATE');
    expect(event.afterJson).toContain('***4567');
    expect(event.afterJson).not.toContain('241234567');
  });

  it('clears the phone when blank', async () => {
    const { service, tx } = setup('+233241234567');

    await service.updatePhone('user-1', '  ', CONTEXT);

    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { phoneE164: null } }),
    );
  });

  it('refuses a number that is not a phone, as a field error', async () => {
    const { service, tx } = setup();

    await expect(service.updatePhone('user-1', '12', CONTEXT)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('writes nothing when the number is unchanged', async () => {
    const { service, tx, audit } = setup('+233241234567');

    await service.updatePhone('user-1', '+233241234567', CONTEXT);

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(audit.logWrite).not.toHaveBeenCalled();
  });
});
