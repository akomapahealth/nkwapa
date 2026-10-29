/**
 * Install-the-app state (#206), free of React so it can be tested with plain objects.
 *
 * - Chromium fires `beforeinstallprompt`; the event is held so the account menu can offer the
 *   prompt when the person asks, instead of the browser's own banner.
 * - iOS/iPadOS and macOS Safari have no prompt API, so the menu shows the manual steps instead.
 * - Firefox desktop cannot install, and an already installed app has nothing to offer.
 */

export type InstallPlatform = 'chromium' | 'ios' | 'macos-safari' | 'unsupported';
export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

/** The parts of BeforeInstallPromptEvent we use; it is not in the TypeScript DOM library. */
export interface DeferredInstallPrompt {
  preventDefault(): void;
  prompt(): Promise<unknown>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallEnvironment {
  userAgent: string;
  maxTouchPoints: number;
  /** iOS Safari's own flag for a Home Screen launch. */
  navigatorStandalone?: boolean;
  supportsInstallPrompt: boolean;
  matchMedia(query: string): { matches: boolean };
  addEventListener(type: string, listener: (event: unknown) => void): void;
}

export interface InstallSnapshot {
  platform: InstallPlatform;
  isInstalled: boolean;
  canInstall: boolean;
}

export function detectPlatform(
  env: Pick<InstallEnvironment, 'userAgent' | 'maxTouchPoints' | 'supportsInstallPrompt'>,
): InstallPlatform {
  const ua = env.userAgent;
  // iPadOS reports itself as a Mac; touch support gives it away.
  const isIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && env.maxTouchPoints > 1);
  if (isIos) return 'ios';
  if (env.supportsInstallPrompt) return 'chromium';
  const safariVersion = ua.match(/Version\/(\d+)[.\d]* Safari\//);
  const isOtherEngine = /Chrome|Chromium|Edg\/|Firefox|FxiOS|CriOS/.test(ua);
  if (/Macintosh/.test(ua) && safariVersion && !isOtherEngine && Number(safariVersion[1]) >= 17) {
    return 'macos-safari';
  }
  return 'unsupported';
}

export function isStandalone(
  env: Pick<InstallEnvironment, 'matchMedia' | 'navigatorStandalone'>,
): boolean {
  return env.matchMedia('(display-mode: standalone)').matches || env.navigatorStandalone === true;
}

export function createInstallPromptStore(
  env: InstallEnvironment,
  track: (event: 'accept' | 'dismiss' | 'installed', platform: InstallPlatform) => void = () =>
    undefined,
) {
  const platform = detectPlatform(env);
  let deferred: DeferredInstallPrompt | null = null;
  let installed = isStandalone(env);
  const listeners = new Set<() => void>();

  const build = (): InstallSnapshot => ({
    platform,
    isInstalled: installed,
    canInstall:
      !installed && (platform === 'chromium' ? deferred !== null : platform !== 'unsupported'),
  });
  let snapshot = build();
  const changed = () => {
    snapshot = build();
    listeners.forEach((listener) => listener());
  };

  env.addEventListener('beforeinstallprompt', (event) => {
    // Keep the browser's own install banner away; the account menu offers it on request.
    (event as DeferredInstallPrompt).preventDefault();
    deferred = event as DeferredInstallPrompt;
    changed();
  });
  env.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    track('installed', platform);
    changed();
  });

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Chromium only. A held prompt can be shown once, so it is dropped whatever the answer. */
    async promptInstall(): Promise<InstallOutcome> {
      const event = deferred;
      if (!event) return 'unavailable';
      deferred = null;
      changed();
      await event.prompt();
      const { outcome } = await event.userChoice;
      track(outcome === 'accepted' ? 'accept' : 'dismiss', platform);
      return outcome;
    },
  };
}

export type InstallPromptStore = ReturnType<typeof createInstallPromptStore>;
