import { Socket } from 'socket.io';
import { UserRole } from '@prisma/client';
import { ChatGateway } from './chat.gateway';

function redisUp() {
  return { isReady: () => true, client: {} };
}

describe('ChatGateway security', () => {
  const chatService = {
    assertActiveParticipant: jest.fn(),
    sendMessage: jest.fn(),
    markConversationRead: jest.fn(),
  };
  const prisma = {
    conversationParticipant: {
      findMany: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createGateway() {
    return new ChatGateway(chatService as never, prisma as never, redisUp() as never);
  }

  function createSocket() {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    const join = jest.fn();
    const socket = {
      data: {
        auth: {
          userId: 'user-1',
          clinicId: 'clinic-a',
          displayName: 'User One',
          roles: [{ clinicId: 'clinic-a', role: UserRole.DOCTOR }],
        },
      },
      emit,
      to,
      join,
    };
    return socket as unknown as Socket & {
      emit: jest.Mock;
      to: jest.Mock;
      join: jest.Mock;
    };
  }

  it('does not broadcast typing events for conversations outside the authenticated clinic', async () => {
    chatService.assertActiveParticipant.mockRejectedValue(new Error('not found'));
    const gateway = createGateway();
    const socket = createSocket();

    await gateway.handleTypingStart(socket, { conversationId: 'conversation-1' });

    expect(chatService.assertActiveParticipant).toHaveBeenCalledWith(
      'conversation-1',
      'user-1',
      'clinic-a',
    );
    expect(socket.to).not.toHaveBeenCalled();
  });

  it('does not join conversation rooms until same-clinic participation is verified', async () => {
    chatService.assertActiveParticipant.mockRejectedValue(new Error('not found'));
    const gateway = createGateway();
    const socket = createSocket();

    await gateway.handleJoinConversation(socket, { conversationId: 'conversation-1' });

    expect(socket.join).not.toHaveBeenCalled();
  });

  it('joins a conversation room after same-clinic participation is verified', async () => {
    chatService.assertActiveParticipant.mockResolvedValue({ id: 'participant-1' });
    const gateway = createGateway();
    const socket = createSocket();

    await gateway.handleJoinConversation(socket, { conversationId: 'conversation-1' });

    expect(socket.join).toHaveBeenCalledWith('conversation:conversation-1');
  });
});

describe('ChatGateway presence (#30)', () => {
  function gatewayWithRedis(now: number, ready = true) {
    const redis = {
      zadd: jest.fn(),
      zrem: jest.fn(),
      hset: jest.fn(),
      zremrangebyscore: jest.fn(),
      zrangebyscore: jest.fn().mockResolvedValue(['u-online']),
      hgetall: jest.fn().mockResolvedValue({ 'u-gone': '2026-10-08T09:00:00.000Z' }),
    };
    const gateway = new ChatGateway(
      {} as never,
      {} as never,
      {
        isReady: () => ready,
        client: redis,
      } as never,
    );
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const socket = {
      data: { auth: { userId: 'u-1', clinicId: 'clinic-a', displayName: 'One' } },
      emit: jest.fn(),
    };
    return { gateway, redis, socket };
  }

  afterEach(() => jest.restoreAllMocks());

  it('keeps someone online by heartbeat, not by a set entry a crash would strand', async () => {
    const { gateway, redis, socket } = gatewayWithRedis(1_000_000);
    await gateway.handlePresenceHeartbeat(socket as never);
    expect(redis.zadd).toHaveBeenCalledWith('chat:clinic:clinic-a:presence', 1_000_000, 'u-1');
  });

  it('lists only check-ins newer than the TTL, after clearing the stale ones, with last-seen times', async () => {
    const { gateway, redis, socket } = gatewayWithRedis(1_000_000);
    await gateway.handlePresenceList(socket as never);
    expect(redis.zremrangebyscore).toHaveBeenCalledWith(
      'chat:clinic:clinic-a:presence',
      '-inf',
      1_000_000 - 60_000,
    );
    expect(redis.zrangebyscore).toHaveBeenCalledWith(
      'chat:clinic:clinic-a:presence',
      1_000_000 - 60_000,
      '+inf',
    );
    expect(socket.emit).toHaveBeenCalledWith('presence:list', {
      onlineUserIds: ['u-online'],
      lastSeen: { 'u-gone': '2026-10-08T09:00:00.000Z' },
    });
  });
});

describe('ChatGateway presence without Redis (#199)', () => {
  afterEach(() => jest.restoreAllMocks());

  function setup(ready: boolean, failing = false) {
    const redis = {
      zadd: jest.fn(failing ? () => Promise.reject(new Error('Command timed out')) : undefined),
      zremrangebyscore: jest.fn(),
      zrangebyscore: jest.fn(),
      hgetall: jest.fn(),
    };
    const gateway = new ChatGateway(
      {} as never,
      {} as never,
      {
        isReady: () => ready,
        client: redis,
      } as never,
    );
    const emit = jest.fn();
    const socket = {
      data: { auth: { userId: 'u-1', clinicId: 'clinic-a', displayName: 'One' } },
      emit,
      join: jest.fn(),
      to: jest.fn().mockReturnValue({ emit }),
    };
    return { gateway, redis, socket };
  }

  it('still connects someone, and tells the clinic, while Redis is down', async () => {
    const { gateway, redis, socket } = setup(false);
    await expect(gateway.handleConnection(socket as never)).resolves.toBeUndefined();
    expect(redis.zadd).not.toHaveBeenCalled();
    expect(socket.join).toHaveBeenCalledWith('user:u-1');
    expect(socket.to).toHaveBeenCalledWith('clinic:clinic-a');
  });

  it('swallows a failed presence write instead of failing the heartbeat', async () => {
    const { gateway, socket } = setup(true, true);
    await expect(gateway.handlePresenceHeartbeat(socket as never)).resolves.toBeUndefined();
  });

  it('sends no presence list rather than an empty one that would show everyone offline', async () => {
    const { gateway, redis, socket } = setup(false);
    await gateway.handlePresenceList(socket as never);
    expect(redis.zrangebyscore).not.toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalled();
  });
});

describe('ChatGateway typing (#30)', () => {
  it("tells every other member who is typing, so their list shows it, and not the typist's own tabs", async () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    const chatService = {
      assertActiveParticipant: jest.fn().mockResolvedValue({ id: 'p1' }),
      activeParticipantIds: jest.fn().mockResolvedValue(['user-1', 'user-2', 'user-3']),
    };
    const gateway = new ChatGateway(chatService as never, {} as never, redisUp() as never);
    (gateway as unknown as { server: unknown }).server = { to };
    const socket = {
      data: { auth: { userId: 'user-1', clinicId: 'clinic-a', displayName: 'User One' } },
    };

    await gateway.handleTypingStart(socket as never, { conversationId: 'conv-1' });

    expect(to.mock.calls.map(([room]) => room)).toEqual(['user:user-2', 'user:user-3']);
    expect(emit).toHaveBeenCalledWith('typing:start', {
      conversationId: 'conv-1',
      userId: 'user-1',
      displayName: 'User One',
    });
  });
});
