import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from './chat.service';
import { createWsAuthMiddleware, WsAuthData } from './chat-ws-auth.middleware';
import { getAllowedCorsOrigins } from '../common/api-config';
import { randomUUID } from 'crypto';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: getAllowedCorsOrigins(),
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Namespace;

  private pubClient!: Redis;
  private subClient!: Redis;

  constructor(
    private readonly chatService: ChatService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Namespace) {
    // Set up Redis adapter for multi-instance WebSocket support.
    // Because this gateway uses a namespace, `server` is a Namespace; the
    // adapter must be installed on the parent Server (affects all namespaces).
    this.pubClient = new Redis(REDIS_URL);
    this.subClient = this.pubClient.duplicate();

    server.server.adapter(
      createAdapter(this.pubClient, this.subClient) as ReturnType<typeof createAdapter>,
    );

    // Register auth middleware on this namespace
    server.use(createWsAuthMiddleware(this.prisma));
  }

  async handleConnection(client: Socket) {
    const auth: WsAuthData = client.data.auth;
    if (!auth) {
      client.disconnect();
      return;
    }

    const { userId, clinicId } = auth;

    // Join rooms for message routing
    await client.join(`clinic:${clinicId}`);
    await client.join(`user:${userId}`);

    // Track online presence in Redis
    await this.pubClient.sadd(`chat:clinic:${clinicId}:online`, userId);

    // Broadcast presence to clinic
    client.to(`clinic:${clinicId}`).emit('presence:online', {
      userId,
      displayName: auth.displayName,
    });
  }

  async handleDisconnect(client: Socket) {
    const auth: WsAuthData | undefined = client.data?.auth;
    if (!auth) return;

    const { userId, clinicId } = auth;

    // Check if user has other active connections before removing presence
    const clinicRoom = `clinic:${clinicId}`;
    const sockets = await this.server.in(`user:${userId}`).fetchSockets();

    // Only remove presence if this is the last connection for this user
    if (sockets.length <= 1) {
      await this.pubClient.srem(`chat:clinic:${clinicId}:online`, userId);
      this.server.to(clinicRoom).emit('presence:offline', { userId });
    }
  }

  @SubscribeMessage('message:send')
  async handleSendMessage(client: Socket, payload: { conversationId: string; content: string }) {
    const auth: WsAuthData = client.data.auth;
    if (!auth) return;

    try {
      const message = await this.chatService.sendMessage(
        payload.conversationId,
        auth.userId,
        auth.clinicId,
        payload.content,
        randomUUID(),
      );

      // Broadcast to all participants in the conversation room
      this.server.to(`conversation:${payload.conversationId}`).emit('message:new', message);

      // Also send to sender to confirm
      client.emit('message:new', message);

      // Notify other participants who may not have the conversation room open
      const participants = await this.prisma.conversationParticipant.findMany({
        where: {
          conversationId: payload.conversationId,
          isActive: true,
          userId: { not: auth.userId },
        },
        select: { userId: true },
      });

      for (const p of participants) {
        this.server.to(`user:${p.userId}`).emit('unread:update', {
          conversationId: payload.conversationId,
          lastMessage: {
            content: message.content,
            senderUserId: message.senderUserId,
            createdAt: message.createdAt,
          },
        });
      }
    } catch (error) {
      client.emit('message:error', {
        conversationId: payload.conversationId,
        error: error instanceof Error ? error.message : 'Failed to send message',
      });
    }
  }

  @SubscribeMessage('message:read')
  async handleMarkRead(client: Socket, payload: { conversationId: string }) {
    const auth: WsAuthData = client.data.auth;
    if (!auth) return;

    try {
      await this.chatService.markConversationRead(payload.conversationId, auth.userId);

      // Notify other participants that messages have been read
      this.server.to(`conversation:${payload.conversationId}`).emit('read:update', {
        conversationId: payload.conversationId,
        userId: auth.userId,
        readAt: new Date().toISOString(),
      });
    } catch {
      // Silently ignore read receipt errors
    }
  }

  @SubscribeMessage('typing:start')
  async handleTypingStart(client: Socket, payload: { conversationId: string }) {
    const auth: WsAuthData = client.data.auth;
    if (!auth) return;

    client.to(`conversation:${payload.conversationId}`).emit('typing:start', {
      conversationId: payload.conversationId,
      userId: auth.userId,
      displayName: auth.displayName,
    });
  }

  @SubscribeMessage('typing:stop')
  async handleTypingStop(client: Socket, payload: { conversationId: string }) {
    const auth: WsAuthData = client.data.auth;
    if (!auth) return;

    client.to(`conversation:${payload.conversationId}`).emit('typing:stop', {
      conversationId: payload.conversationId,
      userId: auth.userId,
    });
  }

  @SubscribeMessage('conversation:join')
  async handleJoinConversation(client: Socket, payload: { conversationId: string }) {
    const auth: WsAuthData = client.data.auth;
    if (!auth) return;

    // Verify participant
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: payload.conversationId,
          userId: auth.userId,
        },
      },
    });

    if (participant?.isActive) {
      await client.join(`conversation:${payload.conversationId}`);
    }
  }

  @SubscribeMessage('conversation:leave')
  async handleLeaveConversation(client: Socket, payload: { conversationId: string }) {
    await client.leave(`conversation:${payload.conversationId}`);
  }

  /**
   * Get online users in a clinic (REST fallback is in the controller).
   */
  @SubscribeMessage('presence:list')
  async handlePresenceList(client: Socket) {
    const auth: WsAuthData = client.data.auth;
    if (!auth) return;

    const onlineUserIds = await this.pubClient.smembers(`chat:clinic:${auth.clinicId}:online`);

    client.emit('presence:list', { onlineUserIds });
  }
}
