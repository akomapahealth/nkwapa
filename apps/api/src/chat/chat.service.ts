import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ConversationType, Prisma, UserRole } from '@prisma/client';
import { PERMISSIONS, rolesWithPermission } from '../auth/constants/permissions';

/** A group is three people or more; the creator plus at least two. */
export const GROUP_MIN_OTHERS = 2;
/** Large enough for a whole clinic team, small enough that a typo cannot message a directory. */
export const GROUP_MAX_PARTICIPANTS = 50;

const PARTICIPANT_INCLUDE = {
  participants: {
    include: {
      user: { select: { id: true, displayName: true, firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.ConversationInclude;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Find or create a direct conversation between two users in a clinic.
   * Returns the existing conversation if one already exists.
   */
  async findOrCreateDirectConversation(
    clinicId: string,
    currentUserId: string,
    participantUserId: string,
    requestId: string,
  ) {
    if (currentUserId === participantUserId) {
      throw new BadRequestException('Cannot create a conversation with yourself');
    }

    await this.assertEligibleParticipants(clinicId, [participantUserId]);

    // Check if a direct conversation already exists between these two users in this clinic
    const existing = await this.prisma.conversation.findFirst({
      where: {
        clinicId,
        type: ConversationType.DIRECT,
        AND: [
          { participants: { some: { userId: currentUserId, isActive: true } } },
          { participants: { some: { userId: participantUserId, isActive: true } } },
        ],
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, displayName: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (existing) {
      return existing;
    }

    // Create new conversation
    const conversation = await this.prisma.conversation.create({
      data: {
        clinicId,
        type: ConversationType.DIRECT,
        participants: {
          create: [{ userId: currentUserId }, { userId: participantUserId }],
        },
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, displayName: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId: currentUserId,
      action: 'CHAT.CONVERSATION.CREATE',
      entityType: 'Conversation',
      entityId: conversation.id,
      requestId,
    });

    return conversation;
  }

  /**
   * Start a group conversation (#30): the creator and at least two other people who can chat at
   * this clinic. The name is optional; without one the conversation reads as its members.
   */
  async createGroupConversation(
    clinicId: string,
    creatorUserId: string,
    params: { title?: string | null; participantUserIds: string[] },
    requestId: string,
  ) {
    const others = [...new Set(params.participantUserIds)].filter((id) => id !== creatorUserId);
    if (others.length < GROUP_MIN_OTHERS) {
      throw new BadRequestException({
        code: 'GROUP_TOO_SMALL',
        message: 'A group needs at least two other people. Send a direct message instead.',
      });
    }
    if (others.length + 1 > GROUP_MAX_PARTICIPANTS) {
      throw new BadRequestException({
        code: 'GROUP_TOO_LARGE',
        message: `A group can have at most ${GROUP_MAX_PARTICIPANTS} people.`,
      });
    }
    await this.assertEligibleParticipants(clinicId, others);

    const conversation = await this.prisma.conversation.create({
      data: {
        clinicId,
        type: ConversationType.GROUP,
        title: params.title?.trim() || null,
        participants: {
          create: [{ userId: creatorUserId }, ...others.map((userId) => ({ userId }))],
        },
      },
      include: PARTICIPANT_INCLUDE,
    });
    await this.auditService.logWrite({
      clinicId,
      actorUserId: creatorUserId,
      action: 'CHAT.CONVERSATION.CREATE',
      entityType: 'Conversation',
      entityId: conversation.id,
      afterJson: JSON.stringify({ type: 'GROUP', participantCount: others.length + 1 }),
      requestId,
    });
    return conversation;
  }

  /**
   * Add people to a group. Any member may; someone who left is brought back with their history.
   * Returns the conversation and the user ids that are new to it.
   */
  async addParticipants(
    conversationId: string,
    actorUserId: string,
    clinicId: string,
    userIds: string[],
    requestId: string,
  ) {
    await this.assertActiveParticipant(conversationId, actorUserId, clinicId);
    const conversation = await this.requireGroup(conversationId, clinicId);
    const requested = [...new Set(userIds)].filter((id) => id !== actorUserId);
    const alreadyActive = new Set(
      conversation.participants.filter((p) => p.isActive).map((p) => p.userId),
    );
    const adding = requested.filter((id) => !alreadyActive.has(id));
    if (adding.length === 0)
      return { conversation: await this.loadConversation(conversationId), added: [] };
    if (alreadyActive.size + adding.length > GROUP_MAX_PARTICIPANTS) {
      throw new BadRequestException({
        code: 'GROUP_TOO_LARGE',
        message: `A group can have at most ${GROUP_MAX_PARTICIPANTS} people.`,
      });
    }
    await this.assertEligibleParticipants(clinicId, adding);

    await this.prisma.$transaction(async (tx) => {
      for (const userId of adding) {
        await tx.conversationParticipant.upsert({
          where: { conversationId_userId: { conversationId, userId } },
          create: { conversationId, userId },
          update: { isActive: true },
        });
      }
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
    });
    await this.auditService.logWrite({
      clinicId,
      actorUserId,
      action: 'CHAT.CONVERSATION.PARTICIPANT_ADD',
      entityType: 'Conversation',
      entityId: conversationId,
      afterJson: JSON.stringify({ added: adding.length }),
      requestId,
    });
    return { conversation: await this.loadConversation(conversationId), added: adding };
  }

  /** Rename a group. Any member may. An empty name goes back to listing the members. */
  async renameConversation(
    conversationId: string,
    actorUserId: string,
    clinicId: string,
    title: string | null,
    requestId: string,
  ) {
    await this.assertActiveParticipant(conversationId, actorUserId, clinicId);
    await this.requireGroup(conversationId, clinicId);
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { title: title?.trim() || null },
    });
    await this.auditService.logWrite({
      clinicId,
      actorUserId,
      action: 'CHAT.CONVERSATION.RENAME',
      entityType: 'Conversation',
      entityId: conversationId,
      requestId,
    });
    return this.loadConversation(conversationId);
  }

  /**
   * Leave a group. Messages already sent stay; the person stops receiving new ones and can be
   * added back. A direct conversation cannot be left, only ignored.
   */
  async leaveConversation(
    conversationId: string,
    userId: string,
    clinicId: string,
    requestId: string,
  ) {
    const participant = await this.assertActiveParticipant(conversationId, userId, clinicId);
    await this.requireGroup(conversationId, clinicId);
    await this.prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { isActive: false },
    });
    await this.auditService.logWrite({
      clinicId,
      actorUserId: userId,
      action: 'CHAT.CONVERSATION.LEAVE',
      entityType: 'Conversation',
      entityId: conversationId,
      requestId,
    });
    return this.loadConversation(conversationId);
  }

  /** The active members of a conversation, for routing notifications. */
  async activeParticipantIds(conversationId: string): Promise<string[]> {
    const rows = await this.prisma.conversationParticipant.findMany({
      where: { conversationId, isActive: true },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  /**
   * Everyone must be able to chat here: an active account holding a chat role at this clinic, or
   * a system administrator (whose seat is global and who can already read every clinic). The same
   * rule as the staff picker, so nobody can be added who could not have been picked -- in
   * particular not a portal patient who also holds some role at the clinic.
   */
  async assertEligibleParticipants(clinicId: string, userIds: string[]): Promise<void> {
    const chatRoles = rolesWithPermission(PERMISSIONS.CHAT_READ);
    const eligible = await this.prisma.userClinicRole.findMany({
      where: {
        userId: { in: userIds },
        user: { isActive: true },
        OR: [
          { clinicId, role: { in: chatRoles } },
          { clinicId: null, role: UserRole.SYSTEM_ADMIN },
        ],
      },
      select: { userId: true },
    });
    const allowed = new Set(eligible.map((row) => row.userId));
    const refused = userIds.filter((id) => !allowed.has(id));
    if (refused.length) {
      throw new ForbiddenException({
        code: 'CHAT_PARTICIPANT_NOT_ELIGIBLE',
        message:
          refused.length === 1
            ? 'That person cannot be messaged at this clinic.'
            : `${refused.length} of those people cannot be messaged at this clinic.`,
      });
    }
  }

  private async requireGroup(conversationId: string, clinicId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, clinicId },
      include: { participants: { select: { userId: true, isActive: true } } },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.type !== ConversationType.GROUP) {
      throw new BadRequestException({
        code: 'NOT_A_GROUP',
        message: 'Only a group conversation can be changed this way.',
      });
    }
    return conversation;
  }

  private loadConversation(conversationId: string) {
    return this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: PARTICIPANT_INCLUDE,
    });
  }

  /**
   * List conversations for a user in a clinic, ordered by most recent activity.
   * Includes unread count per conversation.
   */
  async listConversations(clinicId: string, userId: string, limit: number) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        clinicId,
        participants: { some: { userId, isActive: true } },
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, displayName: true, firstName: true, lastName: true } },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            content: true,
            senderUserId: true,
            createdAt: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    // Compute unread counts
    const result = await Promise.all(
      conversations.map(async (conv) => {
        const participant = conv.participants.find((p) => p.userId === userId);
        const lastReadAt = participant?.lastReadAt;

        const unreadCount = lastReadAt
          ? await this.prisma.message.count({
              where: {
                conversationId: conv.id,
                createdAt: { gt: lastReadAt },
                senderUserId: { not: userId },
              },
            })
          : await this.prisma.message.count({
              where: {
                conversationId: conv.id,
                senderUserId: { not: userId },
              },
            });

        return {
          ...conv,
          lastMessage: conv.messages[0] ?? null,
          messages: undefined,
          unreadCount,
        };
      }),
    );

    return result;
  }

  /**
   * List messages in a conversation with cursor-based pagination.
   */
  async listMessages(
    conversationId: string,
    userId: string,
    clinicId: string,
    cursor?: string,
    limit = 50,
  ) {
    await this.assertActiveParticipant(conversationId, userId, clinicId);

    const messages = await this.prisma.message.findMany({
      where: { conversationId, clinicId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
      include: {
        sender: { select: { id: true, displayName: true, firstName: true, lastName: true } },
      },
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  /**
   * Send a message to a conversation.
   */
  async sendMessage(
    conversationId: string,
    senderUserId: string,
    clinicId: string,
    content: string,
    _requestId: string,
  ) {
    await this.assertActiveParticipant(conversationId, senderUserId, clinicId);

    // Create message and update conversation timestamp atomically
    const message = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          conversationId,
          senderUserId,
          clinicId,
          content,
        },
        include: {
          sender: { select: { id: true, displayName: true, firstName: true, lastName: true } },
        },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
      return msg;
    });

    return message;
  }

  /**
   * Mark a conversation as read up to now for a user.
   */
  async markConversationRead(conversationId: string, userId: string, clinicId: string) {
    const participant = await this.assertActiveParticipant(conversationId, userId, clinicId);

    await this.prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt: new Date() },
    });

    return { success: true };
  }

  /**
   * List users available for chat in a clinic (staff members with chat permission).
   */
  /**
   * The people in this clinic who can be messaged.
   *
   * Filtered to roles that actually hold `CHAT.READ`, derived from the permission table. It used
   * to return every `UserClinicRole` in the clinic with no role filter at all, under a doc comment
   * claiming it returned "staff members with chat permission" -- so anyone who was ever given a
   * role here appeared in the staff picker, including a portal account, which is the directory
   * enumeration issue #31 is careful about.
   */
  async listClinicChatUsers(clinicId: string, currentUserId: string) {
    const roles = await this.prisma.userClinicRole.findMany({
      where: {
        role: { in: rolesWithPermission(PERMISSIONS.CHAT_READ) },
        OR: [
          { clinicId },
          { clinicId: null }, // SYSTEM_ADMIN has access everywhere
        ],
        user: { isActive: true },
      },
      include: {
        user: {
          select: { id: true, displayName: true, firstName: true, lastName: true, email: true },
        },
      },
      distinct: ['userId'],
    });

    // Filter out the current user and deduplicate
    const seen = new Set<string>();
    return roles
      .filter((r) => {
        if (r.userId === currentUserId || seen.has(r.userId)) return false;
        seen.add(r.userId);
        return true;
      })
      .map((r) => ({
        ...r.user,
        role: r.role,
      }));
  }

  async assertActiveParticipant(conversationId: string, userId: string, clinicId: string) {
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: {
        conversationId,
        userId,
        isActive: true,
        conversation: { clinicId },
      },
      select: { id: true },
    });

    if (!participant) {
      throw new NotFoundException('Conversation not found');
    }

    return participant;
  }
}
