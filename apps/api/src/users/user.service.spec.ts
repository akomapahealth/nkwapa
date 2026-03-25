import { DisabledUserException } from '../auth/disabled-user.exception';
import { UserService } from './user.service';

describe('UserService', () => {
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
      service.findOrCreateByKeycloakSub('test-sub', 'Disabled User')
    ).rejects.toBeInstanceOf(DisabledUserException);
    expect(userRepository.syncKeycloakProfile).not.toHaveBeenCalled();
    expect(userRepository.create).not.toHaveBeenCalled();
  });
});
