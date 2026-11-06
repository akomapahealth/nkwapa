import { sendNotification, WebPushError } from 'web-push';
import { PushService, resolveVapidConfig } from './push.service';

jest.mock('web-push', () => {
  const actual = jest.requireActual('web-push');
  return { ...actual, sendNotification: jest.fn() };
});

const send = sendNotification as jest.MockedFunction<typeof sendNotification>;

function gone(status: number) {
  return new WebPushError('Push service error', status, {}, '', 'https://push.example/x');
}

function setup(env: Record<string, string | undefined> = {}) {
  const saved = { ...process.env };
  Object.assign(process.env, {
    WEB_PUSH_VAPID_PUBLIC_KEY: 'pub',
    WEB_PUSH_VAPID_PRIVATE_KEY: 'priv',
    ...env,
  });
  const client = {
    pushSubscription: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'live', endpoint: 'https://push.example/live', p256dh: 'k', auth: 'a' },
        { id: 'expired', endpoint: 'https://push.example/expired', p256dh: 'k', auth: 'a' },
        { id: 'flaky', endpoint: 'https://push.example/flaky', p256dh: 'k', auth: 'a' },
      ]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      upsert: jest.fn(),
    },
  };
  const prisma = {
    withSystemContext: jest.fn((_ctx, callback) => callback(client)),
    detachFromRlsContext: jest.fn((callback) => callback()),
    pushSubscription: client.pushSubscription,
  };
  const service = new PushService(prisma as never);
  process.env = saved;
  return { service, prisma, client };
}

describe('PushService', () => {
  beforeEach(() => send.mockReset());

  it('is off without both VAPID keys, and sends nothing', () => {
    expect(resolveVapidConfig({ WEB_PUSH_VAPID_PUBLIC_KEY: 'pub' })).toBeNull();
    const { service, prisma } = setup({ WEB_PUSH_VAPID_PRIVATE_KEY: '' });
    expect(service.enabled).toBe(false);
    service.notify(['user-1'], { title: 't', url: '/' });
    expect(prisma.withSystemContext).not.toHaveBeenCalled();
  });

  it('drops subscriptions the push service says are gone and stamps the rest', async () => {
    const { service, client } = setup();
    send.mockImplementation(async (subscription) => {
      if (subscription.endpoint.endsWith('expired')) throw gone(410);
      if (subscription.endpoint.endsWith('flaky')) throw gone(500);
      return { statusCode: 201, body: '', headers: {} };
    });

    await service.deliver(['user-1'], { title: 'New message from Ama', url: '/dashboard' });

    expect(send).toHaveBeenCalledTimes(3);
    const [, payload, options] = send.mock.calls[0];
    expect(JSON.parse(payload as string)).toEqual({
      title: 'New message from Ama',
      url: '/dashboard',
    });
    expect(options).toMatchObject({ TTL: 86400, vapidDetails: { publicKey: 'pub' } });
    // 404 and 410 only: a 500 is a bad moment, not a dead subscription.
    expect(client.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['expired'] } },
    });
    expect(client.pushSubscription.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['live'] } },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it('treats 404 as gone too', async () => {
    const { service, client } = setup();
    send.mockRejectedValue(gone(404));
    await service.deliver(['user-1'], { title: 't', url: '/' });
    expect(client.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['live', 'expired', 'flaky'] } },
    });
    expect(client.pushSubscription.updateMany).not.toHaveBeenCalled();
  });

  it('notifies each recipient once, skips empty ids, and never throws', async () => {
    const { service, client, prisma } = setup();
    client.pushSubscription.findMany.mockRejectedValue(new Error('db down'));
    expect(() =>
      service.notify(['user-1', null, 'user-1', undefined], { title: 't', url: '/' }),
    ).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
    expect(prisma.detachFromRlsContext).toHaveBeenCalled();
    expect(client.pushSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: { in: ['user-1'] } } }),
    );
  });

  it('moves an endpoint to whoever subscribed last on a shared device', async () => {
    const { service, client } = setup();
    await service.subscribe('user-2', {
      endpoint: 'https://push.example/live',
      p256dh: 'k',
      auth: 'a',
      userAgent: 'x'.repeat(600),
    });
    const args = client.pushSubscription.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ endpoint: 'https://push.example/live' });
    expect(args.update.userId).toBe('user-2');
    expect(args.update.userAgent).toHaveLength(512);
  });
});
