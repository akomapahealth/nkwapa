/**
 * The service worker update flow (#206), kept free of React and the DOM so it can be tested with
 * plain objects. A new worker installs and waits. A page that finds one waiting as it loads takes
 * it straight away: nothing has been typed yet, and a browser reload alone never activates it, so
 * offering the reload there made the prompt come back on every load. A page already open offers a
 * reload instead, and only when the person accepts does the worker take over and the page reload,
 * once, after any sync in flight. A clinician halfway through a vitals form never loses it to a
 * deploy.
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
  removeEventListener(type: 'updatefound', listener: Listener): void;
}

export interface ContainerLike {
  controller: unknown;
  addEventListener(type: 'controllerchange', listener: Listener): void;
  removeEventListener(type: 'controllerchange', listener: Listener): void;
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
  let disposed = false;
  let lastCheck = now();
  // The first worker claims an uncontrolled page; that controllerchange is not an update.
  let hadController = Boolean(container.controller);

  const announceIfWaiting = () => {
    if (!disposed && registration.waiting && container.controller) onUpdateReady();
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

  const applyUpdate = () => {
    requested = true;
    if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    else reloadWhenIdle();
  };

  const onUpdateFound = () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') announceIfWaiting();
    });
  };

  const onControllerChange = () => {
    if (disposed) return;
    if (!hadController) {
      hadController = true;
      return;
    }
    // Another tab accepted the update. This tab now runs on a new worker but old code, so offer
    // the reload rather than taking it: this tab may hold unsaved input.
    if (requested) reloadWhenIdle();
    else onUpdateReady();
  };

  registration.addEventListener('updatefound', onUpdateFound);
  container.addEventListener('controllerchange', onControllerChange);

  // Waiting at load: take it now. With no controller this is the first install, not an update.
  if (registration.waiting && container.controller) applyUpdate();

  return {
    applyUpdate,
    /** Removes the listeners, so a remounted registration never leaves a second controller. */
    dispose() {
      disposed = true;
      registration.removeEventListener('updatefound', onUpdateFound);
      container.removeEventListener('controllerchange', onControllerChange);
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
