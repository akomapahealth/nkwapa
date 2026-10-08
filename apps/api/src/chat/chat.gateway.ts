import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { UseInterceptors } from '@nestjs/common';
import { Namespace, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaRlsInterceptor } from '../prisma/prisma-rls.interceptor';
import { ChatService } from './chat.service';
import { createWsAuthMiddleware, WsAuthData } from './chat-ws-auth.middleware';
import { getAllowedCorsOrigins } from '../common/api-config';
import { randomUUID } from 'crypto';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/*
  Presence (#30).

  Online used to be a Redis set entry added on connect and removed on the last disconnect, so an
  API that crashed or was redeployed without a clean disconnect left everyone it was serving
  "online" for good. It is now a heartbeat: each tab checks in every PRESENCE_HEARTBEAT_MS, and
  someone is online while their last check-in is newer than PRESENCE_TTL_MS. Nothing has to clean
  up after a crash; a stale entry simply ages out. When someone goes offline cleanly, the time is
  kept as when they were last seen.
*/
export const PRESENCE_HEARTBEAT_MS = 25_000;
export const PRESENCE_TTL_MS = 60_000;
const presenceKey = (clinicId: string) => `chat:clinic:${clinicId}:presence`;
const lastSeenKey = (clinicId: string) => `chat:clinic:${clinicId}:last-seen`;

