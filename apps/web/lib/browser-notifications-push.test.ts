/** @jest-environment jsdom */

/*
  Background Web Push subscription (#250). The VAPID key is read once at import, so each test loads
  the module fresh with the environment it needs.
*/
const apiFetch = jest.fn();
jest.mock('./api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  readApiError: async () => new Error('api error'),
}));

type Lib = typeof import('./browser-notifications');

function load(vapidKey: string | undefined): Lib {
  const saved = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
  process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY = vapidKey;
  if (vapidKey === undefined) delete process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
  let lib!: Lib;
  jest.isolateModules(() => {
    lib = require('./browser-notifications');
  });
  process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY = saved;
  return lib;
}

function installPush(existing: PushSubscription | null) {
  const created = {
    endpoint: 'https://push.example/new',
    toJSON: () => ({ endpoint: 'https://push.example/new', keys: { p256dh: 'p', auth: 'a' } }),
    unsubscribe: jest.fn(async () => true),
  };
  const manager = {
    getSubscription: jest.fn(async () => existing),
    subscribe: jest.fn(async () => created),
  };
  Object.defineProperty(window, 'PushManager', {
    value: function PushManager() {},
    configurable: true,
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { getRegistration: jest.fn(async () => ({ pushManager: manager })) },
    configurable: true,
  });
  return { manager, created };
}

const getToken = async () => 'token';

beforeEach(() => apiFetch.mockReset().mockResolvedValue({ ok: true }));

it('decodes a base64url VAPID key to bytes', () => {
  const { vapidKeyBytes } = load('k');
  expect([...vapidKeyBytes('AQID-_8')]).toEqual([1, 2, 3, 251, 255]);
});

it('does nothing without a VAPID key in the build', async () => {
  const { syncPushSubscription, webPushSupported } = load(undefined);
  const { manager } = installPush(null);
  expect(webPushSupported()).toBe(false);
  expect(await syncPushSubscription(getToken)).toBe(false);
  expect(manager.subscribe).not.toHaveBeenCalled();
});

it('subscribes this browser and saves it for the signed-in person', async () => {
  const { syncPushSubscription } = load('AQID');
  const { manager } = installPush(null);
  expect(await syncPushSubscription(getToken)).toBe(true);
  expect(manager.subscribe).toHaveBeenCalledWith({
    userVisibleOnly: true,
    applicationServerKey: expect.any(Uint8Array),
  });
  expect(apiFetch).toHaveBeenCalledWith(
    '/me/push-subscriptions',
    expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ endpoint: 'https://push.example/new', p256dh: 'p', auth: 'a' }),
    }),
  );
});

it('on sign-out, forgets the subscription and the opt-in on this device', async () => {
  const { forgetNotificationsOnDevice, NOTIFICATION_OPT_IN_KEY } = load('AQID');
  const existing = {
    endpoint: 'https://push.example/old',
    unsubscribe: jest.fn(async () => true),
  } as unknown as PushSubscription;
  installPush(existing);
  window.localStorage.setItem(NOTIFICATION_OPT_IN_KEY, 'true');

  await forgetNotificationsOnDevice(getToken);

  expect(apiFetch).toHaveBeenCalledWith(
    '/me/push-subscriptions/remove',
    expect.objectContaining({ body: JSON.stringify({ endpoint: 'https://push.example/old' }) }),
  );
  expect(existing.unsubscribe).toHaveBeenCalled();
  expect(window.localStorage.getItem(NOTIFICATION_OPT_IN_KEY)).toBeNull();
});
