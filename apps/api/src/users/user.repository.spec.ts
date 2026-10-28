import { UserRepository } from './user.repository';

describe('UserRepository.syncKeycloakProfile', () => {
  function repositoryWith(stored: Record<string, unknown>) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          phoneE164: null,
          middleInitial: null,
          displayName: 'Someone',
          email: 'ama@clinic.org',
          keycloakSub: 'kc-1',
          ...stored,
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'user-1' }),
        update: jest.fn().mockResolvedValue({ id: 'user-1' }),
      },
    };
    return { prisma, repository: new UserRepository(prisma as never) };
  }

  it('never overwrites a name Nkwapa holds with different Keycloak names', async () => {
    const { prisma, repository } = repositoryWith({ firstName: 'Ama', lastName: 'Mensah' });

    await repository.syncKeycloakProfile('user-1', { firstName: 'Amma', lastName: 'Owusu' });

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('fills missing names and rebuilds the display name, keeping the middle initial', async () => {
    const { prisma, repository } = repositoryWith({
      firstName: null,
      lastName: null,
      middleInitial: 'K',
    });

    await repository.syncKeycloakProfile('user-1', { firstName: 'Ama', lastName: 'Mensah' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { firstName: 'Ama', lastName: 'Mensah', displayName: 'Ama K. Mensah' },
    });
  });

  it('leaves the display name alone while the name is still half missing', async () => {
    const { prisma, repository } = repositoryWith({ firstName: null, lastName: null });

    await repository.syncKeycloakProfile('user-1', { firstName: 'Ama' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { firstName: 'Ama' },
    });
  });

  it('heals a display name stuck on the email beside a complete name', async () => {
    const { prisma, repository } = repositoryWith({
      firstName: 'Ama',
      lastName: 'Mensah',
      displayName: 'ama@clinic.org',
    });

    await repository.syncKeycloakProfile('user-1', {});

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { displayName: 'Ama Mensah' },
    });
  });
});
