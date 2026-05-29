import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ConversationType } from '@prisma/client';

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

    // Check participant has access to this clinic
    const participantRole = await this.prisma.userClinicRole.findFirst({
      where: {
        userId: participantUserId,
        OR: [{ clinicId }, { clinicId: null }], // null = SYSTEM_ADMIN
      },
    });

    if (!participantRole) {
      throw new ForbiddenException('Participant does not belong to this clinic');
    }

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
  async listClinicChatUsers(clinicId: string, currentUserId: string) {
    const roles = await this.prisma.userClinicRole.findMany({
      where: {
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
