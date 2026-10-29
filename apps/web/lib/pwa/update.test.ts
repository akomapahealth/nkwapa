import {
  createUpdateController,
  resetReloadGuardForTests,
  UPDATE_CHECK_INTERVAL_MS,
  type ContainerLike,
  type RegistrationLike,
  type WorkerLike,
} from './update';

type Listener = () => void;

function emitter() {
  const listeners = new Map<string, Listener[]>();
  return {
    addEventListener: (type: string, fn: Listener) =>
      listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    emit: (type: string) => listeners.get(type)?.forEach((fn) => fn()),
  };
}

function fakeWorker(state = 'installing') {
  const events = emitter();
  return {
    state,
    postMessage: jest.fn(),
    addEventListener: events.addEventListener,
    emit: events.emit,
  } as WorkerLike & { postMessage: jest.Mock; emit: (type: string) => void };
}

function setup({
  controller = {} as unknown,
  waiting = null as WorkerLike | null,
  syncing = false,
} = {}) {
  const regEvents = emitter();
  const containerEvents = emitter();
  const registration = {
    waiting,
    installing: null as WorkerLike | null,
    update: jest.fn().mockResolvedValue(undefined),
    addEventListener: regEvents.addEventListener,
  } satisfies RegistrationLike;
  const container = {
    controller,
    addEventListener: containerEvents.addEventListener,
  } satisfies ContainerLike;
  const state = { syncing, clock: 0 };
  const syncListeners = new Set<Listener>();
  const onUpdateReady = jest.fn();
  const reload = jest.fn();
  const controllerApi = createUpdateController({
    registration,
    container,
    onUpdateReady,
    reload,
    isSyncing: () => state.syncing,
    onSyncChange: (fn) => {
      syncListeners.add(fn);
      return () => syncListeners.delete(fn);
    },
    now: () => state.clock,
  });
  return {
    ...controllerApi,
    registration,
    onUpdateReady,
    reload,
    state,
    regEvents,
    containerEvents,
    setSyncing(value: boolean) {
      state.syncing = value;
      [...syncListeners].forEach((fn) => fn());
    },
  };
}

beforeEach(() => resetReloadGuardForTests());

describe('service worker update flow (#206)', () => {
  it('offers a reload for a worker already waiting at load', () => {
    const { onUpdateReady } = setup({ waiting: fakeWorker('installed') });
    expect(onUpdateReady).toHaveBeenCalledTimes(1);
  });

  it('stays quiet on the very first install, when nothing controls the page yet', () => {
    const { onUpdateReady } = setup({ controller: null, waiting: fakeWorker('installed') });
    expect(onUpdateReady).not.toHaveBeenCalled();
  });

  it('offers a reload once a newly found worker finishes installing', () => {
    const t = setup();
    const worker = fakeWorker();
    t.registration.installing = worker;
    t.regEvents.emit('updatefound');
    expect(t.onUpdateReady).not.toHaveBeenCalled();

    worker.state = 'installed';
    t.registration.waiting = worker;
    worker.emit('statechange');
    expect(t.onUpdateReady).toHaveBeenCalledTimes(1);
  });

  it('never reloads on its own: only after the person accepts and the worker takes over', () => {
    const worker = fakeWorker('installed');
    const t = setup({ waiting: worker });
    expect(t.reload).not.toHaveBeenCalled();

    t.applyUpdate();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(t.reload).not.toHaveBeenCalled();

    t.containerEvents.emit('controllerchange');
    t.containerEvents.emit('controllerchange');
    expect(t.reload).toHaveBeenCalledTimes(1);
  });

  it('waits for a sync in flight before reloading', () => {
    const t = setup({ waiting: fakeWorker('installed'), syncing: true });
    t.applyUpdate();
    t.containerEvents.emit('controllerchange');
    expect(t.reload).not.toHaveBeenCalled();

    t.setSyncing(false);
    expect(t.reload).toHaveBeenCalledTimes(1);
  });

  it('offers, rather than forces, a reload when another tab took the update', () => {
    const t = setup();
    t.containerEvents.emit('controllerchange');
    expect(t.reload).not.toHaveBeenCalled();
    expect(t.onUpdateReady).toHaveBeenCalledTimes(1);

    t.applyUpdate();
    expect(t.reload).toHaveBeenCalledTimes(1);
  });

  it('never starts a second reload, even from a second controller', () => {
    const first = setup({ waiting: fakeWorker('installed') });
    first.applyUpdate();
    first.containerEvents.emit('controllerchange');
    const second = setup();
    second.applyUpdate();
    expect(first.reload).toHaveBeenCalledTimes(1);
    expect(second.reload).not.toHaveBeenCalled();
  });

  it('checks for a new version at most once an hour', () => {
    const t = setup();
    t.checkForUpdate();
    expect(t.registration.update).not.toHaveBeenCalled();

    t.state.clock = UPDATE_CHECK_INTERVAL_MS;
    t.checkForUpdate();
    t.checkForUpdate();
    expect(t.registration.update).toHaveBeenCalledTimes(1);
  });
});
