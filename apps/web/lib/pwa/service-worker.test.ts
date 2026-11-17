const sw = require('./service-worker.js') as {
  VERSION: string;
  cacheNames: (version: string) => Record<'pages' | 'static' | 'offline', string>;
  shouldHandle: (request: Request, origin: string) => 'page' | 'static' | null;
  isCacheable: (response: Response | null, pathname?: string) => boolean;
  offlineSessionMessage: (
    held: unknown,
    data: unknown,
    now: number,
  ) => { held: { at: number } | null; reply?: unknown };
  cacheKeyFor: (request: Request) => Request;
  trimCache: (cache: Pick<Cache, 'keys' | 'delete'>, max: number) => Promise<void>;
  openFromNotification: (clients: unknown, origin: string, url: unknown) => Promise<void>;
  pushNotificationFor: (raw: string) => { title: string; options: NotificationOptions };
  showPush: (registration: unknown, clients: unknown, raw: string) => Promise<void>;
};

const ORIGIN = 'https://nkwapa.app';

/** Request.mode can't be set to 'navigate' in a constructor, so fake the fields the worker reads. */
function req(
  path: string,
  { method = 'GET', mode = 'navigate', headers = {} as Record<string, string> } = {},
): Request {
  const url = path.startsWith('http') ? path : `${ORIGIN}${path}`;
  return { url, method, mode, headers: new Headers(headers) } as unknown as Request;
}

function res(
  body: string,
  { status = 200, type = 'basic', redirected = false, headers = {} as Record<string, string> } = {},
): Response {
  const response = new Response(body, { status, headers });
  Object.defineProperty(response, 'type', { value: type });
  Object.defineProperty(response, 'redirected', { value: redirected });
  return response;
}

