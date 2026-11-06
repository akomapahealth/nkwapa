import { Injectable, Logger } from '@nestjs/common';
import { sendNotification, WebPushError } from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

/**
 * What a push says. It names who or what kind, never patient details (#250): it lands on a lock
 * screen anyone can read, and it travels through the browser vendor's push service.
 */
export interface PushMessage {
  title: string;
  body?: string;
  /** Same-origin path the click opens. The service worker refuses anything else. */
  url: string;
  /** Repeats with the same tag replace each other, and match the in-page notification's tag. */
  tag?: string;
}

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** The VAPID settings, or null when push is not configured. Never logs the values. */
export function resolveVapidConfig(env: NodeJS.ProcessEnv = process.env): VapidConfig | null {
  const publicKey = env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject: env.WEB_PUSH_SUBJECT?.trim() || 'mailto:no-reply@akomapa.org',
  };
}

// A push the device never shows is worthless after a day; the push service drops it then.
const TTL_SECONDS = 24 * 60 * 60;
const SYSTEM_REASON = 'Deliver web push notifications';

/**
 * Background Web Push (#250): stores each browser's subscription and sends to them when something
 * happens for a person. Sending is fire-and-forget, after the caller's own work: it runs outside
 * the request's transaction, and a dead push service never fails the write that triggered it.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly vapid = resolveVapidConfig();

  constructor(private readonly prisma: PrismaService) {
    if (!this.vapid) {
      this.logger.log('Web Push is off: WEB_PUSH_VAPID_PUBLIC_KEY or _PRIVATE_KEY is not set.');
    }
  }

  get enabled(): boolean {
    return this.vapid !== null;
  }

  /**
   * Save this browser's subscription for `userId`. An endpoint is one browser profile, so on a
   * shared clinic device it moves to whoever subscribed last: the previous person stops getting
   * pushes there. Runs as the system because that row may belong to someone else.
   */
  async subscribe(userId: string, input: PushSubscriptionInput): Promise<void> {
    const data = {
      userId,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent?.slice(0, 512) || null,
    };
    await this.prisma.detachFromRlsContext(() =>
      this.prisma.withSystemContext({ systemReason: 'Save a web push subscription' }, (client) =>
        client.pushSubscription.upsert({
          where: { endpoint: input.endpoint },
          create: { endpoint: input.endpoint, ...data },
          update: data,
        }),
      ),
    );
  }

  /** Forget this browser for this person. Row level security limits it to their own rows. */
  async unsubscribe(endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint } });
  }

  /** Push to everyone in `userIds`, without waiting and without throwing. */
  notify(userIds: Iterable<string | null | undefined>, message: PushMessage): void {
    if (!this.vapid) return;
    const recipients = [...new Set([...userIds].filter((id): id is string => Boolean(id)))];
    if (recipients.length === 0) return;
    this.prisma.detachFromRlsContext(() => {
      void this.deliver(recipients, message).catch((error) =>
        this.logger.warn(`Web push delivery failed: ${errorText(error)}`),
      );
    });
  }

  /** Exposed for tests; callers use notify(). */
  async deliver(userIds: string[], message: PushMessage): Promise<void> {
    const vapid = this.vapid;
    if (!vapid) return;
    const subscriptions = await this.prisma.withSystemContext(
      { systemReason: SYSTEM_REASON },
      (client) =>
        client.pushSubscription.findMany({
          where: { userId: { in: userIds } },
          select: { id: true, endpoint: true, p256dh: true, auth: true },
        }),
    );
    if (subscriptions.length === 0) return;

    const payload = JSON.stringify(message);
    const gone: string[] = [];
    const delivered: string[] = [];
    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload,
            { TTL: TTL_SECONDS, vapidDetails: vapid, timeout: 10_000 },
          );
          delivered.push(subscription.id);
        } catch (error) {
          // 404 and 410: the browser unsubscribed or the push service expired it. Never retried.
          if (error instanceof WebPushError && [404, 410].includes(error.statusCode)) {
            gone.push(subscription.id);
          } else {
            this.logger.warn(`Web push send failed: ${errorText(error)}`);
          }
        }
      }),
    );

    if (gone.length === 0 && delivered.length === 0) return;
    await this.prisma.withSystemContext({ systemReason: SYSTEM_REASON }, async (client) => {
      if (gone.length > 0) {
        await client.pushSubscription.deleteMany({ where: { id: { in: gone } } });
      }
      if (delivered.length > 0) {
        await client.pushSubscription.updateMany({
          where: { id: { in: delivered } },
          data: { lastUsedAt: new Date() },
        });
      }
    });
  }
}

// The status code and message only: a WebPushError's body and headers can echo the endpoint.
function errorText(error: unknown): string {
  if (error instanceof WebPushError) return `${error.statusCode} ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}
