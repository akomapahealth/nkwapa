import { Socket } from 'socket.io';
import { UserRole } from '@prisma/client';
import { createWsAuthMiddleware } from './chat-ws-auth.middleware';

describe('chat WebSocket auth middleware', () => {
  const clinicId = '11111111-1111-4111-8111-111111111111';
  const otherClinicId = '22222222-2222-4222-8222-222222222222';
  const verifyToken = jest.fn();
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createSocket(queryClinicId: unknown = clinicId) {
    return {
      handshake: {
        auth: { token: 'jwt-token' },
        query: { clinicId: queryClinicId },
      },
      data: {},
    } as unknown as Socket;
  }

  it('rejects non-scalar clinic ids before token verification', async () => {
    const middleware = createWsAuthMiddleware(prisma as never, verifyToken);
    const next = jest.fn();

    await middleware(createSocket([clinicId]), next);

    expect(verifyToken).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Authentication failed' }),
    );
  });

  it('rejects malformed clinic ids before token verification', async () => {
    const middleware = createWsAuthMiddleware(prisma as never, verifyToken);
    const next = jest.fn();

    await middleware(createSocket('not-a-uuid'), next);

    expect(verifyToken).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Authentication failed' }),
    );
  });

  it('rejects users without access to the requested clinic with a generic error', async () => {
    verifyToken.mockResolvedValue({ sub: 'keycloak-sub' });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      displayName: 'User One',
      isActive: true,
      clinicRoles: [{ clinicId: otherClinicId, role: UserRole.DOCTOR }],
    });
    const middleware = createWsAuthMiddleware(prisma as never, verifyToken);
    const next = jest.fn();
    const socket = createSocket();

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Authentication failed' }),
    );
    expect(socket.data.auth).toBeUndefined();
  });

  it('attaches auth data for users with same-clinic access', async () => {
    verifyToken.mockResolvedValue({ sub: 'keycloak-sub' });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      displayName: 'User One',
      isActive: true,
      clinicRoles: [{ clinicId, role: UserRole.DOCTOR }],
    });
    const middleware = createWsAuthMiddleware(prisma as never, verifyToken);
    const next = jest.fn();
    const socket = createSocket();

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.auth).toEqual({
      userId: 'user-1',
      clinicId,
      displayName: 'User One',
      roles: [{ clinicId, role: UserRole.DOCTOR }],
    });
  });
});