describe('service worker rules (#206)', () => {
  it('keeps the version placeholder for the route handler to replace', () => {
    expect(sw.VERSION).toBe('__SW_VERSION__');
  });

  it('names every cache with the shared prefix and the version', () => {
    expect(Object.values(sw.cacheNames('abc'))).toEqual([
      'nkwapa-pages-abc',
      'nkwapa-static-abc',
      'nkwapa-offline-abc',
    ]);
  });

  describe('shouldHandle', () => {
    it('answers same-origin navigations and hashed static assets', () => {
      expect(sw.shouldHandle(req('/dashboard'), ORIGIN)).toBe('page');
      expect(sw.shouldHandle(req('/_next/static/chunks/a1.js', { mode: 'no-cors' }), ORIGIN)).toBe(
        'static',
      );
      expect(sw.shouldHandle(req('/icons/icon-192.png', { mode: 'no-cors' }), ORIGIN)).toBe(
        'static',
      );
    });

    it('serves the offline wordmark from the cache, nothing else under /images', () => {
      const asset = (path: string) => req(path, { mode: 'no-cors' });
      expect(sw.shouldHandle(asset('/images/nkwapa-logo.png'), ORIGIN)).toBe('static');
      expect(sw.shouldHandle(asset('/images/nkwapa-logo-dark.png'), ORIGIN)).toBe('static');
      expect(sw.shouldHandle(asset('/images/landing/hero.png'), ORIGIN)).toBeNull();
    });

    it('never touches another origin: the API or Keycloak', () => {
      expect(sw.shouldHandle(req('https://api.nkwapa.app/patients'), ORIGIN)).toBeNull();
      expect(sw.shouldHandle(req('https://auth.nkwapa.app/realms/nkwapa'), ORIGIN)).toBeNull();
    });

    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('never touches %s', (method) => {
      expect(sw.shouldHandle(req('/dashboard', { method }), ORIGIN)).toBeNull();
    });

    it('never touches RSC requests, by header or by query', () => {
      expect(sw.shouldHandle(req('/dashboard', { headers: { RSC: '1' } }), ORIGIN)).toBeNull();
      expect(sw.shouldHandle(req('/dashboard?_rsc=x1y2', { mode: 'cors' }), ORIGIN)).toBeNull();
    });

    it('never touches the silent SSO bridge, API routes, the worker or a sign-in callback', () => {
      expect(sw.shouldHandle(req('/silent-check-sso.html'), ORIGIN)).toBeNull();
      expect(sw.shouldHandle(req('/api/anything'), ORIGIN)).toBeNull();
      expect(sw.shouldHandle(req('/service-worker.js', { mode: 'no-cors' }), ORIGIN)).toBeNull();
      expect(sw.shouldHandle(req('/login?code=abc&state=xyz'), ORIGIN)).toBeNull();
    });

    it('leaves other same-origin subresources to the network', () => {
      expect(
        sw.shouldHandle(req('/images/Akomapa-17.jpg', { mode: 'no-cors' }), ORIGIN),
      ).toBeNull();
    });
  });

  describe('isCacheable', () => {
    it('accepts a plain successful same-origin response', () => {
      expect(sw.isCacheable(res('ok'))).toBe(true);
    });

    it.each([
      ['a server error', res('boom', { status: 500 })],
      ['a not found', res('missing', { status: 404 })],
      ['an opaque response', res('', { type: 'opaque' })],
      ['a CORS response', res('ok', { type: 'cors' })],
      ['a redirected response', res('ok', { redirected: true })],
      ['no-store', res('ok', { headers: { 'Cache-Control': 'no-store' } })],
      ['private', res('ok', { headers: { 'Cache-Control': 'private, max-age=0' } })],
      ['nothing at all', null],
    ])('refuses %s', (_label, response) => {
      expect(sw.isCacheable(response)).toBe(false);
    });
  });

  describe('chart and encounter shells (#207)', () => {
    const noStore = () =>
      res('<html></html>', { headers: { 'Cache-Control': 'private, no-store' } });

    it.each([
      '/clinics/c1/patients/p1',
      '/clinics/c1/patients/p1/edit',
      '/clinics/c1/patients/p1/consent',
      '/clinics/c1/encounters/e1',
    ])('keeps %s although Next marks it no-store', (path) => {
      expect(sw.isCacheable(noStore(), path)).toBe(true);
    });

    it.each(['/clinics/c1/research/exports', '/admin/users', '/clinics/c1/patients/p1/edit/x'])(
      'still refuses no-store on %s',
      (path) => {
        expect(sw.isCacheable(noStore(), path)).toBe(false);
      },
    );

    it('never keeps a failed or redirected chart', () => {
      expect(sw.isCacheable(res('x', { status: 500 }), '/clinics/c1/patients/p1')).toBe(false);
      expect(sw.isCacheable(res('x', { redirected: true }), '/clinics/c1/patients/p1')).toBe(false);
    });
  });

  describe('holding an unlocked offline session (#207)', () => {
    const hold = {
      type: 'OFFLINE_SESSION_HOLD',
      session: { id: 's' },
      keys: [['k', 1]],
      idleMs: 1000,
    };

    it('hands the session back while it is fresh, and forgets it after the idle time', () => {
      let { held } = sw.offlineSessionMessage(null, hold, 0);
      let step = sw.offlineSessionMessage(held, { type: 'OFFLINE_SESSION_RESUME' }, 900);
      expect(step.reply).toEqual({ session: { id: 's' }, keys: [['k', 1]] });

      step = sw.offlineSessionMessage(step.held, { type: 'OFFLINE_SESSION_RESUME' }, 1000);
      expect(step.reply).toBeNull();
      expect(step.held).toBeNull();

      ({ held } = sw.offlineSessionMessage(null, hold, 0));
      ({ held } = sw.offlineSessionMessage(held, { type: 'OFFLINE_SESSION_TOUCH' }, 800));
      expect(
        sw.offlineSessionMessage(held, { type: 'OFFLINE_SESSION_RESUME' }, 1700).reply,
      ).not.toBeNull();
    });

    it('a ping keeps the worker awake without counting as activity', () => {
      const { held } = sw.offlineSessionMessage(null, hold, 0);
      const pinged = sw.offlineSessionMessage(held, { type: 'OFFLINE_SESSION_PING' }, 900).held;
      expect(pinged?.at).toBe(0);
    });

    it('drops it on Lock or sign-in', () => {
      const { held } = sw.offlineSessionMessage(null, hold, 0);
      const dropped = sw.offlineSessionMessage(held, { type: 'OFFLINE_SESSION_DROP' }, 1).held;
      expect(
        sw.offlineSessionMessage(dropped, { type: 'OFFLINE_SESSION_RESUME' }, 2).reply,
      ).toBeNull();
    });
  });

  it('keys pages on origin and pathname only', () => {
    expect(sw.cacheKeyFor(req('/login?source=pwa&next=%2Fpatients')).url).toBe(`${ORIGIN}/login`);
  });

  it('trims the oldest entries first', async () => {
    const keys = ['a', 'b', 'c', 'd', 'e'].map((k) => new Request(`${ORIGIN}/${k}`));
    const deleted: string[] = [];
    await sw.trimCache(
      {
        keys: async () => keys,
        delete: async (key: RequestInfo | URL) => {
          deleted.push(new URL((key as Request).url).pathname);
          return true;
        },
      },
      3,
    );
    expect(deleted).toEqual(['/a', '/b']);
  });

  it('leaves a cache under its cap alone', async () => {
    const remove = jest.fn();
    await sw.trimCache({ keys: async () => [new Request(`${ORIGIN}/a`)], delete: remove }, 3);
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('notification clicks', () => {
  function clientsWith(urls: string[]) {
    const windows = urls.map((url) => ({ url, focus: jest.fn(), postMessage: jest.fn() }));
    return {
      windows,
      clients: { matchAll: jest.fn(async () => windows), openWindow: jest.fn() },
    };
  }

  it('hands the URL to an open window instead of opening another', async () => {
    const { clients, windows } = clientsWith([`${ORIGIN}/patients`]);
    await sw.openFromNotification(clients, ORIGIN, '/patients?chat=conv-1');
    expect(windows[0].focus).toHaveBeenCalled();
    expect(windows[0].postMessage).toHaveBeenCalledWith({
      type: 'NKWAPA_NOTIFICATION_CLICK',
      url: '/patients?chat=conv-1',
    });
    expect(clients.openWindow).not.toHaveBeenCalled();
  });

  it('opens a window when none is open', async () => {
    const { clients } = clientsWith([]);
    await sw.openFromNotification(clients, ORIGIN, '/dashboard?chat=conv-1');
    expect(clients.openWindow).toHaveBeenCalledWith('/dashboard?chat=conv-1');
  });

  it('never opens another site', async () => {
    const { clients } = clientsWith([]);
    await sw.openFromNotification(clients, ORIGIN, 'https://evil.example/phish');
    expect(clients.openWindow).toHaveBeenCalledWith('/dashboard');
  });
});

describe('background push (#250)', () => {
  function setup(windows: Array<{ focused: boolean; visibilityState: string }>) {
    return {
      registration: { showNotification: jest.fn() },
      clients: { matchAll: jest.fn(async () => windows) },
    };
  }

  it('shows the title, body, tag and click URL the API sent', async () => {
    const { registration, clients } = setup([{ focused: false, visibilityState: 'hidden' }]);
    await sw.showPush(
      registration,
      clients,
      JSON.stringify({
        title: 'New message from Ama',
        body: 'Open Nkwapa to read it.',
        url: '/dashboard?chat=c1',
        tag: 'chat-c1',
      }),
    );
    expect(registration.showNotification).toHaveBeenCalledWith(
      'New message from Ama',
      expect.objectContaining({
        body: 'Open Nkwapa to read it.',
        tag: 'chat-c1',
        data: { url: '/dashboard?chat=c1' },
      }),
    );
  });

  it('stays quiet while a Nkwapa window is in front, which notifies on its own', async () => {
    const { registration, clients } = setup([{ focused: true, visibilityState: 'visible' }]);
    await sw.showPush(registration, clients, JSON.stringify({ title: 't', url: '/' }));
    expect(registration.showNotification).not.toHaveBeenCalled();
  });

  it('still shows something for a payload it cannot read', () => {
    const { title, options } = sw.pushNotificationFor('not json');
    expect(title).toBe('Nkwapa');
    expect(options.data).toEqual({ url: '/dashboard' });
  });
});
