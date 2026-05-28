import { Socket } from 'socket.io';
import { UserRole } from '@prisma/client';
import { ChatGateway } from './chat.gateway';

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
    return new ChatGateway(chatService as never, prisma as never);
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
