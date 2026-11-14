import { NotFoundException } from '@nestjs/common';
import { ChatService } from './chat.service';
import type { PrismaService } from '../prisma/prisma.service';
import { PERMISSIONS, rolesWithPermission } from '../auth/constants/permissions';

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

/**
 * The staff picker is a directory, and a directory that lists the wrong people is a disclosure.
 *
 * It used to return every `UserClinicRole` in the clinic with no role filter, under a doc comment
 * claiming it returned "staff members with chat permission". A portal account that had been given
 * a clinic role would have appeared in it, which is exactly the enumeration #31 is careful about.
 */
describe('ChatService.listClinicChatUsers', () => {
  function setup() {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { userClinicRole: { findMany } } as unknown as PrismaService;
    const service = new ChatService(prisma, { logWrite: jest.fn() } as never);
    return { service, findMany };
  }

  it('asks only for roles that hold CHAT.READ', async () => {
    const { service, findMany } = setup();
    await service.listClinicChatUsers('clinic-1', 'user-1');

    const where = findMany.mock.calls[0][0].where;
    expect(where.role.in).toEqual(expect.arrayContaining(['DOCTOR', 'VOLUNTEER', 'MANAGER']));
    expect(where.role.in).not.toContain('PATIENT');
  });

  /*
    Derived from ROLE_PERMISSIONS rather than hand-listed, so granting or revoking CHAT.READ moves
    the picker with it instead of leaving a stale list behind.
  */
  it('derives the list from the permission table', async () => {
    const { service, findMany } = setup();
    await service.listClinicChatUsers('clinic-1', 'user-1');

    expect(findMany.mock.calls[0][0].where.role.in.sort()).toEqual(
      rolesWithPermission(PERMISSIONS.CHAT_READ).sort(),
    );
  });

  it('still excludes the caller and inactive accounts', async () => {
    const { service, findMany } = setup();
    findMany.mockResolvedValue([
      { userId: 'user-1', role: 'DOCTOR', user: { id: 'user-1', displayName: 'Me' } },
      { userId: 'user-2', role: 'VOLUNTEER', user: { id: 'user-2', displayName: 'Them' } },
    ]);

    const result = await service.listClinicChatUsers('clinic-1', 'user-1');

    expect(findMany.mock.calls[0][0].where.user).toEqual({ isActive: true });
    expect(result.map((entry) => entry.id)).toEqual(['user-2']);
  });
});

describe('ChatService background push (#250)', () => {
  const savedKey = process.env.CHAT_ENCRYPTION_KEY;
  beforeAll(() => {
    process.env.CHAT_ENCRYPTION_KEY = '22'.repeat(32);
  });
  afterAll(() => {
    if (savedKey === undefined) delete process.env.CHAT_ENCRYPTION_KEY;
    else process.env.CHAT_ENCRYPTION_KEY = savedKey;
  });

  it('pushes who wrote to the other active members, never what they wrote', async () => {
    const tx = {
      message: {
        create: jest.fn().mockResolvedValue({
          id: 'm1',
          content: 'sealed',
          sender: { id: 'u1', displayName: 'Ama Owusu', firstName: null, lastName: null },
        }),
      },
      conversation: { update: jest.fn() },
    };
    const prisma = {
      conversationParticipant: {
        findFirst: jest.fn().mockResolvedValue({ id: 'p1' }),
        findMany: jest.fn().mockResolvedValue([{ userId: 'u2' }, { userId: 'u3' }]),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const push = { enabled: true, notify: jest.fn() };
    const service = new ChatService(
      prisma as never,
      { logWrite: jest.fn() } as never,
      push as never,
    );

    await service.sendMessage('c1', 'u1', 'clinic-a', 'BP 180/110 for Kofi Mensah', 'r1');

    expect(prisma.conversationParticipant.findMany).toHaveBeenCalledWith({
      where: { conversationId: 'c1', isActive: true, userId: { not: 'u1' } },
      select: { userId: true },
    });
    expect(push.notify).toHaveBeenCalledWith(['u2', 'u3'], {
      title: 'New message from Ama Owusu',
      body: 'Open Nkwapa to read it.',
      url: '/dashboard?chat=c1',
      tag: 'chat-c1',
      kind: 'MESSAGE',
      inbox: { body: 'Open the chat to read it.' },
    });
    expect(JSON.stringify(push.notify.mock.calls)).not.toContain('Kofi');
  });
});
