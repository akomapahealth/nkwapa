import { DisabledUserException } from '../auth/disabled-user.exception';
import { UserService } from './user.service';

describe('UserService', () => {
  function activeUser(overrides?: Record<string, unknown>) {
    return {
      id: 'user-1',
      keycloakSub: 'test-sub',
      displayName: 'Test User',
      email: null,
      isActive: true,
      clinicRoles: [],
      ...overrides,
    };
  }

  it('throws DisabledUserException for an inactive existing user', async () => {
    const userRepository = {
      findByKeycloakSub: jest.fn().mockResolvedValue({
        id: 'user-1',
        keycloakSub: 'test-sub',
        displayName: 'Disabled User',
        email: 'disabled@example.com',
        isActive: false,
        clinicRoles: [],
      }),
      syncKeycloakProfile: jest.fn(),
      create: jest.fn(),
    };

    const service = new UserService(userRepository as never);

    await expect(
      service.findOrCreateByKeycloakSub('test-sub', 'Disabled User'),
    ).rejects.toBeInstanceOf(DisabledUserException);
    expect(userRepository.syncKeycloakProfile).not.toHaveBeenCalled();
    expect(userRepository.create).not.toHaveBeenCalled();
  });

  it('syncs verified Keycloak email when an existing active user logs in', async () => {
    const existing = activeUser();
    const updated = activeUser({ email: 'ama@example.com' });
    const userRepository = {
      findByKeycloakSub: jest.fn().mockResolvedValue(existing),
      syncKeycloakProfile: jest.fn().mockResolvedValue(updated),
      create: jest.fn(),
    };
    const service = new UserService(userRepository as never);

    const result = await service.findOrCreateByKeycloakSub('test-sub', 'Ama', 'ama@example.com');

    expect(userRepository.syncKeycloakProfile).toHaveBeenCalledWith('user-1', {
      firstName: undefined,
      lastName: undefined,
      email: 'ama@example.com',
      phoneE164: null,
    });
    expect(result.user).toBe(updated);
  });

  it('does not use unverified Keycloak email as the display fallback for new users', async () => {
    const userRepository = {
      findByKeycloakSub: jest.fn().mockResolvedValue(null),
      syncKeycloakProfile: jest.fn(),
      create: jest.fn().mockImplementation(async (data) => ({
        id: 'user-1',
        isActive: true,
        clinicRoles: [],
        ...data,
      })),
    };
    const service = new UserService(userRepository as never);

    await service.findOrCreateByKeycloakSub('test-sub', null, undefined);

    expect(userRepository.create).toHaveBeenCalledWith({
      keycloakSub: 'test-sub',
      displayName: 'test-sub',
      email: undefined,
      firstName: undefined,
      lastName: undefined,
      phoneE164: null,
    });
  });
});
