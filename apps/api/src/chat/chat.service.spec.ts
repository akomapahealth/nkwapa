import { NotFoundException } from '@nestjs/common';
import { ChatService } from './chat.service';

describe('ChatService security', () => {
  const prisma = {
    conversationParticipant: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
    },
  };
  const auditService = { logWrite: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createService() {
    return new ChatService(prisma as never, auditService as never);
  }

  it('requires an active participant in the same clinic before listing messages', async () => {
    prisma.conversationParticipant.findFirst.mockResolvedValue(null);
    const service = createService();

    await expect(
      service.listMessages('conversation-1', 'user-1', 'clinic-a'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.conversationParticipant.findFirst).toHaveBeenCalledWith({
      where: {
        conversationId: 'conversation-1',
        userId: 'user-1',
        isActive: true,
        conversation: { clinicId: 'clinic-a' },
      },
      select: { id: true },
    });
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });

  it('requires an active participant in the same clinic before marking messages read', async () => {
    prisma.conversationParticipant.findFirst.mockResolvedValue(null);
    const service = createService();

    await expect(
      service.markConversationRead('conversation-1', 'user-1', 'clinic-a'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.conversationParticipant.update).not.toHaveBeenCalled();
  });

  it('updates the participant row only after same-clinic membership is verified', async () => {
    prisma.conversationParticipant.findFirst.mockResolvedValue({ id: 'participant-1' });
    prisma.conversationParticipant.update.mockResolvedValue({ id: 'participant-1' });
    const service = createService();

    await expect(
      service.markConversationRead('conversation-1', 'user-1', 'clinic-a'),
    ).resolves.toEqual({ success: true });

    expect(prisma.conversationParticipant.update).toHaveBeenCalledWith({
      where: { id: 'participant-1' },
      data: { lastReadAt: expect.any(Date) },
    });
  });
});
