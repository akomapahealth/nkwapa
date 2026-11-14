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
    $executeRaw: jest.fn().mockResolvedValue(1),
    encounter: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ patient: { firstName: 'Kwame', lastName: 'Asante' } }),
    },
    staffShift: { findMany: jest.fn().mockResolvedValue([]) },
    userClinicRole: {
      findMany: jest.fn().mockResolvedValue([{ userId: 'doc-1' }, { userId: 'actor' }]),
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

  it('is off without both VAPID keys: pushes nothing but still files the bell', async () => {
    expect(resolveVapidConfig({ WEB_PUSH_VAPID_PUBLIC_KEY: 'pub' })).toBeNull();
    const { service, client } = setup({ WEB_PUSH_VAPID_PRIVATE_KEY: '' });
    expect(service.enabled).toBe(false);
    service.notify(['user-1'], { title: 't', url: '/', kind: 'MESSAGE' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(client.pushSubscription.findMany).not.toHaveBeenCalled();
    expect(client.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('files one row per recipient with the bell wording, never the lock-screen text', async () => {
    const { service, client } = setup();
    await service.record(['u1', 'u2'], {
      title: 'A patient needs urgent review',
      body: 'Open Nkwapa to see who.',
      url: '/x',
      tag: 'health-e1',
      kind: 'HEALTH_ALERT',
      clinicId: 'c1',
      inbox: { title: 'Kwame Asante needs urgent review', body: 'Chest pain.' },
    });
    expect(client.$executeRaw).toHaveBeenCalledTimes(2);
    const values = client.$executeRaw.mock.calls[0].slice(1);
    expect(values).toEqual(
      expect.arrayContaining([
        'u1',
        'c1',
        'HEALTH_ALERT',
        'Kwame Asante needs urgent review',
        'Chest pain.',
        '/x',
        'health-e1',
      ]),
    );
    const sql = (client.$executeRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).toContain('ON CONFLICT ("userId", "tag") WHERE "readAt" IS NULL');
  });

  it('alerts the clinic doctors, not the recorder, only for findings the save added', async () => {
    const { service, client } = setup({ WEB_PUSH_VAPID_PRIVATE_KEY: '' });
    const base = {
      clinicId: 'c1',
      encounterId: 'e1',
      actorUserId: 'actor',
      labels: { A: 'Chest pain', B: 'Fainting' },
    };
    service.alertOnNewFindings({ ...base, before: ['A'], after: ['A'] });
    await new Promise((resolve) => setImmediate(resolve));
    expect(client.encounter.findUnique).not.toHaveBeenCalled();

    service.alertOnNewFindings({ ...base, before: ['A'], after: ['A', 'B'] });
    for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
    expect(client.$executeRaw).toHaveBeenCalledTimes(1);
    const values = client.$executeRaw.mock.calls[0].slice(1);
    expect(values).toEqual(expect.arrayContaining(['doc-1', 'Kwame Asante needs urgent review']));
    expect(values).not.toContain('actor');
    expect(values.join(' ')).toContain('Chest pain. Fainting.');
  });

  it('never sends the bell wording to a device', async () => {
    const { service } = setup();
    send.mockResolvedValue({ statusCode: 201, body: '', headers: {} });
    await service.deliver(['user-1'], {
      title: 'A patient needs urgent review',
      url: '/x',
      kind: 'HEALTH_ALERT',
      inbox: { title: 'Kwame Asante needs urgent review' },
    });
    expect(String(send.mock.calls[0][1])).not.toContain('Kwame');
  });

  it('drops subscriptions the push service says are gone and stamps the rest', async () => {
    const { service, client } = setup();
    send.mockImplementation(async (subscription) => {
      if (subscription.endpoint.endsWith('expired')) throw gone(410);
      if (subscription.endpoint.endsWith('flaky')) throw gone(500);
      return { statusCode: 201, body: '', headers: {} };
    });

    await service.deliver(['user-1'], {
      title: 'New message from Ama',
      url: '/dashboard',
      kind: 'MESSAGE',
    });

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
    await service.deliver(['user-1'], { title: 't', url: '/', kind: 'MESSAGE' });
    expect(client.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['live', 'expired', 'flaky'] } },
    });
    expect(client.pushSubscription.updateMany).not.toHaveBeenCalled();
  });

  it('notifies each recipient once, skips empty ids, and never throws', async () => {
    const { service, client, prisma } = setup();
    client.pushSubscription.findMany.mockRejectedValue(new Error('db down'));
    expect(() =>
      service.notify(['user-1', null, 'user-1', undefined], {
        title: 't',
        url: '/',
        kind: 'MESSAGE',
      }),
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
