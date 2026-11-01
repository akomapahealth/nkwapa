import {
  createInstallPromptStore,
  detectPlatform,
  type DeferredInstallPrompt,
  type InstallEnvironment,
} from './install-prompt';

const UA = {
  chromeDesktop:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
  // iPadOS asks for the desktop site and reports itself as a Mac.
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  safariMac17:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  safariMac16:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
  firefoxMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:131.0) Gecko/20100101 Firefox/131.0',
};

function fakeEnv(overrides: Partial<InstallEnvironment> & { standalone?: boolean } = {}) {
  const handlers = new Map<string, (event: unknown) => void>();
  const env: InstallEnvironment = {
    userAgent: UA.chromeDesktop,
    maxTouchPoints: 0,
    supportsInstallPrompt: true,
    matchMedia: (query) => ({
      matches: query === '(display-mode: standalone)' && overrides.standalone === true,
    }),
    addEventListener: (type, listener) => handlers.set(type, listener),
    ...overrides,
  };
  return { env, fire: (type: string, event?: unknown) => handlers.get(type)?.(event) };
}

function fakePrompt(outcome: 'accepted' | 'dismissed') {
  return {
    preventDefault: jest.fn(),
    prompt: jest.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome }),
  } satisfies DeferredInstallPrompt;
}

describe('detectPlatform (#206)', () => {
  it.each([
    ['Chrome desktop', UA.chromeDesktop, 0, true, 'chromium'],
    ['Chrome Android', UA.chromeAndroid, 5, true, 'chromium'],
    ['iPhone Safari', UA.iphone, 5, false, 'ios'],
    ['Chrome on iPhone, which installs through Safari', UA.chromeIos, 5, false, 'ios'],
    ['iPadOS desktop-mode Safari', UA.ipad, 5, false, 'ios'],
    ['macOS Safari 17', UA.safariMac17, 0, false, 'macos-safari'],
    ['macOS Safari 16, which has no Add to Dock', UA.safariMac16, 0, false, 'unsupported'],
    ['Firefox desktop', UA.firefoxMac, 0, false, 'unsupported'],
  ])('%s', (_label, userAgent, maxTouchPoints, supportsInstallPrompt, expected) => {
    expect(detectPlatform({ userAgent, maxTouchPoints, supportsInstallPrompt })).toBe(expected);
  });
});

describe('install prompt store (#206)', () => {
  it('offers nothing on Chromium until the browser hands over a prompt', () => {
    const { env, fire } = fakeEnv();
    const store = createInstallPromptStore(env);
    expect(store.getSnapshot()).toEqual({
      platform: 'chromium',
      isInstalled: false,
      canInstall: false,
    });

    const prompt = fakePrompt('accepted');
    fire('beforeinstallprompt', prompt);
    expect(prompt.preventDefault).toHaveBeenCalled();
    expect(store.getSnapshot().canInstall).toBe(true);
  });

  it('shows the held prompt once and drops it, whatever the answer', async () => {
    const { env, fire } = fakeEnv();
    const track = jest.fn();
    const store = createInstallPromptStore(env, track);
    const prompt = fakePrompt('dismissed');
    fire('beforeinstallprompt', prompt);

    await expect(store.promptInstall()).resolves.toBe('dismissed');
    expect(prompt.prompt).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('dismiss', 'chromium');
    expect(store.getSnapshot().canInstall).toBe(false);
    await expect(store.promptInstall()).resolves.toBe('unavailable');
  });

  it('records an accepted prompt', async () => {
    const { env, fire } = fakeEnv();
    const track = jest.fn();
    const store = createInstallPromptStore(env, track);
    fire('beforeinstallprompt', fakePrompt('accepted'));
    await expect(store.promptInstall()).resolves.toBe('accepted');
    expect(track).toHaveBeenCalledWith('accept', 'chromium');
  });

  it('hides the entry the moment the app is installed', () => {
    const { env, fire } = fakeEnv();
    const track = jest.fn();
    const store = createInstallPromptStore(env, track);
    const listener = jest.fn();
    store.subscribe(listener);
    fire('beforeinstallprompt', fakePrompt('accepted'));

    fire('appinstalled');
    expect(store.getSnapshot()).toMatchObject({ isInstalled: true, canInstall: false });
    expect(track).toHaveBeenCalledWith('installed', 'chromium');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('offers the manual steps on iOS, where there is no prompt', () => {
    const { env } = fakeEnv({
      userAgent: UA.iphone,
      maxTouchPoints: 5,
      supportsInstallPrompt: false,
    });
    expect(createInstallPromptStore(env).getSnapshot()).toEqual({
      platform: 'ios',
      isInstalled: false,
      canInstall: true,
    });
  });

  it('treats a Home Screen launch on iOS as installed', () => {
    const { env } = fakeEnv({
      userAgent: UA.iphone,
      maxTouchPoints: 5,
      supportsInstallPrompt: false,
      navigatorStandalone: true,
    });
    expect(createInstallPromptStore(env).getSnapshot()).toMatchObject({
      isInstalled: true,
      canInstall: false,
    });
  });

  it('treats a standalone display mode as installed', () => {
    const { env } = fakeEnv({ standalone: true });
    expect(createInstallPromptStore(env).getSnapshot().isInstalled).toBe(true);
  });

  it('offers nothing where the browser cannot install', () => {
    const { env } = fakeEnv({ userAgent: UA.firefoxMac, supportsInstallPrompt: false });
    expect(createInstallPromptStore(env).getSnapshot().canInstall).toBe(false);
  });

  it('keeps one snapshot object between changes, as useSyncExternalStore requires', () => {
    const { env } = fakeEnv();
    const store = createInstallPromptStore(env);
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });
});
