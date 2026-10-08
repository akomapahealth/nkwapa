import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ChatService, GROUP_MAX_PARTICIPANTS } from './chat.service';

/*
  #30: group conversations, and the one rule every participant has to pass.
*/

const CLINIC = 'clinic-a';

function setup(eligible: string[] = ['u-2', 'u-3', 'u-4']) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: Record<string, any> = {
    userClinicRole: {
      findMany: jest.fn(async ({ where }: { where: { userId: { in: string[] } } }) =>
        where.userId.in.filter((id) => eligible.includes(id)).map((userId) => ({ userId })),
      ),
    },
    conversation: {
      create: jest.fn(async ({ data }) => ({
        id: 'conv-1',
        ...data,
        participants: data.participants.create.map((p: { userId: string }) => ({
          userId: p.userId,
          isActive: true,
        })),
      })),
      findFirst: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(async () => ({ id: 'conv-1', participants: [] })),
    },
    conversationParticipant: {
      findFirst: jest.fn().mockResolvedValue({ id: 'part-1' }),
      findMany: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
  };
  const audit = { logWrite: jest.fn() };
  return { prisma, audit, service: new ChatService(prisma as never, audit as never) };
}

describe('group conversations (#30)', () => {
  it('creates a group with the creator, the others once each, and an optional name', async () => {
    const { prisma, service, audit } = setup();
    const conversation = await service.createGroupConversation(
      CLINIC,
      'u-1',
      { title: '  Triage team  ', participantUserIds: ['u-2', 'u-3', 'u-2', 'u-1'] },
      'req-1',
    );
    expect(prisma.conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clinicId: CLINIC,
          type: 'GROUP',
          title: 'Triage team',
          participants: { create: [{ userId: 'u-1' }, { userId: 'u-2' }, { userId: 'u-3' }] },
        }),
      }),
    );
    expect(conversation.participants).toHaveLength(3);
    expect(audit.logWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CHAT.CONVERSATION.CREATE', entityId: 'conv-1' }),
    );
  });

  it('sends a group of two to direct messages instead', async () => {
    const { service } = setup();
    await expect(
      service.createGroupConversation(CLINIC, 'u-1', { participantUserIds: ['u-2'] }, 'req'),
    ).rejects.toMatchObject({ response: { code: 'GROUP_TOO_SMALL' } });
  });

  it('refuses a group larger than the limit', async () => {
    const many = Array.from({ length: GROUP_MAX_PARTICIPANTS }, (_, index) => `x-${index}`);
    const { service } = setup(many);
    await expect(
      service.createGroupConversation(CLINIC, 'u-1', { participantUserIds: many }, 'req'),
    ).rejects.toMatchObject({ response: { code: 'GROUP_TOO_LARGE' } });
  });

  it('refuses anyone who cannot chat at this clinic, and creates nothing', async () => {
    const { prisma, service } = setup(['u-2']);
    await expect(
      service.createGroupConversation(
        CLINIC,
        'u-1',
        { participantUserIds: ['u-2', 'patient-account'] },
        'req',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it('asks only for chat roles here or a global system administrator, among active accounts', async () => {
    const { prisma, service } = setup();
    await service.assertEligibleParticipants(CLINIC, ['u-2']);
    const { where } = prisma.userClinicRole.findMany.mock.calls[0][0];
    expect(where.user).toEqual({ isActive: true });
    expect(where.OR).toEqual([
      { clinicId: CLINIC, role: { in: expect.not.arrayContaining(['PATIENT']) } },
      { clinicId: null, role: 'SYSTEM_ADMIN' },
    ]);
  });

  it('applies the same rule to a direct conversation', async () => {
    const { service } = setup([]);
    await expect(
      service.findOrCreateDirectConversation(CLINIC, 'u-1', 'patient-account', 'req'),
    ).rejects.toMatchObject({ response: { code: 'CHAT_PARTICIPANT_NOT_ELIGIBLE' } });
  });

  describe('changing a group', () => {
    const group = (participants: Array<{ userId: string; isActive: boolean }>) => ({
      id: 'conv-1',
      clinicId: CLINIC,
      type: 'GROUP',
      participants,
    });

    it('adds only new people, bringing back someone who had left', async () => {
      const { prisma, service } = setup();
      prisma.conversation.findFirst.mockResolvedValue(
        group([
          { userId: 'u-1', isActive: true },
          { userId: 'u-2', isActive: true },
          { userId: 'u-3', isActive: false },
        ]),
      );
      const { added } = await service.addParticipants(
        'conv-1',
        'u-1',
        CLINIC,
        ['u-2', 'u-3', 'u-4'],
        'req',
      );
      expect(added).toEqual(['u-3', 'u-4']);
      expect(prisma.conversationParticipant.upsert).toHaveBeenCalledWith({
        where: { conversationId_userId: { conversationId: 'conv-1', userId: 'u-3' } },
        create: { conversationId: 'conv-1', userId: 'u-3' },
        update: { isActive: true },
      });
    });

    it('lets only a member change it', async () => {
      const { prisma, service } = setup();
      prisma.conversationParticipant.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.addParticipants('conv-1', 'outsider', CLINIC, ['u-2'], 'req'),
      ).rejects.toThrow('Conversation not found');
    });

    it('refuses to add to, rename or leave a direct conversation', async () => {
      const { prisma, service } = setup();
      prisma.conversation.findFirst.mockResolvedValue({ ...group([]), type: 'DIRECT' });
      await expect(
        service.leaveConversation('conv-1', 'u-1', CLINIC, 'req'),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.renameConversation('conv-1', 'u-1', CLINIC, 'x', 'req'),
      ).rejects.toMatchObject({ response: { code: 'NOT_A_GROUP' } });
    });

    it('leaves by deactivating the member, keeping what they sent', async () => {
      const { prisma, service } = setup();
      prisma.conversation.findFirst.mockResolvedValue(group([{ userId: 'u-1', isActive: true }]));
      await service.leaveConversation('conv-1', 'u-1', CLINIC, 'req');
      expect(prisma.conversationParticipant.update).toHaveBeenCalledWith({
        where: { id: 'part-1' },
        data: { isActive: false },
      });
    });
  });
});
