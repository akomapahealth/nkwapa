import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, UseInterceptors, type OnModuleDestroy } from '@nestjs/common';
import { Namespace, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaRlsInterceptor } from '../prisma/prisma-rls.interceptor';
import { ChatService } from './chat.service';
import { createWsAuthMiddleware, WsAuthData } from './chat-ws-auth.middleware';
import { getAllowedCorsOrigins } from '../common/api-config';
import { randomUUID } from 'crypto';
import { createRedisClient } from '../common/redis';
import { redactLogValue } from '../common/redaction';
import { RedisService } from '../redis/redis.service';

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
/** How long a disconnect waits on Redis to count a user's other sockets before counting locally. */
const SOCKETS_LOOKUP_TIMEOUT_MS = 3_000;
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
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server!: Namespace;

  private readonly logger = new Logger(ChatGateway.name);
  private adapterClients: Redis[] = [];
  private redisAdapterInstalled = false;

  constructor(
    private readonly chatService: ChatService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  afterInit(server: Namespace) {
    // Register auth middleware on this namespace
    server.use(createWsAuthMiddleware(this.prisma));
    this.useRedisAdapterWhenReady(server);
  }

  onModuleDestroy() {
    for (const client of this.adapterClients) client.disconnect();
  }

  /*
    The Redis adapter fans messages out across API instances. It is installed only once both of
    its clients are connected (#199).

    Installed eagerly, as it used to be, its subscribe call was never awaited, and the default
    client gave up after twenty retries. With Redis unreachable the rejection went unhandled and
    took the process down twelve seconds after boot. Until Redis is reachable chat uses Socket.IO's
    in-memory adapter, which is exact for a single instance; that is all staging and the current
    production deploy run.

    Swapping adapters forgets which rooms each connected socket is in, so sockets already
    connected when Redis arrives are disconnected. Their clients reconnect on their own, and
    `handleConnection` puts them back in their rooms. Later outages leave the adapter in place:
    its clients reconnect and resubscribe without help.
  */
  private useRedisAdapterWhenReady(nsp: Namespace) {
    const pub = createRedisClient('chat-pub', 'pubsub');
    const sub = createRedisClient('chat-sub', 'pubsub');
    this.adapterClients = [pub, sub];

    const install = () => {
      if (this.redisAdapterInstalled || pub.status !== 'ready' || sub.status !== 'ready') return;
      this.redisAdapterInstalled = true;
      const connected = [...nsp.sockets.values()];
      // Because this gateway uses a namespace, the adapter goes on the parent Server.
      nsp.server.adapter(createAdapter(pub, sub) as ReturnType<typeof createAdapter>);
      for (const socket of connected) socket.disconnect(true);
      this.logger.log(
        JSON.stringify({
          message: 'Chat Redis adapter installed',
          reconnectedSockets: connected.length,
        }),
      );
    };
    pub.on('ready', install);
    sub.on('ready', install);
    pub.once('error', () => {
      if (this.redisAdapterInstalled) return;
      this.logger.warn(
        JSON.stringify({
          message: 'Chat is running on the in-memory adapter until Redis is reachable',
        }),
      );
    });
  }

  /**
   * Presence is best effort (#199): it uses the fail-fast client, and a Redis outage makes it
   * stale rather than failing the connect, send or disconnect around it.
   */
  private async presence<T>(operation: (redis: Redis) => Promise<T>): Promise<T | null> {
    if (!this.redis.isReady()) return null;
    try {
      return await operation(this.redis.client);
    } catch (error) {
      this.logger.warn(
        JSON.stringify({ message: 'Chat presence unavailable', error: redactLogValue(error) }),
      );
      return null;
    }
  }

  /** Every socket of a user, across instances when Redis allows, else this instance's. */
  private async socketsOfUser(userId: string) {
    const room = `user:${userId}`;
    if (!this.redisAdapterInstalled || !this.redis.isReady()) {
      return this.server.local.in(room).fetchSockets();
    }
    // The Redis adapter's count of instances waits for Redis rather than failing.
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), SOCKETS_LOOKUP_TIMEOUT_MS);
    });
    try {
      const sockets = await Promise.race([
        this.server
          .in(room)
          .fetchSockets()
          .catch(() => null),
        timedOut,
      ]);
      return sockets ?? (await this.server.local.in(room).fetchSockets());
    } finally {
      clearTimeout(timer);
    }
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

    await this.presence((redis) => redis.zadd(presenceKey(clinicId), Date.now(), userId));

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
    const sockets = await this.socketsOfUser(userId);

    // Only remove presence if this is the last connection for this user
    if (sockets.length <= 1) {
      const lastSeenAt = new Date().toISOString();
      await this.presence(async (redis) => {
        await redis.zrem(presenceKey(clinicId), userId);
        await redis.hset(lastSeenKey(clinicId), userId, lastSeenAt);
      });
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
    await this.presence((redis) => redis.zadd(presenceKey(auth.clinicId), Date.now(), auth.userId));
  }

  /** Who is online at this clinic now, and when everyone else was last seen. */
  @SubscribeMessage('presence:list')
  async handlePresenceList(client: Socket) {
    const auth: WsAuthData = client.data.auth;
    if (!auth) return;

    const now = Date.now();
    const key = presenceKey(auth.clinicId);
    const listed = await this.presence(async (redis) => {
      // Entries older than the TTL belong to tabs that stopped without saying so.
      await redis.zremrangebyscore(key, '-inf', now - PRESENCE_TTL_MS);
      const [onlineUserIds, lastSeen] = await Promise.all([
        redis.zrangebyscore(key, now - PRESENCE_TTL_MS, '+inf'),
        redis.hgetall(lastSeenKey(auth.clinicId)),
      ]);
      return { onlineUserIds, lastSeen };
    });
    // Nothing rather than an empty list, which the client would show as everyone offline.
    if (listed) client.emit('presence:list', listed);
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
