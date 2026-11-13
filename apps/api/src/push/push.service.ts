import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InboxNotificationKind } from '@prisma/client';
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
  /** What the bell files it under. */
  kind: InboxNotificationKind;
  /** The clinic it concerns; the bell hides it once the reader loses their role there. */
  clinicId?: string | null;
  /**
   * Fuller wording for the in-app bell only, which is read signed in, inside the clinic it is
   * about. The lock-screen push keeps `title` and `body`, which never name a patient.
   */
  inbox?: { title?: string; body?: string | null };
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

  /**
   * File a notification in each person's bell and push it to their devices, without waiting and
   * without throwing. The bell is written whether or not Web Push is configured.
   */
  notify(userIds: Iterable<string | null | undefined>, message: PushMessage): void {
    const recipients = [...new Set([...userIds].filter((id): id is string => Boolean(id)))];
    if (recipients.length === 0) return;
    this.prisma.detachFromRlsContext(() => {
      void this.record(recipients, message).catch((error) =>
        this.logger.warn(`In-app notification failed: ${errorText(error)}`),
      );
      if (!this.vapid) return;
      void this.deliver(recipients, message).catch((error) =>
        this.logger.warn(`Web push delivery failed: ${errorText(error)}`),
      );
    });
  }

  /**
   * Tell the clinicians who should see this patient now (an urgent finding at screening). Goes
   * to the doctors on shift at the clinic, or to the clinic's doctors when none is on shift, and
   * never to the person who recorded it: they are looking at the warning already. One tile per
   * visit: a second finding on the same visit updates it.
   */
  alertClinicians(params: {
    clinicId: string;
    encounterId: string;
    actorUserId: string;
    /** Plain-English findings, e.g. "Chest pain" or "Blood pressure 186/124 mmHg". */
    findings: string[];
  }): void {
    this.prisma.detachFromRlsContext(() => {
      void this.findAlertRecipients(params)
        .then(({ recipients, patientName }) =>
          this.notify(recipients, {
            title: 'A patient needs urgent review',
            body: 'Open Nkwapa to see who.',
            url: `/clinics/${params.clinicId}/encounters/${params.encounterId}`,
            tag: `health-${params.encounterId}`,
            kind: 'HEALTH_ALERT',
            clinicId: params.clinicId,
            inbox: {
              title: `${patientName} needs urgent review`,
              body: `${params.findings.join('. ')}. Recorded at screening; see the patient now.`,
            },
          }),
        )
        .catch((error) => this.logger.warn(`Health alert failed: ${errorText(error)}`));
    });
  }

  /**
   * Alert only on findings this save added, so re-saving an already urgent screen stays quiet
   * and a second, different finding on the same visit still gets through.
   */
  alertOnNewFindings(params: {
    clinicId: string;
    encounterId: string;
    actorUserId: string;
    before: readonly string[];
    after: readonly string[];
    labels: Readonly<Record<string, string>>;
  }): void {
    const added = params.after.filter((reason) => !params.before.includes(reason));
    if (added.length === 0) return;
    this.alertClinicians({
      clinicId: params.clinicId,
      encounterId: params.encounterId,
      actorUserId: params.actorUserId,
      findings: params.after.map((reason) => params.labels[reason] ?? reason),
    });
  }

  private findAlertRecipients(params: {
    clinicId: string;
    encounterId: string;
    actorUserId: string;
  }) {
    return this.prisma.withSystemContext(
      { systemReason: 'Route an urgent screening finding' },
      async (client) => {
        const [encounter, onShift] = await Promise.all([
          client.encounter.findUnique({
            where: { id: params.encounterId },
            select: { patient: { select: { firstName: true, lastName: true } } },
          }),
          client.staffShift.findMany({
            where: { clinicId: params.clinicId, status: 'ACTIVE', roleAtShift: 'DOCTOR' },
            select: { userId: true },
          }),
        ]);
        const doctors = onShift.length
          ? onShift
          : await client.userClinicRole.findMany({
              where: { clinicId: params.clinicId, role: 'DOCTOR' },
              select: { userId: true },
            });
        const name = encounter
          ? `${encounter.patient.firstName} ${encounter.patient.lastName}`.trim()
          : '';
        return {
          recipients: doctors.map((d) => d.userId).filter((id) => id !== params.actorUserId),
          patientName: name || 'A patient',
        };
      },
    );
  }

  /**
   * Exposed for tests; callers use notify(). A tagged notification merges into the person's
   * unread one with that tag. The merge is one statement against a partial unique index, so two
   * events racing on different API instances still end as one row with the right count.
   */
  async record(userIds: string[], message: PushMessage): Promise<void> {
    const title = (message.inbox?.title ?? message.title).slice(0, 200);
    const body = (message.inbox?.body === undefined ? message.body : message.inbox.body) ?? null;
    const clipped = body ? body.slice(0, 500) : null;
    const clinicId = message.clinicId ?? null;
    await this.prisma.withSystemContext(
      { systemReason: 'Record in-app notifications' },
      async (client) => {
        for (const userId of userIds) {
          await client.$executeRaw`
          INSERT INTO "InboxNotification"
            ("id", "userId", "clinicId", "kind", "title", "body", "url", "tag")
          VALUES (
            ${randomUUID()}::uuid, ${userId}::uuid, ${clinicId}::uuid,
            ${message.kind}::"InboxNotificationKind", ${title}, ${clipped}, ${message.url},
            ${message.tag ?? null}
          )
          ON CONFLICT ("userId", "tag") WHERE "readAt" IS NULL AND "tag" IS NOT NULL
          DO UPDATE SET
            "title" = EXCLUDED."title",
            "body" = EXCLUDED."body",
            "url" = EXCLUDED."url",
            "clinicId" = EXCLUDED."clinicId",
            "kind" = EXCLUDED."kind",
            "count" = "InboxNotification"."count" + 1,
            "updatedAt" = CURRENT_TIMESTAMP`;
        }
      },
    );
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

    // Only the lock-screen fields leave the server: the bell wording can name a patient.
    const { title, body, url, tag } = message;
    const payload = JSON.stringify({ title, body, url, tag });
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