/*
  Bound explicitly, because a global one is not enough.

  `PrismaRlsInterceptor` is registered as an `APP_INTERCEPTOR`, which covers HTTP but is not applied
  to gateway handlers. Without this line every socket event ran outside a tenant context, and the
  chat tables are FORCE row-level-security protected -- so `assertActiveParticipant` found nothing,
  every send failed with "Conversation not found", and the gateway's own catch turned that into a
  generic "Unable to send message". Sending is socket-only, so the feature stopped working while
  the REST conversation list and history kept loading.
*/
@UseInterceptors(PrismaRlsInterceptor)
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

    await this.pubClient.zadd(presenceKey(clinicId), Date.now(), userId);

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
      const lastSeenAt = new Date().toISOString();
      await this.pubClient.zrem(presenceKey(clinicId), userId);
      await this.pubClient.hset(lastSeenKey(clinicId), userId, lastSeenAt);
      this.server.to(clinicRoom).emit('presence:offline', { userId, lastSeenAt });
    }
  }

  @SubscribeMessage('message:send')
  async handleSendMessage(client: Socket, payload: { conversationId: string; content: string }) {
    const auth: WsAuthData = client.data.auth;
    if (!auth) return;

    const conversationId = this.readConversationId(payload);
    const content = typeof payload?.content === 'string' ? payload.content : '';
    if (!conversationId || content.trim().length === 0) {
      client.emit('message:error', { error: 'Unable to send message' });
      return;
    }

    try {
      const message = await this.chatService.sendMessage(
        conversationId,
        auth.userId,
        auth.clinicId,
        content,
        randomUUID(),
      );

      // Broadcast to all participants in the conversation room
      this.server.to(`conversation:${conversationId}`).emit('message:new', message);

      // Also send to sender to confirm
      client.emit('message:new', message);

      // Notify other participants who may not have the conversation room open
      const participants = await this.prisma.conversationParticipant.findMany({
        where: {
          conversationId,
          isActive: true,
          userId: { not: auth.userId },
          conversation: { clinicId: auth.clinicId },
        },
        select: { userId: true },
      });

      for (const p of participants) {
        this.server.to(`user:${p.userId}`).emit('unread:update', {
          conversationId,
          lastMessage: {
            content: message.content,
            senderUserId: message.senderUserId,
            createdAt: message.createdAt,
          },
        });
      }
    } catch {
      client.emit('message:error', {
        conversationId,
        error: 'Unable to send message',
      });
    }
  }

  @SubscribeMessage('message:read')
  async handleMarkRead(client: Socket, payload: { conversationId: string }) {
    const auth: WsAuthData = client.data.auth;
    if (!auth) return;
    const conversationId = this.readConversationId(payload);
    if (!conversationId) return;

    try {
      await this.chatService.markConversationRead(conversationId, auth.userId, auth.clinicId);

      // Notify other participants that messages have been read
      this.server.to(`conversation:${conversationId}`).emit('read:update', {
        conversationId,
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
    const conversationId = this.readConversationId(payload);
    if (!conversationId) return;

    try {
      await this.chatService.assertActiveParticipant(conversationId, auth.userId, auth.clinicId);
    } catch {
      return;
    }

    // To each member, not just those with it open, so their list shows who is typing (#30).
    await this.emitToOtherMembers(conversationId, auth.userId, 'typing:start', {
      conversationId,
      userId: auth.userId,
      displayName: auth.displayName,
    });
  }

  @SubscribeMessage('typing:stop')
  async handleTypingStop(client: Socket, payload: { conversationId: string }) {
    const auth: WsAuthData = client.data.auth;
    if (!auth) return;
    const conversationId = this.readConversationId(payload);
    if (!conversationId) return;

    try {
      await this.chatService.assertActiveParticipant(conversationId, auth.userId, auth.clinicId);
    } catch {
      return;
    }

    await this.emitToOtherMembers(conversationId, auth.userId, 'typing:stop', {
      conversationId,
      userId: auth.userId,
    });
  }

  @SubscribeMessage('conversation:join')
  async handleJoinConversation(client: Socket, payload: { conversationId: string }) {
    const auth: WsAuthData = client.data.auth;
    if (!auth) return;
    const conversationId = this.readConversationId(payload);
    if (!conversationId) return;

    try {
      await this.chatService.assertActiveParticipant(conversationId, auth.userId, auth.clinicId);
      await client.join(`conversation:${conversationId}`);
    } catch {
      // Do not disclose whether a conversation id exists in another clinic.
    }
  }

  @SubscribeMessage('conversation:leave')
  async handleLeaveConversation(client: Socket, payload: { conversationId: string }) {
    await client.leave(`conversation:${payload.conversationId}`);
  }

  /** A tab saying it is still here. Keeps its person online; see PRESENCE_TTL_MS. */
  @SubscribeMessage('presence:heartbeat')
  async handlePresenceHeartbeat(client: Socket) {
    const auth: WsAuthData = client.data.auth;
    if (!auth) return;
    await this.pubClient.zadd(presenceKey(auth.clinicId), Date.now(), auth.userId);
  }

  /** Who is online at this clinic now, and when everyone else was last seen. */
  @SubscribeMessage('presence:list')
  async handlePresenceList(client: Socket) {
    const auth: WsAuthData = client.data.auth;
    if (!auth) return;

    const now = Date.now();
    const key = presenceKey(auth.clinicId);
    // Entries older than the TTL belong to tabs that stopped without saying so.
    await this.pubClient.zremrangebyscore(key, '-inf', now - PRESENCE_TTL_MS);
    const [onlineUserIds, lastSeen] = await Promise.all([
      this.pubClient.zrangebyscore(key, now - PRESENCE_TTL_MS, '+inf'),
      this.pubClient.hgetall(lastSeenKey(auth.clinicId)),
    ]);

    client.emit('presence:list', { onlineUserIds, lastSeen });
  }

  /**
   * Tell members about a conversation they are new to or that changed (#30), so their list updates
   * without a reload. Someone who left stops receiving its messages at once.
   */
  notifyConversationChanged(
    conversationId: string,
    params: { memberIds: string[]; removedIds?: string[]; kind: 'new' | 'updated' },
  ) {
    for (const userId of params.memberIds) {
      this.server.to(`user:${userId}`).emit(`conversation:${params.kind}`, { conversationId });
    }
    for (const userId of params.removedIds ?? []) {
      this.server.in(`user:${userId}`).socketsLeave(`conversation:${conversationId}`);
      this.server.to(`user:${userId}`).emit('conversation:removed', { conversationId });
    }
  }

  private async emitToOtherMembers(
    conversationId: string,
    senderUserId: string,
    event: string,
    payload: Record<string, unknown>,
  ) {
    const memberIds = await this.chatService.activeParticipantIds(conversationId);
    for (const userId of memberIds) {
      if (userId !== senderUserId) this.server.to(`user:${userId}`).emit(event, payload);
    }
  }

  private readConversationId(payload: { conversationId?: unknown } | null | undefined) {
    return typeof payload?.conversationId === 'string' && payload.conversationId.trim().length > 0
      ? payload.conversationId.trim()
      : null;
  }
}
