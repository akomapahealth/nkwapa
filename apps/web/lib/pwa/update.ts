/**
 * The service worker update flow (#206), kept free of React and the DOM so it can be tested with
 * plain objects. A new worker installs and waits. The page offers a reload, and only when the
 * person accepts does the worker take over and the page reload, once, after any sync in flight.
 * A clinician halfway through a vitals form never loses it to a deploy.
 */

export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

type Listener = () => void;

export interface WorkerLike {
  state: string;
  postMessage(message: unknown): void;
  addEventListener(type: 'statechange', listener: Listener): void;
}

export interface RegistrationLike {
  waiting: WorkerLike | null;
  installing: WorkerLike | null;
  update(): Promise<unknown>;
  addEventListener(type: 'updatefound', listener: Listener): void;
}

export interface ContainerLike {
  controller: unknown;
  addEventListener(type: 'controllerchange', listener: Listener): void;
}

export interface UpdateControllerOptions {
  registration: RegistrationLike;
  container: ContainerLike;
  /** Called when a new version is ready and the person should be offered a reload. */
  onUpdateReady: () => void;
  reload: () => void;
  isSyncing: () => boolean;
  /** Subscribes to sync status changes; returns an unsubscribe function. */
  onSyncChange: (listener: Listener) => () => void;
  now?: () => number;
}

// Module-level so a remounted controller can never start a second reload.
let reloadStarted = false;

export function createUpdateController({
  registration,
  container,
  onUpdateReady,
  reload,
  isSyncing,
  onSyncChange,
  now = Date.now,
}: UpdateControllerOptions) {
  let requested = false;
  let lastCheck = now();

  // With no controller this is the first install, not an update: there is nothing to reload into.
  const announceIfWaiting = () => {
    if (registration.waiting && container.controller) onUpdateReady();
  };

  const reloadWhenIdle = () => {
    if (reloadStarted) return;
    if (!isSyncing()) {
      reloadStarted = true;
      reload();
      return;
    }
    const unsubscribe = onSyncChange(() => {
      if (isSyncing()) return;
      unsubscribe();
      reloadWhenIdle();
    });
  };

  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') announceIfWaiting();
    });
  });

  container.addEventListener('controllerchange', () => {
    // Another tab accepted the update. This tab now runs on a new worker but old code, so offer
    // the reload rather than taking it: this tab may hold unsaved input.
    if (requested) reloadWhenIdle();
    else onUpdateReady();
  });

  announceIfWaiting();

  return {
    applyUpdate() {
      requested = true;
      if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      else reloadWhenIdle();
    },
    /** Installed apps stay open for days, so look for a new version on focus, at most hourly. */
    checkForUpdate() {
      if (now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;
      lastCheck = now();
      registration.update().catch(() => undefined);
    },
  };
}

/** Test seam: the reload guard is module state by design. */
export function resetReloadGuardForTests() {
  reloadStarted = false;
}
